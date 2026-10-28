'use server';

// export const runtime = 'nodejs';

import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import {
  addStaffWhitelistInSchema,
  updateStaffWhitelistInSchema,
  type AddStaffWhitelistIn,
  type UpdateStaffWhitelistIn,
} from '@/lib/models/staff-whitelist/schema';
import {
  getStaffWhitelist,
  createStaffWhitelist,
  updateStaffWhitelist,
  setStaffActiveStatus,
  listStaffWhitelist,
  type ListStaffWhitelistFilters,
} from '@/lib/models/staff-whitelist/repo';
import type { StaffWhitelistDocument } from '@/types/firestore';

const ALLOWED_CALLER_ROLES = ['coordinator', 'admin'];

export interface AddStaffWhitelistActionInput extends AddStaffWhitelistIn {
  idToken: string;
}

export interface UpdateStaffWhitelistActionInput {
  idToken: string;
  email: string;
  patch: UpdateStaffWhitelistIn;
}

export interface DeactivateStaffWhitelistActionInput {
  idToken: string;
  email: string;
}

export interface ReactivateStaffWhitelistActionInput {
  idToken: string;
  email: string;
}

export interface FetchStaffWhitelistActionInput {
  idToken: string;
  filters?: ListStaffWhitelistFilters;
}

export interface StaffWhitelistActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Add a new staff member to the staff whitelist.
 * Requires caller to be a Coordinator or Admin.
 */
export async function addStaffWhitelistEntry(
  input: AddStaffWhitelistActionInput
): Promise<StaffWhitelistActionResult<StaffWhitelistDocument>> {
  const { idToken, ...rawData } = input;
  const parsed = addStaffWhitelistInSchema.parse(rawData);

  // 1. Authorize caller
  const authUser = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  const email = parsed.email.trim().toLowerCase();

  // 2. Prevent duplicate entries
  const existing = await getStaffWhitelist(email);
  if (existing) {
    throw new HttpError(
      409,
      'STAFF_ALREADY_EXISTS',
      `Staff email "${email}" is already on the whitelist.`
    );
  }

  // 3. Create document in Firestore
  const createdDoc = await createStaffWhitelist(parsed, authUser.uid);

  // 4. Record audit log
  await writeAudit({
    actor: {
      uid: authUser.uid,
      email: authUser.email,
      role: authUser.activeRole,
    },
    action: 'staff.whitelist_added',
    target_type: 'staff_whitelist',
    target_id: email,
    details: {
      full_name: createdDoc.full_name,
      roles: createdDoc.roles,
      department: createdDoc.department,
      programmes: createdDoc.programmes,
    },
  });

  return { ok: true, data: createdDoc };
}

/**
 * Update an existing staff whitelist entry.
 * Caller cannot remove their own coordinator or admin role.
 */
export async function updateStaffWhitelistEntry(
  input: UpdateStaffWhitelistActionInput
): Promise<StaffWhitelistActionResult<void>> {
  const { idToken, email: rawEmail, patch: rawPatch } = input;
  const email = rawEmail.trim().toLowerCase();
  const patch = updateStaffWhitelistInSchema.parse(rawPatch);

  // 1. Authorize caller
  const authUser = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  // 2. Check existence
  const existing = await getStaffWhitelist(email);
  if (!existing) {
    throw new HttpError(
      404,
      'STAFF_NOT_FOUND',
      `Staff whitelist entry for "${email}" not found.`
    );
  }

  // 3. Self-demotion guard
  if (authUser.email.toLowerCase() === email && patch.roles) {
    if (existing.roles.includes('coordinator') && !patch.roles.includes('coordinator')) {
      throw new HttpError(
        403,
        'SELF_DEMOTION_FORBIDDEN',
        'You cannot remove your own coordinator role.'
      );
    }
    if (existing.roles.includes('admin') && !patch.roles.includes('admin')) {
      throw new HttpError(
        403,
        'SELF_DEMOTION_FORBIDDEN',
        'You cannot remove your own admin role.'
      );
    }
  }

  // 4. Update repository
  await updateStaffWhitelist(email, patch);

  // 5. If user already linked, sync roles to users collection if changed
  if (existing.user_uid && patch.roles) {
    const userRef = adminDb.collection('users').doc(existing.user_uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      await userRef.update({
        roles: patch.roles,
      });
    }
  }

  // 6. Record audit log
  await writeAudit({
    actor: {
      uid: authUser.uid,
      email: authUser.email,
      role: authUser.activeRole,
    },
    action: 'staff.whitelist_updated',
    target_type: 'staff_whitelist',
    target_id: email,
    details: patch as Record<string, unknown>,
  });

  return { ok: true };
}

/**
 * Deactivate a staff member.
 * Revokes active refresh tokens if user has signed up.
 * Caller cannot deactivate themselves.
 */
export async function deactivateStaffWhitelistEntry(
  input: DeactivateStaffWhitelistActionInput
): Promise<StaffWhitelistActionResult<void>> {
  const email = input.email.trim().toLowerCase();

  // 1. Authorize caller
  const authUser = await requireUser(input.idToken, ALLOWED_CALLER_ROLES);

  // 2. Self-deactivation guard
  if (authUser.email.toLowerCase() === email) {
    throw new HttpError(
      403,
      'SELF_DEACTIVATION_FORBIDDEN',
      'You cannot deactivate your own account.'
    );
  }

  // 3. Check existence
  const existing = await getStaffWhitelist(email);
  if (!existing) {
    throw new HttpError(
      404,
      'STAFF_NOT_FOUND',
      `Staff whitelist entry for "${email}" not found.`
    );
  }

  // 4. Deactivate in Firestore
  await setStaffActiveStatus(email, false);

  // 5. If user has signed up (has user_uid), revoke session tokens and lock claims
  if (existing.user_uid) {
    try {
      await adminAuth.revokeRefreshTokens(existing.user_uid);
      await adminAuth.setCustomUserClaims(existing.user_uid, {
        roles: existing.roles,
        activeRole: existing.roles[0] || 'supervisor',
        registered: false,
        profileComplete: false,
      });
    } catch (err) {
      console.warn(`Failed to revoke refresh tokens for user ${existing.user_uid}:`, err);
    }
  }

  // 6. Record audit log
  await writeAudit({
    actor: {
      uid: authUser.uid,
      email: authUser.email,
      role: authUser.activeRole,
    },
    action: 'staff.whitelist_deactivated',
    target_type: 'staff_whitelist',
    target_id: email,
    details: { user_uid: existing.user_uid },
  });

  return { ok: true };
}

/**
 * Reactivate a previously deactivated staff member.
 */
export async function reactivateStaffWhitelistEntry(
  input: ReactivateStaffWhitelistActionInput
): Promise<StaffWhitelistActionResult<void>> {
  const email = input.email.trim().toLowerCase();

  // 1. Authorize caller
  const authUser = await requireUser(input.idToken, ALLOWED_CALLER_ROLES);

  // 2. Check existence
  const existing = await getStaffWhitelist(email);
  if (!existing) {
    throw new HttpError(
      404,
      'STAFF_NOT_FOUND',
      `Staff whitelist entry for "${email}" not found.`
    );
  }

  // 3. Reactivate in Firestore
  await setStaffActiveStatus(email, true);

  // 4. Restore claims if user had previously signed up
  if (existing.user_uid) {
    try {
      await adminAuth.setCustomUserClaims(existing.user_uid, {
        roles: existing.roles,
        activeRole: existing.roles[0] || 'supervisor',
        registered: true,
        profileComplete: true,
      });
    } catch (err) {
      console.warn(`Failed to restore claims for user ${existing.user_uid}:`, err);
    }
  }

  // 5. Record audit log
  await writeAudit({
    actor: {
      uid: authUser.uid,
      email: authUser.email,
      role: authUser.activeRole,
    },
    action: 'staff.whitelist_reactivated',
    target_type: 'staff_whitelist',
    target_id: email,
    details: { user_uid: existing.user_uid },
  });

  return { ok: true };
}

/**
 * Fetch staff whitelist entries with optional filters.
 */
export async function fetchStaffWhitelistEntries(
  input: FetchStaffWhitelistActionInput
): Promise<StaffWhitelistActionResult<StaffWhitelistDocument[]>> {
  await requireUser(input.idToken, ALLOWED_CALLER_ROLES);
  const items = await listStaffWhitelist(input.filters);
  return { ok: true, data: items };
}
