import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { GradeAppealDocument, GradeAppealStatus } from '@/types/firestore';

export const GRADE_APPEALS_COLLECTION = 'grade_appeals';

function cleanUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }
  return result;
}

/**
 * Deterministic doc id for an appeal: {teamId}__{studentUid}
 */
export function getGradeAppealId(teamId: string, studentUid: string): string {
  return `${teamId}__${studentUid}`;
}

/**
 * Fetch a single grade appeal by ID.
 */
export async function getGradeAppeal(id: string): Promise<GradeAppealDocument | null> {
  const doc = await adminDb.collection(GRADE_APPEALS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Omit<GradeAppealDocument, 'id'>) };
}

/**
 * Fetch a student's grade appeal for a specific team.
 */
export async function getGradeAppealByStudent(
  teamId: string,
  studentUid: string
): Promise<GradeAppealDocument | null> {
  const id = getGradeAppealId(teamId, studentUid);
  return getGradeAppeal(id);
}

/**
 * List grade appeals with optional filtering.
 */
export async function listGradeAppeals(filters?: {
  team_id?: string;
  status?: GradeAppealStatus;
}): Promise<GradeAppealDocument[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(GRADE_APPEALS_COLLECTION);

  if (filters?.team_id) {
    query = query.where('team_id', '==', filters.team_id);
  }
  if (filters?.status) {
    query = query.where('status', '==', filters.status);
  }

  const snap = await query.get();
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<GradeAppealDocument, 'id'>) } as GradeAppealDocument)
  );
}

/**
 * Create a new grade appeal document.
 */
export async function createGradeAppeal(
  data: Omit<GradeAppealDocument, 'created_at' | 'updated_at'>
): Promise<GradeAppealDocument> {
  const docRef = adminDb.collection(GRADE_APPEALS_COLLECTION).doc(data.id);
  const now = FieldValue.serverTimestamp();

  const payload = cleanUndefined({
    team_id: data.team_id,
    student_id: data.student_id,
    reason: data.reason,
    status: data.status,
    created_at: now,
    updated_at: now,
  });

  await docRef.set(payload);

  return {
    ...data,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };
}

/**
 * Update the review status and resolution notes of an appeal.
 */
export async function updateGradeAppealStatus(
  appealId: string,
  update: {
    status: GradeAppealStatus;
    resolution_notes: string;
    resolved_by: string;
    resolved_at?: FirebaseFirestore.Timestamp;
  }
): Promise<void> {
  const docRef = adminDb.collection(GRADE_APPEALS_COLLECTION).doc(appealId);
  const now = FieldValue.serverTimestamp();

  const payload = cleanUndefined({
    status: update.status,
    resolution_notes: update.resolution_notes,
    resolved_by: update.resolved_by,
    resolved_at: update.resolved_at ?? now,
    updated_at: now,
  });

  await docRef.update(payload);
}
