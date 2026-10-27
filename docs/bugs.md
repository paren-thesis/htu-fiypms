# FYPMS bug log
`fypms-fix-bug` reads this first and appends a row for every fixed bug.
Classes: **A** code defect · **B** source-of-truth (spec/skill/prompt) was wrong · **C** spec ambiguity · **D** environment/config.

| ID | Date | Prompt | Symptom | Class | Root cause | Fix | Docs updated |
|---|---|---|---|---|---|---|---|
| BUG-001 | 2026-10-27 | 00-03 | Supervisor saw Roster Import in the sidebar and could import rosters | B | FR-01.4 and the UI skill nav allowed supervisors | Decision D-05 (spec 5.2.1); nav, route gate, action and tests aligned | spec, ui-design-system, roster-import, testing, AGENTS.md, prompts 00-03/02-02/03-01/03-02 |
| BUG-002 | 2026-10-27 | 03-02 | Build Error: parallel pages resolve to same path (/(shell)/admin/staff-whitelist and /(shell)/students) | A | Pages created directly under src/app instead of replacing placeholder pages in (shell) route group | Moved pages into src/app/(shell)/, removed duplicate folders, added connection() for cacheComponents | none |
| BUG-003 | 2026-10-27 | 03-02 | Runtime Error: Only plain objects can be passed to Client Components from Server Components | A | Firestore Timestamp class instances in documents passed directly across RSC boundary to Client Components | Added serializeForClient helper in src/lib/serialize.ts and serialized documents in students and staff-whitelist pages | none |
