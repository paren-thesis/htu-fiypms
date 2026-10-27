import { Timestamp } from 'firebase-admin/firestore';

/**
 * Checks whether a value is a Firestore Timestamp.
 */
export function isFirestoreTimestamp(val: unknown): val is Timestamp {
  if (!val || typeof val !== 'object') return false;
  return (
    val instanceof Timestamp ||
    (typeof (val as { toMillis?: unknown }).toMillis === 'function' &&
      typeof (val as { toDate?: unknown }).toDate === 'function')
  );
}

/**
 * Converts a Firestore Timestamp to milliseconds since epoch.
 */
export function timestampToMillis(
  timestamp?: Timestamp | null
): number | null {
  if (!timestamp) return null;
  return timestamp.toMillis();
}

/**
 * Converts a Firestore Timestamp to an ISO-8601 string.
 */
export function timestampToIso(
  timestamp?: Timestamp | null
): string | null {
  if (!timestamp) return null;
  return timestamp.toDate().toISOString();
}

/**
 * Converts milliseconds to a Firestore Timestamp.
 */
export function millisToTimestamp(millis: number): Timestamp {
  return Timestamp.fromMillis(millis);
}

/**
 * Deeply traverses an object or array and converts all Firestore Timestamps
 * to ISO-8601 strings so the data can be safely passed to Client Components.
 */
export function serializeTimestamps<T>(data: T): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (isFirestoreTimestamp(data)) {
    return data.toDate().toISOString();
  }

  if (Array.isArray(data)) {
    return data.map((item) => serializeTimestamps(item));
  }

  if (typeof data === 'object' && data.constructor === Object) {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      serialized[key] = serializeTimestamps(value);
    }
    return serialized;
  }

  return data;
}

/**
 * Safely converts Firestore document objects across the Server Component
 * to Client Component boundary by stripping class instances and non-plain prototypes.
 */
export function serializeForClient<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}
