import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import type { CourseDocument } from '@/types/firestore';
import type { CreateCourseIn } from './schema';

const COLLECTION = 'courses';

/**
 * Retrieves a single course by its ID (e.g. "btech-cs").
 */
export async function getCourse(id: string): Promise<CourseDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return snap.data() as CourseDocument;
}

/**
 * Lists all registered departmental courses.
 */
export async function listCourses(): Promise<CourseDocument[]> {
  const snap = await adminDb.collection(COLLECTION).orderBy('code', 'asc').get();
  return snap.docs.map((doc) => doc.data() as CourseDocument);
}

/**
 * Upserts a course document.
 */
export async function upsertCourse(
  input: CreateCourseIn
): Promise<CourseDocument> {
  const ref = adminDb.collection(COLLECTION).doc(input.id);
  const data: CourseDocument = {
    id: input.id,
    code: input.code,
    name: input.name,
    department: input.department,
  };

  await ref.set(data, { merge: true });
  const snap = await ref.get();
  return snap.data() as CourseDocument;
}
