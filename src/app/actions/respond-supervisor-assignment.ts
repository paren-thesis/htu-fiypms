'use server';

import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError, type ActionErrorResponse } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import { ensureContactGrants } from '@/lib/contacts/grants';
import { ensureSupervisionDocInTx, supervisionDocId } from '@/lib/models/supervision';
import type { TeamDocument } from '@/types/firestore';

export const respondSupervisorAssignmentInputSchema = z
  .object({
    team_id: z.string().min(1, 'Team ID is required'),
    decision: z.enum(['accept', 'decline']),
    decline_reason: z.string().trim().optional(),
  })
  .strict();

export type RespondSupervisorAssignmentInput = z.infer<
  typeof respondSupervisorAssignmentInputSchema
>;

export interface RespondSupervisorAssignmentResult {
  ok: boolean;
  decision?: 'accept' | 'decline';
  teamId?: string;
  error?: string;
  code?: string;
  status?: number;
}

async function getCoordinatorUserIds(proposedByUid?: string): Promise<string[]> {
  const coordinatorUids = new Set<string>();
  if (proposedByUid) {
    coordinatorUids.add(proposedByUid);
  }

  const userSnaps = await adminDb
    .collection('users')
    .where('roles', 'array-contains', 'coordinator')
    .get();

  for (const doc of userSnaps.docs) {
    coordinatorUids.add(doc.id);
  }

  return Array.from(coordinatorUids);
}

/**
 * Server Action: Accept or decline a proposed supervisor assignment (Spec FR-04.3, A2).
 * Role: the proposed supervisor ONLY.
 *
 * Rules:
 * - Caller must match team.assigned_supervisor_id.
 * - Proposal window must not be expired.
 * - Accept:
 *   - Runs in a transaction.
 *   - Verifies supervision.current_assigned_count < max_capacity (else 409).
 *   - Increments current_assigned_count, appends teamId to assigned_team_ids.
 *   - Sets status 'at_capacity' if count reaches max_capacity.
 *   - Marks supervisor_assignment.status 'accepted'.
 *   - Calls ensureContactGrants.
 *   - Notifies team members and coordinators.
 * - Decline:
 *   - Clears assigned_supervisor_id.
 *   - Sets supervisor_assignment.status 'declined' and decline_reason.
 *   - Notifies coordinators.
 */
export async function respondSupervisorAssignment(
  idTokenOrInput: string | (RespondSupervisorAssignmentInput & { idToken: string }),
  maybeInput?: RespondSupervisorAssignmentInput
): Promise<RespondSupervisorAssignmentResult> {
  try {
    let idToken: string;
    let rawInput: RespondSupervisorAssignmentInput;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest;
    }

    const caller = await requireUser(idToken, ['supervisor']);
    const parsed = respondSupervisorAssignmentInputSchema.parse(rawInput);

    const teamRef = adminDb.collection('teams').doc(parsed.team_id);

    let teamSnapshotData!: TeamDocument;
    let proposedByUid: string | undefined;

    await adminDb.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      }

      const team = teamSnap.data() as TeamDocument;
      teamSnapshotData = team;
      proposedByUid = team.supervisor_assignment?.proposed_by;

      // 1. Authorization: caller must be the proposed supervisor
      if (team.assigned_supervisor_id !== caller.uid) {
        throw new HttpError(
          403,
          'FORBIDDEN_NOT_ASSIGNED_SUPERVISOR',
          'You are not the designated supervisor for this team assignment.'
        );
      }

      // 2. Proposal status check
      if (team.supervisor_assignment?.status !== 'proposed') {
        throw new HttpError(
          400,
          'NO_PENDING_PROPOSAL',
          'There is no active pending proposal for this team.'
        );
      }

      // 3. Response window expiration check
      const now = Timestamp.now();
      const expiresAt = team.supervisor_assignment.window_expires_at;
      if (!expiresAt || expiresAt.toMillis() <= now.toMillis()) {
        throw new HttpError(
          400,
          'PROPOSAL_EXPIRED',
          'The response window for this supervision proposal has expired.'
        );
      }

      if (parsed.decision === 'accept') {
        // 4. Load supervision record inside transaction
        const supervision = await ensureSupervisionDocInTx(
          tx,
          caller.uid,
          team.academic_year_id
        );

        // 5. Concurrency-safe capacity check: count < max_capacity, else 409
        if (supervision.current_assigned_count >= supervision.max_capacity) {
          throw new HttpError(
            409,
            'SUPERVISOR_AT_CAPACITY',
            `You have reached your maximum team supervision capacity (${supervision.max_capacity}).`
          );
        }

        const newCount = supervision.current_assigned_count + 1;
        const newStatus =
          newCount >= supervision.max_capacity ? 'at_capacity' : 'available';

        const supDocId = supervisionDocId(caller.uid, team.academic_year_id);
        const supRef = adminDb.collection('supervisions').doc(supDocId);

        // Update supervision document
        tx.update(supRef, {
          current_assigned_count: FieldValue.increment(1),
          assigned_team_ids: FieldValue.arrayUnion(team.id),
          status: newStatus,
          updated_at: FieldValue.serverTimestamp(),
        });

        // Update team document
        tx.update(teamRef, {
          'supervisor_assignment.status': 'accepted',
          'supervisor_assignment.responded_at': FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });

        // Audit log
        writeAuditInTx(tx, {
          actor: {
            uid: caller.uid,
            email: caller.email,
            role: caller.activeRole,
            activeRole: caller.activeRole,
          },
          action: 'supervision.accepted',
          target_type: 'team',
          target_id: team.id,
          details: `Supervisor accepted assignment for team ${team.name} (${team.group_number})`,
          metadata: {
            team_id: team.id,
            supervisor_id: caller.uid,
            academic_year_id: team.academic_year_id,
            assigned_count: newCount,
            max_capacity: supervision.max_capacity,
          },
        });
      } else {
        // 6. Decline path
        tx.update(teamRef, {
          assigned_supervisor_id: FieldValue.delete(),
          'supervisor_assignment.status': 'declined',
          'supervisor_assignment.responded_at': FieldValue.serverTimestamp(),
          'supervisor_assignment.decline_reason':
            parsed.decline_reason?.trim() || 'Declined without specific reason',
          updated_at: FieldValue.serverTimestamp(),
        });

        writeAuditInTx(tx, {
          actor: {
            uid: caller.uid,
            email: caller.email,
            role: caller.activeRole,
            activeRole: caller.activeRole,
          },
          action: 'supervision.declined',
          target_type: 'team',
          target_id: team.id,
          details: parsed.decline_reason?.trim() || 'Declined assignment',
          metadata: {
            team_id: team.id,
            supervisor_id: caller.uid,
            decline_reason: parsed.decline_reason?.trim() || null,
          },
        });
      }
    });

    const coordinatorUids = await getCoordinatorUserIds(proposedByUid);

    if (parsed.decision === 'accept') {
      // 7. Ensure contact grants (gated until both topic approved AND assignment accepted)
      await ensureContactGrants(adminDb, parsed.team_id);

      // 8. Notify team members
      for (const memberId of teamSnapshotData.member_ids || []) {
        await createNotification({
          user_id: memberId,
          title: 'Supervisor Assignment Accepted',
          body: `Supervisor ${caller.email} has accepted to supervise your team.`,
          type: 'supervision_assignment',
          target_url: '/my-team',
        });
      }

      // 9. Notify coordinators
      for (const coordId of coordinatorUids) {
        await createNotification({
          user_id: coordId,
          title: 'Supervision Assignment Accepted',
          body: `Supervisor ${caller.email} accepted assignment for team ${teamSnapshotData.name} (${teamSnapshotData.group_number}).`,
          type: 'supervision_assignment',
          target_url: '/supervision',
        });
      }
    } else {
      // 10. Notify coordinators on decline
      for (const coordId of coordinatorUids) {
        await createNotification({
          user_id: coordId,
          title: 'Supervision Assignment Declined',
          body: `Supervisor ${caller.email} declined assignment for team ${teamSnapshotData.name} (${teamSnapshotData.group_number}). Reason: ${parsed.decline_reason || 'None provided'}`,
          type: 'supervision_assignment',
          target_url: '/supervision',
        });
      }
    }

    return {
      ok: true,
      decision: parsed.decision,
      teamId: parsed.team_id,
    };
  } catch (error) {
    return toActionError(error) as ActionErrorResponse & RespondSupervisorAssignmentResult;
  }
}
