import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { RubricDocument } from '@/types/firestore';
import type { CreateRubricIn } from './schema';

export const RUBRICS_COLLECTION = 'rubrics';

/**
 * Fetch a single rubric by its ID.
 */
export async function getRubric(id: string): Promise<RubricDocument | null> {
  const doc = await adminDb.collection(RUBRICS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Omit<RubricDocument, 'id'>) };
}

/**
 * Get the currently active rubric, if one exists.
 */
export async function getActiveRubric(): Promise<RubricDocument | null> {
  const snap = await adminDb
    .collection(RUBRICS_COLLECTION)
    .where('is_active', '==', true)
    .limit(1)
    .get();

  if (snap.empty || !snap.docs[0]) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<RubricDocument, 'id'>) };
}

/**
 * List all rubrics (excluding or including archived).
 * Ordered by created_at descending.
 */
export async function listRubrics(includeArchived = false): Promise<RubricDocument[]> {
  const snap = await adminDb.collection(RUBRICS_COLLECTION).get();
  let rubrics = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<RubricDocument, 'id'>) } as RubricDocument)
  );

  if (!includeArchived) {
    rubrics = rubrics.filter((r) => !r.is_archived);
  }

  // Sort by created_at desc (in memory in case compound index is missing)
  return rubrics.sort((a, b) => {
    const aTime = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
    const bTime = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
    return bTime - aTime;
  });
}

/**
 * Checks whether any evaluation references this rubric.
 * When an evaluation exists, modifications or deletions must be blocked (HTTP 409).
 */
export async function hasEvaluationsForRubric(rubricId: string): Promise<boolean> {
  const snap = await adminDb
    .collection('evaluations')
    .where('rubric_id', '==', rubricId)
    .limit(1)
    .get();

  return !snap.empty;
}

/**
 * Create a new rubric document.
 * By default is_active is false until explicitly activated.
 */
export async function createRubricDoc(
  input: CreateRubricIn,
  customId?: string
): Promise<RubricDocument> {
  const ref = customId
    ? adminDb.collection(RUBRICS_COLLECTION).doc(customId)
    : adminDb.collection(RUBRICS_COLLECTION).doc();

  const docData = {
    title: input.title,
    max_score: input.max_score,
    supervisor_weight_pct: input.supervisor_weight_pct,
    panel_weight_pct: input.panel_weight_pct,
    is_active: false,
    is_archived: false,
    criteria: input.criteria,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  const createdSnap = await ref.get();
  return { id: ref.id, ...(createdSnap.data() as Omit<RubricDocument, 'id'>) };
}
