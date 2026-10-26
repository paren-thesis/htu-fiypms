'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { adminAuth } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { userRoleEnum, type UserRole } from '@/lib/models/user/schema';

const switchRoleInputSchema = z.object({
  idToken: z.string().min(1, 'Token is required'),
  role: userRoleEnum,
});

export type SwitchRoleInput = z.infer<typeof switchRoleInputSchema>;

export interface SwitchRoleResult {
  ok: boolean;
  activeRole: UserRole;
}

/**
 * Server Action to switch active context role for multi-role faculty (Spec FR-01.3).
 * Verifies that the requested role is already granted in the user's claims,
 * updates the activeRole claim, and records an audit log entry.
 *
 * @param input Raw token + role object or token string with roleParam
 */
export async function switchRole(
  input: SwitchRoleInput | string,
  roleParam?: string
): Promise<SwitchRoleResult> {
  const rawInput =
    typeof input === 'string' ? { idToken: input, role: roleParam } : input;
  const parsed = switchRoleInputSchema.parse(rawInput);

  // 1. Verify user identity, registration, and HTU domain gating
  const authUser = await requireUser(parsed.idToken);

  // 2. Validate that the requested role is in the token's authorized roles
  if (!authUser.roles.includes(parsed.role)) {
    throw new HttpError(
      403,
      'FORBIDDEN_ROLE',
      `Requested role '${parsed.role}' is not assigned to this user.`
    );
  }

  // 3. Update activeRole in Firebase Auth custom claims, preserving other claims
  const userRecord = await adminAuth.getUser(authUser.uid);
  const currentClaims = userRecord.customClaims || {};

  await adminAuth.setCustomUserClaims(authUser.uid, {
    ...currentClaims,
    activeRole: parsed.role,
  });

  // 4. Audit log entry: user.role_switched
  await writeAudit({
    actor: {
      uid: authUser.uid,
      email: authUser.email,
      role: parsed.role,
      activeRole: parsed.role,
    },
    action: 'user.role_switched',
    target_type: 'user',
    target_id: authUser.uid,
    details: `User switched active role from '${authUser.activeRole}' to '${parsed.role}'`,
    metadata: {
      previous_role: authUser.activeRole,
      new_role: parsed.role,
      available_roles: authUser.roles,
    },
  });

  // 5. Return success
  return {
    ok: true,
    activeRole: parsed.role,
  };
}
