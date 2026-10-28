'use server';

// export const runtime = 'nodejs';

import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import {
  submitGradeAppealInSchema,
  type SubmitGradeAppealIn,
} from '@/lib/models/grade-appeal/schema';
import {
  createGradeAppeal,
  getGradeAppeal,
  getGradeAppealId,
} from '@/lib/models/grade-appeal/repo';
import type { TeamDocument, AcademicYearDocument } from '@/types/firestore';

export interface SubmitGradeAppealResult {
  ok: boolean;
  appeal_id?: string;
  error?: string;
  code?: string;
}

/**
 * Server Action: Submit a student grade appeal.
 * Spec: FR-10.4, Amendment A-04.
 * Requirements:
 * - Grades must be published for the team's academic year.
 * - Current time must be <= grade_appeal_deadline.
 * - Caller must be a member of the team.
 * - One appeal per student (idempotent duplicate rejection).
 * - System notification sent to departmental coordinators.
 */
export async function submitGradeAppeal(
  idTokenOrInput?: string | (SubmitGradeAppealIn & { idToken?: string }),
  maybeInput?: SubmitGradeAppealIn | string
): Promise<SubmitGradeAppealResult> {
  try {
    let idToken: string | undefined;
    let rawInput: unknown;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput;
    } else if (idTokenOrInput && typeof idTokenOrInput === 'object') {
      idToken = idTokenOrInput.idToken;
      const copy = { ...idTokenOrInput };
      delete copy.idToken;
      rawInput = copy;
      if (!idToken && typeof maybeInput === 'string') {
        idToken = maybeInput;
      }
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
    }

    // Must be an enrolled student
    const caller = await requireUser(idToken, ['student']);

    const parsed = submitGradeAppealInSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { team_id, reason } = parsed.data;

    // 1. Validate team membership
    const teamRef = adminDb.collection('teams').doc(team_id);
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) {
      throw new HttpError(404, 'NOT_FOUND', `Team ${team_id} does not exist`);
    }

    const teamData = teamSnap.data() as TeamDocument;
    if (!teamData.member_ids?.includes(caller.uid)) {
      throw new HttpError(403, 'FORBIDDEN', 'You are not a registered member of this team');
    }

    // 2. Validate academic year & appeal window
    const academicYearRef = adminDb.collection('academic_years').doc(teamData.academic_year_id);
    const yearSnap = await academicYearRef.get();
    if (!yearSnap.exists) {
      throw new HttpError(404, 'NOT_FOUND', `Academic year ${teamData.academic_year_id} not found`);
    }

    const yearData = yearSnap.data() as AcademicYearDocument;
    if (!yearData.grades_published) {
      throw new HttpError(400, 'GRADES_NOT_PUBLISHED', 'Grades have not yet been published for this cohort');
    }

    const deadlineTimestamp = yearData.deadlines?.grade_appeal_deadline;

    if (!deadlineTimestamp) {
      throw new HttpError(400, 'DEADLINE_NOT_SET', 'Grade appeal deadline is not configured for this academic year');
    }

    const deadlineMs =
      typeof deadlineTimestamp.toMillis === 'function'
        ? deadlineTimestamp.toMillis()
        : deadlineTimestamp.toDate().getTime();

    if (Date.now() > deadlineMs) {
      throw new HttpError(400, 'DEADLINE_EXPIRED', 'The grade appeal window has closed');
    }

    // 3. Enforce one appeal per student
    const appealId = getGradeAppealId(team_id, caller.uid);
    const existingAppeal = await getGradeAppeal(appealId);
    if (existingAppeal) {
      throw new HttpError(409, 'ALREADY_EXISTS', 'You have already submitted a grade appeal for this project');
    }

    // 4. Create appeal
    await createGradeAppeal({
      id: appealId,
      team_id,
      student_id: caller.uid,
      reason,
      status: 'submitted',
    });

    // 5. Notify Departmental Coordinators (system)
    const coordinatorsSnap = await adminDb
      .collection('users')
      .where('roles', 'array-contains', 'coordinator')
      .get();

    for (const coordDoc of coordinatorsSnap.docs) {
      await createNotification({
        user_id: coordDoc.id,
        title: 'New Grade Appeal Submitted',
        body: `A student from team ${teamData.group_number || teamData.name} has submitted a grade appeal.`,
        type: 'system',
        target_url: '/grades',
      });
    }

    // 6. Write Audit Log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.activeRole || 'student',
      },
      action: 'grade_appeal.submitted',
      target_type: 'grade_appeal',
      target_id: appealId,
      description: `Grade appeal submitted by student for team ${teamData.group_number || teamData.name}`,
      metadata: {
        team_id,
        reason_length: reason.length,
      },
    });

    return {
      ok: true,
      appeal_id: appealId,
    };
  } catch (err: unknown) {
    return toActionError(err);
  }
}
