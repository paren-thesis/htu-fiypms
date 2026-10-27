import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  createRubric,
  updateRubric,
  duplicateRubric,
  activateRubric,
  archiveRubric,
  deleteRubric,
} from '@/app/actions/manage-rubric';
import { DEFAULT_RUBRIC_TEMPLATE } from '@/lib/rubrics/validate';
import { getRubric, RUBRICS_COLLECTION } from '@/lib/models/rubric/repo';
import { listAuditLogs } from '@/lib/models/audit-log/repo';
import type { UserDocument } from '@/types/firestore';
import { fx, studentEmail, studentUid, staffUid } from '../../fixtures';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';

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
      registered: true,
      profile_complete: true,
      course_id: s.course_id,
      index_number: s.index_number,
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
    roles: staff.roles,
    active_role: activeRole,
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

describe('Rubric Management Server Actions (manage-rubric)', () => {
  let coordinatorToken: string;
  let studentToken: string;
  let coordinatorEmail: string;

  beforeAll(async () => {
    const coordinatorStaff = fx.staff.find((s) => s.roles.includes('coordinator'))!;
    coordinatorEmail = coordinatorStaff.email;
    coordinatorToken = await createStaffToken(coordinatorEmail, 'coordinator');

    const studentUser = fx.students[0]!;
    studentToken = await createStudentToken(studentUser.index_number);
  });

  it('rejects rubric creation when caller is a student (403)', async () => {
    const res = await createRubric(studentToken, {
      title: 'Student Attempt',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'crit1',
          title: 'Demo',
          max_points: 100,
          category: 'system_demo',
        },
      ],
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe('FORBIDDEN_ROLE');
  });

  it('rejects invalid weights or point totals', async () => {
    // 1. Weights don't sum to 100
    const invalidWeightRes = await createRubric(coordinatorToken, {
      title: 'Bad Weights',
      max_score: 100,
      supervisor_weight_pct: 50,
      panel_weight_pct: 60, // 110%
      criteria: [
        {
          id: 'crit1',
          title: 'Demo',
          max_points: 100,
          category: 'system_demo',
        },
      ],
    });
    expect(invalidWeightRes.ok).toBe(false);

    // 2. Point totals don't equal max_score
    const invalidPointsRes = await createRubric(coordinatorToken, {
      title: 'Bad Points',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'crit1',
          title: 'Demo',
          max_points: 80, // 80 != 100
          category: 'system_demo',
        },
      ],
    });
    expect(invalidPointsRes.ok).toBe(false);

    // 3. Duplicate criterion IDs
    const duplicateCritRes = await createRubric(coordinatorToken, {
      title: 'Duplicate Criteria',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'same_id',
          title: 'Demo 1',
          max_points: 50,
          category: 'system_demo',
        },
        {
          id: 'same_id',
          title: 'Demo 2',
          max_points: 50,
          category: 'system_demo',
        },
      ],
    });
    expect(duplicateCritRes.ok).toBe(false);
  });

  it('creates a valid rubric from the default template', async () => {
    const res = await createRubric(coordinatorToken, DEFAULT_RUBRIC_TEMPLATE);
    expect(res.ok).toBe(true);
    expect(res.rubricId).toBeDefined();

    const saved = await getRubric(res.rubricId!);
    expect(saved).not.toBeNull();
    expect(saved?.title).toBe(DEFAULT_RUBRIC_TEMPLATE.title);
    expect(saved?.is_active).toBe(false);
    expect(saved?.criteria).toHaveLength(3);

    // Check audit log
    const logRes = await listAuditLogs({ limit: 10 });
    const createLog = logRes.items.find(
      (l) => l.action === 'rubric.created' && l.target_id === res.rubricId
    );
    expect(createLog).toBeDefined();
  });

  it('updates an existing rubric when no evaluations exist', async () => {
    const createRes = await createRubric(coordinatorToken, {
      title: 'Original Title',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'c1',
          title: 'Oral',
          max_points: 100,
          category: 'oral_defense',
        },
      ],
    });
    expect(createRes.ok).toBe(true);
    const rubricId = createRes.rubricId!;

    const updateRes = await updateRubric(coordinatorToken, {
      rubric_id: rubricId,
      title: 'Updated Rubric Title',
    });
    expect(updateRes.ok).toBe(true);

    const updated = await getRubric(rubricId);
    expect(updated?.title).toBe('Updated Rubric Title');
  });

  it('duplicates a rubric successfully', async () => {
    const createRes = await createRubric(coordinatorToken, DEFAULT_RUBRIC_TEMPLATE);
    const sourceId = createRes.rubricId!;

    const dupRes = await duplicateRubric(coordinatorToken, {
      rubric_id: sourceId,
      new_title: 'Cloned Defense Rubric',
    });

    expect(dupRes.ok).toBe(true);
    expect(dupRes.rubricId).toBeDefined();
    expect(dupRes.rubricId).not.toBe(sourceId);

    const cloned = await getRubric(dupRes.rubricId!);
    expect(cloned?.title).toBe('Cloned Defense Rubric');
    expect(cloned?.max_score).toBe(DEFAULT_RUBRIC_TEMPLATE.max_score);
    expect(cloned?.criteria).toHaveLength(3);
    expect(cloned?.is_active).toBe(false);
  });

  it('enforces that only one rubric is active at any time in a transaction', async () => {
    // Create two rubrics
    const r1Res = await createRubric(coordinatorToken, {
      title: 'Rubric Alpha',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'a1',
          title: 'Oral',
          max_points: 100,
          category: 'oral_defense',
        },
      ],
    });
    const r2Res = await createRubric(coordinatorToken, {
      title: 'Rubric Beta',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'b1',
          title: 'Oral',
          max_points: 100,
          category: 'oral_defense',
        },
      ],
    });

    const r1Id = r1Res.rubricId!;
    const r2Id = r2Res.rubricId!;

    // 1. Activate Alpha
    const act1 = await activateRubric(coordinatorToken, { rubric_id: r1Id });
    expect(act1.ok).toBe(true);

    let doc1 = await getRubric(r1Id);
    let doc2 = await getRubric(r2Id);
    expect(doc1?.is_active).toBe(true);
    expect(doc2?.is_active).toBe(false);

    // 2. Activate Beta -> Alpha should be deactivated atomically
    const act2 = await activateRubric(coordinatorToken, { rubric_id: r2Id });
    expect(act2.ok).toBe(true);

    doc1 = await getRubric(r1Id);
    doc2 = await getRubric(r2Id);
    expect(doc1?.is_active).toBe(false);
    expect(doc2?.is_active).toBe(true);

    // Verify all active rubrics in collection: strictly one
    const activeSnap = await adminDb
      .collection(RUBRICS_COLLECTION)
      .where('is_active', '==', true)
      .get();
    expect(activeSnap.docs).toHaveLength(1);
    expect(activeSnap.docs[0]?.id).toBe(r2Id);
  });

  it('blocks update, archive, and delete when evaluations reference the rubric (409)', async () => {
    // 1. Create a rubric
    const createRes = await createRubric(coordinatorToken, DEFAULT_RUBRIC_TEMPLATE);
    const rubricId = createRes.rubricId!;

    // 2. Insert a simulated evaluation referencing this rubric
    const evalId = `team_test__evaluator_test__team`;
    await adminDb.collection('evaluations').doc(evalId).set({
      id: evalId,
      team_id: 'team_test',
      evaluator_id: staffUid(coordinatorEmail),
      evaluator_role: 'supervisor',
      rubric_id: rubricId,
      scores: { oral_defense: 25, system_demo: 35, technical_architecture: 28 },
      total_score: 88,
      comments: 'Great work',
      is_published: false,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // 3. Attempt to update -> must fail with 409
    const updateRes = await updateRubric(coordinatorToken, {
      rubric_id: rubricId,
      title: 'Should Be Blocked',
    });
    expect(updateRes.ok).toBe(false);
    expect(updateRes.code).toBe('RUBRIC_IN_USE');

    // 4. Attempt to archive -> must fail with 409
    const archiveRes = await archiveRubric(coordinatorToken, {
      rubric_id: rubricId,
    });
    expect(archiveRes.ok).toBe(false);
    expect(archiveRes.code).toBe('RUBRIC_IN_USE');

    // 5. Attempt to delete -> must fail with 409
    const deleteRes = await deleteRubric(coordinatorToken, {
      rubric_id: rubricId,
    });
    expect(deleteRes.ok).toBe(false);
    expect(deleteRes.code).toBe('RUBRIC_IN_USE');

    // Clean up dummy evaluation
    await adminDb.collection('evaluations').doc(evalId).delete();
  });
});
