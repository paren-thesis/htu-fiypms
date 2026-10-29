# FYPMS JSON prompt pack (spec v5.2)

40 ready-to-run JSON prompts that take the project from Phase 0 (scaffold) to Phase 12 (release). Together they build all 18 models in the spec plus two additions (`grade_appeals`, `archived_projects`).

## How to use
1. Unzip into your project root. It adds `docs/prompts/` and `docs/models.md` and does not touch `AGENTS.md`, your spec or your skills.
2. Open a **new Antigravity conversation** for each prompt, in order (see `docs/prompts/index.json`).
3. Say: `Run docs/prompts/phase-04-teams/04-01-team-model-create-join-and-invite-codes.json` (or paste the file contents).
4. Review the diff, run the prompt's `verify` commands, commit, then move to the next prompt.

Each prompt names the skills to load, the spec parts to read (FR ids only), the models it touches, what to build, what is out of scope, and acceptance checks. The agent replies with a short JSON summary.

## What it depends on
- Your existing skills only: scaffold-roadmap, ui-design-system, auth-gating, firestore-data, roster-import, teams-topics, supervisor-matching, defense-grading, reports-export, notifications, testing.
- `docs/prompts/_standards.json` holds the shared conventions (model layer layout, Server Action pattern, rules and test patterns, error procedure, reply format), so the prompts stay small and nothing depends on the create-model or fix-error skills. If you add those later they will not conflict.
- Prerequisites: Node 20+, a JDK for the Firestore emulator (the Firebase CLI tells you the minimum version), a Firebase dev project.

## Prompts

**Phase 00**

- `00-01` Scaffold project
- `00-02` Design tokens and UI kit
- `00-03` App shell and empty pages

**Phase 01**

- `01-01` Types, rules, indexes and emulator (models: all 18 models)
- `01-02` Rules test harness and baseline tests (models: UserDocument, TeamDocument, SupervisorContactDocument, EvaluationDocument, PeerEvaluationDocument)
- `01-03` Server infrastructure, audit log and notifications models (models: AuditLogDocument, NotificationDocument)
- `01-04` Course and academic year models with seed script (models: CourseDocument, AcademicYearDocument)

**Phase 02**

- `02-01` Firebase clients, AuthContext, login and session cookie (models: UserDocument)
- `02-02` Edge middleware and gate pages
- `02-03` complete-signup: roster and whitelist linkage (models: UserDocument, RosterStudentDocument, StaffWhitelistDocument)
- `02-04` Role switcher and switch-role action (models: UserDocument)
- `02-05` Faculty profile completion and supervisor contacts (models: SupervisorContactDocument, UserDocument)

**Phase 03**

- `03-01` Staff whitelist model and admin page (models: StaffWhitelistDocument)
- `03-02` Roster model and CSV import (models: RosterStudentDocument)
- `03-03` Student records CRUD (coordinator/admin) (models: RosterStudentDocument)

**Phase 04**

- `04-01` Team model: create, join and invite codes (models: TeamDocument, TeamMember (subcollection), InviteCodeDocument, TeamInviteDocument, CounterDocument)
- `04-02` My Team page (models: TeamDocument)
- `04-03` Unassigned pool and auto-grouping (models: TeamDocument)

**Phase 05**

- `05-01` Topic model, state machine and submission (models: TopicDocument, Topic history (subcollection))
- `05-02` Proposals page for teams (models: TopicDocument)
- `05-03` Topic review and supervisor contact grants (models: TopicDocument, TeamDocument, SupervisorContact grants)

**Phase 06**

- `06-01` Matching engine (pure logic)
- `06-02` Supervision model and assignment workflow (models: SupervisionDocument, TeamDocument)
- `06-03` Supervision page for all roles (models: SupervisionDocument, SupervisorContactDocument)

**Phase 07**

- `07-01` Chapter model and review actions (models: ChapterDocument)
- `07-02` Chapters page (models: ChapterDocument)

**Phase 08**

- `08-01` Rubric model and builder (models: RubricDocument)
- `08-02` Defense panel model, scheduling and conflict detection (models: DefensePanelDocument)
- `08-03` Defense scheduling UI (models: DefensePanelDocument)

**Phase 09**

- `09-01` Evaluation model and score aggregation (models: EvaluationDocument)
- `09-02` Digital marksheet (real-time) (models: EvaluationDocument)

**Phase 10**

- `10-01` Peer evaluation model and pages (models: PeerEvaluationDocument)
- `10-02` Software deliverables and supervisor sign-off (models: SoftwareDeliverableDocument)

**Phase 11**

- `11-01` Broadsheet exports (XLSX, CSV, PDF) (models: TeamDocument, RosterStudentDocument)
- `11-02` Publish, lock and amend grades; student grades page (models: EvaluationDocument, TeamDocument, AcademicYearDocument)
- `11-03` Grade appeals (new model) (models: GradeAppealDocument (NEW))

**Phase 12**

- `12-01` Notification centre and live toasts (models: NotificationDocument)
- `12-02` Project archive (new model) and search (models: ArchivedProjectDocument (NEW))
- `12-03` Audit log viewer, admin users and team overrides (models: AuditLogDocument, UserDocument, TeamDocument)
- `12-04` Hardening, end-to-end tests and release checklist (models: all models)

## Spec amendments the prompts make (the agent records them in `docs/models.md` and `docs/fypms-docs.md` section 13)
- **A1** NotificationDocument.type extended (01-03)
- **A2** TeamDocument.supervisor_assignment (06-02)
- **A3** ChapterDocument.history[] (07-01)
- **A4a** DefensePanelDocument.is_published/published_at if missing (08-02)
- **A4** New model grade_appeals (11-03)
- **A5** New model archived_projects (12-02)
- **A6** RosterStudentDocument is_active and audit fields (03-03)

## Assumptions to confirm (the spec is silent; each prompt also lists its own)
- Any team member drafts topics, only the leader submits; teams need at least 4 members to submit.
- Topic review: the assigned supervisor if any, otherwise any supervisor of the team's programme.
- Supervisor response window is 72 hours.
- A team becomes `defense_ready` when chapter 5 is approved; deliverables open at that point.
- Peer evaluation opens at `defense_ready`; peer data never changes marks.
- Cross-category team merging (admin override) is not implemented in v1.
- Email is out of scope (FR-09.3 deferred); all alerts are in-app.
