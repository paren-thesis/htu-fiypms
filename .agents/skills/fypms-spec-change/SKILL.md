---
name: fypms-spec-change
description: Applies a requirement, role or permission change consistently across the FYPMS spec, skills, AGENTS.md, JSON prompts, commit messages, code, rules and tests using an impact search and a change record. Use when the user says a rule, role, permission, flow or field in the spec is wrong or has changed, when a bug is class B (the docs were wrong), or when the user sends JSON with "task":"spec_change".
---

# Input
JSON prompt (template `references/spec-change.template.json`, worked example `references/spec-change.example.json`). Needed: `title`, `decision`. Useful: `affects{roles,routes,actions,collections,fr_ids,terms}`, `supersedes[]`, `prompts_done[]`, `code_built`, `version_bump`. Plain-language requests are fine; convert them.

# Procedure
1. **Impact search (grep only, no full reads)**: build search terms from `affects` plus synonyms (role names, route paths, action names, FR ids). Run:
   `grep -n -i "<term>" docs/fypms-docs.md` and
   `grep -rn -i "<term>" AGENTS.md .agents docs/prompts docs/models.md src firestore.rules tests e2e`
   Use `references/impact-checklist.md` for the change type so nothing is missed.
2. **List the impact before editing** as compact JSON: `{"files":[{"path":"","why":"","action":""}]}`. Group by spec, skills, AGENTS.md, prompts, commit messages, code, rules, tests.
3. **Edit in this order, surgically** (str_replace, keep markdown tables valid): spec, skills, AGENTS.md, prompt JSON (keep valid JSON), commit message files, then code and tests when `code_built` or any `prompts_done` touched the behaviour.
   Spec edits: personas, FR rows, architecture diagram, directory-tree comments, section 9 rules, section 12.2 tests, a new decision row `D-NN` (next free number) in section 13.1, a changelog row in section 14, and the version in the header (patch bump unless `version_bump` says otherwise).
4. **Code alignment** (only for work already built): follow the `fypms-fix-bug` loop. Permission changes are fixed in every layer (nav, route gate, Server Action, rules, UI) with a test per layer.
5. **Verify**: re-grep the old wording (it must be gone or intentionally kept), validate every edited JSON (`python3 -m json.tool`), run the narrow unit tests for gate/nav/actions and the affected rules tests.
6. **Commit messages**: write `docs/prompts/commits/docs-<D-NN>.txt` (type `docs(spec)`) and, if code changed, `fix-<slug>.txt`. Update the message files of affected prompts so they describe the corrected behaviour.
7. **Record**: add a row to `docs/bugs.md` when the change came from a bug.

# Reply (JSON only)
`{"status":"done","decision":"D-NN","version":"5.2.1","files_changed":[{"path":"","summary":""}],"code_changed":false,"tests":"command + result","commit_messages":["docs/prompts/commits/docs-D-NN.txt"],"rerun_prompts":["00-03"],"follow_ups":[]}`
`rerun_prompts` lists finished prompts whose output must be redone or patched (omit when code was aligned directly).

# Never
- Edit only the spec and leave a skill or prompt that still says the old thing; a stale skill recreates the bug on the next prompt.
- Renumber or delete earlier decisions or findings; add new ones.
- Change behaviour the user did not ask to change; widen permissions while narrowing others.
