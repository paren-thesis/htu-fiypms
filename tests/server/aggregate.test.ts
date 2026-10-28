import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { aggregateDefense } from '@/app/actions/aggregate-defense';
import { concludeDefenseSlot } from '@/app/actions/conclude-defense-slot';
import { evaluationId } from '@/lib/defense/eval-id';
import { getTeam } from '@/lib/models/team/repo';
import { getDefensePanel } from '@/lib/models/defense-panel/repo';
import type { UserDocument, TeamDocument, RubricDocument, DefensePanelDocument, EvaluationDocument } from '@/types/firestore';
import { fx, staffUid, studentUid } from '../../fixtures';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';
const YEAR_ID = '2026-2027';

async function createStaffToken(email: string, activeRole: string): Promise<string> {
  const staff = fx.staffByEmail(email);
  const uid = staffUid(email);

  try {
    const existing = await adminAuth.getUserByEmail(email);
    await adminAuth.deleteUser(existing.uid);
  } catch {
    // Ignore
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: staff.full_name,
    emailVerified: true,
  });

  await adminAuth.setCustomUserClaims(uid, {
    roles: staff.roles,
    activeRole,
    registered: true,
    profileComplete: true,
  });

  await adminDb.collection('staff_whitelist').doc(email.toLowerCase()).set({
    email: staff.email.toLowerCase(),
    full_name: staff.full_name,
    roles: staff.roles,
    department: staff.department,
    programmes: staff.programmes,
    is_active: staff.is_active,
    added_by_uid: 'system',
    added_at: Timestamp.now(),
    user_uid: uid,
  });

  const userDoc: UserDocument = {
    uid,
    name: staff.full_name,
    email: staff.email.toLowerCase(),
    role: (staff.roles[0] as UserDocument['role']) || 'coordinator',
    roles: staff.roles as UserDocument['roles'],
    active_role: activeRole as UserDocument['active_role'],
    profile: {
      registered: true,
      profile_complete: true,
    },
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };
  await adminDb.collection('users').doc(uid).set(userDoc);

  const customToken = await adminAuth.createCustomToken(uid);
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = (await response.json()) as { idToken: string };
  return data.idToken;
}

describe('Server Action: Defense Scoring Aggregation & Slot Conclusion', () => {
  const teamId = 'team-agg-01';
  const panelId = 'panel-agg-01';
  const slotId = 'slot-team-agg-01';
  const rubricId = 'rubric-agg-01';

  // Fixture staff
  const chairEmail = 'kappiah@htu.edu.gh';
  const examiner1Email = 'aowusu@htu.edu.gh';
  const examiner2Email = 'yboateng@htu.edu.gh';
  const supervisorEmail = 'emensah@htu.edu.gh';
  const outsiderEmail = 'admin@htu.edu.gh';

  const chairUid = staffUid(chairEmail);
  const ex1Uid = staffUid(examiner1Email);
  const ex2Uid = staffUid(examiner2Email);
  const supervisorUid = staffUid(supervisorEmail);
  const outsiderUid = staffUid(outsiderEmail);

  let chairToken: string;
  let examiner1Token: string;

  beforeAll(async () => {
    // 1. Generate auth tokens
    chairToken = await createStaffToken(chairEmail, 'panel_member');
    examiner1Token = await createStaffToken(examiner1Email, 'panel_member');

    // 2. Seed Rubric (100 max score, 40% supervisor, 60% panel)
    const rubricDoc: RubricDocument = {
      id: rubricId,
      title: 'Oral Defense Rubric',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      is_active: true,
      criteria: [
        { id: 'crit-pres', title: 'Presentation & Slides', max_points: 50, category: 'oral_defense' },
        { id: 'crit-tech', title: 'Technical Demonstration', max_points: 50, category: 'technical_architecture' },
      ],
      created_at: Timestamp.now(),
    };
    await adminDb.collection('rubrics').doc(rubricId).set(rubricDoc);

    // 3. Seed Team with assigned supervisor
    const studentMemberUid = studentUid('0323000101');
    const teamDoc: TeamDocument = {
      id: teamId,
      name: 'Alpha Defense Team',
      group_number: 'BCS26_01',
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      leader_id: studentMemberUid,
      member_ids: [studentMemberUid],
      member_count: 1,
      max_members: 5,
      status: 'defense_ready',
      assigned_supervisor_id: supervisorUid,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(teamId).set(teamDoc);

    // 4. Seed Defense Panel with Chair + 2 Examiners and a Slot for this team
    const panelDoc: DefensePanelDocument = {
      id: panelId,
      academic_year_id: YEAR_ID,
      course_id: 'btech-cs',
      panel_name: 'CS Panel Alpha',
      venue: 'Lab 301',
      is_virtual: false,
      chair_id: chairUid,
      examiner_ids: [ex1Uid, ex2Uid],
      time_slots: [
        {
          slot_id: slotId,
          team_id: teamId,
          start_time: Timestamp.now(),
          end_time: Timestamp.fromMillis(Date.now() + 3600000),
          status: 'scheduled',
        },
      ],
      is_published: true,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('defense_panels').doc(panelId).set(panelDoc);

    // 5. Seed Evaluations
    // Supervisor eval: 40 + 40 = 80 -> norm 80
    const supEvalId = evaluationId(teamId, supervisorUid);
    const supEval: EvaluationDocument = {
      id: supEvalId,
      team_id: teamId,
      evaluator_id: supervisorUid,
      evaluator_role: 'supervisor',
      rubric_id: rubricId,
      scores: { 'crit-pres': 40, 'crit-tech': 40 },
      total_score: 80,
      comments: 'Solid implementation',
      is_published: false,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('evaluations').doc(supEvalId).set(supEval);

    // Panel Chair eval: 35 + 45 = 80 -> norm 80
    const chairEvalId = evaluationId(teamId, chairUid);
    const chairEval: EvaluationDocument = {
      id: chairEvalId,
      team_id: teamId,
      evaluator_id: chairUid,
      evaluator_role: 'panel_chair',
      rubric_id: rubricId,
      scores: { 'crit-pres': 35, 'crit-tech': 45 },
      total_score: 80,
      comments: 'Very clear answers',
      is_published: false,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('evaluations').doc(chairEvalId).set(chairEval);

    // Panel Examiner 1 eval: 30 + 40 = 70 -> norm 70
    // TAMPERED total_score = 999 to test that server action recomputes from scores
    const ex1EvalId = evaluationId(teamId, ex1Uid);
    const ex1Eval: EvaluationDocument = {
      id: ex1EvalId,
      team_id: teamId,
      evaluator_id: ex1Uid,
      evaluator_role: 'panel_member',
      rubric_id: rubricId,
      scores: { 'crit-pres': 30, 'crit-tech': 40 },
      total_score: 999, // tampered
      comments: 'Good demo',
      is_published: false,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('evaluations').doc(ex1EvalId).set(ex1Eval);

    // Panel Examiner 2 eval: 45 + 45 = 90 -> norm 90
    const ex2EvalId = evaluationId(teamId, ex2Uid);
    const ex2Eval: EvaluationDocument = {
      id: ex2EvalId,
      team_id: teamId,
      evaluator_id: ex2Uid,
      evaluator_role: 'panel_member',
      rubric_id: rubricId,
      scores: { 'crit-pres': 45, 'crit-tech': 45 },
      total_score: 90,
      comments: 'Excellent quality',
      is_published: false,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('evaluations').doc(ex2EvalId).set(ex2Eval);

    // Outsider eval: 10 + 10 = 20 -> norm 20
    // Must be ignored during score aggregation
    const outsiderEvalId = evaluationId(teamId, outsiderUid);
    const outsiderEval: EvaluationDocument = {
      id: outsiderEvalId,
      team_id: teamId,
      evaluator_id: outsiderUid,
      evaluator_role: 'panel_member',
      rubric_id: rubricId,
      scores: { 'crit-pres': 10, 'crit-tech': 10 },
      total_score: 20,
      comments: 'Outsider review',
      is_published: false,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('evaluations').doc(outsiderEvalId).set(outsiderEval);
  });

  it('aggregates 1 supervisor + 3 panelists, ignoring outsider evaluations and tampered total_score', async () => {
    // 1 supervisor (80) + 3 panel members (80, 70, 90 -> average 80)
    // Composite = 80 * 0.40 + 80 * 0.60 = 80.00
    // Outsider (20) must NOT affect the panel average.
    // Examiner 1 tampered total_score (999) must be ignored.
    const res = await aggregateDefense(chairToken, { team_id: teamId });

    expect(res.ok).toBe(true);
    expect(res.missingEvaluators).toEqual([]);
    expect(res.scores_summary).toBeDefined();

    expect(res.scores_summary?.supervisor_score).toBe(80);
    expect(res.scores_summary?.panel_average_score).toBe(80);
    expect(res.scores_summary?.composite_final_score).toBe(80);
    expect(res.scores_summary?.is_locked).toBe(false);

    // Verify stored on team document in Firestore
    const updatedTeam = await getTeam(teamId);
    expect(updatedTeam?.scores_summary).toEqual({
      supervisor_score: 80,
      panel_average_score: 80,
      composite_final_score: 80,
      is_locked: false,
    });
    // grade_classification stays unset (Decision D-02)
    expect(updatedTeam?.scores_summary?.grade_classification).toBeUndefined();
  });

  it('is idempotent across repeated reruns', async () => {
    // Rerun 1
    const res1 = await aggregateDefense(chairToken, { team_id: teamId });
    // Rerun 2
    const res2 = await aggregateDefense(chairToken, { team_id: teamId });

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res1.scores_summary).toEqual(res2.scores_summary);

    const team = await getTeam(teamId);
    expect(team?.scores_summary?.composite_final_score).toBe(80);
  });

  it('rejects aggregation requests from non-chair examiners', async () => {
    // examiner1 is a panel member but NOT the panel chair, and not coordinator/admin
    const res = await aggregateDefense(examiner1Token, { team_id: teamId });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/chair.*coordinator.*admin/i);
  });

  it('concludes defense slot and triggers score aggregation', async () => {
    const res = await concludeDefenseSlot(chairToken, {
      panel_id: panelId,
      slot_id: slotId,
    });

    expect(res.ok).toBe(true);
    expect(res.slot?.status).toBe('completed');
    expect(res.aggregation?.ok).toBe(true);
    expect(res.aggregation?.scores_summary?.composite_final_score).toBe(80);

    // Verify updated slot status in Firestore
    const panel = await getDefensePanel(panelId);
    const updatedSlot = panel?.time_slots.find((s) => s.slot_id === slotId);
    expect(updatedSlot?.status).toBe('completed');
  });

  it('rejects slot conclusion from non-chair panel members', async () => {
    const res = await concludeDefenseSlot(examiner1Token, {
      panel_id: panelId,
      slot_id: slotId,
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/chair.*coordinator.*admin/i);
  });
});
