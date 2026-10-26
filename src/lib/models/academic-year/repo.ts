import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type {
  AcademicYearDocument,
  CounterDocument,
} from '@/types/firestore';
import { isFirestoreTimestamp } from '@/lib/serialize';
import type { CreateAcademicYearIn, UpdateAcademicYearIn } from './schema';

const COLLECTION = 'academic_years';

function toTimestamp(val: unknown): FirebaseFirestore.Timestamp {
  if (isFirestoreTimestamp(val)) return val;
  if (val instanceof Date) return Timestamp.fromDate(val);
  if (typeof val === 'string') return Timestamp.fromDate(new Date(val));
  throw new Error(`Cannot convert ${String(val)} to Firestore Timestamp`);
}

function normalizeDeadlines(
  deadlines: CreateAcademicYearIn['deadlines']
): AcademicYearDocument['deadlines'] {
  const result: AcademicYearDocument['deadlines'] = {
    roster_import_deadline: toTimestamp(deadlines.roster_import_deadline),
    team_formation_deadline: toTimestamp(deadlines.team_formation_deadline),
    topic_submission_deadline: toTimestamp(deadlines.topic_submission_deadline),
    chapters_deadline: toTimestamp(deadlines.chapters_deadline),
    defense_start_date: toTimestamp(deadlines.defense_start_date),
    defense_end_date: toTimestamp(deadlines.defense_end_date),
  };

  if (deadlines.grade_appeal_deadline) {
    result.grade_appeal_deadline = toTimestamp(deadlines.grade_appeal_deadline);
  }

  return result;
}

/**
 * Retrieves the currently active academic year.
 */
export async function getCurrentAcademicYear(): Promise<AcademicYearDocument | null> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where('is_active', '==', true)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return doc ? (doc.data() as AcademicYearDocument) : null;
}

/**
 * Retrieves an academic year document by its ID (e.g. "2026-2027").
 */
export async function getAcademicYear(
  id: string
): Promise<AcademicYearDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as AcademicYearDocument;
}

/**
 * Lists all academic years ordered by code descending.
 */
export async function listAcademicYears(): Promise<AcademicYearDocument[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .orderBy('code', 'desc')
    .get();
  return snap.docs.map((doc) => doc.data() as AcademicYearDocument);
}

/**
 * Upserts an academic year document.
 */
export async function upsertAcademicYear(
  input: CreateAcademicYearIn
): Promise<AcademicYearDocument> {
  const ref = adminDb.collection(COLLECTION).doc(input.id);
  const existing = await ref.get();

  const deadlines = normalizeDeadlines(input.deadlines);

  const data: Record<string, unknown> = {
    id: input.id,
    code: input.code,
    semester: input.semester,
    is_active: input.is_active,
    deadlines,
  };

  if (!existing.exists) {
    data.grades_published = false;
    data.created_at = FieldValue.serverTimestamp();
  }

  await ref.set(data, { merge: true });
  const snap = await ref.get();
  return snap.data() as AcademicYearDocument;
}

/**
 * Updates editable fields of an academic year.
 */
export async function updateAcademicYear(
  id: string,
  input: UpdateAcademicYearIn
): Promise<AcademicYearDocument | null> {
  const ref = adminDb.collection(COLLECTION).doc(id);
  const updateData: Record<string, unknown> = {};

  if (input.semester !== undefined) updateData.semester = input.semester;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  if (input.deadlines) {
    for (const [key, val] of Object.entries(input.deadlines)) {
      if (val !== undefined) {
        updateData[`deadlines.${key}`] = toTimestamp(val);
      }
    }
  }

  await ref.update(updateData);
  const snap = await ref.get();
  return snap.data() as AcademicYearDocument;
}

/**
 * Subcollection: academic_years/{yearId}/counters/{courseId}
 * Initializes a counter document if not present.
 */
export async function initCounter(
  yearId: string,
  courseId: string,
  nextSequence = 1
): Promise<void> {
  const ref = adminDb
    .collection(COLLECTION)
    .doc(yearId)
    .collection('counters')
    .doc(courseId);

  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ next_sequence: nextSequence });
  }
}

/**
 * Retrieves the current counter for a course in an academic year.
 */
export async function getCounter(
  yearId: string,
  courseId: string
): Promise<CounterDocument | null> {
  const snap = await adminDb
    .collection(COLLECTION)
    .doc(yearId)
    .collection('counters')
    .doc(courseId)
    .get();

  if (!snap.exists) return null;
  return snap.data() as CounterDocument;
}

/**
 * Increments and returns the next sequence number inside an active transaction.
 */
export async function incrementCounterInTx(
  tx: FirebaseFirestore.Transaction,
  yearId: string,
  courseId: string
): Promise<number> {
  const ref = adminDb
    .collection(COLLECTION)
    .doc(yearId)
    .collection('counters')
    .doc(courseId);

  const snap = await tx.get(ref);
  let assignedSeq = 1;
  if (snap.exists) {
    const data = snap.data() as CounterDocument;
    assignedSeq = data.next_sequence || 1;
  }

  tx.set(ref, { next_sequence: assignedSeq + 1 }, { merge: true });
  return assignedSeq;
}
