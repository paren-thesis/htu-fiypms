# FYPMS bug log
`fypms-fix-bug` reads this first and appends a row for every fixed bug.
Classes: **A** code defect · **B** source-of-truth (spec/skill/prompt) was wrong · **C** spec ambiguity · **D** environment/config · **E** data mismatch (not from fixtures) · **V** visual/layout.

| ID | Date | Prompt | Symptom | Class | Root cause | Fix | Docs updated |
|---|---|---|---|---|---|---|---|
| BUG-001 | 2026-10-27 | 00-03 | Supervisor saw Roster Import in the sidebar and could import rosters | B | FR-01.4 and the UI skill nav allowed supervisors | Decision D-05 (spec 5.2.1); nav, route gate, action and tests aligned | spec, ui-design-system, roster-import, testing, AGENTS.md, prompts 00-03/02-02/03-01/03-02 |
| BUG-002 | 2026-10-27 | 01-04 | Dev Auth/Firestore emulator held users and roster rows not in fixtures | E | Tests and seed code wrote invented data to the dev emulator | fixtures/, seed base, check:data, test emulator + guard | fypms-test-data, AGENTS.md |
| BUG-003 | 2026-10-27 | 00-02 | Doubled ring on the current stepper step | V | Border plus ring stacked or ring clipped | Single indicator + layout spec | fypms-ui-qa pitfalls |
| BUG-004 | 2026-10-27 | 03-02 | /students: invented rows, tabs beside table, dev badge over sidebar | E+V | Invented seed data; tabs in flex row; Next dev indicator position | studentEmail() single source, layout fix, indicator moved | fypms-ui-qa pitfalls |
