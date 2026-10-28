import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { publishGrades } from '@/app/actions/publish-grades';
import { amendGrade } from '@/app/actions/amend-grade';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import type { UserDocument, TeamDocument, AcademicYearDocument, EvaluationDocument } from '@/types/firestore';
import { fx, studentEmail, studentUid, staffUid } from '../../fixtures';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';
const YEAR_ID = '2026-2027-publish';

async function createStudentToken(indexNumber: string): Promise<string> {
  const s = fx.student(indexNumber);
  const uid = studentUid(s.index_number);
  const email = studentEmail(s.index_number);

  try {
    const existing = await adminAuth.getUserByEmail(email);
    await adminAuth.deleteUser(existing.uid);
  } catch {
    // Ignore
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: s.full_name,
    emailVerified: true,
  });

  await adminAuth.setCustomUserClaims(uid, {
    roles: ['student'],
    activeRole: 'student',
    registered: true,
    profileComplete: true,
  });

  const userDoc: UserDocument = {
    uid,
    name: s.full_name,
    email,
    role: 'student',
    roles: ['student'],
    active_role: 'student',
    profile: {
      index_number: s.index_number,
      course_id: s.course_id,
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

async function createStaffToken(email: string, activeRole = 'coordinator'): Promise<string> {
  const staff = fx.staffByEmail(email);
  const uid = staffUid(staff.email);

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
      staff_id: 'STAFF-COOR-01',
      programmes: staff.programmes,
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

describe('Publish and Amend Grades Server Actions (FR-10.2, FR-10.3, FR-10.4, F-13)', () => {
  let coordinatorToken: string;
  let supervisorToken: string;
  let studentToken: string;

  const student1 = fx.students[0]!;
  const student2 = fx.students[1]!;
  const team1Id = 'team-publish-test-1';
  const team2Id = 'team-publish-test-2';
  const eval1Id = `${team1Id}__staff-1__team`;

  beforeAll(async () => {
    // 1. Academic Year with grades_published: false
    await upsertAcademicYear({
      id: YEAR_ID,
      code: '2026/2027',
      semester: 2,
      is_active: true,
      deadlines: {
        roster_import_deadline: new Date('2026-11-01'),
        team_formation_deadline: new Date('2026-11-15'),
        topic_submission_deadline: new Date('2026-11-30'),
        chapters_deadline: new Date('2027-04-01'),
        defense_start_date: new Date('2027-05-01'),
        defense_end_date: new Date('2027-05-15'),
      },
    });

    // Reset grades_published to false explicitly
    await adminDb.collection('academic_years').doc(YEAR_ID).update({
      grades_published: false,
    });

    // 2. Auth tokens
    coordinatorToken = await createStaffToken('coordinator@htu.edu.gh', 'coordinator');
    supervisorToken = await createStaffToken('kappiah@htu.edu.gh', 'supervisor');
    studentToken = await createStudentToken(student1.index_number);
    await createStudentToken(student2.index_number);

    const uid1 = studentUid(student1.index_number);
    const uid2 = studentUid(student2.index_number);

    // 3. Team 1: Complete scores, but deliverable NOT yet signed off
    const team1: TeamDocument = {
      id: team1Id,
      name: 'Alpha AI System',
      group_number: 'BCS26_01',
      course_id: student1.course_id,
      academic_year_id: YEAR_ID,
      leader_id: uid1,
      member_ids: [uid1],
      member_count: 1,
      max_members: 5,
      status: 'defense_ready',
      scores_summary: {
        supervisor_score: 85,
        panel_average_score: 80,
        composite_final_score: 82,
        is_locked: false,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(team1Id).set(team1);

    // Seed evaluation for team 1
    const eval1: EvaluationDocument = {
      id: eval1Id,
      team_id: team1Id,
      evaluator_id: 'staff-1',
      evaluator_role: 'supervisor',
      rubric_id: 'rubric-1',
      scores: { c1: 20 },
      total_score: 20,
      comments: 'Solid work',
      is_published: false,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('evaluations').doc(eval1Id).set(eval1);

    // Team 2: Missing scores
    const team2: TeamDocument = {
      id: team2Id,
      name: 'Beta Cloud Storage',
      group_number: 'BCS26_02',
      course_id: student2.course_id,
      academic_year_id: YEAR_ID,
      leader_id: uid2,
      member_ids: [uid2],
      member_count: 1,
      max_members: 5,
      status: 'defense_ready',
      // No scores_summary
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(team2Id).set(team2);
  });

  describe('1. Pre-flight Check', () => {
    it('preflight lists failing teams with specific reasons', async () => {
      const res = await publishGrades(coordinatorToken, {
        academic_year_id: YEAR_ID,
        preflight_only: true,
      });

      expect(res.ok).toBe(true);
      expect(res.preflight).toBeDefined();
      expect(res.preflight?.can_publish).toBe(false);

      const failures = res.preflight?.failures || [];
      expect(failures.length).toBeGreaterThanOrEqual(2);

      const missingScoreFailure = failures.find((f) => f.team_id === team2Id);
      expect(missingScoreFailure?.reason).toBe('missing_scores');

      const missingSignoffFailure = failures.find((f) => f.team_id === team1Id);
      expect(missingSignoffFailure?.reason).toBe('missing_signoff');
    });

    it('rejects publication when teams have missing scores', async () => {
      const res = await publishGrades(coordinatorToken, {
        academic_year_id: YEAR_ID,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('MISSING_SCORES');
    });

    it('rejects publication when sign-off is missing and no override is provided', async () => {
      // Fix team 2 scores
      await adminDb.collection('teams').doc(team2Id).update({
        scores_summary: {
          supervisor_score: 75,
          panel_average_score: 78,
          composite_final_score: 76.8,
          is_locked: false,
        },
      });

      // Still missing deliverables sign-offs on team 1 and 2
      const res = await publishGrades(coordinatorToken, {
        academic_year_id: YEAR_ID,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('MISSING_SIGNOFFS');
    });
  });

  describe('2. Publication Execution & Idempotency', () => {
    it('publishes grades with administrative override, locks teams/evaluations and starts appeal window', async () => {
      const res = await publishGrades(coordinatorToken, {
        academic_year_id: YEAR_ID,
        override: {
          justification: 'Approved by Head of Department for expedited graduation deadline',
        },
      });

      expect(res.ok).toBe(true);
      expect(res.total_teams_published).toBeGreaterThanOrEqual(2);
      expect(res.grade_appeal_deadline).toBeDefined();

      // Check academic year document
      const yearSnap = await adminDb.collection('academic_years').doc(YEAR_ID).get();
      const yearData = yearSnap.data() as AcademicYearDocument;
      expect(yearData.grades_published).toBe(true);
      expect(yearData.grade_published_at).toBeDefined();
      expect(yearData.deadlines.grade_appeal_deadline).toBeDefined();

      // Check team document is locked and completed
      const teamSnap = await adminDb.collection('teams').doc(team1Id).get();
      const teamData = teamSnap.data() as TeamDocument;
      expect(teamData.scores_summary?.is_locked).toBe(true);
      expect(teamData.status).toBe('completed');

      // Check evaluation is marked is_published: true
      const evalSnap = await adminDb.collection('evaluations').doc(eval1Id).get();
      const evalData = evalSnap.data() as EvaluationDocument;
      expect(evalData.is_published).toBe(true);

      // Check audit log contains grades.published
      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'grades.published')
        .get();
      expect(auditSnap.empty).toBe(false);

      // Check audit log contains grades.publish_override
      const overrideAuditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'grades.publish_override')
        .get();
      expect(overrideAuditSnap.empty).toBe(false);
    });

    it('is idempotent on subsequent calls', async () => {
      const res = await publishGrades(coordinatorToken, {
        academic_year_id: YEAR_ID,
        override: {
          justification: 'Subsequent idempotent invocation check',
        },
      });

      expect(res.ok).toBe(true);
      expect(res.already_published).toBe(true);
    });
  });

  describe('3. Grade Amendment (FR-10.3)', () => {
    it('rejects student and supervisor from amending grades (coordinator only)', async () => {
      const studentRes = await amendGrade(studentToken, {
        team_id: team1Id,
        supervisor_score: 90,
        panel_average_score: 85,
        composite_final_score: 87,
        justification: 'Attempting student unauthorized amendment',
      });
      expect(studentRes.ok).toBe(false);
      expect(studentRes.code).toBe('FORBIDDEN_ROLE');

      const supRes = await amendGrade(supervisorToken, {
        team_id: team1Id,
        supervisor_score: 90,
        panel_average_score: 85,
        composite_final_score: 87,
        justification: 'Attempting supervisor unauthorized amendment',
      });
      expect(supRes.ok).toBe(false);
      expect(supRes.code).toBe('FORBIDDEN_ROLE');
    });

    it('rejects amendment when justification is shorter than 20 characters', async () => {
      const res = await amendGrade(coordinatorToken, {
        team_id: team1Id,
        supervisor_score: 90,
        panel_average_score: 85,
        composite_final_score: 87,
        justification: 'Too short',
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('VALIDATION_ERROR');
    });

    it('coordinator amends grade with audit log capturing old and new scores', async () => {
      const res = await amendGrade(coordinatorToken, {
        team_id: team1Id,
        supervisor_score: 92,
        panel_average_score: 88,
        composite_final_score: 89.6, // 92*0.4 + 88*0.6 = 36.8 + 52.8 = 89.6
        justification: 'Formal review by Department Academic Board approved recalculation of oral presentation rubric points.',
      });

      expect(res.ok).toBe(true);
      expect(res.scores_summary?.composite_final_score).toBe(89.6);
      expect(res.scores_summary?.is_locked).toBe(true);

      // Verify updated team in Firestore
      const teamSnap = await adminDb.collection('teams').doc(team1Id).get();
      const teamData = teamSnap.data() as TeamDocument;
      expect(teamData.scores_summary?.composite_final_score).toBe(89.6);
      expect(teamData.scores_summary?.supervisor_score).toBe(92);
      expect(teamData.scores_summary?.panel_average_score).toBe(88);

      // Verify audit log
      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'grades.amended')
        .where('target_id', '==', team1Id)
        .get();

      expect(auditSnap.empty).toBe(false);
      const auditEntry = auditSnap.docs[0]?.data();
      expect(auditEntry?.metadata?.old).toBeDefined();
      expect(auditEntry?.metadata?.new?.composite_final_score).toBe(89.6);
      expect(auditEntry?.metadata?.justification).toContain('Department Academic Board');
    });
  });
});
