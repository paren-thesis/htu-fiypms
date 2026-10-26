import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type {
  SupervisorContactDocument,
} from '@/types/firestore';
import type {
  UpsertSupervisorContactIn,
} from './schema';

const COLLECTION = 'supervisor_contacts';

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result as T;
}

/**
 * Retrieves gated supervisor contact details by supervisor UID.
 */
export async function getSupervisorContact(
  supervisorId: string
): Promise<SupervisorContactDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(supervisorId).get();
  if (!snap.exists) return null;
  return snap.data() as SupervisorContactDocument;
}

/**
 * Upserts a supervisor contact document.
 */
export async function upsertSupervisorContact(
  supervisorId: string,
  input: UpsertSupervisorContactIn
): Promise<SupervisorContactDocument> {
  const docRef = adminDb.collection(COLLECTION).doc(supervisorId);
  const data = stripUndefined({
    supervisor_id: supervisorId,
    office_location: input.office_location,
    consultation_hours: input.consultation_hours,
    phone: input.phone || null,
    updated_at: FieldValue.serverTimestamp(),
  });

  await docRef.set(data, { merge: true });
  const updated = await docRef.get();
  return updated.data() as SupervisorContactDocument;
}

/**
 * Stages an upsert of supervisor contact details inside an active transaction.
 */
export function upsertSupervisorContactInTx(
  tx: Transaction,
  supervisorId: string,
  input: UpsertSupervisorContactIn
): void {
  const docRef = adminDb.collection(COLLECTION).doc(supervisorId);
  const data = stripUndefined({
    supervisor_id: supervisorId,
    office_location: input.office_location,
    consultation_hours: input.consultation_hours,
    phone: input.phone || null,
    updated_at: FieldValue.serverTimestamp(),
  });

  tx.set(docRef, data, { merge: true });
}

/**
 * Grants a student read access to a supervisor's gated contact details.
 */
export async function grantContactAccess(
  supervisorId: string,
  studentId: string,
  teamId: string
): Promise<void> {
  const grantRef = adminDb
    .collection(COLLECTION)
    .doc(supervisorId)
    .collection('grants')
    .doc(studentId);

  await grantRef.set({
    student_id: studentId,
    team_id: teamId,
    granted_at: FieldValue.serverTimestamp(),
  });
}

/**
 * Stages a contact access grant inside an active transaction.
 */
export function grantContactAccessInTx(
  tx: Transaction,
  supervisorId: string,
  studentId: string,
  teamId: string
): void {
  const grantRef = adminDb
    .collection(COLLECTION)
    .doc(supervisorId)
    .collection('grants')
    .doc(studentId);

  tx.set(grantRef, {
    student_id: studentId,
    team_id: teamId,
    granted_at: FieldValue.serverTimestamp(),
  });
}

/**
 * Revokes a student's contact access grant.
 */
export async function revokeContactAccess(
  supervisorId: string,
  studentId: string
): Promise<void> {
  const grantRef = adminDb
    .collection(COLLECTION)
    .doc(supervisorId)
    .collection('grants')
    .doc(studentId);

  await grantRef.delete();
}

/**
 * Stages revocation of contact access inside an active transaction.
 */
export function revokeContactAccessInTx(
  tx: Transaction,
  supervisorId: string,
  studentId: string
): void {
  const grantRef = adminDb
    .collection(COLLECTION)
    .doc(supervisorId)
    .collection('grants')
    .doc(studentId);

  tx.delete(grantRef);
}

/**
 * Checks if a student has been granted access to a supervisor's contact details.
 */
export async function hasContactGrant(
  supervisorId: string,
  studentId: string
): Promise<boolean> {
  const grantSnap = await adminDb
    .collection(COLLECTION)
    .doc(supervisorId)
    .collection('grants')
    .doc(studentId)
    .get();

  return grantSnap.exists;
}
