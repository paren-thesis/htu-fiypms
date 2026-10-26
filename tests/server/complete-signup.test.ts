import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { completeSignup } from '@/app/actions/complete-signup';
import { HttpError } from '@/lib/errors';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { upsertCourse } from '@/lib/models/course/repo';
import type {
  RosterStudentDocument,
  StaffWhitelistDocument,
  UserDocument,
} from '@/types/firestore';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

async function getEmulatorIdToken(
  uid: string,
  email: string,
  displayName?: string
): Promise<string> {
  try {
    await adminAuth.deleteUser(uid);
  } catch {
    // User doesn't exist yet, ignore
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: displayName || email.split('@')[0],
    emailVerified: true,
  });

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

describe('Server Action: completeSignup (Spec §5.2)', () => {
  const currentYearId = '2026-2027';

  beforeAll(async () => {
    // Ensure course and active academic year exist
    await upsertCourse({
      id: 'btech-cs',
      code: 'BTECH-CS',
      name: 'BTech Computer Science',
      department: 'Computer Science',
    });

    await upsertAcademicYear({
      id: currentYearId,
      code: '2026/2027',
      semester: 1,
      is_active: true,
      deadlines: {
        roster_import_deadline: new Date(2026, 9, 15),
        team_formation_deadline: new Date(2026, 10, 1),
        topic_submission_deadline: new Date(2026, 10, 15),
        chapters_deadline: new Date(2027, 3, 30),
        defense_start_date: new Date(2027, 5, 1),
        defense_end_date: new Date(2027, 5, 15),
      },
    });
  });

  it('1. student happy path: links user_uid, creates user doc, and sets custom claims', async () => {
    const indexNumber = '0323809901';
    const email = `${indexNumber}@htu.edu.gh`;
    const uid = 'student-uid-happy';

    // Seed student roster record
    const rosterRef = adminDb
      .collection('rosters')
      .doc(currentYearId)
      .collection('students')
      .doc(indexNumber);

    await rosterRef.set({
      index_number: indexNumber,
      full_name: 'Akwasi Mensah',
      course_id: 'btech-cs',
      contact: '0241000001',
      user_uid: null,
    });

    const idToken = await getEmulatorIdToken(uid, email, 'Akwasi Mensah');
    const res = await completeSignup(idToken);

    expect(res.ok).toBe(true);
    expect(res.registered).toBe(true);
    expect(res.profileComplete).toBe(true);
    expect(res.activeRole).toBe('student');
    expect(res.course_id).toBe('btech-cs');

    // Verify Firestore user document
    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    expect(userDocSnap.exists).toBe(true);
    const userDoc = userDocSnap.data() as UserDocument;
    expect(userDoc.role).toBe('student');
    expect(userDoc.roles).toEqual(['student']);
    expect(userDoc.active_role).toBe('student');
    expect(userDoc.profile.index_number).toBe(indexNumber);
    expect(userDoc.profile.course_id).toBe('btech-cs');
    expect(userDoc.profile.registered).toBe(true);
    expect(userDoc.profile.profile_complete).toBe(true);

    // Verify roster linkage
    const updatedRosterSnap = await rosterRef.get();
    const updatedRoster = updatedRosterSnap.data() as RosterStudentDocument;
    expect(updatedRoster.user_uid).toBe(uid);
    expect(updatedRoster.signup_completed_at).toBeDefined();

    // Verify custom user claims
    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.customClaims?.registered).toBe(true);
    expect(userRecord.customClaims?.profileComplete).toBe(true);
    expect(userRecord.customClaims?.activeRole).toBe('student');
    expect(userRecord.customClaims?.course_id).toBe('btech-cs');
  });

  it('2. staff happy path: links user_uid, creates user doc, and sets profileComplete:false', async () => {
    const email = 'kklu@htu.edu.gh';
    const uid = 'staff-uid-happy';

    // Seed staff whitelist
    const staffRef = adminDb.collection('staff_whitelist').doc(email);
    await staffRef.set({
      email,
      full_name: 'Dr. Kafui Klu',
      staff_id: 'STF-001',
      department: 'Computer Science',
      roles: ['supervisor', 'coordinator'],
      programmes: ['btech-cs'],
      is_active: true,
      user_uid: null,
    });

    const idToken = await getEmulatorIdToken(uid, email, 'Dr. Kafui Klu');
    const res = await completeSignup(idToken);

    expect(res.ok).toBe(true);
    expect(res.registered).toBe(true);
    expect(res.profileComplete).toBe(false);
    expect(res.activeRole).toBe('supervisor');

    // Verify Firestore user document
    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    expect(userDocSnap.exists).toBe(true);
    const userDoc = userDocSnap.data() as UserDocument;
    expect(userDoc.role).toBe('supervisor');
    expect(userDoc.roles).toEqual(['supervisor', 'coordinator']);
    expect(userDoc.active_role).toBe('supervisor');
    expect(userDoc.profile.registered).toBe(true);
    expect(userDoc.profile.profile_complete).toBe(false);
    expect(userDoc.profile.programmes).toEqual(['btech-cs']);

    // Verify staff whitelist linkage
    const updatedStaffSnap = await staffRef.get();
    const updatedStaff = updatedStaffSnap.data() as StaffWhitelistDocument;
    expect(updatedStaff.user_uid).toBe(uid);

    // Verify custom user claims
    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.customClaims?.registered).toBe(true);
    expect(userRecord.customClaims?.profileComplete).toBe(false);
    expect(userRecord.customClaims?.activeRole).toBe('supervisor');
    expect(userRecord.customClaims?.roles).toEqual(['supervisor', 'coordinator']);
  });

  it('3. unknown email: sets registered:false claims and never deletes the Auth user', async () => {
    const email = '0323999999@htu.edu.gh';
    const uid = 'unknown-student-uid';

    const idToken = await getEmulatorIdToken(uid, email);
    const res = await completeSignup(idToken);

    expect(res.ok).toBe(false);
    expect(res.code).toBe('NOT_REGISTERED');

    // Auth user must still exist in Firebase Auth
    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.uid).toBe(uid);
    expect(userRecord.customClaims?.registered).toBe(false);
    expect(userRecord.customClaims?.profileComplete).toBe(false);
  });

  it('4. inactive staff: returns NOT_REGISTERED and sets registered:false claims', async () => {
    const email = 'inactive.lecturer@htu.edu.gh';
    const uid = 'inactive-staff-uid';

    await adminDb.collection('staff_whitelist').doc(email).set({
      email,
      full_name: 'Inactive Lecturer',
      roles: ['supervisor'],
      programmes: ['btech-cs'],
      is_active: false,
      user_uid: null,
    });

    const idToken = await getEmulatorIdToken(uid, email);
    const res = await completeSignup(idToken);

    expect(res.ok).toBe(false);
    expect(res.code).toBe('NOT_REGISTERED');

    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.customClaims?.registered).toBe(false);
  });

  it('5. identity conflict: rejects with 409 and logs identity_conflict to audit_logs', async () => {
    const indexNumber = '0323807777';
    const email = `${indexNumber}@htu.edu.gh`;
    const originalUid = 'original-owner-uid';
    const imposterUid = 'imposter-uid';

    // Roster is already claimed by originalUid
    await adminDb
      .collection('rosters')
      .doc(currentYearId)
      .collection('students')
      .doc(indexNumber)
      .set({
        index_number: indexNumber,
        full_name: 'Original Student',
        course_id: 'btech-cs',
        contact: '0241000007',
        user_uid: originalUid,
      });

    const imposterToken = await getEmulatorIdToken(imposterUid, email);

    let thrownError: unknown;
    try {
      await completeSignup(imposterToken);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    const httpErr = thrownError as HttpError;
    expect(httpErr.status).toBe(409);
    expect(httpErr.code).toBe('IDENTITY_CONFLICT');

    // Verify identity_conflict in audit_logs
    const auditQuery = await adminDb
      .collection('audit_logs')
      .where('action', '==', 'identity_conflict')
      .where('target_id', '==', indexNumber)
      .get();

    expect(auditQuery.empty).toBe(false);
    const auditData = auditQuery.docs[0]!.data();
    expect(auditData.actor_id).toBe(imposterUid);
    expect(auditData.metadata.attempted_uid).toBe(imposterUid);
    expect(auditData.metadata.existing_uid).toBe(originalUid);
  });

  it('6. second sign-in is idempotent: succeeds without duplicate writes or errors', async () => {
    const indexNumber = '0323805555';
    const email = `${indexNumber}@htu.edu.gh`;
    const uid = 'idempotent-student-uid';

    const rosterRef = adminDb
      .collection('rosters')
      .doc(currentYearId)
      .collection('students')
      .doc(indexNumber);

    await rosterRef.set({
      index_number: indexNumber,
      full_name: 'Second Signin Student',
      course_id: 'btech-cs',
      contact: '0241000055',
      user_uid: null,
    });

    const idToken = await getEmulatorIdToken(uid, email, 'Second Signin Student');

    // First sign-in
    const firstRes = await completeSignup(idToken);
    expect(firstRes.ok).toBe(true);

    // Second sign-in with the same token / user
    const secondRes = await completeSignup(idToken);
    expect(secondRes.ok).toBe(true);
    expect(secondRes.registered).toBe(true);
    expect(secondRes.profileComplete).toBe(true);

    // Verify roster remains linked to the same UID
    const rosterSnap = await rosterRef.get();
    expect(rosterSnap.data()?.user_uid).toBe(uid);

    // User doc still valid
    const userSnap = await adminDb.collection('users').doc(uid).get();
    expect(userSnap.exists).toBe(true);
    expect(userSnap.data()?.uid).toBe(uid);
  });
});
