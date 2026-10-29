import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import type { RosterStudentDocument } from '@/types/firestore';

export function getStudentsCollection(yearId: string) {
  return adminDb.collection('rosters').doc(yearId).collection('students');
}

/**
 * Fetch a single roster student by academic year and 10-digit index number.
 */
export async function getRosterStudent(
  yearId: string,
  indexNumber: string
): Promise<RosterStudentDocument | null> {
  const docRef = getStudentsCollection(yearId).doc(indexNumber.trim());
  const snap = await docRef.get();
  if (!snap.exists) return null;
  const data = snap.data() as RosterStudentDocument;
  return {
    ...data,
    is_active: data.is_active !== false,
  };
}

export interface ListRosterFilter {
  course_id?: string;
  isLinked?: boolean;
  isActive?: boolean;
}

/**
 * List roster students for an academic year with optional filters.
 */
export async function listRosterStudents(
  yearId: string,
  filter?: ListRosterFilter
): Promise<RosterStudentDocument[]> {
  const collectionRef = getStudentsCollection(yearId);
  const snap = await collectionRef.get();
  let list = snap.docs.map((d) => {
    const data = d.data() as RosterStudentDocument;
    return {
      ...data,
      is_active: data.is_active !== false,
    };
  });

  if (filter?.course_id) {
    const courseId = filter.course_id.toLowerCase().trim();
    list = list.filter((item) => item.course_id.toLowerCase() === courseId);
  }

  if (filter?.isLinked !== undefined) {
    list = list.filter((item) => (item.user_uid !== null) === filter.isLinked);
  }

  if (filter?.isActive !== undefined) {
    list = list.filter((item) => (item.is_active !== false) === filter.isActive);
  }

  // Sort by index_number ascending
  list.sort((a, b) => a.index_number.localeCompare(b.index_number));
  return list;
}

/**
 * Check which index numbers in a given array already exist in Firestore.
 * Performs chunked lookups (chunks of 30 for fieldPath 'in' queries, or direct getAll).
 */
export async function checkExistingIndexNumbers(
  yearId: string,
  indexNumbers: string[]
): Promise<Set<string>> {
  const existingSet = new Set<string>();
  if (indexNumbers.length === 0) return existingSet;

  const collectionRef = getStudentsCollection(yearId);

  // Firestore getAll supports up to several hundred refs at once
  const chunkSize = 100;
  for (let i = 0; i < indexNumbers.length; i += chunkSize) {
    const chunk = indexNumbers.slice(i, i + chunkSize);
    const refs = chunk.map((index) => collectionRef.doc(index));
    const snapshots = await adminDb.getAll(...refs);

    for (const snap of snapshots) {
      if (snap.exists) {
        existingSet.add(snap.id);
      }
    }
  }

  return existingSet;
}

/**
 * Commit validated student rows in transactional batches of size N (default 50).
 */
export async function batchCommitRosterStudents(
  yearId: string,
  students: RosterStudentDocument[],
  batchSize: number = 50
): Promise<{ committed: number }> {
  if (students.length === 0) return { committed: 0 };

  const collectionRef = getStudentsCollection(yearId);
  let committed = 0;

  for (let i = 0; i < students.length; i += batchSize) {
    const chunk = students.slice(i, i + batchSize);
    const batch = adminDb.batch();

    for (const student of chunk) {
      const docRef = collectionRef.doc(student.index_number);
      batch.set(
        docRef,
        {
          ...student,
          is_active: student.is_active !== false,
        },
        { merge: false }
      );
    }

    await batch.commit();
    committed += chunk.length;
  }

  return { committed };
}
