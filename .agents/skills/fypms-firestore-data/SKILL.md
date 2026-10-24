---
name: fypms-firestore-data
description: FYPMS Cloud Firestore schema, TypeScript document interfaces, security rules and composite indexes. Use when creating or querying collections, adding types, editing firestore.rules or firestore.indexes.json, or writing onSnapshot listeners and batch writes.
---

# Where things are
- `references/types.ts` → copy to `src/types/firestore.ts` (all document interfaces).
- `references/firestore.rules` → copy to `/firestore.rules`. Already includes the v5.2 review fixes; do not loosen it.
- `references/firestore.indexes.json` → `/firestore.indexes.json`.

# Collections (18 top-level)
`users`, `rosters/{year}/students/{index}`, `staff_whitelist/{email}`, `courses`, `academic_years` (+`counters`), `teams` (+`members`, `private`), `topics` (+`history`), `supervisions`, `chapters`, `rubrics`, `defense_panels`, `evaluations`, `peer_evaluations`, `software_deliverables/{teamId}`, `supervisor_contacts/{uid}` (+`grants/{studentUid}`), `invite_codes/{code}`, `notifications`, `audit_logs`.

# Who writes what
- **Server Actions only (Admin SDK; rules deny client):** users, rosters, staff_whitelist, invite_codes, teams (except leader rename), topics, chapters, supervisions, supervisor_contacts + grants, counters, audit_logs, notifications (create), publishing/amending grades.
- **Client SDK allowed:** `evaluations` (own unpublished sheet), `peer_evaluations` (create only), notification `is_read`/delete, `defense_panels`, `rubrics`, `courses`, `academic_years` (not `grades_published`), `software_deliverables` (team links; supervisor sign-off fields).
- Rules use `isMember()` (registered claim + verified `@htu.edu.gh`), never bare `isSignedIn()`.

# Conventions
- snake_case fields; server timestamps via `FieldValue.serverTimestamp()`.
- Multi-doc writes: `db.batch()` (≤50 per import commit) or `db.runTransaction()` for read-then-write (team join/create, signup linkage, topic versioning, supervisor accept).
- Live screens (marksheet, dashboards) use `onSnapshot`; everything else RSC + Admin SDK.
- Gated supervisor details live in `supervisor_contacts`, never in `users`. Student `contact` lives on the roster doc only.
- Deterministic ids: evaluation `{teamId}__{evaluatorId}__team`; peer evaluation `{teamId}__{evaluatorId}__{evaluateeId}`.
- Add a composite index whenever a query combines `where` + `orderBy` on different fields.
- `scores_summary.grade_classification` is optional and unset (no thresholds yet). `evaluations.student_id` is always null in v1.
