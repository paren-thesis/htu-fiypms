'use server';

import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getCurrentAcademicYear } from '@/lib/models/academic-year/repo';
import { getStudentState } from '@/lib/roster/student-guards';
import { getStudentsCollection } from '@/lib/models/roster/repo';
import { Timestamp } from 'firebase-admin/firestore';
import type { UserDocument } from '@/types/firestore';
import { z } from 'zod';

const ALLOWED_CALLER_ROLES = ['coordinator', 'admin'];
const KNOWN_COURSES = new Set(['btech-cs', 'btech-ict', 'hnd-cs', 'hnd-ict']);

const changeCourseSchema = z.object({
  index_number: z.string().trim().regex(/^[0-9]{10}$/).optional(),
  uid: z.string().trim().optional(),
  course_id: z.string().trim().optional(),
  new_course_id: z.string().trim().optional(),
  justification: z.string().trim().min(20, 'Justification must be at least 20 characters'),
  academic_year_id: z.string().trim().optional(),
}).refine((data) => Boolean(data.index_number || data.uid), {
  message: 'Either index_number or uid must be provided',
}).refine((data) => Boolean(data.course_id || data.new_course_id), {
  message: 'Target course track must be provided',
});

export type ChangeCourseActionInput = z.infer<typeof changeCourseSchema>;

function parseArgs(
  arg1?: string | (ChangeCourseActionInput & { idToken?: string }),
  arg2?: ChangeCourseActionInput
): { idToken: string; payload: ChangeCourseActionInput } {
  if (typeof arg1 === 'string') {
    return { idToken: arg1, payload: (arg2 || {}) as ChangeCourseActionInput };
  }
  if (arg1 && typeof arg1 === 'object') {
    const { idToken, ...rest } = arg1 as ChangeCourseActionInput & { idToken?: string };
    return { idToken: idToken || '', payload: rest as unknown as ChangeCourseActionInput };
  }
  return { idToken: '', payload: (arg2 || {}) as ChangeCourseActionInput };
}

/**
 * Coordinator & Admin Server Action: Change a student's course allocation (Spec FR-01.10, D-05).
 * Refused with 409 if student is currently on an active (non-disbanded) team.
 * Requires justification >= 20 characters.
 * Updates both roster entry and users/{uid}.profile.course_id (when linked).
 */
export async function changeStudentCourse(
  idTokenOrInput?: string | (ChangeCourseActionInput & { idToken?: string }),
  maybeInput?: ChangeCourseActionInput
) {
  const { idToken, payload } = parseArgs(idTokenOrInput, maybeInput);
  const caller = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  const parsed = changeCourseSchema.parse(payload);
  const targetCourseId = (parsed.course_id || parsed.new_course_id || '').toLowerCase().trim();

  // Validate target course
  if (!KNOWN_COURSES.has(targetCourseId)) {
    const courseDoc = await adminDb.collection('courses').doc(targetCourseId).get();
    if (!courseDoc.exists) {
      throw new HttpError(400, 'INVALID_COURSE', `Target course "${targetCourseId}" does not exist.`);
    }
  }

  let yearId = parsed.academic_year_id?.trim();
  if (!yearId) {
    const currentYear = await getCurrentAcademicYear();
    if (!currentYear) {
      throw new HttpError(500, 'NO_ACTIVE_ACADEMIC_YEAR', 'No active academic year found.');
    }
    yearId = currentYear.id;
  }

  let indexNumber = parsed.index_number?.trim();
  let userUid = parsed.uid?.trim();

  // If uid was provided without indexNumber, derive indexNumber from user document
  if (!indexNumber && userUid) {
    const userSnap = await adminDb.collection('users').doc(userUid).get();
    if (!userSnap.exists) {
      throw new HttpError(404, 'USER_NOT_FOUND', `User ${userUid} not found.`);
    }
    const userData = userSnap.data() as UserDocument;
    indexNumber = userData.profile?.index_number || userData.email.split('@')[0];
  }

  if (!indexNumber) {
    throw new HttpError(400, 'INVALID_STUDENT_IDENTIFIER', 'Missing student index number.');
  }

  // Check student state & active team membership
  const state = await getStudentState(indexNumber, yearId);
  if (!state.exists || !state.student) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', `Student ${indexNumber} not found in cohort roster.`);
  }

  if (state.onActiveTeam) {
    throw new HttpError(
      409,
      'STUDENT_IN_ACTIVE_TEAM',
      `Cannot change student course while student belongs to an active team (${state.teamId || 'active'}). Remove or disband the team first.`
    );
  }

  const oldCourseId = state.student.course_id;
  if (!userUid && state.uid) {
    userUid = state.uid;
  }

  // 1. Update roster student document
  const studentRef = getStudentsCollection(yearId).doc(indexNumber);
  await studentRef.update({
    course_id: targetCourseId,
    updated_at: Timestamp.now(),
    updated_by: caller.uid,
  });

  // 2. If student account is linked, update users/{uid}.profile.course_id and claims
  if (userUid) {
    const userRef = adminDb.collection('users').doc(userUid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      await userRef.update({
        'profile.course_id': targetCourseId,
        updated_at: Timestamp.now(),
      });

      try {
        const authUser = await adminAuth.getUser(userUid);
        const existingClaims = authUser.customClaims || {};
        await adminAuth.setCustomUserClaims(userUid, {
          ...existingClaims,
          course_id: targetCourseId,
        });
      } catch {
        // Tolerate if user auth emulator record is missing
      }
    }
  }

  // 3. Write audit log
  await writeAudit({
    actor: {
      uid: caller.uid,
      email: caller.email,
      role: caller.activeRole || 'coordinator',
    },
    action: 'student.course_changed',
    target_type: 'roster',
    target_id: indexNumber,
    description: `Changed course for student ${indexNumber} from ${oldCourseId} to ${targetCourseId}`,
    metadata: {
      old: oldCourseId,
      new: targetCourseId,
      justification: parsed.justification,
      index_number: indexNumber,
      ...(userUid ? { uid: userUid } : {}),
      academic_year_id: yearId,
    },
  });

  return {
    ok: true,
    index_number: indexNumber,
    uid: userUid,
    old_course_id: oldCourseId,
    new_course_id: targetCourseId,
  };
}
