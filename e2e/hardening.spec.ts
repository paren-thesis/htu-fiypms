process.env.GCLOUD_PROJECT = 'demo-fypms-test';
process.env.FIREBASE_ADMIN_PROJECT_ID = 'demo-fypms-test';
process.env.FIREBASE_PROJECT_ID = 'demo-fypms-test';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-fypms-test';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../src/lib/firebase/admin';
import { fx, studentEmail, studentUid, staffUid } from '../fixtures';
import { evaluationId } from '../src/lib/defense/eval-id';
import type {
  DefensePanelDocument,
  RubricDocument,
  EvaluationDocument,
  TopicDocument,
} from '../src/types/firestore';

interface EmulatorUserSetup {
  uid: string;
  email: string;
  displayName: string;
  claims: Record<string, unknown>;
}

async function ensureEmulatorUserWithClaims(setup: EmulatorUserSetup): Promise<void> {
  try {
    await adminAuth.updateUser(setup.uid, {
      email: setup.email,
      displayName: setup.displayName,
      emailVerified: true,
    });
  } catch {
    await adminAuth.createUser({
      uid: setup.uid,
      email: setup.email,
      displayName: setup.displayName,
      emailVerified: true,
    });
  }
  await adminAuth.setCustomUserClaims(setup.uid, setup.claims);
}

async function signInViaDevPortal(page: Page, uidOrEmail: string): Promise<void> {
  await page.goto('/dev/login', { waitUntil: 'networkidle' });
  const input = page.locator('[data-testid="dev-login-input"]');
  await expect(input).toBeVisible();
  await input.fill(uidOrEmail);
  await page.locator('[data-testid="dev-login-submit"]').click();
}

async function getTeamIdByGroupNumber(groupNumber: string): Promise<string> {
  const snap = await adminDb
    .collection('teams')
    .where('group_number', '==', groupNumber)
    .limit(1)
    .get();
  if (snap.empty || !snap.docs[0]) {
    throw new Error(`Team with group_number ${groupNumber} not found in Firestore`);
  }
  return snap.docs[0].id;
}

async function syncContactGrants(teamId: string): Promise<void> {
  const teamSnap = await adminDb.collection('teams').doc(teamId).get();
  if (!teamSnap.exists) return;
  const team = teamSnap.data() as {
    member_ids: string[];
    assigned_supervisor_id?: string | null;
    approved_topic_id?: string | null;
    supervisor_assignment?: { status?: string };
  };
  const supId = team.assigned_supervisor_id;
  if (!supId) return;

  const isAccepted = team.supervisor_assignment?.status === 'accepted';
  const hasApprovedTopic = Boolean(team.approved_topic_id);

  const grantsCol = adminDb
    .collection('supervisor_contacts')
    .doc(supId)
    .collection('grants');

  for (const memberUid of team.member_ids) {
    if (isAccepted && hasApprovedTopic) {
      await grantsCol.doc(memberUid).set({
        student_id: memberUid,
        team_id: teamId,
        granted_at: Timestamp.now(),
      });
    } else {
      await grantsCol.doc(memberUid).delete();
    }
  }
}

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe('Phase 12 Hardening End-to-End Flows & Accessibility Suite', () => {
  test('1. registered student reaches the dashboard and passes @axe-core/playwright check on /', async ({
    page,
  }) => {
    const student = fx.students[0]!;
    const uid = studentUid(student.index_number);
    const email = studentEmail(student.index_number);

    await ensureEmulatorUserWithClaims({
      uid,
      email,
      displayName: student.full_name,
      claims: {
        roles: ['student'],
        activeRole: 'student',
        registered: true,
        profileComplete: true,
        course_id: student.course_id,
      },
    });

    await signInViaDevPortal(page, uid);
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
    await expect(page.getByRole('link', { name: /My Team/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Proposals/i }).first()).toBeVisible();

    await expectAccessible(page);
  });

  test('2. unknown email lands on /not-registered', async ({ page }) => {
    const tempUid = 'e2e-unregistered-user';
    const tempEmail = '9999999999@htu.edu.gh';

    await ensureEmulatorUserWithClaims({
      uid: tempUid,
      email: tempEmail,
      displayName: 'Unregistered Visitor',
      claims: {
        roles: ['student'],
        activeRole: 'student',
        registered: false,
        profileComplete: false,
      },
    });

    try {
      await signInViaDevPortal(page, tempUid);
      await page.waitForURL((url) => url.pathname === '/not-registered', {
        timeout: 20_000,
      });

      await expect(page.getByText('Account Not Registered')).toBeVisible();
      await expect(
        page.getByText(/not listed in the current final-year cohort roster/i)
      ).toBeVisible();
    } finally {
      await adminAuth.deleteUser(tempUid).catch(() => undefined);
    }
  });

  test('3. faculty completes /complete-profile and lands on /', async ({ page }) => {
    const staff = fx.staffByEmail('yboateng@htu.edu.gh');
    const uid = staffUid(staff.email);

    await ensureEmulatorUserWithClaims({
      uid,
      email: staff.email,
      displayName: staff.full_name,
      claims: {
        roles: staff.roles,
        activeRole: staff.roles[0],
        registered: true,
        profileComplete: false,
      },
    });

    await adminDb.collection('users').doc(uid).set(
      {
        profile: {
          registered: true,
          profile_complete: false,
          programmes: staff.programmes,
        },
        updated_at: Timestamp.now(),
      },
      { merge: true }
    );

    await signInViaDevPortal(page, uid);
    await page.waitForURL((url) => url.pathname === '/complete-profile', {
      timeout: 20_000,
    });

    await expect(page.getByText('Faculty Profile Setup')).toBeVisible();

    await page.locator('#office_location').fill('CS Block B, Room 212');
    await page.locator('#consultation_hours').fill('Wednesdays 10:00 AM - 12:00 PM');
    await page.locator('#phone').fill('+233202111003');

    await page.getByRole('button', { name: /Complete Profile/i }).click();

    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

    const updatedUser = await adminDb.collection('users').doc(uid).get();
    expect(updatedUser.data()?.profile?.profile_complete).toBe(true);

    const updatedContact = await adminDb.collection('supervisor_contacts').doc(uid).get();
    expect(updatedContact.data()?.office_location).toBe('CS Block B, Room 212');
  });

  test('4. category mismatch join shows the 409 message and passes @axe-core/playwright check on /my-team', async ({
    page,
  }) => {
    // Retrieve invite code for btech-cs team BCS26_01
    const bcsTeamId = await getTeamIdByGroupNumber('BCS26_01');
    const inviteSnap = await adminDb
      .collection('teams')
      .doc(bcsTeamId)
      .collection('private')
      .doc('invite')
      .get();
    const bcsInviteCode = (inviteSnap.data()?.code as string) || 'BCS261';

    // Pick a btech-ict student from fixtures and temporarily detach from their team so JoinTeamCard renders
    const ictStudent = fx.students.find((s) => s.course_id === 'btech-ict')!;
    const uid = studentUid(ictStudent.index_number);
    const email = studentEmail(ictStudent.index_number);

    const activeTeamsSnap = await adminDb
      .collection('teams')
      .where('member_ids', 'array-contains', uid)
      .get();
    const originalTeamDocs: { id: string; member_ids: string[]; member_count: number }[] = [];
    for (const d of activeTeamsSnap.docs) {
      const data = d.data() as { member_ids: string[]; member_count: number };
      originalTeamDocs.push({
        id: d.id,
        member_ids: data.member_ids,
        member_count: data.member_count,
      });
      const filtered = data.member_ids.filter((id) => id !== uid);
      await d.ref.update({
        member_ids: filtered,
        member_count: filtered.length,
      });
    }

    // Ensure bcsTeamId has an open slot so joinTeam reaches the 409 course mismatch check
    await adminDb.collection('teams').doc(bcsTeamId).update({ max_members: 6 });

    try {
      await ensureEmulatorUserWithClaims({
        uid,
        email,
        displayName: ictStudent.full_name,
        claims: {
          roles: ['student'],
          activeRole: 'student',
          registered: true,
          profileComplete: true,
          course_id: ictStudent.course_id,
        },
      });

      await signInViaDevPortal(page, uid);
      await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

      await page.goto('/my-team');
      await expect(page.getByText('Join with Code')).toBeVisible();

      await expectAccessible(page);

      const codeInput = page.getByPlaceholder(/7K4X9B/i);
      await codeInput.fill(bcsInviteCode);
      await page.getByRole('button', { name: /Join Team/i }).click();

      await expect(
        page
          .getByText(
            /This team belongs to a different programme\. You can only join teams in your own course track\./i
          )
          .first()
      ).toBeVisible();
    } finally {
      await adminDb.collection('teams').doc(bcsTeamId).update({ max_members: 5 });
      for (const orig of originalTeamDocs) {
        await adminDb.collection('teams').doc(orig.id).update({
          member_ids: orig.member_ids,
          member_count: orig.member_count,
        });
      }
    }
  });

  test('5. full path proposal approved + supervisor accepted unlocks contact details and passes @axe-core/playwright on /proposals', async ({
    page,
  }) => {
    const group = fx.group('BCS26_02');
    const leader = fx.student(group.leader);
    const leaderUid = studentUid(leader.index_number);
    const supUid = staffUid('kappiah@htu.edu.gh');
    const teamId = await getTeamIdByGroupNumber('BCS26_02');
    const topicId = 'topic-bcs26-02';
    const assignId = `assign-${teamId}-${supUid}`;

    // Ensure initially proposed (not yet accepted) and no contact grants
    const now = Timestamp.now();
    const topicDoc: TopicDocument = {
      id: topicId,
      team_id: teamId,
      title: 'Zero-Trust Campus Authentication Gateway',
      abstract:
        'A mutual-TLS and hardware-token authentication gateway for university laboratory networks.',
      problem_statement: 'Campus laboratory endpoints lack mutual authentication and session auditing.',
      proposed_solution: 'Deploy an mTLS and FIDO2 gateway for laboratory network access.',
      tech_stack: ['typescript', 'cybersecurity', 'cloud-computing'],
      preference_rank: 1,
      is_current: true,
      status: 'submitted',
      version: 1,
      submitted_at: now,
    };
    await adminDb.collection('topics').doc(topicId).set(topicDoc);
    await adminDb.collection('teams').doc(teamId).update({
      status: 'topic_pending',
      approved_topic_id: null,
      assigned_supervisor_id: supUid,
      supervisor_assignment: {
        status: 'proposed',
        assigned_at: now,
      },
    });
    await adminDb.collection('supervisor_assignments').doc(assignId).set({
      id: assignId,
      team_id: teamId,
      supervisor_id: supUid,
      assigned_by: staffUid('coordinator@htu.edu.gh'),
      status: 'proposed',
      assigned_at: now,
    });
    await syncContactGrants(teamId);

    // Sign in as student leader
    await ensureEmulatorUserWithClaims({
      uid: leaderUid,
      email: studentEmail(leader.index_number),
      displayName: leader.full_name,
      claims: {
        roles: ['student'],
        activeRole: 'student',
        registered: true,
        profileComplete: true,
        course_id: leader.course_id,
      },
    });

    await signInViaDevPortal(page, leaderUid);
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

    // Check /proposals accessibility
    await page.goto('/proposals');
    await expect(page.getByText('Zero-Trust Campus Authentication Gateway')).toBeVisible();
    await expectAccessible(page);

    // Visit /supervision while still proposed -> contact details must be locked
    await page.goto('/supervision');
    await expect(page.getByText('Supervisor Consultation Details Locked')).toBeVisible();

    // Approve topic + accept supervisor assignment -> syncs contact grants
    await adminDb.collection('topics').doc(topicId).update({
      status: 'approved',
      reviewed_by_user_id: staffUid('coordinator@htu.edu.gh'),
      reviewed_at: Timestamp.now(),
    });
    await adminDb.collection('teams').doc(teamId).update({
      status: 'topic_approved',
      approved_topic_id: topicId,
      assigned_supervisor_id: supUid,
      supervisor_assignment: {
        status: 'accepted',
        assigned_at: now,
        responded_at: Timestamp.now(),
      },
    });
    await adminDb.collection('supervisor_assignments').doc(assignId).update({
      status: 'accepted',
      responded_at: Timestamp.now(),
    });
    await syncContactGrants(teamId);

    // Reload /supervision and verify contact details unlock
    await page.reload();
    await expect(page.getByText('Consultation Details')).toBeVisible();
    await expect(page.getByText('Access Granted')).toBeVisible();
    await expect(
      page.getByText(fx.profile('kappiah@htu.edu.gh')!.office_location)
    ).toBeVisible();
  });

  test('6. two evaluators score and the coordinator sees the live composite + @axe-core/playwright on /defense/[panelId]', async ({
    page,
  }) => {
    const teamId = await getTeamIdByGroupNumber('BCS26_01');
    const panelId = 'panel-e2e-bcs26-01';
    const rubricId = 'rubric-2026-default';
    const supUid = staffUid('kappiah@htu.edu.gh');
    const chairUid = staffUid('aowusu@htu.edu.gh');
    const examinerUid = staffUid('yboateng@htu.edu.gh');
    const coordUid = staffUid('coordinator@htu.edu.gh');
    const now = Timestamp.now();

    // Ensure active rubric
    const rubric: RubricDocument = {
      id: rubricId,
      title: 'HTU Standard Capstone Rubric',
      is_active: true,
      max_score: 100,
      panel_weight_pct: 60,
      supervisor_weight_pct: 40,
      criteria: [
        { id: 'c1', title: 'Problem Definition', description: 'Clarity of problem', max_points: 25, category: 'oral_defense' },
        { id: 'c2', title: 'System Architecture', description: 'Design quality', max_points: 25, category: 'technical_architecture' },
        { id: 'c3', title: 'Implementation', description: 'Working prototype', max_points: 25, category: 'system_demo' },
        { id: 'c4', title: 'Presentation & Q&A', description: 'Defense delivery', max_points: 25, category: 'oral_defense' },
      ],
      created_at: now,
      updated_at: now,
    };
    await adminDb.collection('rubrics').doc(rubricId).set(rubric);

    // Ensure defense panel for BCS26_01
    const panel: DefensePanelDocument = {
      id: panelId,
      academic_year_id: '2026-2027',
      course_id: 'BTECH-CS',
      panel_name: 'BTech CS Panel Alpha',
      venue: 'CS Lab 1',
      is_virtual: false,
      chair_id: chairUid,
      examiner_ids: [examinerUid],
      is_published: true,
      time_slots: [
        {
          slot_id: 'slot-1',
          team_id: teamId,
          start_time: now,
          end_time: Timestamp.fromMillis(now.toMillis() + 30 * 60 * 1000),
          status: 'scheduled',
        },
      ],
      created_at: now,
      updated_at: now,
    };
    await adminDb.collection('defense_panels').doc(panelId).set(panel);

    // Evaluator 1 (Supervisor: 80/100) and Evaluator 2 (Panel Chair: 90/100) submit evaluations
    const supEvalId = evaluationId(teamId, supUid);
    const chairEvalId = evaluationId(teamId, chairUid);

    const supEval: EvaluationDocument = {
      id: supEvalId,
      team_id: teamId,
      evaluator_id: supUid,
      evaluator_role: 'supervisor',
      rubric_id: rubricId,
      scores: { c1: 20, c2: 20, c3: 20, c4: 20 },
      total_score: 80,
      comments: 'Consistent milestone progress.',
      is_published: false,
      student_id: null,
      created_at: now,
      updated_at: now,
    };

    const chairEval: EvaluationDocument = {
      id: chairEvalId,
      team_id: teamId,
      evaluator_id: chairUid,
      evaluator_role: 'panel_chair',
      rubric_id: rubricId,
      scores: { c1: 23, c2: 22, c3: 23, c4: 22 },
      total_score: 90,
      comments: 'Strong technical demonstration.',
      is_published: false,
      student_id: null,
      created_at: now,
      updated_at: now,
    };

    await adminDb.collection('evaluations').doc(supEvalId).set(supEval);
    await adminDb.collection('evaluations').doc(chairEvalId).set(chairEval);

    // Sign in as Coordinator and open /defense/[panelId]
    const coordStaff = fx.staffByEmail('coordinator@htu.edu.gh');
    await ensureEmulatorUserWithClaims({
      uid: coordUid,
      email: coordStaff.email,
      displayName: coordStaff.full_name,
      claims: {
        roles: coordStaff.roles,
        activeRole: 'coordinator',
        registered: true,
        profileComplete: true,
      },
    });

    await signInViaDevPortal(page, coordUid);
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

    await page.goto(`/defense/${panelId}?team=${teamId}`);

    await expect(page.getByText('Live Panel Composite Scoring')).toBeVisible();
    // 0.4 * 80 + 0.6 * 90 = 32 + 54 = 86.00%
    await expect(page.getByText('80.00%')).toBeVisible();
    await expect(page.getByText('90.00%')).toBeVisible();
    await expect(page.getByText('86.00%')).toBeVisible();

    await expectAccessible(page);
  });

  test('7. publishing grades blocks further evaluation writes and passes @axe-core/playwright on /reports', async ({
    page,
  }) => {
    const teamId = await getTeamIdByGroupNumber('BCS26_01');
    const panelId = 'panel-e2e-bcs26-01';
    const chairStaff = fx.staffByEmail('aowusu@htu.edu.gh');
    const chairUid = staffUid(chairStaff.email);
    const coordStaff = fx.staffByEmail('coordinator@htu.edu.gh');
    const coordUid = staffUid(coordStaff.email);
    const chairEvalId = evaluationId(teamId, chairUid);

    // First verify /reports accessibility as coordinator
    await ensureEmulatorUserWithClaims({
      uid: coordUid,
      email: coordStaff.email,
      displayName: coordStaff.full_name,
      claims: {
        roles: coordStaff.roles,
        activeRole: 'coordinator',
        registered: true,
        profileComplete: true,
      },
    });

    await signInViaDevPortal(page, coordUid);
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /Official Broadsheet Reports/i })).toBeVisible();
    await expectAccessible(page);

    // Publish evaluation for chairUid and lock grades
    await adminDb.collection('evaluations').doc(chairEvalId).update({
      is_published: true,
      updated_at: Timestamp.now(),
    });
    await adminDb.collection('academic_years').doc('2026-2027').update({
      grades_published: true,
      updated_at: Timestamp.now(),
    });

    try {
      // Sign in as Panel Chair and open the marksheet at /defense/[panelId]
      await ensureEmulatorUserWithClaims({
        uid: chairUid,
        email: chairStaff.email,
        displayName: chairStaff.full_name,
        claims: {
          roles: chairStaff.roles,
          activeRole: 'panel_member',
          registered: true,
          profileComplete: true,
        },
      });

      await signInViaDevPortal(page, chairUid);
      await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });

      await page.goto(`/defense/${panelId}?team=${teamId}`);

      await expect(page.getByText('Marksheet Locked')).toBeVisible();
      await expect(
        page.getByText(/This evaluation has been locked following publication of grades/i)
      ).toBeVisible();

      const commentsBox = page.locator('textarea').first();
      await expect(commentsBox).toBeDisabled();
    } finally {
      // Restore grades_published: false on 2026-2027 for clean state
      await adminDb.collection('academic_years').doc('2026-2027').update({
        grades_published: false,
      });
    }
  });
});
