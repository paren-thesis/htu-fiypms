# Impact checklist by change type (check every row, skip none)

## Role or permission change
- Spec: personas (section 2), FR rows, architecture diagram, directory-tree comments (section 11), rules (section 9), tests (section 12.2), decisions and changelog.
- Skills: `fypms-ui-design-system` (nav per role), the domain skill's "Allowed callers", `fypms-testing`, `fypms-auth-gating` if routes change.
- `AGENTS.md` non-negotiables; `docs/models.md` access column.
- Prompts: nav shell (00-03), route gate (02-02), the action prompt, the UI prompt; their acceptance lists.
- Code: `src/config/nav.ts`, `src/lib/auth/route-gate.ts` (+ test), the Server Action's `requireUser(roles)`, `firestore.rules` (+ rules test), page-level conditional rendering, e2e.

## Field or schema change
- Spec section 8.1 + the FR; `src/types/firestore.ts`; Zod schema and repo; `firestore.rules`; `firestore.indexes.json`; seed script; `docs/models.md`; prompts that list the model; tests; export columns if reported.

## Status or workflow change
- State machine (`src/lib/**/state-machine.ts`) + tests, spec FR and diagrams, `StatusBadge` maps, notifications, route gating by status, prompts' assumptions.

## Formula or weight change
- Pure scoring/matching function + tests, spec formula section, rubric validation, Excel formulas and CSV, defense-grading/matching skills.

## UI copy or behaviour only
- Component, the prompt's acceptance line, any e2e text assertion.

## Search recipes
- Role words: `supervisor`, `coordinator`, `activeRole`, `hasAnyRole`, `requireUser(`.
- Routes: the path, its folder under `src/app`, and its nav label.
- Actions: the file name in `src/app/actions` and every import of it.
- Old wording: quote a distinctive phrase from the superseded FR.
