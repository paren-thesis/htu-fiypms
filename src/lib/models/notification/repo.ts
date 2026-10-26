import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { NotificationDocument } from '@/types/firestore';
import type { CreateNotificationIn } from './schema';

const COLLECTION = 'notifications';

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export async function createNotification(
  input: CreateNotificationIn
): Promise<NotificationDocument> {
  const ref = adminDb.collection(COLLECTION).doc();
  const clean = stripUndefined(input);
  const data = {
    ...clean,
    id: ref.id,
    is_read: false,
    created_at: FieldValue.serverTimestamp(),
  };

  await ref.set(data);
  const snap = await ref.get();
  return snap.data() as NotificationDocument;
}

export function createNotificationInTx(
  tx: FirebaseFirestore.Transaction,
  input: CreateNotificationIn
): { id: string; ref: FirebaseFirestore.DocumentReference } {
  const ref = adminDb.collection(COLLECTION).doc();
  const clean = stripUndefined(input);
  const data = {
    ...clean,
    id: ref.id,
    is_read: false,
    created_at: FieldValue.serverTimestamp(),
  };

  tx.set(ref, data);
  return { id: ref.id, ref };
}

export async function getNotificationById(
  id: string
): Promise<NotificationDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as NotificationDocument;
}

export interface ListUserNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
}

export async function listNotificationsByUser(
  userId: string,
  options: ListUserNotificationsOptions = {}
): Promise<NotificationDocument[]> {
  const limit = options.limit ?? 50;
  let query: FirebaseFirestore.Query = adminDb
    .collection(COLLECTION)
    .where('user_id', '==', userId)
    .orderBy('created_at', 'desc');

  if (options.unreadOnly) {
    query = query.where('is_read', '==', false);
  }

  const snap = await query.limit(limit).get();
  return snap.docs.map((d) => d.data() as NotificationDocument);
}

export async function markNotificationAsRead(
  id: string,
  isRead = true
): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).update({
    is_read: isRead,
  });
}

export async function deleteNotification(id: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).delete();
}
