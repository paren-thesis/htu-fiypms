---
name: fypms-defense-grading
description: FYPMS defense scheduling, panel composition, conflict detection, real-time digital marksheet with Firestore onSnapshot, team-level score aggregation, peer evaluations, grade locking and amendments. Use for defense pages, DigitalMarksheet, aggregate-defense.ts, rubrics, evaluations, peer_evaluations.
---

# Scheduling
- Panel = Chair + Examiners, scoped to `course_id`; examiner candidates default to staff whose `programmes[]` ∋ course; cross-programme needs an audit-logged justification.
- Conflicts (run before saving): `overlaps = (a,b) => a.start < b.end && b.start < a.end`. Flag (1) same examiner in overlapping slots across panels, (2) same physical venue in overlapping slots. Show `ConflictAlertBadge`; block publish while conflicts exist.
- On publish: notify examiners and team members in-app with links to deliverables (`fypms-notifications`). No email in v1.

# Final mark is per team (decision D-02)
Everyone on a team gets the team composite. No individual marks, no grade classification (leave `scores_summary.grade_classification` unset until thresholds exist). `evaluations.student_id` is always null.

# Digital marksheet (`/defense/[panelId]`)
- Criteria come from the active rubric. Clamp each score to `[0, max_points]`; `total_score` is recomputed server-side at aggregation, never trusted from the client.
- One evaluation doc per evaluator per team, id **`${teamId}__${evaluatorId}__team`** (rules enforce it; write with `setDoc` merge = upsert).
- Optimistic local state (<100 ms), debounced write (~400 ms), visible "Saving / Saved" state, retry on error. Chair/coordinator listen to all evaluations of the team for a live composite; always return the unsubscribe from `useEffect`.
- Evaluators can never set `is_published`; locked sheets render disabled.

# Aggregation (`aggregate-defense.ts`, idempotent, chair/coordinator)
Only count evaluations whose evaluator is the team's supervisor or a member of the team's panel. `norm(e) = e.total_score_recomputed / rubric.max_score * 100`; `supervisor_score` = supervisor eval; `panel_average_score` = mean of panel evals; `composite_final_score = supervisor*sup_w/100 + panel*panel_w/100` (weights from rubric, must sum to 100). Write `team.scores_summary` (2 dp). Re-running yields the same result.

# Peer evaluation (advisory only)
Student rates each teammate (not self) on punctuality, technical contribution, teamwork (1–10); id `{teamId}__{evaluatorId}__{evaluateeId}`; `average_score` recomputed server-side; immutable. Evaluatees never read ratings about them. Supervisors/coordinators see aggregates to spot free-riders and may adjust the **team's** CA score; it never changes individual marks.

# Publish, lock, amend, appeal
- `publish-grades.ts` (Admin SDK): set `is_published` on all evaluations of the year, `academic_years.grades_published = true`, set team `scores_summary.is_locked`. Opens the 7-day appeal window (`grade_appeal_deadline`). Clients cannot flip these flags.
- `amend-grade.ts`: coordinator only, requires written justification; audit `grade.amended` with `{old, new, justification}`.
