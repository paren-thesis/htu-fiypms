# FYPMS test data and emulator guide

All test and seed data comes from two files, and nothing else may be invented:
- `fixtures/testusers.json`: 40 students (10 per programme), 6 staff, 8 groups, 4 supervisor assignments
- `fixtures/staff-profiles.json`: office, hours, phone, interests per staff member (used by `seed:full`)
- `fixtures/index.ts`: typed loader; the only place that builds student emails (`<index>@htu.edu.gh`) and UIDs

## Accounts you can sign in with
Student email is always `<index_number>@htu.edu.gh` (for example `0323000101@htu.edu.gh`).

| Staff email | Name | Roles | Programmes |
|---|---|---|---|
| coordinator@htu.edu.gh | Dr. Samuel K. Ampofo | coordinator, supervisor | btech-cs, btech-ict, hnd-cs, hnd-ict |
| admin@htu.edu.gh | IT Systems Admin | admin | - |
| kappiah@htu.edu.gh | Prof. Kwame Appiah | supervisor, panel_member | btech-cs, hnd-cs |
| aowusu@htu.edu.gh | Dr. Ama Owusu | supervisor, panel_member | btech-ict, hnd-ict |
| yboateng@htu.edu.gh | Dr. Yaw Boateng | supervisor, panel_member | btech-cs, btech-ict |
| emensah@htu.edu.gh | Dr. Efua Mensah | supervisor, panel_member | hnd-cs, hnd-ict |

| Group | Programme | Leader | Members (index range) | Supervisor |
|---|---|---|---|---|
| BCS26_01 | btech-cs | 0323000101 (Kwame Mensah) | 0323000101 to 0323000105 | kappiah@htu.edu.gh |
| BCS26_02 | btech-cs | 0323000106 (Efua Ansah) | 0323000106 to 0323000110 | yboateng@htu.edu.gh |
| BICT26_01 | btech-ict | 0323000201 (Kwabena Danso) | 0323000201 to 0323000205 | aowusu@htu.edu.gh |
| BICT26_02 | btech-ict | 0323000206 (Araba Mensimah) | 0323000206 to 0323000210 | yboateng@htu.edu.gh |
| HCS26_01 | hnd-cs | 0323000301 (Emmanuel Tetteh) | 0323000301 to 0323000305 | emensah@htu.edu.gh |
| HCS26_02 | hnd-cs | 0323000306 (Joyce Addo) | 0323000306 to 0323000310 | kappiah@htu.edu.gh |
| HICT26_01 | hnd-ict | 0323000401 (Joseph Mensah) | 0323000401 to 0323000405 | emensah@htu.edu.gh |
| HICT26_02 | hnd-ict | 0323000406 (Comfort Nyame) | 0323000406 to 0323000410 | aowusu@htu.edu.gh |

**Signing in with the emulator's Google popup:** choose **Add new account**, type the email from the tables, add any display name, then **Sign in with Google.com**. In `base` data this creates the Auth user the first time and runs the real `complete-signup` flow.

## Two emulators, never mixed
| | Dev (what you look at) | Test (automated tests only) |
|---|---|---|
| Config | `firebase.json` | `firebase.test.json` |
| Project id | `demo-fypms` | `demo-fypms-test` |
| Auth / Firestore | 9099 / 8080 | 9199 / 8180 |
| UI | http://localhost:4000 | off |
| Used by | you, the app, `seed:*` | `npm run test:rules`, `test:server`, e2e |

Tests refuse to run against the dev ports (`tests/setup/emulator-guard.ts`), so they cannot put users into the emulator you inspect.

## Refresh everything (Firestore + Authentication)
Do these in order. The emulators keep data in memory, so stopping them is the most complete reset.

### Fastest: one command (emulators running)
```
npm run dev:fresh
```
It clears Auth and Firestore (`scripts/emulator-reset.mjs`), loads the fixtures (`seed:base`) and verifies them (`check:data`).
Then clear the browser (step 3 below).

### Step by step
1. **Clear the emulator data**, pick one:
   - Emulator UI at http://localhost:4000: **Authentication, Clear all data**, then **Firestore, Clear all data**.
   - `npm run emu:reset` (add `-- --only auth` or `-- --only firestore` for one side; `-- --project <id>` if your emulator runs with another project id).
   - Raw REST calls (replace `demo-fypms` with your project id):
     - macOS/Linux
       ```
       curl -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/demo-fypms/accounts"
       curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-fypms/databases/(default)/documents"
       ```
     - Windows PowerShell
       ```
       Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:9099/emulator/v1/projects/demo-fypms/accounts"
       Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:8080/emulator/v1/projects/demo-fypms/databases/(default)/documents"
       ```
2. **Load known data**: `npm run seed:base` (courses, academic year, roster, staff whitelist; no Auth users) or `npm run seed:full` (adds Auth users, profiles, teams; needs prompt DEV-01).
3. **Clear the browser** or you will see a stale session for a user that no longer exists: open http://localhost:3000, DevTools, **Application**, **Storage**, **Clear site data** (this removes the Firebase Auth IndexedDB entry and the `__session` cookie). Signing out first also works.
4. **Verify**: `npm run check:data`. It must print `"ok": true` and an empty `unknown` list. After `seed:base`: 4 courses, 1 academic year, 40 roster students, 6 staff, 0 Auth users.

### Complete wipe (nuclear option)
1. Stop the emulators (Ctrl+C in the terminal running `npm run emu`).
2. If you ever started them with `--import` or `--export-on-exit`, delete that export folder (for example `emulator-data/`).
3. `npm run emu`, then `npm run dev:fresh`, then clear the browser as above.

## If unknown users or records come back
1. Run `npm run check:data` and read the `unknown` list.
2. Something is writing to the dev emulator. Look for tests or scripts using ports 9099/8080 or project `demo-fypms`:
   `grep -rn "createUser\|createCustomToken\|9099\|8080\|demo-fypms" scripts tests e2e src`
3. Check the emulator log (terminal running `npm run emu`) for requests at the time the data appeared.
4. Nothing cleared after a reset? The project id you passed differs from the one the emulator runs with (data is separate per project id). Use the id in `.firebaserc` / the `--project` flag of `npm run emu`.
5. Ask the agent: `{"task":"fix_bug", ...}` (see `docs/prompts/bugfix/BUG-002.json`).

## Suggested smoke test after a refresh
1. `npm run dev:fresh`, start the app, clear the browser.
2. Sign in as `coordinator@htu.edu.gh`: `/students` shows 40 students; staff whitelist shows 6.
3. Sign in as `0323000101@htu.edu.gh`: signup links the roster entry and lands on the student dashboard.
4. Sign in as `kappiah@htu.edu.gh`: `/complete-profile` appears (base data has no profile), then the supervisor dashboard; no roster import is offered.
5. Run `npm run test:server` and confirm `npm run check:data` still passes (tests did not touch the dev emulator).
