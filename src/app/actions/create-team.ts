'use server';

//export const runtime = 'nodejs';

import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { getUser } from '@/lib/models/user/repo';
import { getCurrentAcademicYear } from '@/lib/models/academic-year/repo';
import { createTeamInputSchema, type CreateTeamInput } from '@/lib/models/team/schema';
import { findUserActiveTeam } from '@/lib/models/team/repo';
import { createTeamInTx } from '@/lib/teams/create-team-tx';

export interface CreateTeamResult {
  ok: boolean;
  teamId?: string;
  groupNumber?: string;
  inviteCode?: string;
  error?: string;
  code?: string;
  status?: number;
}

/**
 * Server Action: Create a new project team (Spec FR-02.1, FR-02.2, FR-02.5, FR-02.5a, F-06, F-14).
 * Role: student ONLY.
 *
 * Guarantees:
 * - Course ID is derived from caller's users.profile.course_id (never from client input)
 * - Single active team per student per academic year
 * - Sequential, concurrency-safe group number allocation
 * - 6-character invite code stored in server-only collection and private subcollection (never on team doc)
 */
export async function createTeam(
  idToken: string,
  input: CreateTeamInput
): Promise<CreateTeamResult> {
  try {
    const caller = await requireUser(idToken, ['student']);
    const parsed = createTeamInputSchema.parse(input);

    const userDoc = await getUser(caller.uid);
    if (!userDoc || !userDoc.profile?.registered || !userDoc.profile.course_id) {
      throw new HttpError(
        400,
        'UNREGISTERED_STUDENT',
        'Your student profile is incomplete or missing an allocated course track.'
      );
    }

    const currentYear = await getCurrentAcademicYear();
    if (!currentYear) {
      throw new HttpError(
        400,
        'NO_ACTIVE_ACADEMIC_YEAR',
        'No active academic year configured for team formation.'
      );
    }

    const courseId = userDoc.profile.course_id.toLowerCase().trim();
    const actor = {
      uid: caller.uid,
      name: userDoc.name || caller.email,
      role: 'student' as const,
    };

    // 1. Verify caller does not belong to an active team this academic year (FR-02.5)
    const existingTeam = await findUserActiveTeam(caller.uid, currentYear.id);
    if (existingTeam) {
      throw new HttpError(
        409,
        'ALREADY_IN_TEAM',
        'You already belong to an active project team for this academic year.'
      );
    }

    const result = await adminDb.runTransaction(async (tx) => {
      // 2. Execute transactional creation
      const txResult = await createTeamInTx(tx, {
        leaderUid: caller.uid,
        memberUids: [caller.uid],
        courseId,
        yearId: currentYear.id,
        name: parsed.name,
      });

      // 3. Write audit log
      writeAuditInTx(tx, {
        actor,
        action: 'team.created',
        target_type: 'team',
        target_id: txResult.teamId,
        details: `Created project team "${parsed.name}" (${txResult.groupNumber})`,
        metadata: {
          group_number: txResult.groupNumber,
          course_id: courseId,
          academic_year_id: currentYear.id,
        },
      });

      return txResult;
    });

    return {
      ok: true,
      teamId: result.teamId,
      groupNumber: result.groupNumber,
      inviteCode: result.inviteCode,
    };
  } catch (error) {
    return toActionError(error);
  }
}
