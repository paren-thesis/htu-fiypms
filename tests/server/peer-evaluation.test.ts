import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { submitPeerEvaluation } from '@/app/actions/submit-peer-evaluation';
import { getPeerSummary } from '@/app/actions/get-peer-summary';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import type { UserDocument, TeamDocument } from '@/types/firestore';
import { fx, studentEmail, studentUid, staffUid } from '../../fixtures';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';
const YEAR_ID = '2026-2027';

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

async function createStaffToken(email: string, activeRole = 'supervisor'): Promise<string> {
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

  const profile = fx.profiles.find((p) => p.email.toLowerCase() === email.toLowerCase());

  const userDoc: UserDocument = {
    uid,
    name: staff.full_name,
    email: staff.email.toLowerCase(),
    role: (staff.roles[0] as UserDocument['role']) || 'supervisor',
    roles: staff.roles as UserDocument['roles'],
    active_role: activeRole as UserDocument['active_role'],
    profile: {
      registered: true,
      profile_complete: true,
      research_interests: profile?.research_interests || ['machine learning', 'python'],
      max_team_capacity: profile?.max_team_capacity || 5,
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

describe('Peer Evaluation Server Actions', () => {
  const leaderIndex = fx.students[0]!.index_number;
  const member2Index = fx.students[1]!.index_number;
  const member3Index = fx.students[2]!.index_number;
  const outsiderIndex = fx.students[3]!.index_number;

  const supervisorEmail = 'kappiah@htu.edu.gh';
  const unassignedEmail = 'aowusu@htu.edu.gh';
  const coordinatorEmail = 'coordinator@htu.edu.gh';

  let leaderToken: string;
  let member2Token: string;
  let member3Token: string;
  let outsiderToken: string;
  let supervisorToken: string;
  let unassignedSupervisorToken: string;
  let coordinatorToken: string;

  let leaderUid: string;
  let member2Uid: string;
  let member3Uid: string;
  let outsiderUid: string;
  let supervisorUidVal: string;

  let teamId: string;

  beforeAll(async () => {
    await upsertAcademicYear({
      id: YEAR_ID,
      code: '2026/2027',
      semester: 2,
      deadlines: {
        roster_import_deadline: Timestamp.now(),
        team_formation_deadline: Timestamp.now(),
        topic_submission_deadline: Timestamp.now(),
        chapters_deadline: Timestamp.now(),
        defense_start_date: Timestamp.now(),
        defense_end_date: Timestamp.now(),
      },
      is_active: true,
    });

    leaderToken = await createStudentToken(leaderIndex);
    member2Token = await createStudentToken(member2Index);
    member3Token = await createStudentToken(member3Index);
    outsiderToken = await createStudentToken(outsiderIndex);

    leaderUid = studentUid(leaderIndex);
    member2Uid = studentUid(member2Index);
    member3Uid = studentUid(member3Index);
    outsiderUid = studentUid(outsiderIndex);

    supervisorToken = await createStaffToken(supervisorEmail, 'supervisor');
    unassignedSupervisorToken = await createStaffToken(unassignedEmail, 'supervisor');
    coordinatorToken = await createStaffToken(coordinatorEmail, 'coordinator');
    supervisorUidVal = staffUid(supervisorEmail);

    teamId = 'peer-test-team-01';

    // Seed team with leader, member2, member3 and assigned supervisor
    const teamDoc: TeamDocument = {
      id: teamId,
      name: 'Peer Evaluation Test Team',
      group_number: 'BCS26_01',
      course_id: fx.students[0]!.course_id,
      academic_year_id: YEAR_ID,
      leader_id: leaderUid,
      member_ids: [leaderUid, member2Uid, member3Uid],
      member_count: 3,
      max_members: 5,
      status: 'defense_ready',
      assigned_supervisor_id: supervisorUidVal,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(teamId).set(teamDoc);
  });

  describe('submitPeerEvaluation', () => {
    it('rejects self-evaluation', async () => {
      const res = await submitPeerEvaluation(leaderToken, {
        team_id: teamId,
        evaluatee_id: leaderUid,
        punctuality_score: 9,
        technical_contribution_score: 9,
        teamwork_score: 9,
        comments: 'Rating myself',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('SELF_EVALUATION_NOT_ALLOWED');
    });

    it('rejects rating a non-teammate', async () => {
      const res = await submitPeerEvaluation(leaderToken, {
        team_id: teamId,
        evaluatee_id: outsiderUid,
        punctuality_score: 8,
        technical_contribution_score: 8,
        teamwork_score: 8,
        comments: 'Rating outsider',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('INVALID_EVALUATEE');
    });

    it('rejects rating from an outsider not in the team', async () => {
      const res = await submitPeerEvaluation(outsiderToken, {
        team_id: teamId,
        evaluatee_id: member2Uid,
        punctuality_score: 8,
        technical_contribution_score: 8,
        teamwork_score: 8,
        comments: 'Outsider trying to rate',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('NOT_TEAM_MEMBER');
    });

    it('rejects submission when team status is not defense_ready or completed', async () => {
      // Temporarily change team status
      await adminDb.collection('teams').doc(teamId).update({ status: 'proposal_review' });

      const res = await submitPeerEvaluation(leaderToken, {
        team_id: teamId,
        evaluatee_id: member2Uid,
        punctuality_score: 8,
        technical_contribution_score: 8,
        teamwork_score: 8,
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('PEER_EVALUATION_NOT_OPEN');

      // Restore status
      await adminDb.collection('teams').doc(teamId).update({ status: 'defense_ready' });
    });

    it('allows valid peer evaluation submission with correct average score', async () => {
      const res = await submitPeerEvaluation(leaderToken, {
        team_id: teamId,
        evaluatee_id: member2Uid,
        punctuality_score: 8,
        technical_contribution_score: 9,
        teamwork_score: 8,
        comments: 'Great teammate and hard worker',
      });

      expect(res.ok).toBe(true);
      expect(res.id).toBe(`${teamId}__${leaderUid}__${member2Uid}`);
      // (8 + 9 + 8) / 3 = 8.333 -> 8.3
      expect(res.average_score).toBe(8.3);
    });

    it('rejects duplicate second submission for the same evaluatee (immutability)', async () => {
      const res = await submitPeerEvaluation(leaderToken, {
        team_id: teamId,
        evaluatee_id: member2Uid,
        punctuality_score: 10,
        technical_contribution_score: 10,
        teamwork_score: 10,
        comments: 'Updating rating',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('ALREADY_SUBMITTED');
    });
  });

  describe('getPeerSummary', () => {
    beforeAll(async () => {
      // Member 2 rates member 3 with low score to test free-rider detection
      await submitPeerEvaluation(member2Token, {
        team_id: teamId,
        evaluatee_id: member3Uid,
        punctuality_score: 3,
        technical_contribution_score: 4,
        teamwork_score: 3,
        comments: 'Barely showed up',
      });

      // Leader rates member 3 with low score as well
      await submitPeerEvaluation(leaderToken, {
        team_id: teamId,
        evaluatee_id: member3Uid,
        punctuality_score: 4,
        technical_contribution_score: 4,
        teamwork_score: 4,
        comments: 'Did not contribute',
      });

      // Member 3 rates leader with high score
      await submitPeerEvaluation(member3Token, {
        team_id: teamId,
        evaluatee_id: leaderUid,
        punctuality_score: 9,
        technical_contribution_score: 9,
        teamwork_score: 9,
        comments: 'Great leader',
      });
    });

    it('rejects access from student role', async () => {
      const res = await getPeerSummary(leaderToken, { team_id: teamId });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN_ROLE');
    });

    it('rejects supervisor not assigned to this team', async () => {
      const res = await getPeerSummary(unassignedSupervisorToken, { team_id: teamId });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN_SUPERVISOR');
    });

    it('allows assigned supervisor and returns aggregated summary with no rater IDs', async () => {
      const res = await getPeerSummary(supervisorToken, { team_id: teamId });

      expect(res.ok).toBe(true);
      expect(res.summary).toBeDefined();

      const summary = res.summary!;
      expect(summary.total_ratings).toBe(4); // 1 for member2, 2 for member3, 1 for leader
      expect(summary.team_mean).toBeGreaterThan(0);

      // Verify confidentiality: result must NOT contain rater IDs or raw rows
      const jsonStr = JSON.stringify(res);
      expect(jsonStr).not.toContain('evaluator_id');
      expect(jsonStr).not.toContain('comments');

      // Verify free-rider detection for member 3
      const member3Summary = summary.students[member3Uid]!;
      expect(member3Summary).toBeDefined();
      expect(member3Summary.ratings_count).toBe(2);
      expect(member3Summary.mean_score).toBeLessThan(5.0);
      expect(member3Summary.is_free_rider).toBe(true);

      // Verify member 2
      const member2Summary = summary.students[member2Uid]!;
      expect(member2Summary).toBeDefined();
      expect(member2Summary.ratings_count).toBe(1);
      expect(member2Summary.mean_score).toBe(8.3);
      expect(member2Summary.is_free_rider).toBe(false);
    });

    it('allows coordinator to access summary for any team', async () => {
      const res = await getPeerSummary(coordinatorToken, { team_id: teamId });
      expect(res.ok).toBe(true);
      expect(res.summary).toBeDefined();
    });
  });
});
