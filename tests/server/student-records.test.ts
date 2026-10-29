import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  createStudent,
  updateStudent,
  deactivateStudent,
  reactivateStudent,
  deleteStudent,
} from '@/app/actions/manage-student';
import { changeStudentCourse } from '@/app/actions/change-student-course';
import { completeSignup } from '@/app/actions/complete-signup';
import { getStudentState } from '@/lib/roster/student-guards';
import { getRosterStudent } from '@/lib/models/roster/repo';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { upsertCourse } from '@/lib/models/course/repo';
import { HttpError } from '@/lib/errors';
import { ZodError } from 'zod';
import { fx, staffUid, studentUid, studentEmail } from '../../fixtures';
import { resetTestEmulator } from '../helpers/reset';
import { Timestamp } from 'firebase-admin/firestore';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';

async function getEmulatorIdToken(
  uid: string,
  email: string,
  claims?: { roles: string[]; activeRole: string; registered?: boolean; profileComplete?: boolean }
): Promise<string> {
  try {
    const existing = await adminAuth.getUserByEmail(email);
    await adminAuth.deleteUser(existing.uid);
  } catch {
    // Ignore
  }

  try {
    await adminAuth.deleteUser(uid);
  } catch {
    // Ignore
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: email.split('@')[0],
    emailVerified: true,
  });

  if (claims) {
    await adminAuth.setCustomUserClaims(uid, {
      roles: claims.roles,
      activeRole: claims.activeRole,
      registered: claims.registered ?? true,
      profileComplete: claims.profileComplete ?? true,
    });
  }

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

describe('Server Action: Student records CRUD & guards (Spec FR-01.4, FR-01.10, FR-01.12, D-05, D-06, A6)', () => {
  const yearId = '2025-2026';
  const coordinatorEmail = 'coordinator@htu.edu.gh';
  const coordinatorUid = staffUid(coordinatorEmail);

  const supervisorEmail = 'kappiah@htu.edu.gh';
  const supervisorUid = staffUid(supervisorEmail);

  const panelMemberEmail = 'aowusu@htu.edu.gh';
  const panelMemberUid = staffUid(panelMemberEmail);

  const student1 = fx.students[0]!; // Kofi Mensah: 0323080001
  const student1Uid = studentUid(student1.index_number);
  const student1Email = studentEmail(student1.index_number);

  let coordinatorToken: string;
  let supervisorToken: string;
  let panelMemberToken: string;
  let studentToken: string;

  beforeAll(async () => {
    // 1. Seed Academic Year & Courses
    await upsertAcademicYear({
      id: yearId,
      code: '2025/2026',
      semester: 1,
      is_active: true,
      deadlines: {
        roster_import_deadline: Timestamp.now(),
        team_formation_deadline: Timestamp.now(),
        topic_submission_deadline: Timestamp.now(),
        chapters_deadline: Timestamp.now(),
        defense_start_date: Timestamp.now(),
        defense_end_date: Timestamp.now(),
      },
    });

    await upsertCourse({
      id: 'btech-cs',
      code: 'BTECH-CS',
      name: 'BTech Computer Science',
      department: 'Computer Science',
    });
    await upsertCourse({
      id: 'btech-ict',
      code: 'BTECH-ICT',
      name: 'BTech ICT',
      department: 'Computer Science',
    });

    // 2. Seed Coordinator, Supervisor, Panel Member staff whitelist docs
    const coordStaff = fx.staffByEmail(coordinatorEmail);
    await adminDb.collection('staff_whitelist').doc(coordinatorEmail).set({
      email: coordinatorEmail,
      full_name: coordStaff.full_name,
      roles: coordStaff.roles,
      department: coordStaff.department,
      programmes: coordStaff.programmes,
      is_active: true,
      added_by_uid: 'fixture',
      added_at: Timestamp.now(),
      user_uid: coordinatorUid,
    });

    const supStaff = fx.staffByEmail(supervisorEmail);
    await adminDb.collection('staff_whitelist').doc(supervisorEmail).set({
      email: supervisorEmail,
      full_name: supStaff.full_name,
      roles: supStaff.roles,
      department: supStaff.department,
      programmes: supStaff.programmes,
      is_active: true,
      added_by_uid: 'fixture',
      added_at: Timestamp.now(),
      user_uid: supervisorUid,
    });

    const panelStaff = fx.staffByEmail(panelMemberEmail);
    await adminDb.collection('staff_whitelist').doc(panelMemberEmail).set({
      email: panelMemberEmail,
      full_name: panelStaff.full_name,
      roles: panelStaff.roles,
      department: panelStaff.department,
      programmes: panelStaff.programmes,
      is_active: true,
      added_by_uid: 'fixture',
      added_at: Timestamp.now(),
      user_uid: panelMemberUid,
    });

    // 3. Generate Auth Tokens
    coordinatorToken = await getEmulatorIdToken(coordinatorUid, coordinatorEmail, {
      roles: coordStaff.roles,
      activeRole: 'coordinator',
      registered: true,
    });

    supervisorToken = await getEmulatorIdToken(supervisorUid, supervisorEmail, {
      roles: supStaff.roles,
      activeRole: 'supervisor',
      registered: true,
    });

    panelMemberToken = await getEmulatorIdToken(panelMemberUid, panelMemberEmail, {
      roles: panelStaff.roles,
      activeRole: 'panel_member',
      registered: true,
    });

    studentToken = await getEmulatorIdToken(student1Uid, student1Email, {
      roles: ['student'],
      activeRole: 'student',
      registered: true,
    });
  });

  afterAll(async () => {
    await resetTestEmulator();
  });

  describe('1. Role Authorization (D-05: Coordinator/Admin only, 403 for others)', () => {
    it('rejects supervisor, panel member, and student on createStudent with 403', async () => {
      const payload = {
        index_number: '0323099991',
        full_name: 'Test Student',
        contact: '+233241112233',
        course_id: 'btech-cs',
        academic_year_id: yearId,
      };

      await expect(createStudent(supervisorToken, payload)).rejects.toThrow(HttpError);
      await expect(createStudent(panelMemberToken, payload)).rejects.toThrow(HttpError);
      await expect(createStudent(studentToken, payload)).rejects.toThrow(HttpError);
    });

    it('rejects supervisor, panel member, and student on updateStudent with 403', async () => {
      const payload = {
        index_number: student1.index_number,
        full_name: 'Updated Name',
        contact: '+233241112233',
        academic_year_id: yearId,
      };

      await expect(updateStudent(supervisorToken, payload)).rejects.toThrow(HttpError);
      await expect(updateStudent(panelMemberToken, payload)).rejects.toThrow(HttpError);
      await expect(updateStudent(studentToken, payload)).rejects.toThrow(HttpError);
    });

    it('rejects supervisor, panel member, and student on deactivateStudent with 403', async () => {
      const payload = {
        index_number: student1.index_number,
        reason: 'Valid deactivation reason over 10 chars',
        academic_year_id: yearId,
      };

      await expect(deactivateStudent(supervisorToken, payload)).rejects.toThrow(HttpError);
      await expect(deactivateStudent(panelMemberToken, payload)).rejects.toThrow(HttpError);
      await expect(deactivateStudent(studentToken, payload)).rejects.toThrow(HttpError);
    });

    it('rejects supervisor, panel member, and student on deleteStudent with 403', async () => {
      const payload = {
        index_number: student1.index_number,
        academic_year_id: yearId,
      };

      await expect(deleteStudent(supervisorToken, payload)).rejects.toThrow(HttpError);
      await expect(deleteStudent(panelMemberToken, payload)).rejects.toThrow(HttpError);
      await expect(deleteStudent(studentToken, payload)).rejects.toThrow(HttpError);
    });

    it('rejects supervisor, panel member, and student on changeStudentCourse with 403', async () => {
      const payload = {
        index_number: student1.index_number,
        course_id: 'btech-ict',
        justification: 'This is a valid transfer reason of 20 chars',
        academic_year_id: yearId,
      };

      await expect(changeStudentCourse(supervisorToken, payload)).rejects.toThrow(HttpError);
      await expect(changeStudentCourse(panelMemberToken, payload)).rejects.toThrow(HttpError);
      await expect(changeStudentCourse(studentToken, payload)).rejects.toThrow(HttpError);
    });
  });

  describe('2. createStudent (FR-01.4)', () => {
    const testIndex = '0323099901';

    it('creates a new unlinked student with is_active = true and writes audit_logs', async () => {
      const res = await createStudent(coordinatorToken, {
        index_number: testIndex,
        full_name: 'Kwame Asante',
        contact: '+233-24-999-0001',
        course_id: 'btech-cs',
        academic_year_id: yearId,
      });

      expect(res.ok).toBe(true);
      expect(res.student.index_number).toBe(testIndex);
      expect(res.student.is_active).toBe(true);
      expect(res.student.user_uid).toBeNull();
      expect(res.student.contact).toBe('+233249990001'); // Normalised

      // Verify in Firestore
      const saved = await getRosterStudent(yearId, testIndex);
      expect(saved).not.toBeNull();
      expect(saved?.is_active).toBe(true);
      expect(saved?.full_name).toBe('Kwame Asante');

      // Verify audit log
      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'student.created')
        .where('target_id', '==', testIndex)
        .get();
      expect(auditSnap.empty).toBe(false);
    });

    it('rejects duplicate index number with 409 Conflict', async () => {
      await expect(
        createStudent(coordinatorToken, {
          index_number: testIndex,
          full_name: 'Duplicate Kwame',
          contact: '+233249990002',
          course_id: 'btech-cs',
          academic_year_id: yearId,
        })
      ).rejects.toThrow(HttpError);

      try {
        await createStudent(coordinatorToken, {
          index_number: testIndex,
          full_name: 'Duplicate Kwame',
          contact: '+233249990002',
          course_id: 'btech-cs',
          academic_year_id: yearId,
        });
      } catch (err) {
        expect((err as HttpError).status).toBe(409);
        expect((err as HttpError).code).toBe('DUPLICATE_STUDENT');
      }
    });

    it('rejects invalid course track with 400', async () => {
      await expect(
        createStudent(coordinatorToken, {
          index_number: '0323099902',
          full_name: 'Invalid Course Student',
          contact: '+233249990003',
          course_id: 'non-existent-course',
          academic_year_id: yearId,
        })
      ).rejects.toThrow(HttpError);
    });
  });

  describe('3. updateStudent (FR-01.4)', () => {
    const testIndex = '0323099901';

    it('rejects forbidden fields (course_id, email, user_uid) in payload with 400', async () => {
      // Trying to inject course_id
      await expect(
        updateStudent(coordinatorToken, {
          index_number: testIndex,
          full_name: 'Kwame Updated',
          contact: '+233249990001',
          academic_year_id: yearId,
          // @ts-expect-error Testing runtime injection
          course_id: 'btech-ict',
        })
      ).rejects.toThrow(HttpError);

      // Trying to inject user_uid
      await expect(
        updateStudent(coordinatorToken, {
          index_number: testIndex,
          full_name: 'Kwame Updated',
          contact: '+233249990001',
          academic_year_id: yearId,
          // @ts-expect-error Testing runtime injection
          user_uid: 'injected-uid',
        })
      ).rejects.toThrow(HttpError);
    });

    it('updates full_name and contact and logs audit', async () => {
      const res = await updateStudent(coordinatorToken, {
        index_number: testIndex,
        full_name: 'Kwame Asante Updated',
        contact: '+233 20 888 7777',
        academic_year_id: yearId,
      });

      expect(res.ok).toBe(true);

      const saved = await getRosterStudent(yearId, testIndex);
      expect(saved?.full_name).toBe('Kwame Asante Updated');
      expect(saved?.contact).toBe('+233208887777');

      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'student.updated')
        .where('target_id', '==', testIndex)
        .get();
      expect(auditSnap.empty).toBe(false);
    });
  });

  describe('4. deactivateStudent & reactivateStudent (FR-01.12, A6)', () => {
    const testIndex = '0323099901';

    it('rejects deactivation reason shorter than 10 characters', async () => {
      await expect(
        deactivateStudent(coordinatorToken, {
          index_number: testIndex,
          reason: 'Too short',
          academic_year_id: yearId,
        })
      ).rejects.toThrow(ZodError);
    });

    it('refuses deactivation with 409 if student is on an active team', async () => {
      const teamStudentIndex = '0323099903';
      const teamStudentUid = 'stu-0323099903';

      // Create student and an active team
      await createStudent(coordinatorToken, {
        index_number: teamStudentIndex,
        full_name: 'Team Member Student',
        contact: '+233249990005',
        course_id: 'btech-cs',
        academic_year_id: yearId,
      });

      // Link student
      await adminDb
        .collection('rosters')
        .doc(yearId)
        .collection('students')
        .doc(teamStudentIndex)
        .update({
          user_uid: teamStudentUid,
        });

      // Create active team containing member
      const teamRef = adminDb.collection('teams').doc('test-active-team');
      await teamRef.set({
        id: 'test-active-team',
        name: 'Guard Team',
        group_number: 'BCS26_99',
        course_id: 'btech-cs',
        academic_year_id: yearId,
        leader_id: teamStudentUid,
        member_ids: [teamStudentUid],
        member_count: 1,
        max_members: 5,
        status: 'formation',
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      });

      // Attempt deactivation -> 409
      try {
        await deactivateStudent(coordinatorToken, {
          index_number: teamStudentIndex,
          reason: 'Withdrawn from university programme',
          academic_year_id: yearId,
        });
        expect.unreachable('Should have thrown 409');
      } catch (err) {
        expect((err as HttpError).status).toBe(409);
        expect((err as HttpError).code).toBe('STUDENT_ON_ACTIVE_TEAM');
      }

      // Disband team -> deactivation should now succeed
      await teamRef.update({ status: 'disbanded' });

      const res = await deactivateStudent(coordinatorToken, {
        index_number: teamStudentIndex,
        reason: 'Withdrawn from university programme',
        academic_year_id: yearId,
      });
      expect(res.ok).toBe(true);

      const state = await getStudentState(teamStudentIndex, yearId);
      expect(state.active).toBe(false);
    });

    it('blocks sign-in when student is deactivated (completeSignup returns inactive)', async () => {
      // Test deactivation blocks signin
      const inactiveIndex = '0323099904';
      const inactiveUid = 'stu-0323099904';
      const inactiveEmail = `${inactiveIndex}@htu.edu.gh`;

      await createStudent(coordinatorToken, {
        index_number: inactiveIndex,
        full_name: 'Inactive Signup Tester',
        contact: '+233249990006',
        course_id: 'btech-cs',
        academic_year_id: yearId,
      });

      await deactivateStudent(coordinatorToken, {
        index_number: inactiveIndex,
        reason: 'Blocked before first institutional signin',
        academic_year_id: yearId,
      });

      const token = await getEmulatorIdToken(inactiveUid, inactiveEmail);
      const signupRes = await completeSignup(token);

      expect(signupRes.ok).toBe(false);
      expect(signupRes.code).toBe('inactive');
      expect(signupRes.error).toContain('Your student record is inactive. Contact your coordinator.');

      // Verify audit log for blocked signup
      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'signup.blocked_inactive')
        .where('target_id', '==', inactiveIndex)
        .get();
      expect(auditSnap.empty).toBe(false);
    });

    it('reactivates a deactivated student', async () => {
      const testIndex = '0323099901';
      await deactivateStudent(coordinatorToken, {
        index_number: testIndex,
        reason: 'Temporary deferment granted',
        academic_year_id: yearId,
      });

      let state = await getStudentState(testIndex, yearId);
      expect(state.active).toBe(false);

      const res = await reactivateStudent(coordinatorToken, {
        index_number: testIndex,
        academic_year_id: yearId,
      });
      expect(res.ok).toBe(true);

      state = await getStudentState(testIndex, yearId);
      expect(state.active).toBe(true);
    });
  });

  describe('5. deleteStudent (FR-01.4)', () => {
    it('refuses deletion with 409 if student is linked', async () => {
      const linkedIndex = '0323099905';
      await createStudent(coordinatorToken, {
        index_number: linkedIndex,
        full_name: 'Linked Student',
        contact: '+233249990007',
        course_id: 'btech-cs',
        academic_year_id: yearId,
      });

      await adminDb
        .collection('rosters')
        .doc(yearId)
        .collection('students')
        .doc(linkedIndex)
        .update({
          user_uid: 'stu-linked-05',
          signup_completed_at: Timestamp.now(),
        });

      try {
        await deleteStudent(coordinatorToken, {
          index_number: linkedIndex,
          academic_year_id: yearId,
        });
        expect.unreachable('Should have thrown 409');
      } catch (err) {
        expect((err as HttpError).status).toBe(409);
        expect((err as HttpError).code).toBe('CANNOT_DELETE_ACTIVE_STUDENT');
      }
    });

    it('allows hard delete for unlinked student with no team', async () => {
      const unlinkedIndex = '0323099906';
      await createStudent(coordinatorToken, {
        index_number: unlinkedIndex,
        full_name: 'Unlinked Student',
        contact: '+233249990008',
        course_id: 'btech-cs',
        academic_year_id: yearId,
      });

      const res = await deleteStudent(coordinatorToken, {
        index_number: unlinkedIndex,
        academic_year_id: yearId,
      });
      expect(res.ok).toBe(true);

      const check = await getRosterStudent(yearId, unlinkedIndex);
      expect(check).toBeNull();

      // Verify audit log
      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'student.deleted')
        .where('target_id', '==', unlinkedIndex)
        .get();
      expect(auditSnap.empty).toBe(false);
    });
  });

  describe('6. changeStudentCourse (FR-01.10)', () => {
    const courseChangeIndex = '0323099907';

    beforeAll(async () => {
      await createStudent(coordinatorToken, {
        index_number: courseChangeIndex,
        full_name: 'Course Change Student',
        contact: '+233249990009',
        course_id: 'btech-cs',
        academic_year_id: yearId,
      });
    });

    it('rejects justification shorter than 20 characters with ZodError', async () => {
      await expect(
        changeStudentCourse(coordinatorToken, {
          index_number: courseChangeIndex,
          course_id: 'btech-ict',
          justification: 'Short justification',
          academic_year_id: yearId,
        })
      ).rejects.toThrow(ZodError);
    });

    it('updates course allocation and writes audit_logs', async () => {
      const res = await changeStudentCourse(coordinatorToken, {
        index_number: courseChangeIndex,
        course_id: 'btech-ict',
        justification: 'Approved department programme transfer due to specialization',
        academic_year_id: yearId,
      });

      expect(res.ok).toBe(true);
      expect(res.old_course_id).toBe('btech-cs');
      expect(res.new_course_id).toBe('btech-ict');

      const saved = await getRosterStudent(yearId, courseChangeIndex);
      expect(saved?.course_id).toBe('btech-ict');

      const auditSnap = await adminDb
        .collection('audit_logs')
        .where('action', '==', 'student.course_changed')
        .where('target_id', '==', courseChangeIndex)
        .get();
      expect(auditSnap.empty).toBe(false);
    });
  });
});
