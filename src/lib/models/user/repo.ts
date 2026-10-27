import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { UserDocument } from '@/types/firestore';
import type { CreateUserIn } from './schema';

const COLLECTION = 'users';

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = stripUndefined(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export async function getUser(uid: string): Promise<UserDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  return snap.data() as UserDocument;
}

export async function createUser(input: CreateUserIn): Promise<UserDocument> {
  const ref = adminDb.collection(COLLECTION).doc(input.uid);
  const cleanInput = stripUndefined(input);
  const data = {
    ...cleanInput,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(data);
  const snap = await ref.get();
  return snap.data() as UserDocument;
}

export function createUserInTx(
  tx: FirebaseFirestore.Transaction,
  input: CreateUserIn
): { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> } {
  const ref = adminDb.collection(COLLECTION).doc(input.uid);
  const cleanInput = stripUndefined(input);
  const data = {
    ...cleanInput,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  tx.set(ref, data);
  return { ref, data };
}

export async function updateUser(
  uid: string,
  update: Partial<Omit<UserDocument, 'uid' | 'created_at'>>
): Promise<UserDocument | null> {
  const ref = adminDb.collection(COLLECTION).doc(uid);
  const cleanUpdate = stripUndefined(update as Record<string, unknown>);
  const data = {
    ...cleanUpdate,
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(data, { merge: true });
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as UserDocument;
}

export function buildStudentUserData(params: {
  uid: string;
  name: string;
  email: string;
  indexNumber: string;
  courseId: string;
}): Record<string, unknown> {
  return {
    uid: params.uid,
    name: params.name,
    email: params.email,
    role: 'student',
    roles: ['student'],
    active_role: 'student',
    profile: {
      index_number: params.indexNumber,
      course_id: params.courseId,
      registered: true,
      profile_complete: true,
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
}

export function buildStaffUserData(params: {
  uid: string;
  name: string;
  email: string;
  roles: string[];
  programmes?: string[];
  isProfileComplete?: boolean;
  researchInterests?: string[];
  maxTeamCapacity?: number;
}): Record<string, unknown> {
  const primaryRole = (params.roles?.[0] as UserDocument['role']) || 'supervisor';
  return {
    uid: params.uid,
    name: params.name,
    email: params.email,
    role: primaryRole,
    roles: params.roles || ['supervisor'],
    active_role: primaryRole,
    profile: {
      programmes: params.programmes || [],
      registered: true,
      profile_complete: Boolean(params.isProfileComplete),
      ...(params.researchInterests ? { research_interests: params.researchInterests } : {}),
      ...(params.maxTeamCapacity !== undefined ? { max_team_capacity: params.maxTeamCapacity } : {}),
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
}
