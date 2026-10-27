---
name: fypms-test-data
description: Controls all FYPMS test and seed data - the single fixtures file fixtures/testusers.json, emulator seeding and reset, isolation of automated tests from the dev emulator, and data consistency checks. Use whenever creating or changing seed scripts, tests or e2e that create users or Firestore data, emulator or vitest config, or when the Auth/Firestore emulator or a page shows users, students or records that are not in the fixtures.
---

# Hard rules
1. **One source of truth**: `fixtures/testusers.json` (students, staff, groups, supervisor_assignments) plus `fixtures/staff-profiles.json`. Never invent names, index numbers, emails, phones, group numbers, UIDs or placeholders such as `std<index>@...` or `0240000000`. Get data only through `fixtures/index.ts` (`fx.student(index)`, `fx.staffByEmail(email)`, `fx.membersOf(group)`, `studentEmail()`, `studentUid()`, `staffUid()`, `fx.claimsFor(email)`).
2. **Derived values live in one place**: student email is exactly `${index_number}@htu.edu.gh` (`studentEmail`). Group numbers come from the fixture or the real `formatGroupNumber`; never string-build them elsewhere.
3. **Two emulator setups, never mixed**:
   - Dev: `firebase.json`, project `demo-fypms`, Auth 9099, Firestore 8080, UI 4000. Holds only seeded fixture data and what the developer does by hand.
   - Test: `firebase.test.json`, project `demo-fypms-test`, Auth 9199, Firestore 8180, UI off. Used only by `test:rules`, `test:server` and e2e (`firebase emulators:exec --config firebase.test.json --project demo-fypms-test ...`).
   Rules and server vitest configs load `tests/setup/emulator-guard.ts`, which aborts if the hosts are not the test ones.
4. **Tests clean up**: tests never call seed scripts, never create users that are not in the fixtures, and end with the test reset (`node scripts/emulator-reset.mjs --test`, or the same REST calls through `tests/helpers/reset.ts`).
5. **Script guard**: every seed/check script exits unless `FIRESTORE_EMULATOR_HOST` is set (and `FIREBASE_AUTH_EMULATOR_HOST` when it touches Auth); without them the Admin SDK would write to the real project. A project id that does not start with `demo-` only prints a warning.
6. **Seeds are idempotent** (set merge, deterministic ids) and safe to run after `emu:reset`.

# Seed modes (`scripts/seed.ts --mode base|full`) and checks
Exact documents and rules: `references/fixtures-contract.md`.
- `base`: courses, current academic year (start 2026), counters, roster from `students`, staff_whitelist from `staff`. **No Auth users and no users docs**, so the real Google sign-in + `complete-signup` path is exercised.
- `full`: base plus Auth users (fixed UIDs, claims), users docs, linked roster/whitelist, supervisor_contacts, supervisions, the 8 teams, supervisor assignments. No topics, chapters or evaluations are seeded; run the flows to create them.
- `check:data` compares emulator Auth and Firestore with the fixtures and spec rules and prints a JSON report; exit code 1 on any mismatch or unknown record.
- Reset: `npm run emu:reset` (`scripts/emulator-reset.mjs`). Human guide: `docs/test-data.md`.

# When asked to add data or a test user
Add it to the fixture file (and `check:data` expectations), not to a script. If the user did not supply the data, ask for it; do not generate placeholders.

# When data looks wrong
1. Run `npm run check:data`; its `unknown` list names the offenders.
2. Find the writer: `grep -rn "createUser\|createCustomToken\|setCustomUserClaims\|std\${\|0240000000" scripts tests e2e src`, then check which emulator and project id that code targets.
3. Fix the writer (usually a test or seed pointing at the dev emulator), then `npm run emu:reset && npm run seed:base && npm run check:data`.
4. Record the bug in `docs/bugs.md` (class E).

# Never
Write test data from application code, ship dev-login or seed code that works without the emulator variables, or run `emu:reset` against anything but localhost.
