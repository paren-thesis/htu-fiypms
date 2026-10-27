import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { autoGroupStudents } from '@/app/actions/auto-group-students';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { listTeams } from '@/lib/models/team/repo';
import { Timestamp } from 'firebase-admin/firestore';
import type { UserDocument, RosterStudentDocument } from '@/types/firestore';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

async function createAuthToken(
  uid: string,
  email: string,
  activeRole: string,
  roles: string[] = [activeRole]
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
    roles,
    activeRole,
    registered: true,
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

async function seedStudent(
  yearId: string,
  indexNumber: string,
  courseId: string,
  isLinked: boolean = true
): Promise<string | null> {
  const uid = isLinked ? `std-${indexNumber}` : null;

  const rosterDoc: RosterStudentDocument = {
    index_number: indexNumber,
    full_name: `Student ${indexNumber}`,
    contact: '0240000000',
    email: `std${indexNumber}@htu.edu.gh`,
    course_id: courseId,
    import_batch_id: 'batch-test-01',
    imported_at: Timestamp.now(),
    imported_by_uid: 'coord-test-uid',
    user_uid: uid,
    signup_completed_at: isLinked ? Timestamp.now() : null,
  };

  await adminDb
    .collection('rosters')
    .doc(yearId)
    .collection('students')
    .doc(indexNumber)
    .set(rosterDoc);

  if (isLinked && uid) {
    const email = `std${indexNumber}@htu.edu.gh`;
    const userDoc: UserDocument = {
      uid,
      name: `Student ${indexNumber}`,
      email,
      role: 'student',
      roles: ['student'],
      active_role: 'student',
      profile: {
        registered: true,
        profile_complete: true,
        course_id: courseId,
        index_number: indexNumber,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('users').doc(uid).set(userDoc);
  }

  return uid;
}

describe('Server Action: autoGroupStudents (FR-02.6, FR-01.10)', () => {
  const yearId = '2026-2027';
  let coordinatorToken: string;
  let adminToken: string;
  let studentToken: string;

  beforeAll(async () => {
    // 1. Seed active academic year with past formation deadline
    const pastTimestamp = Timestamp.fromMillis(Date.now() - 3600000); // 1 hour ago
    await upsertAcademicYear({
      id: yearId,
      code: '2026/2027',
      semester: 1,
      is_active: true,
      deadlines: {
        roster_import_deadline: pastTimestamp,
        team_formation_deadline: pastTimestamp,
        topic_submission_deadline: Timestamp.now(),
        chapters_deadline: Timestamp.now(),
        defense_start_date: Timestamp.now(),
        defense_end_date: Timestamp.now(),
      },
    });

    // 2. Clean up teams, counters, rosters, and audit logs
    const teamsSnap = await adminDb.collection('teams').where('academic_year_id', '==', yearId).get();
    for (const doc of teamsSnap.docs) {
      const mems = await doc.ref.collection('members').get();
      for (const m of mems.docs) await m.ref.delete();
      const priv = await doc.ref.collection('private').get();
      for (const p of priv.docs) await p.ref.delete();
      await doc.ref.delete();
    }

    const rosterSnap = await adminDb.collection('rosters').doc(yearId).collection('students').get();
    for (const doc of rosterSnap.docs) {
      await doc.ref.delete();
    }

    for (const c of ['btech-cs', 'btech-ict', 'hnd-cs', 'hnd-ict']) {
      await adminDb.collection('academic_years').doc(yearId).collection('counters').doc(c).delete();
    }

    // 3. Create test tokens
    coordinatorToken = await createAuthToken('coord-ag-1', 'coord_ag@htu.edu.gh', 'coordinator', ['coordinator']);
    adminToken = await createAuthToken('admin-ag-1', 'admin_ag@htu.edu.gh', 'admin', ['admin']);
    studentToken = await createAuthToken('std-ag-user', 'std_ag_user@htu.edu.gh', 'student', ['student']);

    // 4. Seed cohort students:
    // - 9 linked students in btech-cs
    for (let i = 1; i <= 9; i++) {
      await seedStudent(yearId, `032308${String(100 + i).padStart(4, '0')}`, 'btech-cs', true);
    }
    // - 2 not yet signed in students in btech-cs
    await seedStudent(yearId, '0323080198', 'btech-cs', false);
    await seedStudent(yearId, '0323080199', 'btech-cs', false);

    // - 3 linked students in btech-ict (insufficient for group, will be leftovers)
    for (let i = 1; i <= 3; i++) {
      await seedStudent(yearId, `032308${String(200 + i).padStart(4, '0')}`, 'btech-ict', true);
    }
  });

  it('1. Student role is rejected with 403 Forbidden', async () => {
    const res = await autoGroupStudents(studentToken, { mode: 'preview', yearId });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  it('2. Coordinator previews auto-group without creating any teams', async () => {
    const res = await autoGroupStudents(coordinatorToken, { mode: 'preview', yearId });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('preview');
    expect(res.isDeadlinePassed).toBe(true);

    // 9 btech-cs students -> 2 groups (sizes 5, 4)
    // 3 btech-ict students -> 0 groups, 3 leftovers
    expect(res.groups).toHaveLength(2);
    expect(res.leftovers).toHaveLength(3);
    expect(res.notYetSignedInCount).toBe(2);

    expect(res.summary.totalStudents).toBe(12);
    expect(res.summary.totalAssigned).toBe(9);
    expect(res.summary.totalLeftovers).toBe(3);

    // Verify no teams were written to Firestore
    const currentTeams = await listTeams(yearId);
    expect(currentTeams).toHaveLength(0);
  });

  it('3. Rejects cross-category requests with 400', async () => {
    const res = await autoGroupStudents(coordinatorToken, {
      mode: 'preview',
      yearId,
      allowCrossCategory: true,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.code).toBe('CROSS_CATEGORY_NOT_ALLOWED');
  });

  it('4. Coordinator commits auto-group, creating teams and writing audit logs', async () => {
    const res = await autoGroupStudents(coordinatorToken, { mode: 'commit', yearId });
    expect(res.ok).toBe(true);
    expect(res.mode).toBe('commit');
    expect(res.createdTeams).toHaveLength(2);

    // Verify 2 teams exist in Firestore with sequential group numbers
    const teams = await listTeams(yearId);
    expect(teams).toHaveLength(2);

    const groupNumbers = teams.map((t) => t.group_number).sort();
    expect(groupNumbers).toEqual(['BCS26_01', 'BCS26_02']);

    const totalMembers = teams.reduce((acc, t) => acc + t.member_count, 0);
    expect(totalMembers).toBe(9);

    // Verify audit logs were written
    const auditSnap = await adminDb
      .collection('audit_logs')
      .where('action', '==', 'team.auto_grouped')
      .get();
    expect(auditSnap.docs.length).toBeGreaterThanOrEqual(2);

    // Verify leftovers were not forced into teams
    expect(res.leftovers).toHaveLength(3);
    expect(res.leftovers.every((m) => m.course_id === 'btech-ict')).toBe(true);
  });

  it('5. Commit is idempotent: subsequent run finds an empty pool for btech-cs', async () => {
    const res = await autoGroupStudents(coordinatorToken, { mode: 'commit', yearId });
    expect(res.ok).toBe(true);
    expect(res.createdTeams).toHaveLength(0); // No new teams created
    expect(res.groups).toHaveLength(0);
    // Only the 3 unassignable btech-ict students remain
    expect(res.leftovers).toHaveLength(3);
  });

  it('6. Deadline enforcement: non-admin blocked before deadline, admin allowed', async () => {
    // Set deadline into the future (+1 hour)
    const futureTimestamp = Timestamp.fromMillis(Date.now() + 3600000);
    await upsertAcademicYear({
      id: yearId,
      code: '2026/2027',
      semester: 1,
      is_active: true,
      deadlines: {
        roster_import_deadline: Timestamp.now(),
        team_formation_deadline: futureTimestamp,
        topic_submission_deadline: Timestamp.now(),
        chapters_deadline: Timestamp.now(),
        defense_start_date: Timestamp.now(),
        defense_end_date: Timestamp.now(),
      },
    });

    // Seed 4 new linked students in hnd-cs
    for (let i = 1; i <= 4; i++) {
      await seedStudent(yearId, `032308${String(300 + i).padStart(4, '0')}`, 'hnd-cs', true);
    }

    // Coordinator attempt before deadline fails with 403
    const coordRes = await autoGroupStudents(coordinatorToken, { mode: 'commit', yearId });
    expect(coordRes.ok).toBe(false);
    expect(coordRes.status).toBe(403);
    expect(coordRes.code).toBe('DEADLINE_NOT_PASSED');

    // Admin attempt before deadline succeeds with override
    const adminRes = await autoGroupStudents(adminToken, { mode: 'commit', yearId });
    expect(adminRes.ok).toBe(true);
    expect(adminRes.createdTeams).toHaveLength(1);
    expect(adminRes.createdTeams![0]!.courseId).toBe('hnd-cs');
  });
});
