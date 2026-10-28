import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { submitGradeAppeal } from '@/app/actions/submit-grade-appeal';
import { resolveGradeAppeal } from '@/app/actions/resolve-grade-appeal';
import { getGradeAppeal } from '@/lib/models/grade-appeal/repo';
import type { UserDocument, TeamDocument, AcademicYearDocument } from '@/types/firestore';
import { fx, studentEmail, studentUid, staffUid } from '../../fixtures';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';
const YEAR_ID = '2026-2027-appeals';

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

describe('Server Actions: Grade Appeals (Prompt 11-03)', () => {
  let student1Token: string;
  let student1Uid: string;
  let nonMemberToken: string;
  let coordinatorToken: string;
  let coordinatorStaff: ReturnType<typeof fx.staffByEmail>;

  const teamId = 'team-appeal-test-01';
  const closedTeamId = 'team-appeal-closed-01';
  const unpublishedTeamId = 'team-appeal-unpub-01';

  beforeAll(async () => {
    // 1. Setup Student 1 (teammate on appeal team)
    const s1 = fx.students[0];
    student1Uid = studentUid(s1.index_number);
    student1Token = await createStudentToken(s1.index_number);

    // 2. Setup Non-Member Student
    const s2 = fx.students[1];
    nonMemberToken = await createStudentToken(s2.index_number);

    // 3. Setup Coordinator
    coordinatorStaff = fx.staffByEmail('coordinator@htu.edu.gh');
    coordinatorToken = await createStaffToken(coordinatorStaff.email, 'coordinator');

    // 4. Setup Academic Year with active appeal deadline (now + 7 days)
    const futureDeadline = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await adminDb.collection('academic_years').doc(YEAR_ID).set({
      id: YEAR_ID,
      title: '2026/2027 Academic Year',
      is_active: true,
      grades_published: true,
      grade_published_at: Timestamp.now(),
      deadlines: {
        topic_submission: Timestamp.now(),
        chapter_1_submission: Timestamp.now(),
        final_submission: Timestamp.now(),
        defense_start: Timestamp.now(),
        defense_end: Timestamp.now(),
        grade_appeal_deadline: futureDeadline,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // Setup expired academic year
    const pastDeadline = Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
    await adminDb.collection('academic_years').doc('2025-2026-expired').set({
      id: '2025-2026-expired',
      title: '2025/2026 Expired Academic Year',
      is_active: false,
      grades_published: true,
      grade_published_at: Timestamp.now(),
      deadlines: {
        grade_appeal_deadline: pastDeadline,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // Setup unpublished academic year
    await adminDb.collection('academic_years').doc('2026-2027-unpub').set({
      id: '2026-2027-unpub',
      title: 'Unpublished Year',
      is_active: true,
      grades_published: false,
      deadlines: {
        grade_appeal_deadline: futureDeadline,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // 5. Setup Teams
    await adminDb.collection('teams').doc(teamId).set({
      id: teamId,
      name: 'Smart Campus Navigation',
      group_number: 'BICT26_01',
      course_id: 'btech-ict',
      academic_year_id: YEAR_ID,
      member_ids: [student1Uid],
      status: 'completed',
      scores_summary: {
        supervisor_score: 82,
        panel_average_score: 78,
        composite_final_score: 79.6,
        is_locked: true,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    await adminDb.collection('teams').doc(closedTeamId).set({
      id: closedTeamId,
      name: 'Expired Appeal Team',
      group_number: 'BICT26_02',
      course_id: 'btech-ict',
      academic_year_id: '2025-2026-expired',
      member_ids: [student1Uid],
      status: 'completed',
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    await adminDb.collection('teams').doc(unpublishedTeamId).set({
      id: unpublishedTeamId,
      name: 'Unpublished Team',
      group_number: 'BICT26_03',
      course_id: 'btech-ict',
      academic_year_id: '2026-2027-unpub',
      member_ids: [student1Uid],
      status: 'active',
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
  });

  describe('submitGradeAppeal', () => {
    it('rejects appeal when grades are not published for the cohort', async () => {
      const res = await submitGradeAppeal(student1Token, {
        team_id: unpublishedTeamId,
        reason: 'We feel the scores recorded for chapter reviews were omitted.',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('GRADES_NOT_PUBLISHED');
    });

    it('rejects appeal when the appeal window deadline has passed', async () => {
      const res = await submitGradeAppeal(student1Token, {
        team_id: closedTeamId,
        reason: 'This petition is submitted after the board deadline elapsed.',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('DEADLINE_EXPIRED');
    });

    it('rejects appeal when student is not a member of the team', async () => {
      const res = await submitGradeAppeal(nonMemberToken, {
        team_id: teamId,
        reason: 'I am requesting a review of a project that is not mine.',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN');
    });

    it('rejects appeal when reason is shorter than 20 characters', async () => {
      const res = await submitGradeAppeal(student1Token, {
        team_id: teamId,
        reason: 'Too short',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('VALIDATION_ERROR');
    });

    it('successfully submits grade appeal and notifies coordinators', async () => {
      const validReason = 'We observed a 5-point discrepancy between the supervisor continuous assessment marksheet and the composite tally.';
      const res = await submitGradeAppeal(student1Token, {
        team_id: teamId,
        reason: validReason,
      });

      expect(res.ok).toBe(true);
      expect(res.appeal_id).toBe(`${teamId}__${student1Uid}`);

      // Verify stored document
      const appealDoc = await getGradeAppeal(`${teamId}__${student1Uid}`);
      expect(appealDoc).not.toBeNull();
      expect(appealDoc?.team_id).toBe(teamId);
      expect(appealDoc?.student_id).toBe(student1Uid);
      expect(appealDoc?.status).toBe('submitted');
      expect(appealDoc?.reason).toBe(validReason);

      // Verify coordinator notification was dispatched
      const coordUid = staffUid(coordinatorStaff.email);
      const notifsSnap = await adminDb
        .collection('notifications')
        .where('user_id', '==', coordUid)
        .where('type', '==', 'system')
        .get();

      const appealNotif = notifsSnap.docs.find((d) =>
        d.data().title?.includes('New Grade Appeal Submitted')
      );
      expect(appealNotif).toBeDefined();

      // Verify audit log
      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'grade_appeal.submitted')
        .where('target_id', '==', `${teamId}__${student1Uid}`)
        .get();

      expect(auditSnap.empty).toBe(false);
    });

    it('enforces one appeal per student and rejects duplicate submission', async () => {
      const res = await submitGradeAppeal(student1Token, {
        team_id: teamId,
        reason: 'Attempting to resubmit another appeal for the same team grade.',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('ALREADY_EXISTS');
    });
  });

  describe('resolveGradeAppeal', () => {
    it('denies students from calling resolveGradeAppeal', async () => {
      const res = await resolveGradeAppeal(student1Token, {
        appeal_id: `${teamId}__${student1Uid}`,
        status: 'resolved',
        resolution_notes: 'Self-resolving my own appeal should fail.',
      });

      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN_ROLE');
    });

    it('allows coordinator to set appeal status to under_review', async () => {
      const res = await resolveGradeAppeal(coordinatorToken, {
        appeal_id: `${teamId}__${student1Uid}`,
        status: 'under_review',
        resolution_notes: 'Academic Board panel has reconvened to audit supervisor rubrics.',
      });

      expect(res.ok).toBe(true);
      expect(res.appeal_status).toBe('under_review');

      const appealDoc = await getGradeAppeal(`${teamId}__${student1Uid}`);
      expect(appealDoc?.status).toBe('under_review');
      expect(appealDoc?.resolution_notes).toContain('Academic Board panel has reconvened');
    });

    it('allows coordinator to resolve appeal with formal resolution notes and notifies student', async () => {
      const resolutionNotes = 'Board investigated the continuous assessment rubric and confirmed a calculation error. Grade will be amended via official broadsheet.';
      const res = await resolveGradeAppeal(coordinatorToken, {
        appeal_id: `${teamId}__${student1Uid}`,
        status: 'resolved',
        resolution_notes: resolutionNotes,
      });

      expect(res.ok).toBe(true);
      expect(res.appeal_status).toBe('resolved');

      const appealDoc = await getGradeAppeal(`${teamId}__${student1Uid}`);
      expect(appealDoc?.status).toBe('resolved');
      expect(appealDoc?.resolution_notes).toBe(resolutionNotes);
      expect(appealDoc?.resolved_by).toBe(staffUid(coordinatorStaff.email));
      expect(appealDoc?.resolved_at).toBeDefined();

      // Verify notification sent to student
      const studentNotifSnap = await adminDb
        .collection('notifications')
        .where('user_id', '==', student1Uid)
        .where('type', '==', 'system')
        .get();

      const resolvedNotif = studentNotifSnap.docs.find((d) =>
        d.data().title?.includes('Grade Appeal Status Updated') &&
        d.data().body?.includes('Resolved')
      );
      expect(resolvedNotif).toBeDefined();

      // Verify audit log
      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'grade_appeal.resolved')
        .where('target_id', '==', `${teamId}__${student1Uid}`)
        .get();

      expect(auditSnap.empty).toBe(false);
    });
  });
});
