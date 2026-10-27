---
name: fypms-create-model
description: Scaffolds a new FYPMS data model (Firestore collection) end to end from a JSON prompt with "task":"create_model" - TypeScript interface, Zod schemas, Admin-SDK repo, security-rules block, composite indexes, Server Actions, tests and registry entry. Use whenever the user asks to add a model, entity, collection or document type, or sends JSON containing task create_model.
---

# Input = JSON prompt
Template `references/prompt.template.json` · worked example `references/prompt.example.json` · validator `references/prompt.schema.json` (open only if validation is unclear). Required keys: `task, model, collection, description, fields, access`.
If invalid or ambiguous, reply with ONLY `{"status":"invalid","errors":[{"path":"fields[2].type","problem":"..."}]}` and write nothing. Never ask free-text questions.

# Steps (do not read the spec; read `docs/models.md` and `src/types/firestore.ts` only)
1. **Duplicate check**: grep the model and collection in `docs/models.md` and the types file. Exists → reply `{"status":"exists"}` and stop.
2. **Defaults**: `doc_id:"auto"`, `timestamps:true` (adds `created_at`, `updated_at`), `audit:true`, `generate` = all.
3. **Generate** only what `generate` lists, following `references/codegen-patterns.md` exactly:

| key | file |
|---|---|
| types | append interface to `src/types/firestore.ts` |
| zod | `src/lib/models/<kebab-model>/schema.ts` |
| repo | `src/lib/models/<kebab-model>/repo.ts` (server-only) |
| rules | one new `match` block in `firestore.rules` |
| indexes | entries in `firestore.indexes.json` for each query mixing `where` + `orderBy` on different fields |
| actions | `src/app/actions/<verb>-<kebab-model>.ts` per `actions[]` |
| tests | `src/lib/models/<kebab-model>/schema.test.ts` + `tests/rules/<kebab-model>.rules.test.ts` |
| registry | one row appended to `docs/models.md` |

4. **Verify**: `npx tsc --noEmit`, then `npx vitest run src/lib/models/<kebab-model>`. On failure apply `fypms-fix-bug` logic, max 2 attempts.
5. **Reply** with this JSON only:
`{"status":"created","model":"X","files_created":[],"files_modified":[],"verified":{"tsc":true,"vitest":true},"needs_review":["..."]}`

# Hard rules
- Model PascalCase, fields snake_case, folders kebab-case. Server-managed fields (`id`, `created_at`, `updated_at`, `created_by`) never appear in input schemas.
- Zod: create schema `.strict()`; update schema = create `.partial()` limited to updatable fields.
- Rules: use only existing helpers (`isMember`, `hasAnyRole`, `isTeamMember`, `isAssignedSupervisor`); never loosen other blocks. Client writes are allowed only when `access.create|update` is a role list AND the touched fields have `writable_by_client:true` (enforce with `affectedKeys().hasOnly([...])`). Otherwise `if false` and writes go through Server Actions.
- `sensitive:true` fields (phones, contacts, scores before publication) must not live in a collection any non-owner client can read. If `access.read` conflicts, return `invalid`; the fix is a gated doc like `supervisor_contacts` + `grants`.
- `course_scoped:true` adds required `course_id` (ref `courses`) and every create/join-style action must check category integrity (409 on mismatch).
- Every action: verifyIdToken → role check → Zod parse → mutate (transaction if read-then-write) → audit log when `audit:true`. Catch `ZodError`, return `{ok:false,errors}`.
- No new dependencies, no `any`, no dark-mode classes.
