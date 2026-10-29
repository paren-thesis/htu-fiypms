---
name: fypms-auth-gating
description: FYPMS Google sign-in, @htu.edu.gh domain gate, roster and staff-whitelist gating, custom claims, active-role switching, middleware route guards, /not-registered and /complete-profile pages. Use for login, complete-signup, claims, RBAC, middleware, AuthContext.
---

# Rules
- Google Sign-In only (`GoogleAuthProvider`, `signInWithPopup`). `hd` param is only a UI hint; **always** check `email.endsWith('@htu.edu.gh')` server-side and `email_verified`.
- Claims shape: `{ roles: string[], activeRole: string, registered: boolean, profileComplete: boolean }`. Roles: `student | supervisor | coordinator | admin | panel_member`.
- Student email `^[0-9]{10}@htu\.edu\.gh$` → roster path. Anything else → staff whitelist path. Exact steps: `references/signin-flow.md` (read it before editing `complete-signup.ts`).
- `roster.user_uid` / `staff_whitelist.user_uid` are write-once. Different uid on same index → 409 + `identity_conflict` audit log.
- After `complete-signup` and after `switch-role`, the client must `await user.getIdToken(true)` before rendering role-scoped UI.
- `switch-role.ts`: verify requested role ∈ token `roles`, then `setCustomUserClaims(uid, {...claims, activeRole})`, audit `user.role_switched`.
- A student roster entry with `is_active === false` is treated as not registered (message: record inactive, contact the coordinator); a missing `is_active` counts as true (spec D-06).
- Unregistered users are never deleted from Auth. They are sent to `/not-registered` (shows attempted email, category message, coordinator contact, sign-out). All routes redirect there while `registered !== true`.
- Faculty with `profileComplete: false` → `/complete-profile` (office_location, consultation_hours, research_interests[], max_team_capacity). Students skip it.
- **Any Google account gets a Firebase token**, even if rejected here, so rules must never trust `request.auth != null`. Rules use `isMember()` (registered claim + verified `@htu.edu.gh` email); do not weaken it (spec F-01).
- Student `contact` stays on the roster doc; staff phone/office/hours go to `supervisor_contacts/{uid}` (never `users`). Profile edits use `update-profile.ts`, not client writes.
- Revocation: ID tokens live 1h. "Force Revoke Session" admin action calls `adminAuth.revokeRefreshTokens(uid)`.

# Middleware (Edge) — gate order
1. no token → `/login`  2. `registered` false → `/not-registered`  3. `profileComplete` false and activeRole ≠ student → `/complete-profile`  4. pass.
Public paths: `/login`, `/not-registered`, static assets.

# Middleware token transport (spec F-11, now in §11.1)
Middleware can't use `firebase-admin` and can't read the Firebase client SDK state. Required approach:
- After sign-in, store the ID token in an httpOnly cookie via a small Route Handler (refresh it whenever `onIdTokenChanged` fires, including after `getIdToken(true)`).
- In middleware verify the signature with `jose` (`createRemoteJWKSet` on `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`; issuer `https://securetoken.google.com/<projectId>`; audience `<projectId>`), then read the claims.
- Middleware is only a UX guard. Real enforcement = Firestore rules + `verifyIdToken` in every Server Action.

# Files
`app/api/session/route.ts` (sets/refreshes httpOnly `__session` cookie), `lib/auth/verify-token-edge.ts` (jose), `context/AuthContext.tsx` (user + claims + loading, `onIdTokenChanged`), `components/auth/*`, `components/navbar/RoleSwitcherDropdown.tsx`, `app/actions/{complete-signup,switch-role}.ts`, `middleware.ts`, `lib/firebase/{client,admin}.ts` (admin singleton on `globalThis`).
