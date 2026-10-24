### **5.1 Student Roster Import (Roster-First, No Auth Writes)**

The CSV import writes ONLY to `/rosters` — it never creates Firebase Auth users. This eliminates the need for complex compensating rollback workflows because no Auth user exists yet at import time.

CSV columns (header row required): `index_number`, `full_name`, `contact`. `contact` is a required phone number (after removing spaces and dashes it must match `^\+?[0-9]{7,15}$`) stored on the roster document only (never copied to `users`); it is the source of the `contact` column in the broadsheet CSV (FR-10.1b).

Pipeline:
1. **Filename Course Detection:** The uploaded file's basename is matched against known patterns (case-insensitive, allowing `_`, `-`, or space as separators): `btech_cs` $\rightarrow$ `btech-cs`, `btech_ict` $\rightarrow$ `btech-ict`, `hnd_cs` $\rightarrow$ `hnd-cs`, `hnd_ict` $\rightarrow$ `hnd-ict`. If ambiguous or unmatched, the user is prompted to select the course manually. The detected course is shown in a confirmation step ("We detected this is a BTECH-ICT roster. Confirm or change.") — detection is a hint, not authoritative.
2. **Pre-Validation:** Server-side Zod re-validation of every row (10-digit index regex `^[0-9]{10}$`, non-empty `full_name`, valid `contact`). Duplicate index numbers within the file are flagged. Index numbers already present in `rosters/{currentYear}/students/` are flagged as Skipped (Duplicate).
3. **Dry-Run Mode:** NFR-08 dry-run returns the full validation report without any Firestore writes. The coordinator reviews the report before committing.
4. **Batch Write:** Valid rows are committed in batches of 50 via `db.batch()`, each writing one roster doc. No Auth calls. No compensating logic needed — a failed batch rolls back cleanly at the Firestore level.
5. **Audit:** A single `/audit_logs` entry is written per import: `{ action: 'roster.imported', course_id, filename, total, imported, skipped, errors, imported_by_uid, academic_year_id }`.

