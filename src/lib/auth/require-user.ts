import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '@/lib/firebase/admin';
import { HttpError } from '@/lib/errors';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  roles: string[];
  activeRole: string;
  claims: DecodedIdToken;
}

/**
 * Validates the Firebase ID token and enforces HTU domain gating,
 * registered status, and role authorization.
 *
 * @param idToken The client's Firebase ID token
 * @param roles Optional list of allowed roles
 * @returns AuthenticatedUser with verified identity and custom claims
 * @throws HttpError(401) on missing/invalid token
 * @throws HttpError(403) on domain, registration, or role failure
 */
export async function requireUser(
  idToken: string,
  roles?: string[]
): Promise<AuthenticatedUser> {
  if (!idToken || typeof idToken !== 'string') {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token');
  }

  // Domain gate: must be verified @htu.edu.gh
  const email = decoded.email?.toLowerCase();
  if (!email || !email.endsWith('@htu.edu.gh') || !decoded.email_verified) {
    throw new HttpError(
      403,
      'FORBIDDEN_DOMAIN',
      'Access requires a verified @htu.edu.gh account'
    );
  }

  // Registration gate: registered claim must be explicitly true
  if (decoded.registered !== true) {
    throw new HttpError(
      403,
      'NOT_REGISTERED',
      'User account is not registered in the FYPMS cohort'
    );
  }

  const tokenRoles: string[] = Array.isArray(decoded.roles)
    ? (decoded.roles as string[])
    : typeof decoded.role === 'string'
    ? [decoded.role]
    : [];

  const activeRole: string =
    (decoded.activeRole as string) ||
    (decoded.active_role as string) ||
    tokenRoles[0] ||
    '';

  // Role check if required roles are specified
  if (roles && roles.length > 0) {
    const isAuthorized =
      roles.includes(activeRole) || tokenRoles.some((r) => roles.includes(r));
    if (!isAuthorized) {
      throw new HttpError(
        403,
        'FORBIDDEN_ROLE',
        `Access denied. Requires one of the following roles: ${roles.join(', ')}`
      );
    }
  }

  return {
    uid: decoded.uid,
    email: decoded.email!,
    roles: tokenRoles,
    activeRole,
    claims: decoded,
  };
}
