import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { submitDeliverable } from '@/app/actions/submit-deliverable';
import { signoffDeliverable } from '@/app/actions/signoff-deliverable';
import { getDeliverable } from '@/lib/models/software-deliverable/repo';
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

describe('Software Deliverables Server Actions', () => {
  const leaderIndex = fx.students[0]!.index_number;
  const member2Index = fx.students[1]!.index_number;
  const outsiderIndex = fx.students[3]!.index_number;

  const supervisorEmail = 'kappiah@htu.edu.gh';
  const unassignedEmail = 'aowusu@htu.edu.gh';

  let leaderToken: string;
  let member2Token: string;
  let outsiderToken: string;
  let supervisorToken: string;
  let unassignedSupervisorToken: string;

  let leaderUid: string;
  let member2Uid: string;
  let supervisorUidVal: string;

  const teamId = 'deliverables-test-team-01';

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
    outsiderToken = await createStudentToken(outsiderIndex);

    leaderUid = studentUid(leaderIndex);
    member2Uid = studentUid(member2Index);

    supervisorToken = await createStaffToken(supervisorEmail, 'supervisor');
    unassignedSupervisorToken = await createStaffToken(unassignedEmail, 'supervisor');
    supervisorUidVal = staffUid(supervisorEmail);

    // Seed team with leader and member2, assigned supervisor, defense_ready status
    const teamDoc: TeamDocument = {
      id: teamId,
      name: 'Deliverables Test Team',
      group_number: 'BCS26_02',
      course_id: fx.students[0]!.course_id,
      academic_year_id: YEAR_ID,
      leader_id: leaderUid,
      member_ids: [leaderUid, member2Uid],
      member_count: 2,
      max_members: 5,
      status: 'defense_ready',
      assigned_supervisor_id: supervisorUidVal,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(teamId).set(teamDoc);
  });

  describe('submitDeliverable', () => {
    it('rejects invalid repository URL', async () => {
      const res = await submitDeliverable(leaderToken, {
        team_id: teamId,
        github_repository_url: 'https://bitbucket.org/team/project',
        environment_setup_notes: 'Run npm start',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('rejects submission from non-team member', async () => {
      const res = await submitDeliverable(outsiderToken, {
        team_id: teamId,
        github_repository_url: 'https://github.com/htu-cs/deliverables-repo',
        environment_setup_notes: 'Run npm start',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('NOT_TEAM_MEMBER');
    });

    it('rejects submission when team status is not defense_ready or completed', async () => {
      await adminDb.collection('teams').doc(teamId).update({ status: 'topic_review' });

      const res = await submitDeliverable(leaderToken, {
        team_id: teamId,
        github_repository_url: 'https://github.com/htu-cs/deliverables-repo',
        environment_setup_notes: 'Run npm start',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('DELIVERABLE_NOT_OPEN');

      // Restore status
      await adminDb.collection('teams').doc(teamId).update({ status: 'defense_ready' });
    });

    it('allows valid submission by team member', async () => {
      const res = await submitDeliverable(leaderToken, {
        team_id: teamId,
        github_repository_url: 'https://github.com/htu-cs/deliverables-repo',
        live_demo_url: 'https://demo.htu.edu.gh',
        google_drive_url: 'https://drive.google.com/file/d/sample-manuscript',
        environment_setup_notes: '### Setup\n`npm install`\n`npm run dev`',
      });

      expect(res.ok).toBe(true);
      expect(res.team_id).toBe(teamId);

      const saved = await getDeliverable(teamId);
      expect(saved).toBeDefined();
      expect(saved?.github_repository_url).toBe('https://github.com/htu-cs/deliverables-repo');
      expect(saved?.submitted_by_user_id).toBe(leaderUid);
      expect(saved?.approved_by_supervisor_at).toBeUndefined();
    });
  });

  describe('signoffDeliverable', () => {
    it('rejects sign-off from student', async () => {
      const res = await signoffDeliverable(leaderToken, {
        team_id: teamId,
        supervisor_signoff_notes: 'Student self-signing',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN_ROLE');
    });

    it('rejects sign-off from unassigned supervisor', async () => {
      const res = await signoffDeliverable(unassignedSupervisorToken, {
        team_id: teamId,
        supervisor_signoff_notes: 'Unassigned supervisor trying to sign off',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN_SUPERVISOR');
    });

    it('allows assigned supervisor to sign off and notifies team members', async () => {
      const res = await signoffDeliverable(supervisorToken, {
        team_id: teamId,
        supervisor_signoff_notes: 'Repository inspected and code compiles successfully.',
      });

      expect(res.ok).toBe(true);
      expect(res.team_id).toBe(teamId);

      const updated = await getDeliverable(teamId);
      expect(updated?.approved_by_supervisor_at).toBeDefined();
      expect(updated?.supervisor_signoff_notes).toBe(
        'Repository inspected and code compiles successfully.'
      );

      // Verify notifications were created for team members
      const notifsSnap = await adminDb
        .collection('notifications')
        .where('user_id', '==', leaderUid)
        .where('type', '==', 'team_update')
        .get();

      expect(notifsSnap.empty).toBe(false);
      expect(notifsSnap.docs[0]!.data().title).toBe('Software Deliverable Approved');
    });

    it('blocks subsequent deliverable submission after supervisor sign-off', async () => {
      const res = await submitDeliverable(member2Token, {
        team_id: teamId,
        github_repository_url: 'https://github.com/htu-cs/new-repo',
        environment_setup_notes: 'Attempting to change after sign-off',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('DELIVERABLE_ALREADY_SIGNED_OFF');
    });
  });
});
