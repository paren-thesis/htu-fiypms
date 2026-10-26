import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { StaffWhitelistDocument } from '@/types/firestore';
import type { AddStaffWhitelistIn, UpdateStaffWhitelistIn } from './schema';

const COLLECTION = 'staff_whitelist';

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Fetch a single staff whitelist document by lowercase email.
 */
export async function getStaffWhitelist(
  email: string
): Promise<StaffWhitelistDocument | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const snap = await adminDb.collection(COLLECTION).doc(normalizedEmail).get();
  if (!snap.exists) return null;
  return snap.data() as StaffWhitelistDocument;
}

export interface ListStaffWhitelistFilters {
  role?: string;
  programme?: string;
  isActive?: boolean;
}

/**
 * List all staff whitelist records, optionally filtered by role, programme, or active status.
 */
export async function listStaffWhitelist(
  filters?: ListStaffWhitelistFilters
): Promise<StaffWhitelistDocument[]> {
  const snap = await adminDb.collection(COLLECTION).get();
  let list = snap.docs.map((doc) => doc.data() as StaffWhitelistDocument);

  if (filters?.isActive !== undefined) {
    list = list.filter((item) => item.is_active === filters.isActive);
  }

  if (filters?.role) {
    const role = filters.role.toLowerCase();
    list = list.filter((item) => item.roles.includes(role));
  }

  if (filters?.programme) {
    const programme = filters.programme.toLowerCase();
    list = list.filter((item) =>
      item.programmes.map((p) => p.toLowerCase()).includes(programme)
    );
  }

  // Sort by full_name ascending
  list.sort((a, b) => a.full_name.localeCompare(b.full_name));

  return list;
}

/**
 * Create a new staff whitelist entry.
 * Note: email must not exist already.
 */
export async function createStaffWhitelist(
  input: AddStaffWhitelistIn,
  addedByUid: string
): Promise<StaffWhitelistDocument> {
  const email = input.email.trim().toLowerCase();
  const docRef = adminDb.collection(COLLECTION).doc(email);

  const newDoc: StaffWhitelistDocument = stripUndefined({
    email,
    full_name: input.full_name.trim(),
    roles: input.roles,
    department: input.department.trim(),
    programmes: input.programmes,
    phone: input.phone?.trim() || undefined,
    is_active: true,
    added_by_uid: addedByUid,
    added_at: Timestamp.now(),
    user_uid: null,
  });

  await docRef.create(newDoc);
  return newDoc;
}

/**
 * Update an existing staff whitelist entry.
 */
export async function updateStaffWhitelist(
  email: string,
  patch: UpdateStaffWhitelistIn
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const docRef = adminDb.collection(COLLECTION).doc(normalizedEmail);

  const cleanPatch = stripUndefined({
    full_name: patch.full_name?.trim(),
    roles: patch.roles,
    department: patch.department?.trim(),
    programmes: patch.programmes,
    phone: patch.phone !== undefined ? patch.phone.trim() || null : undefined,
  });

  if (Object.keys(cleanPatch).length === 0) return;

  await docRef.update(cleanPatch as Record<string, unknown>);
}

/**
 * Toggle staff active status.
 */
export async function setStaffActiveStatus(
  email: string,
  isActive: boolean
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const docRef = adminDb.collection(COLLECTION).doc(normalizedEmail);
  await docRef.update({
    is_active: isActive,
    updated_at: FieldValue.serverTimestamp(),
  });
}
