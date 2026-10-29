# Fixture contract

## Files
- `fixtures/testusers.json`: 40 students (10 per programme), 6 staff, 8 groups (5 members each), 4 supervisor assignments (2 teams each, programmes always match).
- `fixtures/staff-profiles.json`: office, hours, phone, research_interests, max_team_capacity per staff email (used by `full` only).
- `fixtures/index.ts`: typed loader and the only place that builds `studentEmail`, `studentUid` (`stu-<index>`), `staffUid` (`staff-<localpart>`), `claimsFor`.

## Base mode writes
| Collection | Doc id | Content |
|---|---|---|
| courses | btech-cs, btech-ict, hnd-cs, hnd-ict | per CourseDocument (prefix BCS, BICT, HCS, HICT) |
| academic_years | one current, start year 2026 | per AcademicYearDocument, deadlines default |
| academic_years/{y}/counters | each course id | `next_sequence: 1` |
| rosters/{y}/students | index_number | index_number, full_name, contact, email = studentEmail(index), course_id, user_uid null, signup_completed_at null, import_batch_id `fixture-base`, `is_active` true (group_number is NOT written) |
| staff_whitelist | email | full_name, roles, department, programmes, is_active, added_by_uid `fixture`, user_uid null |
No Auth users, no users docs.

## Full mode adds
- Auth users: uid `stu-<index>` / `staff-<localpart>`, email, displayName, `emailVerified: true`, custom claims `fx.claimsFor(email)`.
- `users/{uid}` via the same internal function `complete-signup` uses (do not hand-build the doc), then roster/whitelist `user_uid` and `signup_completed_at`.
- `supervisor_contacts/{uid}` and users.profile (research_interests, max_team_capacity) from `staff-profiles.json`.
- `supervisions/{uid}__{yearId}` for every staff with the supervisor role: max_capacity from the profile, assigned teams from `supervisor_assignments`.
- Teams via `createTeamInTx` in fixture order so group numbers equal the fixture (BCS26_01, BCS26_02, ...); leader and members from `groups`; then `assigned_supervisor_id` and `supervisor_assignment.status: 'accepted'`. Counters end at 3 per programme. Status stays `formation`. Contact grants are not seeded (they need an approved topic).

## check:data rules (report `{ok, checks[], unknown[]}`)
1. Roster docs: index set equals fixture; `email == studentEmail(index)`; contact and course_id equal the fixture; `is_active` is true (missing counts as true).
2. Staff whitelist: email set equals fixture; roles and programmes equal.
3. Auth users (if any): every email is a fixture email; uid matches the helper; claims match `claimsFor`.
4. users docs (if any): only fixture uids; course_id equals roster course.
5. Teams (full): 8 teams, member count 4 to 5, group_number format `{prefix}26_{NN}` with prefix matching course_id, every member in the same course, supervisor programmes include the team's course, counters = teams per course + 1.
6. Anything not in the fixture is reported under `unknown` and fails the check.

## package.json scripts
```json
"emu": "firebase emulators:start --only auth,firestore --project demo-fypms",
"emu:reset": "node scripts/emulator-reset.mjs",
"emu:reset:test": "node scripts/emulator-reset.mjs --test",
"seed:base": "tsx scripts/seed.ts --mode base",
"seed:full": "tsx scripts/seed.ts --mode full",
"check:data": "tsx scripts/check-data.ts",
"dev:fresh": "npm run emu:reset && npm run seed:base && npm run check:data",
"test:rules": "firebase emulators:exec --config firebase.test.json --project demo-fypms-test --only firestore \"vitest run --config vitest.rules.config.ts\"",
"test:server": "firebase emulators:exec --config firebase.test.json --project demo-fypms-test --only auth,firestore \"vitest run --config vitest.server.config.ts\""
```
Seed and check scripts require `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (put them in `.env.local` or the npm script via `cross-env`).
