import type { EdgeUserClaims } from './verify-token-edge';

export type RouteDecision = 'allow' | { redirect: string };

export const ROUTE_ROLE_PERMISSIONS: {
  pathPrefix: string;
  allowedRoles: string[];
}[] = [
  // Administration: Coordinator & Admin only (Spec D-05)
  { pathPrefix: '/students', allowedRoles: ['coordinator', 'admin'] },
  { pathPrefix: '/admin/staff-whitelist', allowedRoles: ['coordinator', 'admin'] },
  { pathPrefix: '/rubrics', allowedRoles: ['coordinator', 'admin'] },
  { pathPrefix: '/reports', allowedRoles: ['coordinator', 'admin'] },
  { pathPrefix: '/audit-logs', allowedRoles: ['coordinator', 'admin'] },

  // System Administration: Admin only
  { pathPrefix: '/admin/users', allowedRoles: ['admin'] },

  // Defense assessment: Staff, panel members, and coordinators
  { pathPrefix: '/defense', allowedRoles: ['supervisor', 'coordinator', 'panel_member', 'admin'] },

  // Peer evaluations: Students (plus coordinator/admin oversight)
  { pathPrefix: '/peer-evaluation', allowedRoles: ['student', 'coordinator', 'admin'] },
];

/**
 * Pure routing decision logic evaluated on Edge runtime.
 * Order of evaluation:
 *   1. Public endpoints & assets
 *   2. No token -> redirect to /login
 *   3. Token registered === false -> redirect to /not-registered
 *   4. Token registered === true trying to access /login or /not-registered -> redirect to app
 *   5. Incomplete profile for non-students -> redirect to /complete-profile
 *   6. Role-scoped RBAC route restrictions based on activeRole
 *
 * @param claims Verified Edge user claims or null
 * @param pathname Current request path (e.g. "/students", "/login")
 * @returns 'allow' | { redirect: string }
 */
export function decideRoute(
  claims: EdgeUserClaims | null,
  pathname: string
): RouteDecision {
  const normalizedPath = pathname.split('?')[0] || '/';

  // 1. Static assets & API session endpoints are always allowed
  if (
    normalizedPath.startsWith('/api/session') ||
    normalizedPath.startsWith('/_next') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(normalizedPath)
  ) {
    return 'allow';
  }

  // 2. Unauthenticated user (no token)
  if (!claims) {
    if (normalizedPath === '/login') {
      return 'allow';
    }
    return { redirect: '/login' };
  }

  // 3. User is not registered in the cohort roster or staff whitelist
  if (claims.registered !== true) {
    if (normalizedPath === '/not-registered') {
      return 'allow';
    }
    return { redirect: '/not-registered' };
  }

  // 4. Authenticated & registered user trying to access gate pages
  if (normalizedPath === '/not-registered' || normalizedPath === '/login') {
    if (claims.profileComplete === false && claims.activeRole !== 'student') {
      return { redirect: '/complete-profile' };
    }
    return { redirect: '/' };
  }

  // 5. Profile completion gate (Faculty with profileComplete: false must complete profile)
  // Students skip this gate per FR-01.9
  if (claims.profileComplete === false && claims.activeRole !== 'student') {
    if (normalizedPath === '/complete-profile') {
      return 'allow';
    }
    return { redirect: '/complete-profile' };
  }

  // If already profile-complete and visiting /complete-profile, redirect to dashboard
  if (normalizedPath === '/complete-profile' && claims.profileComplete === true) {
    return { redirect: '/' };
  }

  // 6. Role-based access control based on activeRole
  for (const permission of ROUTE_ROLE_PERMISSIONS) {
    if (
      normalizedPath === permission.pathPrefix ||
      normalizedPath.startsWith(`${permission.pathPrefix}/`)
    ) {
      if (!permission.allowedRoles.includes(claims.activeRole)) {
        return { redirect: '/' };
      }
    }
  }

  return 'allow';
}
