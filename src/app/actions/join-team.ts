'use server';

// export const runtime = 'nodejs';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { getUser } from '@/lib/models/user/repo';
import { findUserActiveTeam } from '@/lib/models/team/repo';
import { joinTeamInputSchema, type JoinTeamInput } from '@/lib/models/team/schema';
import type { TeamDocument, InviteCodeDocument } from '@/types/firestore';

export interface JoinTeamResult {
  ok: boolean;
  teamId?: string;
  groupNumber?: string;
  error?: string;
  code?: string;
  status?: number;
}

/**
 * Server Action: Join a project team using an invite code (Spec FR-02.3, FR-02.4a, FR-02.5, F-06).
 * Role: student ONLY.
 *
 * Guarantees:
 * - Programme track category integrity: 409 with exact spec message if caller's course does not match team's course
 * - Enforces membership cap (max 5)
 * - Verifies caller does not belong to another active team in the same academic year
 * - Adds caller to team.member_ids, increments member_count, and writes teams/{id}/members/{uid}
 * - Writes audit log and notifies the team leader
 */
export async function joinTeam(
  idToken: string,
  input: JoinTeamInput
): Promise<JoinTeamResult> {
  try {
    const caller = await requireUser(idToken, ['student']);
    const parsed = joinTeamInputSchema.parse(input);

    const userDoc = await getUser(caller.uid);
    if (!userDoc || !userDoc.profile?.registered || !userDoc.profile.course_id) {
      throw new HttpError(
        400,
        'UNREGISTERED_STUDENT',
        'Your student profile is incomplete or missing an allocated course track.'
      );
    }

    const callerCourseId = userDoc.profile.course_id.toLowerCase().trim();
    const actor = {
      uid: caller.uid,
      name: userDoc.name || caller.email,
      role: 'student' as const,
    };

    // 1. Resolve invite code
    const inviteDocSnap = await adminDb
      .collection('invite_codes')
      .doc(parsed.inviteCode)
      .get();

    if (!inviteDocSnap.exists) {
      throw new HttpError(
        404,
        'INVITE_CODE_NOT_FOUND',
        'Invalid invite code. Team not found.'
      );
    }

    const inviteData = inviteDocSnap.data() as InviteCodeDocument;
    const teamId = inviteData.team_id;
    const teamRef = adminDb.collection('teams').doc(teamId);

    // Resolve target team pre-check
    const targetTeamSnap = await teamRef.get();
    if (!targetTeamSnap.exists) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
    }
    const targetTeam = targetTeamSnap.data() as TeamDocument;

    // Verify caller is not already on another active team for this academic year (FR-02.5)
    const existingTeam = await findUserActiveTeam(caller.uid, targetTeam.academic_year_id);
    if (existingTeam) {
      if (existingTeam.id === teamId) {
        throw new HttpError(
          400,
          'ALREADY_IN_THIS_TEAM',
          'You are already a member of this team.'
        );
      }
      throw new HttpError(
        409,
        'ALREADY_IN_TEAM',
        'You already belong to an active project team for this academic year.'
      );
    }

    // 2. Execute transactional join
    const team = await adminDb.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      }

      const teamData = teamSnap.data() as TeamDocument;

      // Check team lifecycle status
      if (teamData.status !== 'formation' && teamData.status !== 'topic_pending') {
        throw new HttpError(
          400,
          'TEAM_NOT_ACCEPTING_MEMBERS',
          `Cannot join team in status: ${teamData.status}. Group formation is closed.`
        );
      }

      // Check membership limit
      if (
        teamData.member_count >= teamData.max_members ||
        teamData.member_ids.length >= teamData.max_members
      ) {
        throw new HttpError(
          400,
          'TEAM_FULL',
          'This team is already full (maximum 5 members).'
        );
      }

      // Check if already a member of this team
      if (teamData.member_ids.includes(caller.uid)) {
        throw new HttpError(
          400,
          'ALREADY_IN_THIS_TEAM',
          'You are already a member of this team.'
        );
      }

      // Category integrity check (FR-02.4a):
      // A mismatch returns 409 "This team belongs to a different programme. You can only join teams in your own course track."
      if (callerCourseId !== teamData.course_id.toLowerCase().trim()) {
        throw new HttpError(
          409,
          'COURSE_MISMATCH',
          'This team belongs to a different programme. You can only join teams in your own course track.'
        );
      }

      // Update team document
      tx.update(teamRef, {
        member_ids: FieldValue.arrayUnion(caller.uid),
        member_count: teamData.member_count + 1,
        updated_at: FieldValue.serverTimestamp(),
      });

      // Write member subcollection document
      const memberDocRef = teamRef.collection('members').doc(caller.uid);
      tx.set(memberDocRef, {
        uid: caller.uid,
        role: 'member',
        joined_at: FieldValue.serverTimestamp(),
      });

      // Write audit log
      writeAuditInTx(tx, {
        actor,
        action: 'team.joined',
        target_type: 'team',
        target_id: teamId,
        details: `${actor.name} joined team "${teamData.name}" (${teamData.group_number})`,
        metadata: {
          group_number: teamData.group_number,
          course_id: teamData.course_id,
        },
      });

      return teamData;
    });

    // 3. Notify the team leader (fire-and-forget safe)
    await notify([team.leader_id], {
      type: 'team_update',
      title: 'New Team Member',
      body: `${actor.name} has joined your project team (${team.group_number}).`,
      target_url: '/my-team',
    }).catch((err) => {
      console.error('Failed to notify team leader:', err);
    });

    return {
      ok: true,
      teamId: team.id,
      groupNumber: team.group_number,
    };
  } catch (error) {
    return toActionError(error);
  }
}
