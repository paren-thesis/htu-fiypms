import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { NotificationType } from '@/types/firestore';

export interface NotifyPayload {
  title: string;
  body: string;
  type: NotificationType;
  target_url?: string;
}

const BATCH_SIZE = 400; // Strictly <= 400 per Firestore write batch

/**
 * Creates in-app notifications for one or more users.
 * Automatically handles batching for <= 400 writes per batch.
 *
 * @param userIds List of recipient user IDs
 * @param payload Notification content and metadata
 * @returns Array of generated notification document IDs
 */
export async function notify(
  userIds: string[],
  payload: NotifyPayload
): Promise<string[]> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return [];

  const createdIds: string[] = [];

  for (let i = 0; i < uniqueUserIds.length; i += BATCH_SIZE) {
    const chunk = uniqueUserIds.slice(i, i + BATCH_SIZE);
    const batch = adminDb.batch();

    for (const uid of chunk) {
      const ref = adminDb.collection('notifications').doc();
      createdIds.push(ref.id);

      const docData: Record<string, unknown> = {
        id: ref.id,
        user_id: uid,
        title: payload.title,
        body: payload.body,
        type: payload.type,
        is_read: false,
        created_at: FieldValue.serverTimestamp(),
      };

      if (payload.target_url) {
        docData.target_url = payload.target_url;
      }

      batch.set(ref, docData);
    }

    await batch.commit();
  }

  return createdIds;
}

/**
 * Appends notification writes to an existing Firestore transaction.
 *
 * @param tx The active Firestore transaction
 * @param userIds List of recipient user IDs
 * @param payload Notification content and metadata
 * @returns Array of generated notification document IDs
 */
export function notifyInTx(
  tx: FirebaseFirestore.Transaction,
  userIds: string[],
  payload: NotifyPayload
): string[] {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return [];

  const createdIds: string[] = [];

  for (const uid of uniqueUserIds) {
    const ref = adminDb.collection('notifications').doc();
    createdIds.push(ref.id);

    const docData: Record<string, unknown> = {
      id: ref.id,
      user_id: uid,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      is_read: false,
      created_at: FieldValue.serverTimestamp(),
    };

    if (payload.target_url) {
      docData.target_url = payload.target_url;
    }

    tx.set(ref, docData);
  }

  return createdIds;
}
