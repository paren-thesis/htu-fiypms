import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { SupervisionDocument, UserDocument } from '@/types/firestore';

const COLLECTION = 'supervisions';

export function supervisionDocId(supervisorUid: string, academicYearId: string): string {
  return `${supervisorUid}__${academicYearId}`;
}

/**
 * Retrieve supervision document for a supervisor and academic year.
 */
export async function getSupervision(
  supervisorUid: string,
  academicYearId: string
): Promise<SupervisionDocument | null> {
  const docId = supervisionDocId(supervisorUid, academicYearId);
  return getSupervisionById(docId);
}

/**
 * Retrieve supervision document by ID.
 */
export async function getSupervisionById(docId: string): Promise<SupervisionDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(docId).get();
  if (!snap.exists) return null;
  return snap.data() as SupervisionDocument;
}

/**
 * List all supervision documents for a specific academic year.
 */
export async function listSupervisionsByYear(
  academicYearId: string
): Promise<SupervisionDocument[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where('academic_year_id', '==', academicYearId)
    .get();

  return snap.docs.map((d) => d.data() as SupervisionDocument);
}

/**
 * Ensures a supervision record exists for the given supervisor and academic year.
 * Doc id: `${supervisorUid}__${academicYearId}`.
 * Max capacity is derived from user profile.max_team_capacity (default 5).
 */
export async function ensureSupervisionDoc(
  supervisorUid: string,
  academicYearId: string,
  maxCapacity?: number
): Promise<SupervisionDocument> {
  const docId = supervisionDocId(supervisorUid, academicYearId);
  const ref = adminDb.collection(COLLECTION).doc(docId);
  const snap = await ref.get();

  if (snap.exists) {
    const existing = snap.data() as SupervisionDocument;
    if (maxCapacity !== undefined && maxCapacity !== existing.max_capacity) {
      const newStatus = existing.current_assigned_count >= maxCapacity ? 'at_capacity' : 'available';
      await ref.update({
        max_capacity: maxCapacity,
        status: newStatus,
        updated_at: FieldValue.serverTimestamp(),
      });
      const updatedSnap = await ref.get();
      return updatedSnap.data() as SupervisionDocument;
    }
    return existing;
  }

  let capacity = maxCapacity;
  if (capacity === undefined) {
    const userSnap = await adminDb.collection('users').doc(supervisorUid).get();
    if (userSnap.exists) {
      const userData = userSnap.data() as UserDocument;
      capacity = userData.profile?.max_team_capacity;
    }
  }
  if (capacity === undefined || capacity < 1) {
    capacity = 5;
  }

  const newDoc: SupervisionDocument = {
    id: docId,
    supervisor_id: supervisorUid,
    academic_year_id: academicYearId,
    max_capacity: capacity,
    current_assigned_count: 0,
    assigned_team_ids: [],
    status: 'available',
    updated_at: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
  };

  await ref.set(newDoc);
  const createdSnap = await ref.get();
  return createdSnap.data() as SupervisionDocument;
}

/**
 * Transactional version: ensures supervision record exists inside a transaction.
 */
export async function ensureSupervisionDocInTx(
  tx: FirebaseFirestore.Transaction,
  supervisorUid: string,
  academicYearId: string,
  maxCapacity?: number
): Promise<SupervisionDocument> {
  const docId = supervisionDocId(supervisorUid, academicYearId);
  const ref = adminDb.collection(COLLECTION).doc(docId);
  const snap = await tx.get(ref);

  if (snap.exists) {
    return snap.data() as SupervisionDocument;
  }

  let capacity = maxCapacity;
  if (capacity === undefined) {
    const userRef = adminDb.collection('users').doc(supervisorUid);
    const userSnap = await tx.get(userRef);
    if (userSnap.exists) {
      const userData = userSnap.data() as UserDocument;
      capacity = userData.profile?.max_team_capacity;
    }
  }
  if (capacity === undefined || capacity < 1) {
    capacity = 5;
  }

  const newDoc: SupervisionDocument = {
    id: docId,
    supervisor_id: supervisorUid,
    academic_year_id: academicYearId,
    max_capacity: capacity,
    current_assigned_count: 0,
    assigned_team_ids: [],
    status: 'available',
    updated_at: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
  };

  tx.set(ref, newDoc);
  return newDoc;
}
