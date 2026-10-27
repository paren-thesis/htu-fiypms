'use server';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError, type ActionErrorResponse } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import type { TeamDocument, UserDocument, StaffWhitelistDocument } from '@/types/firestore';

const SUPERVISOR_RESPONSE_WINDOW_HOURS = 72;

const proposeSupervisorInputSchema = z
  .object({
    team_id: z.string().min(1, 'Team ID is required'),
    supervisor_id: z.string().min(1, 'Supervisor ID is required'),
    override_reason: z.string().trim().optional(),
  })
  .strict();

export type ProposeSupervisorInput = z.infer<typeof proposeSupervisorInputSchema>;

export interface ProposeSupervisorResult {
  ok: boolean;
  teamId?: string;
  supervisorId?: string;
  windowExpiresAt?: Timestamp;
  error?: string;
  code?: string;
  status?: number;
}

/**
 * Server Action: Propose a supervisor for a team (Spec FR-04.2, FR-04.2a, FR-04.3, A2).
 * Role: coordinator or admin ONLY.
 *
 * Rules:
 * - Supervisor must list team's course_id in staff_whitelist.programmes unless override_reason is provided.
 * - If override_reason is provided, an audit log with action 'supervision.override' is recorded.
 * - Sets team.assigned_supervisor_id and supervisor_assignment (status 'proposed', window_expires_at = now + 72h).
 * - An expired proposal may be replaced.
 * - Notifies the supervisor with type 'supervision_assignment'.
 */
export async function proposeSupervisor(
  idTokenOrInput: string | (ProposeSupervisorInput & { idToken: string }),
  maybeInput?: ProposeSupervisorInput
): Promise<ProposeSupervisorResult> {
  try {
    let idToken: string;
    let rawInput: ProposeSupervisorInput;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest;
    }

    const caller = await requireUser(idToken, ['coordinator', 'admin']);
    const parsed = proposeSupervisorInputSchema.parse(rawInput);

    const teamRef = adminDb.collection('teams').doc(parsed.team_id);
    const userRef = adminDb.collection('users').doc(parsed.supervisor_id);

    // 1. Load supervisor details
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpError(404, 'SUPERVISOR_NOT_FOUND', 'Supervisor user record not found.');
    }
    const supervisorUser = userSnap.data() as UserDocument;

    // Load staff_whitelist entry
    let whitelistDoc: StaffWhitelistDocument | null = null;
    const whitelistDirectSnap = await adminDb
      .collection('staff_whitelist')
      .doc(supervisorUser.email.toLowerCase())
      .get();

    if (whitelistDirectSnap.exists) {
      whitelistDoc = whitelistDirectSnap.data() as StaffWhitelistDocument;
    } else {
      const whitelistQuery = await adminDb
        .collection('staff_whitelist')
        .where('user_uid', '==', parsed.supervisor_id)
        .limit(1)
        .get();
      if (!whitelistQuery.empty && whitelistQuery.docs[0]) {
        whitelistDoc = whitelistQuery.docs[0].data() as StaffWhitelistDocument;
      }
    }

    if (!whitelistDoc || !whitelistDoc.is_active || !whitelistDoc.roles.includes('supervisor')) {
      throw new HttpError(
        400,
        'INVALID_SUPERVISOR',
        'Selected user is not an active faculty supervisor.'
      );
    }

    // 2. Programme match validation & override audit requirement
    const supervisorProgrammes = (whitelistDoc.programmes || []).map((p) => p.trim().toLowerCase());

    const now = Timestamp.now();
    const windowExpiresAt = Timestamp.fromMillis(
      now.toMillis() + SUPERVISOR_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000
    );

    let teamName = '';
    let teamGroupNumber = '';

    await adminDb.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      }

      const team = teamSnap.data() as TeamDocument;
      teamName = team.name;
      teamGroupNumber = team.group_number;

      // Check current proposal status
      if (team.supervisor_assignment) {
        if (team.supervisor_assignment.status === 'accepted') {
          throw new HttpError(
            409,
            'ALREADY_ACCEPTED',
            'This team already has an accepted supervisor assignment.'
          );
        }

        if (team.supervisor_assignment.status === 'proposed') {
          const currentExpiry = team.supervisor_assignment.window_expires_at;
          const isExpired = currentExpiry && currentExpiry.toMillis() <= now.toMillis();
          if (!isExpired) {
            throw new HttpError(
              409,
              'PROPOSAL_PENDING',
              'A supervisor proposal is already active and has not expired.'
            );
          }
          // Expired proposal may be replaced
        }
      }

      // Check programme match
      const normalizedTeamCourse = (team.course_id || '').trim().toLowerCase();
      const coversProgramme = supervisorProgrammes.includes(normalizedTeamCourse);

      if (!coversProgramme) {
        if (!parsed.override_reason || !parsed.override_reason.trim()) {
          throw new HttpError(
            400,
            'PROGRAMME_MISMATCH',
            `Supervisor does not cover programme "${team.course_id}". An override reason is required.`
          );
        }

        // Write override audit log
        writeAuditInTx(tx, {
          actor: {
            uid: caller.uid,
            email: caller.email,
            role: caller.activeRole,
            activeRole: caller.activeRole,
          },
          action: 'supervision.override',
          target_type: 'team',
          target_id: team.id,
          details: parsed.override_reason.trim(),
          description: `Supervision override: assigned supervisor ${whitelistDoc!.full_name} (${parsed.supervisor_id}) outside programme ${team.course_id}`,
          metadata: {
            team_id: team.id,
            course_id: team.course_id,
            supervisor_id: parsed.supervisor_id,
            supervisor_programmes: whitelistDoc!.programmes,
            override_reason: parsed.override_reason.trim(),
          },
        });
      }

      // Record proposal audit
      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: caller.activeRole,
          activeRole: caller.activeRole,
        },
        action: 'supervision.proposed',
        target_type: 'team',
        target_id: team.id,
        details: `Proposed supervisor ${whitelistDoc!.full_name} for team ${team.name} (${team.group_number})`,
        metadata: {
          team_id: team.id,
          supervisor_id: parsed.supervisor_id,
          window_expires_at: windowExpiresAt,
          override_reason: parsed.override_reason ? parsed.override_reason.trim() : null,
        },
      });

      // Update team document
      tx.update(teamRef, {
        assigned_supervisor_id: parsed.supervisor_id,
        supervisor_assignment: {
          status: 'proposed',
          proposed_by: caller.uid,
          proposed_at: now,
          window_expires_at: windowExpiresAt,
          ...(parsed.override_reason ? { override_reason: parsed.override_reason.trim() } : {}),
        },
        updated_at: now,
      });
    });

    // 3. Notify the proposed supervisor
    await createNotification({
      user_id: parsed.supervisor_id,
      title: 'New Supervision Assignment Proposed',
      body: `You have been proposed to supervise team ${teamName} (${teamGroupNumber}). Please respond within ${SUPERVISOR_RESPONSE_WINDOW_HOURS} hours.`,
      type: 'supervision_assignment',
      target_url: '/supervision',
    });

    return {
      ok: true,
      teamId: parsed.team_id,
      supervisorId: parsed.supervisor_id,
      windowExpiresAt,
    };
  } catch (error) {
    return toActionError(error) as ActionErrorResponse & ProposeSupervisorResult;
  }
}
