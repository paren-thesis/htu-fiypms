import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { tokenizeSearchQuery } from '@/lib/archive/tokens';
import type { ArchivedProjectDocument } from '@/types/firestore';

export const ARCHIVED_PROJECTS_COLLECTION = 'archived_projects';

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
 * Fetch a single archived project by ID (teamId).
 */
export async function getArchivedProject(
  teamId: string
): Promise<ArchivedProjectDocument | null> {
  const snap = await adminDb.collection(ARCHIVED_PROJECTS_COLLECTION).doc(teamId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<ArchivedProjectDocument, 'id'>) };
}

/**
 * Idempotently create or update an archived project record (doc id = teamId).
 * Preserves existing created_at timestamp when re-archiving the same team.
 */
export async function upsertArchivedProject(
  data: Omit<ArchivedProjectDocument, 'created_at'> & {
    created_at?: FirebaseFirestore.Timestamp;
  }
): Promise<ArchivedProjectDocument> {
  const docRef = adminDb.collection(ARCHIVED_PROJECTS_COLLECTION).doc(data.id);
  const existingSnap = await docRef.get();
  const existingData = existingSnap.exists
    ? (existingSnap.data() as Partial<ArchivedProjectDocument>)
    : undefined;

  const createdAt = existingData?.created_at ?? data.created_at ?? Timestamp.now();

  const payload = cleanUndefined({
    id: data.id,
    title: data.title,
    abstract: data.abstract,
    keywords: data.keywords,
    search_tokens: data.search_tokens,
    academic_year_id: data.academic_year_id,
    course_id: data.course_id,
    group_number: data.group_number,
    github_repository_url: data.github_repository_url,
    manuscript_url: data.manuscript_url,
    created_at: existingData?.created_at ? existingData.created_at : FieldValue.serverTimestamp(),
  });

  await docRef.set(payload);

  return {
    ...data,
    created_at: createdAt,
  };
}

export interface SearchArchivedProjectsParams {
  query?: string;
  tokens?: string[];
  course_id?: string;
  academic_year_id?: string;
  cursor?: string;
  limit?: number;
}

export interface SearchArchivedProjectsResult {
  items: ArchivedProjectDocument[];
  nextCursor: string | null;
}

/**
 * Search and filter archived projects using token-based array-contains-any (max 10 tokens),
 * optional course_id and academic_year_id filters, and cursor pagination.
 */
export async function listArchivedProjects(
  params: SearchArchivedProjectsParams = {}
): Promise<SearchArchivedProjectsResult> {
  const pageSize = Math.min(Math.max(params.limit ?? 12, 1), 50);
  const queryTokens =
    params.tokens && params.tokens.length > 0
      ? params.tokens.slice(0, 10)
      : params.query
      ? tokenizeSearchQuery(params.query, 10)
      : [];

  // If the user typed a non-empty query string that produced 0 valid tokens (e.g. only stopwords),
  // fall back to lowercase trimmed words >= 1 char or return empty if none.
  if (params.query && params.query.trim().length > 0 && queryTokens.length === 0) {
    return { items: [], nextCursor: null };
  }

  let ref: FirebaseFirestore.Query = adminDb.collection(ARCHIVED_PROJECTS_COLLECTION);

  if (queryTokens.length > 0) {
    ref = ref.where('search_tokens', 'array-contains-any', queryTokens);
  } else if (params.course_id && params.academic_year_id) {
    ref = ref
      .where('course_id', '==', params.course_id)
      .where('academic_year_id', '==', params.academic_year_id)
      .orderBy('created_at', 'desc');
  } else if (params.course_id) {
    ref = ref.where('course_id', '==', params.course_id);
  } else if (params.academic_year_id) {
    ref = ref.where('academic_year_id', '==', params.academic_year_id);
  } else {
    ref = ref.orderBy('created_at', 'desc');
  }

  const snap = await ref.get();
  let docs: ArchivedProjectDocument[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ArchivedProjectDocument, 'id'>),
  }));

  // Apply secondary equality filters if query used array-contains-any
  if (params.course_id) {
    docs = docs.filter((d) => d.course_id === params.course_id);
  }
  if (params.academic_year_id) {
    docs = docs.filter((d) => d.academic_year_id === params.academic_year_id);
  }

  // Sort consistently: created_at DESC, then group_number ASC, then id ASC
  docs.sort((a, b) => {
    const timeA = a.created_at?.toMillis?.() ?? 0;
    const timeB = b.created_at?.toMillis?.() ?? 0;
    if (timeB !== timeA) return timeB - timeA;
    return a.id.localeCompare(b.id);
  });

  // Apply cursor pagination (cursor = last seen doc id)
  let startIndex = 0;
  if (params.cursor) {
    const cursorIdx = docs.findIndex((d) => d.id === params.cursor);
    if (cursorIdx !== -1) {
      startIndex = cursorIdx + 1;
    }
  }

  const paged = docs.slice(startIndex, startIndex + pageSize);
  const hasMore = startIndex + pageSize < docs.length;
  const nextCursor = hasMore && paged.length > 0 ? paged[paged.length - 1]!.id : null;

  return {
    items: paged,
    nextCursor,
  };
}

/**
 * List archived projects for topic similarity comparisons (FR-03.5, FR-11.3).
 */
export async function listArchivedProjectsForSimilarity(
  excludeYearId?: string,
  limitCount = 300
): Promise<ArchivedProjectDocument[]> {
  const snap = await adminDb
    .collection(ARCHIVED_PROJECTS_COLLECTION)
    .limit(limitCount)
    .get();

  const results: ArchivedProjectDocument[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Omit<ArchivedProjectDocument, 'id'>;
    if (excludeYearId && data.academic_year_id === excludeYearId) {
      continue;
    }
    results.push({
      id: doc.id,
      ...data,
    });
  }
  return results;
}

