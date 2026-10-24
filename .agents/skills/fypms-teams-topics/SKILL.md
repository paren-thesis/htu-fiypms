---
name: fypms-teams-topics
description: FYPMS project teams, group numbers, invite codes, course-category integrity, topic proposals, the topic approval state machine and versioning. Use for my-team and proposals pages, create-team/join-team/auto-group actions, topic review.
---

# Teams
- Size 4–5 (`max_members: 5`). Creator = `leader_id`. One active team per student per academic year.
- `group_number = {PREFIX}{YY}_{NN}`; prefix from `course_id`: `btech-cs→BCS`, `btech-ict→BICT`, `hnd-cs→HCS`, `hnd-ict→HICT`. Never user-supplied. Sequence from `academic_years/{yearId}/counters/{course_id}.next_sequence`, incremented in the same transaction (spec F-14).
- Invite code: 6 chars uppercase alphanumeric, exclude `0 O 1 I`. Never store it on the team doc (F-06): create `invite_codes/{code}` with `tx.create` (collision → retry) and `teams/{teamId}/private/invite`. Join looks up `invite_codes/{code}`.
- All team/topic/chapter writes are Server Actions (rules deny client writes). Leader may rename the team only.
- **Category integrity (409)**: create/join must run in a Firestore transaction checking `student.profile.course_id === team.course_id`, not already on a team this year, `member_count < max_members`. Message: "This team belongs to a different programme. You can only join teams in your own course track."
- Status flow: `formation → topic_pending → topic_approved → defense_ready → completed`; `disbanded` from any (admin/coordinator).
- Coordinator pool: unassigned students after formation deadline; auto-group clusters strictly by `course_id`; cross-category only via admin override (audit-logged with reason).

# Topics
- 3 ranked topics per team (`preference_rank` 1|2|3), unique among `is_current: true` docs for the team.
- State machine (reject any other transition server-side):
  `draft→submitted` (team) · `submitted→under_review` (supervisor opens) · `under_review→approved | rejected | revision_requested` (supervisor) · `revision_requested|rejected→submitted` (team resubmits).
- Resubmission transaction: copy current doc to `topics/{id}/history/{version}`, `version += 1`, set `status:'submitted'`, keep `is_current:true`. History is append-only.
- Approve exactly one topic per team → set `team.approved_topic_id`, `team.status='topic_approved'`, write `supervisor_contacts/{supervisorId}/grants/{studentUid}` for every team member (also on later joins; delete on removal/disband). Audit `topic.approved` / `topic.revision_requested`. Notify the team.
- Duplicate detection (medium): Jaccard on lowercase title+tech_stack tokens vs archived topics; warn if ≥ 0.6 (tunable constant).
- Form: RHF + Zod: title, abstract, problem_statement, proposed_solution, tech_stack[] (chips).
