import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { PeerEvaluationDocument } from '@/types/firestore';
import { peerEvaluationId } from './peer-id';

export const PEER_EVALUATIONS_COLLECTION = 'peer_evaluations';

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
 * Fetch a peer evaluation document by its deterministic ID.
 */
export async function getPeerEvaluation(id: string): Promise<PeerEvaluationDocument | null> {
  const doc = await adminDb.collection(PEER_EVALUATIONS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Omit<PeerEvaluationDocument, 'id'>) };
}

/**
 * Fetch a peer evaluation for a specific pair within a team.
 */
export async function getPeerEvaluationForPair(
  teamId: string,
  evaluatorUid: string,
  evaluateeUid: string
): Promise<PeerEvaluationDocument | null> {
  const id = peerEvaluationId(teamId, evaluatorUid, evaluateeUid);
  return getPeerEvaluation(id);
}

/**
 * List all peer evaluations submitted for a team.
 */
export async function listPeerEvaluationsForTeam(
  teamId: string
): Promise<PeerEvaluationDocument[]> {
  const snap = await adminDb
    .collection(PEER_EVALUATIONS_COLLECTION)
    .where('team_id', '==', teamId)
    .get();

  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<PeerEvaluationDocument, 'id'>) } as PeerEvaluationDocument)
  );
}

/**
 * List all peer evaluations submitted by an evaluator.
 */
export async function listPeerEvaluationsByEvaluator(
  evaluatorUid: string
): Promise<PeerEvaluationDocument[]> {
  const snap = await adminDb
    .collection(PEER_EVALUATIONS_COLLECTION)
    .where('evaluator_id', '==', evaluatorUid)
    .get();

  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<PeerEvaluationDocument, 'id'>) } as PeerEvaluationDocument)
  );
}

/**
 * List all peer evaluations received by an evaluatee.
 */
export async function listPeerEvaluationsForEvaluatee(
  evaluateeUid: string
): Promise<PeerEvaluationDocument[]> {
  const snap = await adminDb
    .collection(PEER_EVALUATIONS_COLLECTION)
    .where('evaluatee_id', '==', evaluateeUid)
    .get();

  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<PeerEvaluationDocument, 'id'>) } as PeerEvaluationDocument)
  );
}

/**
 * Creates a peer evaluation document. Immutable once written.
 */
export async function createPeerEvaluationDoc(
  id: string,
  data: Omit<PeerEvaluationDocument, 'id' | 'submitted_at'> & {
    submitted_at?: Timestamp | FieldValue;
  }
): Promise<void> {
  const docRef = adminDb.collection(PEER_EVALUATIONS_COLLECTION).doc(id);
  const cleaned = cleanUndefined({
    ...data,
    submitted_at: data.submitted_at || FieldValue.serverTimestamp(),
  });
  await docRef.create(cleaned);
}
