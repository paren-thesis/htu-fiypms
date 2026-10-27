# FYPMS common errors (symptom → cause → fix)

| Symptom | Likely cause | Fix |
|---|---|---|
| `Missing or insufficient permissions` / `permission-denied` | (1) Stale claims after complete-signup or switch-role. (2) `registered` claim false, so `isMember()` fails. (3) Evaluation/peer-eval doc id not matching the deterministic id. (4) Client writing a server-only collection. (5) Update touches a field outside the rule's `hasOnly` list. | (1) `await user.getIdToken(true)` then re-subscribe listeners. (2) Check the token claims in the emulator. (3) Build ids as `{teamId}__{uid}__team` / `{teamId}__{uid}__{evaluateeId}`. (4) Move the write into a Server Action. (5) Send only allowed keys. Never loosen rules. |
| `The query requires an index` | Missing composite index | Add the fields from the error link to `firestore.indexes.json`; `firebase deploy --only firestore:indexes`. |
| `Module not found: Can't resolve 'fs' / 'net' / 'tls' / 'child_process'` | `firebase-admin`, `exceljs` or `@react-pdf/renderer` imported into a client component or middleware | Move behind a Server Action/Route Handler; add `import 'server-only'` to server modules. |
| Middleware: `Dynamic code evaluation not allowed in Edge Runtime` or crash | Admin SDK or Node-only API used in `middleware.ts` | Use `lib/auth/verify-token-edge.ts` (`jose`) and cookie `__session`. |
| `params`/`searchParams`/`cookies()`/`headers()` "should be awaited" (Next 15) | Async request APIs used synchronously | `const { id } = await params;` `const c = await cookies();` |
| `Only plain objects can be passed to Client Components` | Firestore `Timestamp` (or class instance) passed from a server to a client component | Serialize first (`toMillis()` or ISO string) in a mapper. |
| `Hydration failed` / text mismatch | `Date`/locale formatting, `Math.random`, `localStorage` or Timestamp read during render | Format in `useEffect` or with a fixed locale and `timeZone: 'Africa/Accra'`. |
| `Failed to parse private key` / `error:1E08010C` | Private key newlines mangled in env | `process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n')`. |
| `app/duplicate-app` / "default Firebase app already exists" | Admin/client SDK re-initialised on hot reload | Singleton: `getApps().length ? getApp() : initializeApp(...)`. |
| `Server Actions must be async functions` | A `'use server'` file exports constants/types/sync functions | Move them to a separate module; export only async functions. |
| `Unsupported field value: undefined` | `undefined` in a Firestore write | Strip undefined keys or use `null`. |
| `Maximum update depth exceeded` / listener fires repeatedly | `onSnapshot` created during render or unstable effect deps; no cleanup | Create in `useEffect` with stable deps and return the unsubscribe. |
| `auth/unauthorized-domain` / `auth/popup-closed-by-user` | Domain not in Firebase Auth authorized domains, or popup blocked | Add `localhost` / the Vercel domain in the Firebase console. |
| TS2322 Timestamp mismatch (client vs admin) | Two different `Timestamp` classes | Use the `FsTimestamp` alias at the boundary; convert in mappers. |
| `ZodError` surfaces as a 500 | Server Action throws the parse error | Catch `ZodError`, return `{ ok:false, errors: e.flatten() }`. |
| Build passes locally, fails on Vercel | Env var missing in Vercel, case-sensitive import path, or a Node-only module on Edge | Check env in Vercel, fix import casing, set `export const runtime = 'nodejs'` where needed. |
| Styles missing or dark look | Content path misses a folder, or a leftover `dark:` class | Fix `content` globs; remove `dark:` (light mode only). |
| Group number duplicated or `ABORTED` transaction errors | Counter read outside the transaction | Read and increment `counters/{courseId}` inside the same `runTransaction`. |
| A role sees a menu item or page it should not | Nav, route gate, Server Action and rules disagree, or the source document (spec/skill/prompt) is wrong (class B) | Fix every layer in order nav, gate, action, rules, UI; if the documents are wrong run `fypms-spec-change` first. |
| Works for admin but not coordinator (or the reverse) | Check uses `activeRole` in one place and the `roles` list in another | Use one helper (`hasAnyRole`/`requireUser(roles)`) everywhere; test with a dual-role user. |
| Sidebar or access does not change after a role switch | Token and cookie not refreshed, or no `router.refresh()` | `await getIdToken(true)`, refresh `__session`, then `router.refresh()`. |
| Rules test fails but the app works (or vice versa) | Test context missing claims (`registered`, `email_verified`, `roles`, `activeRole`) | Build the context with the `ctx()` helper in `tests/rules/helpers.ts`. |
| UI role is wrong in dev | `NEXT_PUBLIC_DEV_ROLE` stale (dev server not restarted) | Restart `npm run dev` after changing env. |
