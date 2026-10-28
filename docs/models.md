# FYPMS model registry
Agents read this file (not the spec) to check what exists. `fypms-create-model` appends a row per new model.

| Model | Collection | Access | Code location | Added |
|---|---|---|---|---|
| UserDocument | users | members read · server write | src/types/firestore.ts | spec v5.2 |
| RosterStudentDocument | rosters/{year}/students | owner/coordinator/admin read · server write | src/types/firestore.ts | spec v5.2 |
| StaffWhitelistDocument | staff_whitelist | coordinator/admin read · server write | src/types/firestore.ts | spec v5.2 |
| CourseDocument | courses | members read · coordinator/admin write | src/types/firestore.ts | spec v5.2 |
| AcademicYearDocument | academic_years (+counters) | members read · coordinator/admin write (not grades_published) | src/types/firestore.ts | spec v5.2 |
| TeamDocument | teams (+members, private) | members read · server write (leader renames; supervisor_assignment per A2) | src/types/firestore.ts | spec v5.2 (A2) |
| TopicDocument | topics (+history) | members read · server write | src/types/firestore.ts | spec v5.2 |
| SupervisionDocument | supervisions (id: `${uid}__${year}`) | members read · server write | src/lib/models/supervision/* | 06-02 |
| ChapterDocument | chapters (id: `${teamId}__ch${n}`) | members read · server write (submit/review actions; history[] per A3) | src/lib/models/chapter/* | 07-01 (A3) |
| RubricDocument | rubrics | members read · coordinator/admin write | src/lib/models/rubric/* | 08-01 |
| DefensePanelDocument | defense_panels | members read · coordinator/admin write | src/lib/models/defense-panel/* | 08-02 (A4a) |
| EvaluationDocument | evaluations | evaluator/staff read, team after publish · evaluator write unpublished | src/lib/models/evaluation/* | 09-01 |
| PeerEvaluationDocument | peer_evaluations | evaluator/supervisor/coordinator/admin read · team member create | src/lib/models/peer-evaluation/* | 10-01 |
| SoftwareDeliverableDocument | software_deliverables | members read · team + assigned supervisor write | src/lib/models/software-deliverable/* | 10-02 |
| SupervisorContactDocument | supervisor_contacts (+grants) | owner/coordinator/admin or granted student read · server write | src/types/firestore.ts | spec v5.2 |
| InviteCodeDocument | invite_codes | none · server only | src/types/firestore.ts | spec v5.2 |
| NotificationDocument | notifications | owner read · server create | src/types/firestore.ts | spec v5.2 |
| AuditLogDocument | audit_logs | coordinator/admin read · server write | src/types/firestore.ts | spec v5.2 |
