---
name: fypms-scaffold-roadmap
description: Project bootstrap and build order for FYPMS. Use at project start, when setting up Firebase/Vercel/env vars/emulators, or when deciding what to build next.
---

# Scaffold

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
npx shadcn@latest init            # then add components only as needed
npm i firebase firebase-admin zod react-hook-form @hookform/resolvers lucide-react sonner papaparse jose exceljs @react-pdf/renderer
npm i -D vitest @firebase/rules-unit-testing @playwright/test firebase-tools @types/papaparse
```
Pick Inter via `next/font/google`. Apply the tokens from `fypms-ui-design-system/resources/globals.css` before building any page (HTU blue + white, light only).

## Env vars
Public: `NEXT_PUBLIC_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,APP_ID}`.
Server-only: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` (replace `\\n` with real newlines).
Separate staging/prod Firebase projects. Use emulators locally (`firebase.json`: auth + firestore). Never commit `.env*`.

## Build order (finish + test each phase before the next; the spec's §11 tree already contains every route)
0. Scaffold, tokens, app shell (sidebar/topbar, role-filtered nav, empty pages)
1. `types/firestore.ts`, `firestore.rules` (from `fypms-firestore-data/references`), indexes, emulator, seed script (courses, academic_year, one coordinator in `staff_whitelist`)
2. Auth gating: login, `/api/session`, middleware, complete-signup, /not-registered, /complete-profile, role switcher
3. Staff whitelist CRUD + roster import (`index_number,full_name,contact`)
4. Teams (create/join/invite code/pool/auto-group)
5. Proposals (state machine + versioning)
6. Supervision + matching engine + supervisor contact grants + in-app notification
7. Chapters
8. Rubrics + defense scheduling + conflict detection + in-app call-up notifications
9. Digital marksheet + team-level aggregation
10. Peer evaluation + software deliverables + supervisor sign-off
11. Reports, publish/lock, amendments, appeals
12. Notifications centre, archive, audit-log viewer, admin users/overrides

Email is out of scope for v1 (spec D-03); do not add an email provider.
