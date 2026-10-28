# FYPMS — Production Release & Hardening Checklist (v5.2)

This release checklist documents all automated test suite results, static architecture/security audits, Firebase production provisioning steps, Vercel deployment configuration, initial administrator bootstrap, and known v1 deferred items.

---

## 1. Automated Verification Suites

| Suite | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **TypeScript Strict Check** | `npm run typecheck` (`npx tsc --noEmit`) | **PASS** | 0 errors across `src/`, `tests/`, `e2e/`, `fixtures/` |
| **ESLint Check** | `npm run lint` | **PASS** | 0 errors, 0 warnings |
| **Unit & Pure Logic Tests** | `npm run test` | **PASS** | 24 test files · 198 passed |
| **Firestore Security Rules** | `npm run test:rules` | **PASS** | 9 test files · 53 passed (`demo-fypms-test` on port 8180) |
| **Server Action & Repo Integration** | `npm run test:server` | **PASS** | 24 test files · 167 passed (`demo-fypms-test` on ports 9199/8180) |
| **Playwright End-to-End & Axe A11y** | `npx playwright test` | **PASS** | 4 spec files · 19 passed (7 hardening flows + `@axe-core/playwright` + UI responsive layout checks) |

---

## 2. Static Architecture & Security Audits

| Audit Requirement | Command | Result | Output / Coverage |
| :--- | :--- | :---: | :--- |
| **1. Light-Mode Only (No `dark:` classes in `src/`)** | `Select-String -Path (Get-ChildItem -Recurse src -Include *.ts,*.tsx,*.css) -Pattern "\bdark:"` | **PASS** | `0` matches |
| **2. No `firebase-admin` Import in Client Components or Middleware** | `Select-String -Path (Get-ChildItem -Recurse src/components,src/hooks,src/context,src/middleware.ts -Include *.ts,*.tsx) -Pattern "firebase-admin"` | **PASS** | `0` matches (`firebase-admin` restricted strictly to `src/lib/firebase/admin.ts`, server repos, and Server Actions/Route Handlers) |
| **3. Strict TypeScript (No `any` in `src/`)** | `Select-String -Path (Get-ChildItem -Recurse src -Include *.ts,*.tsx) -Pattern ":\s*any\b|as\s+any\b|<any>"` | **PASS** | `0` matches |
| **4. Node.js Runtime Confirmed on Server Actions & App Layout** | `Select-String -Path src/app/layout.tsx,src/app/api/session/route.ts,src/app/actions/*.ts -Pattern "runtime\s*=\s*['\"]nodejs['\"]"` | **PASS** | Root layout, session route handler, and all 33 Server Action modules configured for Node.js runtime |
| **5. `/dev/ui` and `/dev/login` Blocked in Production** | `Select-String -Path src/app/dev/ui/page.tsx,src/app/dev/login/page.tsx -Pattern "NODE_ENV === ['\"]production['\"]"` | **PASS** | Both pages invoke `notFound()` when `process.env.NODE_ENV === "production"` |
| **6. Review Findings `F-01` – `F-17` Referenced in Test Names** | `$f = Get-ChildItem -Recurse src,tests -Include *.test.ts; 1..17 \| ForEach-Object { $id = "F-" + $_.ToString("00"); "$id : $((@($f \| Select-String -Pattern "(it\|describe)\(.*$id")).Count)" }` | **PASS** | Every finding `F-01` through `F-17` has $\ge 1$ test referencing its ID (`F-01: 2, F-02: 2, F-03: 3, F-04: 1, F-05: 2, F-06: 4, F-07: 1, F-08: 1, F-09: 2, F-10: 1, F-11: 1, F-12: 2, F-13: 1, F-14: 3, F-15: 1, F-16: 2, F-17: 1`) |

---

## 3. Firebase Production Setup Steps

1. **Create Production Firebase Project**:
   - Create a dedicated Firebase project (e.g., `htu-fypms-prod`) in the [Firebase Console](https://console.firebase.google.com/).
   - Provision **Cloud Firestore** in production mode (choose region closest to Ghana/West Africa, e.g., `eur3` / `europe-west1`).
2. **Configure Firebase Authentication & Authorized Domains**:
   - Enable **Google** as a Sign-In provider under **Authentication → Sign-in method**.
   - Under **Authentication → Settings → Authorized domains**, add:
     - Your production Vercel domain (e.g., `fypms.htu.edu.gh` or `htu-fypms.vercel.app`)
     - Any preview/staging domain if applicable.
3. **Generate Firebase Admin Service Account Key**:
   - Navigate to **Project Settings → Service accounts → Firebase Admin SDK** and click **Generate new private key**.
   - Record `project_id`, `client_email`, and `private_key` for Vercel server environment variables (never commit the JSON file).
4. **Deploy Firestore Security Rules and Composite Indexes**:
   ```bash
   npx firebase use <production-project-id>
   npx firebase deploy --only firestore:rules,firestore:indexes --project <production-project-id>
   ```
5. **Seed Base Academic Year, Courses, and Initial Coordinator**:
   ```bash
   npx tsx scripts/seed.ts --mode base --prod
   ```
   *(Requires `--prod` flag to confirm intentional execution against production Firestore).*

---

## 4. Vercel Environment Variables & Deployment Configuration

Configure the following environment variables in **Vercel → Project Settings → Environment Variables** (Production & Preview):

### Public Client Variables (`NEXT_PUBLIC_*`)
- `NEXT_PUBLIC_FIREBASE_API_KEY`: Firebase Web App API Key
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`: `<project-id>.firebaseapp.com`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: `<project-id>`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: `<project-id>.firebasestorage.app`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`: Messaging sender ID
- `NEXT_PUBLIC_FIREBASE_APP_ID`: Web App ID
- `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`: `"false"`
- `NEXT_PUBLIC_USE_EMULATORS`: `"false"`

### Server-Only Admin SDK Variables (Never prefix with `NEXT_PUBLIC_`)
- `FIREBASE_ADMIN_PROJECT_ID`: `<project-id>`
- `FIREBASE_ADMIN_CLIENT_EMAIL`: `firebase-adminsdk-xxxxx@<project-id>.iam.gserviceaccount.com`
- `FIREBASE_ADMIN_PRIVATE_KEY`: `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` *(preserve literal `\n` newline sequences)*

### Function Timeouts (`vercel.json`)
- `vercel.json` configures `maxDuration: 60` for `src/app/actions/generate-broadsheet.ts`, `src/app/actions/import-rosters.ts`, `src/app/(shell)/reports/page.tsx`, and `src/app/(shell)/roster-import/page.tsx` to accommodate large cohort CSV imports and department broadsheet exports.

---

## 5. First-Admin Bootstrap Procedure

1. Run `npx tsx scripts/seed.ts --mode base --prod` to seed the 4 HTU CS programmes (`btech-cs`, `btech-ict`, `hnd-cs`, `hnd-ict`), the active academic year (`2026-2027`), and the initial `staff_whitelist` entries (including the Department Coordinator and Administrator emails).
2. Have the designated Administrator sign in with their verified `@htu.edu.gh` Google account at `/login`.
3. `completeSignup` automatically links the account against `staff_whitelist/{email}`, creates `users/{uid}`, and mints the `admin` custom claim (`roles: ['admin', ...]`).
4. Complete the faculty profile at `/complete-profile` to set `profileComplete: true`.
5. Once signed in, the Administrator can manage user roles at `/admin/users`, manage staff whitelist records at `/staff-whitelist`, and audit all actions at `/audit-logs`. Note that the last active `admin` role is protected by a server-side guard (`LAST_ADMIN_PROTECTED`) and cannot be removed.

---

## 6. Known Deferred Items (v1 Scope Boundaries)

Per Specification v5.2 (§13.2 & Decisions D-02, D-03, D-05):
1. **Transactional Email Notifications (`FR-09.3`, Decision `D-03`)**: Deferred from v1. All notifications are delivered in-app via the `notifications` Firestore collection and real-time `sonner` toasts.
2. **Letter Grade Classification (`Decision D-02`)**: Deferred until official HTU Academic Board letter-grade cutoffs are finalized. Numeric `final_score` (0–100, 2 d.p.) is computed and exported per team; `grade_classification` remains unset.
3. **Cross-Category Auto-Grouping Override (`FR-02.6`)**: Deferred in v1. Auto-grouping strictly partitions unassigned students by `course_id`; `allowCrossCategory: true` is rejected with `400 CROSS_CATEGORY_NOT_ALLOWED`.
4. **Supervisor Access to Student Phone Numbers (`§13.2`)**: Student `contact` (phone) is stored exclusively on `rosters/{yearId}/students/{indexNumber}` and read only by `coordinator` and `admin`. Supervisors communicate with teams via `@htu.edu.gh` institutional email and chapter feedback threads unless departmental policy is amended.

