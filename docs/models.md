# FYPMS model registry
Agents read this file (not the spec) to check what exists. `fypms-create-model` appends a row per new model.

| Model | Collection | Access | Code location | Added |
|---|---|---|---|---|
| UserDocument | users | members read · server write | src/types/firestore.ts, src/lib/models/user/* | spec v5.2 (Prompt 02-03) |
| RosterStudentDocument | rosters/{year}/students | owner/coordinator/admin read · server write | src/types/firestore.ts, src/lib/models/roster/* | spec v5.2 (Prompt 03-02) |
| StaffWhitelistDocument | staff_whitelist | coordinator/admin read · server write | src/types/firestore.ts, src/lib/models/staff-whitelist/* | spec v5.2 (Prompt 03-01) |
| CourseDocument | courses | members read · coordinator/admin write | src/types/firestore.ts | spec v5.2 |
| AcademicYearDocument | academic_years (+counters) | members read · coordinator/admin write (not grades_published) | src/types/firestore.ts | spec v5.2 |
| TeamDocument | teams (+members, private) | members read · server write (leader renames) | src/types/firestore.ts, src/lib/models/team/* | spec v5.2 (Prompt 04-01) |
| TopicDocument | topics (+history) | members read · server write | src/types/firestore.ts | spec v5.2 |
| SupervisionDocument | supervisions | members read · server write | src/types/firestore.ts | spec v5.2 |
| ChapterDocument | chapters | members read · server write | src/types/firestore.ts | spec v5.2 |
| RubricDocument | rubrics | members read · coordinator/admin write | src/types/firestore.ts | spec v5.2 |
| DefensePanelDocument | defense_panels | members read · coordinator/admin write | src/types/firestore.ts | spec v5.2 |
| EvaluationDocument | evaluations | evaluator/staff read, team after publish · evaluator write unpublished | src/types/firestore.ts | spec v5.2 |
| PeerEvaluationDocument | peer_evaluations | evaluator/supervisor/coordinator/admin read · team member create | src/types/firestore.ts | spec v5.2 |
| SoftwareDeliverableDocument | software_deliverables | members read · team + assigned supervisor write | src/types/firestore.ts | spec v5.2 |
| SupervisorContactDocument | supervisor_contacts (+grants) | owner/coordinator/admin or granted student read · server write | src/types/firestore.ts, src/lib/models/supervisor-contact/* | spec v5.2 (Prompt 02-05) |
| InviteCodeDocument | invite_codes | none · server only | src/types/firestore.ts, src/lib/models/team/* | spec v5.2 (Prompt 04-01) |
| NotificationDocument | notifications | owner read · server create | src/types/firestore.ts | spec v5.2 (amended A1) |
| AuditLogDocument | audit_logs | coordinator/admin read · server write | src/types/firestore.ts | spec v5.2 |

## Amendments
- **A1 (Prompt 01-03):** Extended `NotificationDocument.type` union with `'supervision_assignment' | 'team_update' | 'team_invite' | 'system'` to support full lifecycle event notifications.

