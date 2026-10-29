'use server';

import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getCurrentAcademicYear } from '@/lib/models/academic-year/repo';
import { studentEmail } from '../../../fixtures';
import { getStudentState } from '@/lib/roster/student-guards';
import { getStudentsCollection, getRosterStudent } from '@/lib/models/roster/repo';
import {
  createStudentSchema,
  updateStudentSchema,
  deactivateStudentSchema,
  reactivateStudentSchema,
  deleteStudentSchema,
  type CreateStudentInput,
  type UpdateStudentInput,
  type DeactivateStudentInput,
  type ReactivateStudentInput,
  type DeleteStudentInput,
} from '@/lib/models/roster/schema';
import type { RosterStudentDocument } from '@/types/firestore';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const ALLOWED_CALLER_ROLES = ['coordinator', 'admin'];
const KNOWN_COURSES = new Set(['btech-cs', 'btech-ict', 'hnd-cs', 'hnd-ict']);

function parseArgs<T>(
  arg1?: string | (T & { idToken?: string }),
  arg2?: T
): { idToken: string; payload: T } {
  if (typeof arg1 === 'string') {
    return { idToken: arg1, payload: (arg2 || {}) as T };
  }
  if (arg1 && typeof arg1 === 'object') {
    const { idToken, ...rest } = arg1 as T & { idToken?: string };
    return { idToken: idToken || '', payload: rest as unknown as T };
  }
  return { idToken: '', payload: (arg2 || {}) as T };
}

async function resolveYearId(yearId?: string): Promise<string> {
  if (yearId && yearId.trim().length > 0) {
    return yearId.trim();
  }
  const currentYear = await getCurrentAcademicYear();
  if (!currentYear) {
    throw new HttpError(500, 'NO_ACTIVE_ACADEMIC_YEAR', 'No active academic year found.');
  }
  return currentYear.id;
}

/**
 * Coordinator & Admin only: Create a single student roster record (Spec FR-01.4, D-05).
 */
export async function createStudent(
  idTokenOrInput?: string | (CreateStudentInput & { idToken?: string }),
  maybeInput?: CreateStudentInput
) {
  const { idToken, payload } = parseArgs(idTokenOrInput, maybeInput);
  const caller = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  const parsed = createStudentSchema.parse(payload);
  const yearId = await resolveYearId(parsed.academic_year_id);
  const indexNumber = parsed.index_number.trim();
  const courseId = parsed.course_id.toLowerCase().trim();

  // Validate course exists
  if (!KNOWN_COURSES.has(courseId)) {
    const courseDoc = await adminDb.collection('courses').doc(courseId).get();
    if (!courseDoc.exists) {
      throw new HttpError(400, 'INVALID_COURSE', `Course "${courseId}" does not exist in courses.`);
    }
  }

  const studentRef = getStudentsCollection(yearId).doc(indexNumber);
  const studentSnap = await studentRef.get();
  if (studentSnap.exists) {
    throw new HttpError(
      409,
      'DUPLICATE_STUDENT',
      `Student with index number ${indexNumber} already exists in cohort roster.`
    );
  }

  const newStudent: RosterStudentDocument = {
    index_number: indexNumber,
    full_name: parsed.full_name.trim(),
    contact: parsed.contact,
    email: studentEmail(indexNumber),
    course_id: courseId,
    imported_by_uid: caller.uid,
    imported_at: Timestamp.now(),
    import_batch_id: 'manual-create',
    user_uid: null,
    signup_completed_at: null,
    is_active: true,
  };

  await studentRef.set(newStudent);

  await writeAudit({
    actor: {
      uid: caller.uid,
      email: caller.email,
      role: caller.activeRole || 'coordinator',
    },
    action: 'student.created',
    target_type: 'roster',
    target_id: indexNumber,
    description: `Created student ${newStudent.full_name} (${indexNumber}) in cohort roster`,
    metadata: {
      index_number: indexNumber,
      course_id: courseId,
      contact: newStudent.contact,
      academic_year_id: yearId,
    },
  });

  return { ok: true, student: newStudent };
}

/**
 * Coordinator & Admin only: Update student full_name and contact only.
 * Rejects index_number, email, course_id, and user_uid in the update payload.
 */
export async function updateStudent(
  idTokenOrInput?: string | (UpdateStudentInput & { idToken?: string }),
  maybeInput?: UpdateStudentInput
) {
  const { idToken, payload } = parseArgs(idTokenOrInput, maybeInput);
  const caller = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  // Reject forbidden fields in raw payload
  const rawObj = payload as Record<string, unknown>;
  for (const forbidden of ['email', 'course_id', 'user_uid']) {
    if (forbidden in rawObj && rawObj[forbidden] !== undefined) {
      throw new HttpError(
        400,
        'FORBIDDEN_UPDATE_FIELD',
        `Field "${forbidden}" cannot be modified via updateStudent. Use course change action for course transfers.`
      );
    }
  }

  const parsed = updateStudentSchema.parse(payload);
  const yearId = await resolveYearId(parsed.academic_year_id);
  const indexNumber = parsed.index_number.trim();

  const studentRef = getStudentsCollection(yearId).doc(indexNumber);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', `Student ${indexNumber} not found.`);
  }

  const oldData = studentSnap.data() as RosterStudentDocument;
  const newName = parsed.full_name.trim();
  const newContact = parsed.contact;

  await studentRef.update({
    full_name: newName,
    contact: newContact,
    updated_at: Timestamp.now(),
    updated_by: caller.uid,
  });

  await writeAudit({
    actor: {
      uid: caller.uid,
      email: caller.email,
      role: caller.activeRole || 'coordinator',
    },
    action: 'student.updated',
    target_type: 'roster',
    target_id: indexNumber,
    description: `Updated student record for ${indexNumber}`,
    metadata: {
      index_number: indexNumber,
      academic_year_id: yearId,
      old: {
        full_name: oldData.full_name,
        contact: oldData.contact,
      },
      new: {
        full_name: newName,
        contact: newContact,
      },
    },
  });

  return { ok: true, index_number: indexNumber };
}

/**
 * Coordinator & Admin only: Deactivate a student record.
 * Refused with 409 if student is currently on an active (non-disbanded) team.
 * When linked, revokes Firebase Auth refresh tokens.
 */
export async function deactivateStudent(
  idTokenOrInput?: string | (DeactivateStudentInput & { idToken?: string }),
  maybeInput?: DeactivateStudentInput
) {
  const { idToken, payload } = parseArgs(idTokenOrInput, maybeInput);
  const caller = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  const parsed = deactivateStudentSchema.parse(payload);
  const yearId = await resolveYearId(parsed.academic_year_id);
  const indexNumber = parsed.index_number.trim();

  const state = await getStudentState(indexNumber, yearId);
  if (!state.exists || !state.student) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', `Student ${indexNumber} not found.`);
  }

  if (state.onActiveTeam) {
    throw new HttpError(
      409,
      'STUDENT_ON_ACTIVE_TEAM',
      `Cannot deactivate student ${indexNumber} while on an active project team (${state.teamId || 'active'}). Disband or remove the student first.`
    );
  }

  const studentRef = getStudentsCollection(yearId).doc(indexNumber);
  await studentRef.update({
    is_active: false,
    deactivated_at: Timestamp.now(),
    deactivated_by: caller.uid,
    deactivation_reason: parsed.reason.trim(),
    updated_at: Timestamp.now(),
    updated_by: caller.uid,
  });

  if (state.linked && state.uid) {
    try {
      await adminAuth.revokeRefreshTokens(state.uid);
    } catch {
      // Tolerate if user auth doc doesn't exist
    }
  }

  await writeAudit({
    actor: {
      uid: caller.uid,
      email: caller.email,
      role: caller.activeRole || 'coordinator',
    },
    action: 'student.deactivated',
    target_type: 'roster',
    target_id: indexNumber,
    description: `Deactivated student record ${indexNumber}: ${parsed.reason}`,
    metadata: {
      index_number: indexNumber,
      academic_year_id: yearId,
      reason: parsed.reason,
      user_uid: state.uid,
    },
  });

  return { ok: true, index_number: indexNumber };
}

/**
 * Coordinator & Admin only: Reactivate a previously deactivated student record.
 */
export async function reactivateStudent(
  idTokenOrInput?: string | (ReactivateStudentInput & { idToken?: string }),
  maybeInput?: ReactivateStudentInput
) {
  const { idToken, payload } = parseArgs(idTokenOrInput, maybeInput);
  const caller = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  const parsed = reactivateStudentSchema.parse(payload);
  const yearId = await resolveYearId(parsed.academic_year_id);
  const indexNumber = parsed.index_number.trim();

  const student = await getRosterStudent(yearId, indexNumber);
  if (!student) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', `Student ${indexNumber} not found.`);
  }

  const studentRef = getStudentsCollection(yearId).doc(indexNumber);
  await studentRef.update({
    is_active: true,
    deactivated_at: FieldValue.delete(),
    deactivated_by: FieldValue.delete(),
    deactivation_reason: FieldValue.delete(),
    updated_at: Timestamp.now(),
    updated_by: caller.uid,
  });

  await writeAudit({
    actor: {
      uid: caller.uid,
      email: caller.email,
      role: caller.activeRole || 'coordinator',
    },
    action: 'student.reactivated',
    target_type: 'roster',
    target_id: indexNumber,
    description: `Reactivated student record ${indexNumber}`,
    metadata: {
      index_number: indexNumber,
      academic_year_id: yearId,
    },
  });

  return { ok: true, index_number: indexNumber };
}

/**
 * Coordinator & Admin only: Hard delete an unlinked student record.
 * Allowed only when user_uid and signup_completed_at are null and student is not on any team.
 * Otherwise returns 409 'Deactivate instead'.
 */
export async function deleteStudent(
  idTokenOrInput?: string | (DeleteStudentInput & { idToken?: string }),
  maybeInput?: DeleteStudentInput
) {
  const { idToken, payload } = parseArgs(idTokenOrInput, maybeInput);
  const caller = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  const parsed = deleteStudentSchema.parse(payload);
  const yearId = await resolveYearId(parsed.academic_year_id);
  const indexNumber = parsed.index_number.trim();

  const state = await getStudentState(indexNumber, yearId);
  if (!state.exists || !state.student) {
    throw new HttpError(404, 'STUDENT_NOT_FOUND', `Student ${indexNumber} not found.`);
  }

  if (state.linked || state.student.signup_completed_at || state.onActiveTeam) {
    throw new HttpError(
      409,
      'CANNOT_DELETE_ACTIVE_STUDENT',
      'Cannot delete a student record that has signed in or belongs to a team. Deactivate instead.'
    );
  }

  const snapshot = { ...state.student };
  const studentRef = getStudentsCollection(yearId).doc(indexNumber);
  await studentRef.delete();

  await writeAudit({
    actor: {
      uid: caller.uid,
      email: caller.email,
      role: caller.activeRole || 'coordinator',
    },
    action: 'student.deleted',
    target_type: 'roster',
    target_id: indexNumber,
    description: `Deleted unlinked student record ${indexNumber}`,
    metadata: {
      index_number: indexNumber,
      academic_year_id: yearId,
      snapshot,
    },
  });

  return { ok: true, index_number: indexNumber };
}

