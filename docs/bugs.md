# FYPMS bug log
`fypms-fix-bug` reads this first and appends a row for every fixed bug.
Classes: **A** code defect · **B** source-of-truth (spec/skill/prompt) was wrong · **C** spec ambiguity · **D** environment/config.

| ID | Date | Prompt | Symptom | Class | Root cause | Fix | Docs updated |
|---|---|---|---|---|---|---|---|
| BUG-001 | 2026-10-27 | 00-03 | Supervisor saw Roster Import in the sidebar and could import rosters | B | FR-01.4 and the UI skill nav allowed supervisors | Decision D-05 (spec 5.2.1); nav, route gate, action and tests aligned | spec, ui-design-system, roster-import, testing, AGENTS.md, prompts 00-03/02-02/03-01/03-02 |
