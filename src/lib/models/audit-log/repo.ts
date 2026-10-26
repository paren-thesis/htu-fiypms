import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { AuditLogDocument } from '@/types/firestore';
import type { PaginatedResult } from '@/lib/models/common';
import type { CreateAuditLogIn } from './schema';

const COLLECTION = 'audit_logs';

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export async function createAuditLog(input: CreateAuditLogIn): Promise<AuditLogDocument> {
  const ref = adminDb.collection(COLLECTION).doc();
  const cleanInput = stripUndefined(input);
  const data = {
    ...cleanInput,
    id: ref.id,
    timestamp: FieldValue.serverTimestamp(),
  };

  await ref.set(data);
  const snap = await ref.get();
  return snap.data() as AuditLogDocument;
}

export function createAuditLogInTx(
  tx: FirebaseFirestore.Transaction,
  input: CreateAuditLogIn
): { id: string; ref: FirebaseFirestore.DocumentReference } {
  const ref = adminDb.collection(COLLECTION).doc();
  const cleanInput = stripUndefined(input);
  const data = {
    ...cleanInput,
    id: ref.id,
    timestamp: FieldValue.serverTimestamp(),
  };

  tx.set(ref, data);
  return { id: ref.id, ref };
}

export async function getAuditLogById(id: string): Promise<AuditLogDocument | null> {
  const doc = await adminDb.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return doc.data() as AuditLogDocument;
}

export interface ListAuditLogsOptions {
  limit?: number;
  startAfterId?: string | null;
  action?: string;
  targetType?: string;
}

export async function listAuditLogs(
  options: ListAuditLogsOptions = {}
): Promise<PaginatedResult<AuditLogDocument>> {
  const pageSize = options.limit ?? 25;
  let query: FirebaseFirestore.Query = adminDb
    .collection(COLLECTION)
    .orderBy('timestamp', 'desc');

  if (options.action) {
    query = query.where('action', '==', options.action);
  }
  if (options.targetType) {
    query = query.where('target_type', '==', options.targetType);
  }

  if (options.startAfterId) {
    const startDoc = await adminDb.collection(COLLECTION).doc(options.startAfterId).get();
    if (startDoc.exists) {
      query = query.startAfter(startDoc);
    }
  }

  // Fetch one extra to determine hasMore
  const snapshot = await query.limit(pageSize + 1).get();
  const docs = snapshot.docs;
  const hasMore = docs.length > pageSize;
  const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

  const items = pageDocs.map((d) => d.data() as AuditLogDocument);
  const lastDoc = pageDocs[pageDocs.length - 1];
  const nextCursor = lastDoc ? lastDoc.id : null;

  return {
    items,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
  };
}
