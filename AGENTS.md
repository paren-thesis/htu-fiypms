# FYPMS — Final Year Project Management System (HTU Computer Science)

Stack: Next.js 15 App Router · TypeScript strict · Tailwind + shadcn/ui · Firebase Auth + Firestore · Vercel · React Hook Form + Zod · exceljs · @react-pdf/renderer · Lucide.
Spec: v5.2 (`docs/fypms-docs.md`). §13 lists review findings already folded into the schema and rules.

## Token discipline (read first)
- The full spec is `docs/fypms-docs.md` (~19k tokens). NEVER read it whole. Load the matching `fypms-*` skill instead and open only the reference file you need.
- Edit files directly; do not paste whole files into chat. Keep replies short. Don't restate the spec.
- Work on one feature per conversation. Check `fypms-scaffold-roadmap` for what's next.

## Non-negotiables
- **Light mode only**, HTU **blue and white** brand. No `dark:` classes, no `.dark` block, no theme toggle, no next-themes. `color-scheme: light`.
- **Final mark is per team** (every member gets the team composite). No grade classification yet (`grade_classification` stays unset). `evaluations.student_id` is always null in v1.
- **Roster CSV columns:** `index_number, full_name, contact` (contact = phone, stored on the roster doc only).
- **No email in v1** (FR-09.3 deferred). Notifications are in-app only (Firestore + toasts).
- **Roster CSV import and staff whitelist management: coordinator and admin only** (supervisors get 403 and never see those pages).
- TypeScript strict, no `any`. Doc types live in `src/types/firestore.ts`. Firestore fields are `snake_case`.
- Every Server Action: `'use server'` → `adminAuth.verifyIdToken(token)` → role/ownership check → Zod parse → mutate (transaction/batch) → write `audit_logs`. Node runtime.
- Never trust client input for role, uid, or `course_id`; derive from the verified token or server-side docs.
- Client SDK writes are allowed only to `evaluations`, `peer_evaluations`, notification read-flags, `defense_panels`, `rubrics`, `courses`. Everything else is a Server Action (rules deny it).
- `firebase-admin` only in `lib/firebase/admin.ts` + Server Actions/Route Handlers. Never import it in client components or middleware.
- Middleware is Edge: JWT claims only, no Firestore reads.
- Prefer React Server Components; add `'use client'` only for listeners, forms, interactivity. Always unsubscribe `onSnapshot`.
- Reuse `components/ui` (shadcn) and the tokens in the design-system skill; no hard-coded hex in components.

## JSON prompts
If the user's message is a JSON object with a `task` field, treat it as a structured prompt and route it:
`create_model` → `fypms-create-model` · `fix_error` → `fypms-fix-error`. Validate required keys first; reply in compact JSON (no prose, no restating the prompt). Templates live in each skill's `references/`.
Registry of existing models: `docs/models.md` (read it instead of the spec).

## Skills (auto-loaded by description; name one explicitly to force it)
fypms-scaffold-roadmap · fypms-ui-design-system · fypms-auth-gating · fypms-firestore-data · fypms-roster-import · fypms-teams-topics · fypms-supervisor-matching · fypms-defense-grading · fypms-reports-export · fypms-notifications · fypms-testing · fypms-create-model · fypms-fix-error
