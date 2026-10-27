import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { importRosters } from '@/app/actions/import-rosters';
import { getRosterStudent } from '@/lib/models/roster/repo';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { upsertCourse } from '@/lib/models/course/repo';
import { HttpError } from '@/lib/errors';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

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
  const coordinatorUid = 'coord-import-test-uid';
  const coordinatorEmail = 'coord.rosterimport@htu.edu.gh';

  const supervisorUid = 'sup-import-test-uid';
  const supervisorEmail = 'sup.rosterimport@htu.edu.gh';

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

    // 2. Mint auth tokens
    coordinatorToken = await getEmulatorIdToken(coordinatorUid, coordinatorEmail, {
      roles: ['coordinator'],
      activeRole: 'coordinator',
      registered: true,
    });

    supervisorToken = await getEmulatorIdToken(supervisorUid, supervisorEmail, {
      roles: ['supervisor'],
      activeRole: 'supervisor',
      registered: true,
    });
  });

  it('1. Rejects supervisor caller with 403 (spec D-05)', async () => {
    let thrownError: unknown;
    try {
      await importRosters({
        idToken: supervisorToken,
        course_id: 'btech-cs',
        academic_year_id: yearId,
        rows: [
          {
            index_number: '0323089999',
            full_name: 'Test Student',
            contact: '+233241234567',
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
    const studentIndex = '0323081111';

    const dryRunRes = await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: true,
      filename: 'btech_cs_dryrun.csv',
      rows: [
        {
          index_number: studentIndex,
          full_name: 'Dry Run Student',
          contact: '+233 24 111 2222',
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
    const docAfterDryRun = await getRosterStudent(yearId, studentIndex);
    expect(docAfterDryRun).toBeNull();
  });

  it('3. Commit mode writes valid rows, sets user_uid null, and logs audit', async () => {
    const runSuffix = String(Date.now()).slice(-3);
    const student1 = `032308${runSuffix}1`;
    const student2 = `032308${runSuffix}2`;

    const commitRes = await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: false,
      filename: 'btech_cs_commit.csv',
      rows: [
        {
          index_number: student1,
          full_name: 'Commit Student One',
          contact: '+233 24 222 1111',
        },
        {
          index_number: student2,
          full_name: 'Commit Student Two',
          contact: '024-222-2222',
        },
      ],
    });

    expect(commitRes.ok).toBe(true);
    expect(commitRes.dry_run).toBe(false);
    expect(commitRes.imported).toBe(2);
    expect(commitRes.skipped).toBe(0);
    expect(commitRes.errors).toBe(0);

    // Verify docs written to Firestore
    const doc1 = await getRosterStudent(yearId, student1);
    expect(doc1).not.toBeNull();
    expect(doc1?.full_name).toBe('Commit Student One');
    expect(doc1?.contact).toBe('+233242221111'); // Normalized
    expect(doc1?.email).toBe(`${student1}@htu.edu.gh`);
    expect(doc1?.course_id).toBe('btech-cs');
    expect(doc1?.user_uid).toBeNull(); // No Auth user created
    expect(doc1?.signup_completed_at).toBeNull();
    expect(doc1?.import_batch_id).toBeDefined();

    const doc2 = await getRosterStudent(yearId, student2);
    expect(doc2).not.toBeNull();
    expect(doc2?.contact).toBe('0242222222');

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
    const runSuffix = String(Date.now()).slice(-3);
    const student1 = `032309${runSuffix}1`;
    const studentNew = `032309${runSuffix}2`;

    // First import student1
    await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: false,
      rows: [
        {
          index_number: student1,
          full_name: 'Commit Student One',
          contact: '+233 24 222 1111',
        },
      ],
    });

    // Re-importing student1 along with studentNew
    const reImportRes = await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: false,
      rows: [
        {
          index_number: student1,
          full_name: 'Commit Student One Again',
          contact: '+233 24 222 1111',
        },
        {
          index_number: studentNew,
          full_name: 'New Student Three',
          contact: '+233 24 333 3333',
        },
      ],
    });

    expect(reImportRes.ok).toBe(true);
    expect(reImportRes.imported).toBe(1); // Only the new one
    expect(reImportRes.skipped).toBe(1); // The duplicate was skipped

    const skippedReport = reImportRes.rows.find((r) => r.index_number === student1);
    expect(skippedReport?.status).toBe('skipped');
    expect(skippedReport?.reason).toContain('Duplicate');
  });

  it('5. Per-row validation rejects bad contact numbers without failing valid rows', async () => {
    const runSuffix = String(Date.now()).slice(-3);
    const validStudent = `032307${runSuffix}1`;
    const badContactStudent = `032307${runSuffix}2`;

    const res = await importRosters({
      idToken: coordinatorToken,
      course_id: 'btech-cs',
      academic_year_id: yearId,
      dry_run: false,
      rows: [
        {
          index_number: validStudent,
          full_name: 'Valid Student Four',
          contact: '+233 24 444 1111',
        },
        {
          index_number: badContactStudent,
          full_name: 'Bad Contact Student',
          contact: '12345', // too short
        },
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.imported).toBe(1);
    expect(res.errors).toBe(1);

    const badRow = res.rows.find((r) => r.index_number === badContactStudent);
    expect(badRow?.status).toBe('error');
    expect(badRow?.reason).toContain('7-15 digits');

    // Document for bad row was NOT created
    const badDoc = await getRosterStudent(yearId, badContactStudent);
    expect(badDoc).toBeNull();
  });
});
