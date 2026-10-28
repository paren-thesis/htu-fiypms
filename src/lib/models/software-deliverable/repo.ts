import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { SoftwareDeliverableDocument } from '@/types/firestore';

export const SOFTWARE_DELIVERABLES_COLLECTION = 'software_deliverables';

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
 * Fetch a software deliverable document by its team ID (doc id = teamId).
 */
export async function getDeliverable(teamId: string): Promise<SoftwareDeliverableDocument | null> {
  const doc = await adminDb.collection(SOFTWARE_DELIVERABLES_COLLECTION).doc(teamId).get();
  if (!doc.exists) return null;
  return { team_id: doc.id, ...(doc.data() as Omit<SoftwareDeliverableDocument, 'team_id'>) };
}

/**
 * List all software deliverables.
 */
export async function listDeliverables(): Promise<SoftwareDeliverableDocument[]> {
  const snap = await adminDb.collection(SOFTWARE_DELIVERABLES_COLLECTION).get();
  return snap.docs.map(
    (d) => ({ team_id: d.id, ...(d.data() as Omit<SoftwareDeliverableDocument, 'team_id'>) } as SoftwareDeliverableDocument)
  );
}

/**
 * Creates or updates a deliverable submission for a team.
 */
export async function upsertDeliverable(
  teamId: string,
  data: Omit<
    SoftwareDeliverableDocument,
    'team_id' | 'submitted_at' | 'approved_by_supervisor_at' | 'supervisor_signoff_notes'
  > & {
    submitted_at?: Timestamp | FieldValue;
  }
): Promise<void> {
  const docRef = adminDb.collection(SOFTWARE_DELIVERABLES_COLLECTION).doc(teamId);
  const cleaned = cleanUndefined({
    ...data,
    submitted_at: data.submitted_at || FieldValue.serverTimestamp(),
  });
  await docRef.set(cleaned, { merge: true });
}

/**
 * Records formal supervisor sign-off on a team's software deliverable.
 */
export async function recordSupervisorSignoff(
  teamId: string,
  notes?: string
): Promise<void> {
  const docRef = adminDb.collection(SOFTWARE_DELIVERABLES_COLLECTION).doc(teamId);
  await docRef.update(
    cleanUndefined({
      approved_by_supervisor_at: FieldValue.serverTimestamp(),
      supervisor_signoff_notes: notes || '',
    })
  );
}
