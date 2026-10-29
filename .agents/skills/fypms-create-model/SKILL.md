---
name: fypms-roster-import
description: FYPMS student roster CSV import, student record CRUD (create, edit, deactivate, delete, change course) and staff whitelist management. Use for RosterImportModal, import-rosters.ts, manage-staff-whitelist.ts, CSV templates, dry-run validation, filename course detection.
---

# Rules
- Import writes ONLY to `rosters/{academicYearId}/students/{indexNumber}`. **Never** create Firebase Auth users.
- Full pipeline: `references/pipeline.md` (read once, then implement).
- CSV columns (header required): `index_number, full_name, contact`.
- Row schema (Zod): `index_number` `^[0-9]{10}$`; `full_name` non-empty trimmed; `contact` required, strip spaces/dashes then match `^\+?[0-9]{7,15}$` (store the normalised value). Email = `${index_number}@htu.edu.gh` (derived, never from CSV).
- `contact` is saved on the roster doc only. Never copy it to `users`; only coordinator/admin can read it (supervisor access is an open item, spec §13.2). It is the data source for the `contact` column of the broadsheet CSV (`fypms-reports-export`). `course_id` comes from the confirmed course, never per-row.
- Course detection from filename (case-insensitive; `_`, `-`, space): `btech_cs`→`btech-cs`, `btech_ict`→`btech-ict`, `hnd_cs`→`hnd-cs`, `hnd_ict`→`hnd-ict`. Unmatched/ambiguous → manual select. Detection is a hint; the user must confirm.
- Template CSV header: `index_number,full_name,contact` (include one example row). Parse client-side with papaparse for preview; **re-validate every row server-side**.
- Dry-run: full report (`Total / Imported / Skipped / Errors`, per-row messages), zero writes.
- Commit: batches of 25/50/100 (default 50) via `db.batch()`, `merge: false`; existing index → Skipped (Duplicate); duplicate within file → flagged. Add `import_batch_id` (uuid), `user_uid: null`, `signup_completed_at: null`.
- One `audit_logs` entry per import: `roster.imported`.
- Server Action: `export const runtime = 'nodejs'; export const maxDuration = 60;` Allowed callers: **coordinator and admin only**; every other role, including supervisor, gets 403 (spec D-05). Verify roles from the token because the Admin SDK bypasses rules.
- UI: modal with steps Upload → Confirm course → Dry-run report → Commit → Summary.

# Staff whitelist (`manage-staff-whitelist.ts`, page `/admin/staff-whitelist`)
Doc id = lowercase email (must end `@htu.edu.gh`). Fields: `full_name, roles[], department, programmes[], phone?, is_active, added_by_uid, added_at, user_uid:null`. Deactivate = `is_active:false` (never delete); audit `staff.whitelist_added|deactivated`. Coordinator/admin only.

# Student records CRUD (spec D-06, FR-01.12)
Files: `src/app/actions/manage-student.ts` (createStudent, updateStudent, deactivateStudent, reactivateStudent, deleteStudent) and `change-student-course.ts`. Callers: coordinator and admin only; every other role gets 403 (verify roles from the token).
- Create: same Zod rules as a CSV row plus `course_id` from courses; email only via `studentEmail()`; duplicate index returns 409; `is_active` true, `user_uid` null.
- Update: only `full_name` and `contact`; reject `index_number`, `email`, `course_id`, `user_uid` in the payload.
- Course change (`change-student-course`): written justification (>= 20 chars); refused (409) when the student is on an active team; updates the roster and, if linked, `users.profile.course_id`; audit `student.course_changed` with old, new and justification.
- Deactivate: reason >= 10 chars; refused (409) when on an active team; sets `is_active` false and `deactivated_*`; if linked call `revokeRefreshTokens(uid)`; Reactivate clears it.
- Delete: permanent, only when `user_uid` and `signup_completed_at` are null and no team exists; otherwise 409 "Deactivate instead". Audit with a snapshot. The UI asks the user to type the index number.
- `complete-signup` treats `is_active === false` as not registered ("Your student record is inactive. Contact your coordinator."); a missing field counts as true. The pool and auto-group skip inactive students.
- Every operation writes an audit entry with before and after values.
