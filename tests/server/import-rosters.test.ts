import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { importRosters } from '@/app/actions/import-rosters';
import { getRosterStudent } from '@/lib/models/roster/repo';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { upsertCourse } from '@/lib/models/course/repo';
import { HttpError } from '@/lib/errors';
import { fx, staffUid, studentEmail } from '../../fixtures';
import { resetTestEmulator } from '../helpers/reset';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';

async function getEmulatorIdToken(
  uid: string,
  email: string,
  claims: { roles: string[]; activeRole: string; registered?: boolean }
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

  await adminAuth.setCustomUserClaims(uid, {
    roles: claims.roles,
    activeRole: claims.activeRole,
    registered: claims.registered ?? true,
    profileComplete: true,
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

describe('Server Action: importRosters (Spec §5.1, FR-01.4, FR-01.5, D-05)', () => {
  const yearId = '2026-2027';
  const coordinatorEmail = 'coordinator@htu.edu.gh';
  const coordinatorUid = staffUid(coordinatorEmail);

  const supervisorEmail = 'kappiah@htu.edu.gh';
  const supervisorUid = staffUid(supervisorEmail);

  let coordinatorToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    // 1. Ensure academic year and course track exist
    await upsertCourse({
      id: 'btech-cs',
      code: 'BTECH-CS',
      name: 'BTech Computer Science',
      department: 'Computer Science',
    });

    await upsertAcademicYear({
      id: yearId,
      code: '2026/2027',
      semester: 1,
      is_active: true,
      deadlines: {
        roster_import_deadline: new Date(),
        team_formation_deadline: new Date(),
        topic_submission_deadline: new Date(),
        chapters_deadline: new Date(),
        defense_start_date: new Date(),
        defense_end_date: new Date(),
      },
    });

    const coordStaff = fx.staffByEmail(coordinatorEmail);
    await adminDb.collection('staff_whitelist').doc(coordinatorEmail).set({
      email: coordinatorEmail,
      full_name: coordStaff.full_name,
      roles: coordStaff.roles,
      department: coordStaff.department,
      programmes: coordStaff.programmes,
      is_active: true,
      added_by_uid: 'fixture',
      added_at: new Date(),
      user_uid: coordinatorUid,
    });

    // 2. Mint auth tokens
    coordinatorToken = await getEmulatorIdToken(coordinatorUid, coordinatorEmail, {
      roles: coordStaff.roles,
      activeRole: 'coordinator',
      registered: true,
    });

    const supStaff = fx.staffByEmail(supervisorEmail);
    supervisorToken = await getEmulatorIdToken(supervisorUid, supervisorEmail, {
      roles: supStaff.roles,
      activeRole: 'supervisor',
      registered: true,
    });
  });

  afterAll(async () => {
    await resetTestEmulator();
  });

  it('1. Rejects supervisor caller with 403 (spec D-05)', async () => {
    const s = fx.students[0]!;
    let thrownError: unknown;
    try {
      await importRosters({
        idToken: supervisorToken,
        course_id: s.course_id,
        academic_year_id: yearId,
        rows: [
          {
            index_number: s.index_number,
            full_name: s.full_name,
            contact: s.contact,
          },
        ],
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    expect((thrownError as HttpError).status).toBe(403);
    expect((thrownError as HttpError).code).toBe('FORBIDDEN_ROLE');
  });

  it('2. Dry-run mode produces full report with zero database writes', async () => {
    const s = fx.students[0]!;
    // Clean up roster student if exists
    await adminDb.collection('rosters').doc(yearId).collection('students').doc(s.index_number).delete();

    const dryRunRes = await importRosters({
      idToken: coordinatorToken,
      course_id: s.course_id,
      academic_year_id: yearId,
      dry_run: true,
      filename: 'btech_cs_dryrun.csv',
      rows: [
        {
          index_number: s.index_number,
          full_name: s.full_name,
          contact: s.contact,
        },
        {
          index_number: 'invalid_index',
          full_name: 'Bad Index Student',
          contact: '+233241112222',
        },
      ],
    });

    expect(dryRunRes.ok).toBe(true);
    expect(dryRunRes.dry_run).toBe(true);
    expect(dryRunRes.total).toBe(2);
    expect(dryRunRes.valid).toBe(1);
    expect(dryRunRes.imported).toBe(0); // Zero writes
    expect(dryRunRes.errors).toBe(1);

    // Verify document does NOT exist in Firestore
    const docAfterDryRun = await getRosterStudent(yearId, s.index_number);
    expect(docAfterDryRun).toBeNull();
  });

  it('3. Commit mode writes valid rows, sets user_uid null, and logs audit', async () => {
    const s1 = fx.students[0]!;
    const s2 = fx.students[1]!;

    // Clean up first
    await adminDb.collection('rosters').doc(yearId).collection('students').doc(s1.index_number).delete();
    await adminDb.collection('rosters').doc(yearId).collection('students').doc(s2.index_number).delete();

    const commitRes = await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: false,
      filename: 'btech_cs_commit.csv',
      rows: [
        {
          index_number: s1.index_number,
          full_name: s1.full_name,
          contact: s1.contact,
        },
        {
          index_number: s2.index_number,
          full_name: s2.full_name,
          contact: s2.contact,
        },
      ],
    });

    expect(commitRes.ok).toBe(true);
    expect(commitRes.dry_run).toBe(false);
    expect(commitRes.imported).toBe(2);
    expect(commitRes.skipped).toBe(0);
    expect(commitRes.errors).toBe(0);

    // Verify docs written to Firestore
    const doc1 = await getRosterStudent(yearId, s1.index_number);
    expect(doc1).not.toBeNull();
    expect(doc1?.full_name).toBe(s1.full_name);
    expect(doc1?.email).toBe(studentEmail(s1.index_number));
    expect(doc1?.course_id).toBe('btech-cs');
    expect(doc1?.user_uid).toBeNull(); // No Auth user created
    expect(doc1?.signup_completed_at).toBeNull();
    expect(doc1?.import_batch_id).toBeDefined();

    const doc2 = await getRosterStudent(yearId, s2.index_number);
    expect(doc2).not.toBeNull();
    expect(doc2?.full_name).toBe(s2.full_name);

    // Verify audit log
    const auditSnap = await adminDb
      .collection('audit_logs')
      .where('action', '==', 'roster.imported')
      .where('target_id', '==', `${yearId}/btech-cs`)
      .limit(1)
      .get();
    expect(auditSnap.empty).toBe(false);
  });

  it('4. Re-importing the same CSV reports existing rows as Skipped (Duplicate)', async () => {
    const s1 = fx.students[0]!;
    const sNew = fx.students[2]!;

    // Clean up sNew
    await adminDb.collection('rosters').doc(yearId).collection('students').doc(sNew.index_number).delete();

    // Re-importing s1 along with sNew
    const reImportRes = await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: false,
      rows: [
        {
          index_number: s1.index_number,
          full_name: s1.full_name,
          contact: s1.contact,
        },
        {
          index_number: sNew.index_number,
          full_name: sNew.full_name,
          contact: sNew.contact,
        },
      ],
    });

    expect(reImportRes.ok).toBe(true);
    expect(reImportRes.imported).toBe(1); // Only the new one
    expect(reImportRes.skipped).toBe(1); // The duplicate was skipped

    const skippedReport = reImportRes.rows.find((r) => r.index_number === s1.index_number);
    expect(skippedReport?.status).toBe('skipped');
    expect(skippedReport?.reason).toContain('Duplicate');
  });

  it('5. Per-row validation rejects bad contact numbers without failing valid rows', async () => {
    const validStudent = fx.students[3]!;
    const badIndex = fx.students[4]!.index_number;

    // Clean up
    await adminDb.collection('rosters').doc(yearId).collection('students').doc(validStudent.index_number).delete();
    await adminDb.collection('rosters').doc(yearId).collection('students').doc(badIndex).delete();

    const res = await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: false,
      rows: [
        {
          index_number: validStudent.index_number,
          full_name: validStudent.full_name,
          contact: validStudent.contact,
        },
        {
          index_number: badIndex,
          full_name: 'Bad Contact Student',
          contact: '12345', // too short
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.imported).toBe(1);
    expect(res.errors).toBe(1);

    const badRow = res.rows.find((r) => r.index_number === badIndex);
    expect(badRow?.status).toBe('error');
    expect(badRow?.reason).toContain('7-15 digits');

    // Document for bad row was NOT created
    const badDoc = await getRosterStudent(yearId, badIndex);
    expect(badDoc).toBeNull();
  });
});
