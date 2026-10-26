---
name: fypms-testing
description: FYPMS testing strategy with Vitest and Zod unit tests, Firebase emulator rules tests, and Playwright end-to-end flows. Use when writing or running tests, or verifying a finished feature.
---

# Run only what you changed
`vitest run path/to/file`, `firebase emulators:exec --only firestore,auth "vitest run rules"`, `playwright test e2e/<spec>`. Don't run the whole suite after small edits.

# Must-have tests
**Unit (Vitest):** index regex rejects 9-digit/mixed; derived email; Zod roster row incl. `contact` (missing, too short, letters, `+233 24-123-4567` normalises); Jaccard (empty/disjoint/identical, vector in `fypms-supervisor-matching`), capacity clamp, `max=0` no NaN; group-number prefix map; topic state-machine transitions; overlap detector; composite aggregation + idempotency.
**Rules/emulator:** unregistered → no access; supervisor calling import-rosters or manage-staff-whitelist → 403; linked index with different uid → 409 + `identity_conflict` log; `user_uid` write-once; ICT student can't join CS team; cross-programme supervisor not a candidate; students can't edit others' teams/topics; evaluatee can't read peer ratings; evaluations reject writes after `is_published`; student can't change own `course_id`; students can't read unpublished evaluations; **Google account with `registered:false` (e.g. gmail) reads nothing**; `supervisor_contacts` unreadable until a grant exists; invite codes unreadable by other teams and `invite_codes` unreadable by clients; evaluator can't set `is_published`; evaluation id must equal `{teamId}__{uid}__team`; peer rating rejects self, non-teammate, duplicate, score outside 1–10.
**E2E (Playwright, Auth emulator):** valid roster student → dashboard; unknown email → `/not-registered`; faculty whitelist → `/complete-profile` → dashboard; role switch refreshes token; 3 examiners scoring while coordinator sees live aggregate; mismatched-course join shows 409 message.
