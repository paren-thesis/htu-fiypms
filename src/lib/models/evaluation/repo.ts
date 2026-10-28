import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { EvaluationDocument } from '@/types/firestore';
import { evaluationId } from '@/lib/defense/eval-id';

export const EVALUATIONS_COLLECTION = 'evaluations';

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
 * Fetch an evaluation document by its deterministic ID.
 */
export async function getEvaluation(id: string): Promise<EvaluationDocument | null> {
  const doc = await adminDb.collection(EVALUATIONS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Omit<EvaluationDocument, 'id'>) };
}

/**
 * Fetch an evaluation by team ID and evaluator UID.
 */
export async function getEvaluationForEvaluator(
  teamId: string,
  evaluatorUid: string
): Promise<EvaluationDocument | null> {
  const id = evaluationId(teamId, evaluatorUid);
  return getEvaluation(id);
}

/**
 * List all evaluations for a team.
 */
export async function listEvaluationsForTeam(
  teamId: string
): Promise<EvaluationDocument[]> {
  const snap = await adminDb
    .collection(EVALUATIONS_COLLECTION)
    .where('team_id', '==', teamId)
    .get();

  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<EvaluationDocument, 'id'>) } as EvaluationDocument)
  );
}

/**
 * List all evaluations submitted by a specific evaluator.
 */
export async function listEvaluationsByEvaluator(
  evaluatorId: string
): Promise<EvaluationDocument[]> {
  const snap = await adminDb
    .collection(EVALUATIONS_COLLECTION)
    .where('evaluator_id', '==', evaluatorId)
    .get();

  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<EvaluationDocument, 'id'>) } as EvaluationDocument)
  );
}

/**
 * Save (create or overwrite) an evaluation document.
 * Enforces deterministic ID: `${teamId}__${evaluatorUid}__team` and student_id is null.
 */
export async function saveEvaluationDoc(
  evalData: {
    team_id: string;
    evaluator_id: string;
    evaluator_role: EvaluationDocument['evaluator_role'];
    rubric_id: string;
    scores: Record<string, number>;
    total_score: number;
    comments?: string;
    is_published?: boolean;
    student_id?: null;
  }
): Promise<EvaluationDocument> {
  const id = evaluationId(evalData.team_id, evalData.evaluator_id);
  const ref = adminDb.collection(EVALUATIONS_COLLECTION).doc(id);

  const now = Timestamp.now();
  const existing = await ref.get();

  const docData: Record<string, unknown> = cleanUndefined({
    team_id: evalData.team_id,
    student_id: null,
    evaluator_id: evalData.evaluator_id,
    evaluator_role: evalData.evaluator_role,
    rubric_id: evalData.rubric_id,
    scores: evalData.scores,
    total_score: evalData.total_score,
    comments: evalData.comments ?? '',
    is_published: evalData.is_published ?? false,
    updated_at: FieldValue.serverTimestamp(),
  });

  if (!existing.exists) {
    docData.id = id;
    docData.created_at = FieldValue.serverTimestamp();
    await ref.set(docData);
  } else {
    await ref.set(docData, { merge: true });
  }

  return {
    id,
    team_id: evalData.team_id,
    student_id: null,
    evaluator_id: evalData.evaluator_id,
    evaluator_role: evalData.evaluator_role,
    rubric_id: evalData.rubric_id,
    scores: evalData.scores,
    total_score: evalData.total_score,
    comments: evalData.comments ?? '',
    is_published: evalData.is_published ?? false,
    created_at: existing.exists
      ? (existing.data()?.created_at as FirebaseFirestore.Timestamp)
      : (now as unknown as FirebaseFirestore.Timestamp),
    updated_at: now as unknown as FirebaseFirestore.Timestamp,
  };
}

/**
 * Updates an evaluation document by ID.
 */
export async function updateEvaluationDoc(
  id: string,
  updates: Partial<Pick<EvaluationDocument, 'scores' | 'total_score' | 'comments' | 'is_published'>>
): Promise<void> {
  const ref = adminDb.collection(EVALUATIONS_COLLECTION).doc(id);
  const cleanData = cleanUndefined({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });
  await ref.update(cleanData);
}
