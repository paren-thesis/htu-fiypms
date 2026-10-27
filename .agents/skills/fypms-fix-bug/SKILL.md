---
name: fypms-fix-bug
description: Diagnoses and fixes FYPMS bugs - runtime, TypeScript and build errors, wrong behaviour, role or permission mismatches, failing tests, Firestore rules denials - with a classify, reproduce, fix, prove, record loop that uses minimal tokens. Use whenever the user reports a bug, error, stack trace or unexpected behaviour, or sends JSON with "task":"fix_bug".
---

# Input
JSON prompt (template `references/bug-report.template.json`, example `references/bug-report.example.json`) or any pasted error/plain description; normalise it mentally and continue. Needed: `symptom`, `expected`. Useful: `error{message,code,stack}`, `where{route,role,file,line,screenshot}`, `repro[]`, `prompt_id`, `constraints`.

# Loop (stop as soon as the cause is proven)
0. **Known pattern?** `grep -i "<keyword>" docs/bugs.md`, then `references/common-errors.md`.
1. **Classify in one sentence** (decides everything else):
   - **A** code defect: code deviates from the spec/skill.
   - **B** source-of-truth defect: code did exactly what the spec, a skill or a prompt said, and that is wrong. Do NOT patch code first. Run `fypms-spec-change` to fix the documents, then align code.
   - **C** spec ambiguity: pick the simplest behaviour, record it as an assumption in `docs/bugs.md`, ask the user only if blocked.
   - **D** environment/config: env vars, emulator, dependency, Vercel.
   - **E** data mismatch: users, records or fields that are not from `fixtures/testusers.json`, or tests touching the dev emulator. Use `fypms-test-data`.
   - **V** visual/layout defect (screenshot or description). Use `fypms-ui-qa`.
   Decide by grepping the behaviour or FR id in `docs/fypms-docs.md` and the matching skill: if they agree with the code it is B or C.
2. **Reproduce narrowly**: one file/test/route (`npx vitest run <file>`, `npx tsc --noEmit`, emulator rules test, `NEXT_PUBLIC_DEV_ROLE=<role>` for UI). For logic bugs write the failing test first.
3. **Locate** with the symptom table in `references/common-errors.md`. Role or permission bugs: check all five layers in order: (1) `src/config/nav.ts`, (2) `decideRoute` in the route gate, (3) the Server Action role check (`requireUser(idToken, roles)`), (4) `firestore.rules`, (5) UI conditional rendering. A permission is only fixed when every layer agrees.
4. **Fix the root cause**, smallest diff, within `constraints.max_files` (default 3, 6 for permission bugs), no new dependencies unless allowed.
5. **Prove**: the failing test passes, plus the narrow related suite. Permission bugs get one test per layer touched (gate unit test, action 403, rules test).
6. **Propagate**: if the fix changes documented behaviour, update spec, skills, prompts and commit messages (`fypms-spec-change`).
7. **Record**: append a row to `docs/bugs.md` (next BUG-NNN) and write the commit message from `references/commit-fix-template.txt` to `docs/prompts/commits/fix-<bug-id>.txt`.
8. **Limit**: 3 fix attempts, then stop with the unresolved reply.

# Reply (JSON only)
`{"status":"fixed","bug_id":"BUG-002","class":"A|B|C|D|E|V","root_cause":"...","layers_fixed":["nav","gate","action","rules","ui"],"changes":[{"file":"...","summary":"..."}],"tests_added":["..."],"verified_with":"npx vitest run ...","docs_updated":["..."],"commit_message_file":"docs/prompts/commits/fix-BUG-002.txt","follow_ups":["..."]}`
Unresolved: `{"status":"unresolved","attempts":3,"hypotheses":[{"cause":"...","evidence":"...","next_check":"..."}]}`

# Never
- Loosen Firestore rules to make an error disappear; use `any`, `@ts-ignore` or `eslint-disable`; skip, delete or weaken a failing test; swallow errors with an empty `catch`.
- Import `firebase-admin` into client components or middleware as a fix.
- Fix a permission in the UI only. Hiding a button is not a fix.
- Add `dark:` styles (light mode only). Refactor unrelated code (list it in `follow_ups`).
- Dump whole files or full stack traces into chat; read the cited file +/- 40 lines first.
