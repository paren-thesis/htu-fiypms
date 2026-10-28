import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { createDefensePanel } from '@/app/actions/manage-defense-panel';
import { publishDefenseSchedule } from '@/app/actions/publish-defense-schedule';
import { getDefensePanel } from '@/lib/models/defense-panel/repo';
import { listAuditLogs } from '@/lib/models/audit-log/repo';
import type { UserDocument, TeamDocument } from '@/types/firestore';
import { fx, studentEmail, studentUid, staffUid } from '../../fixtures';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';
const YEAR_ID = '2026-2027';

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
    roles: staff.roles as UserDocument['roles'],
    active_role: activeRole as UserDocument['active_role'],
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

async function createTestTeam(opts: {
  teamId: string;
  name: string;
  courseId: 'btech-cs' | 'btech-ict';
  status: 'defense_ready' | 'topic_approved' | 'formation';
  memberIndices: string[];
}): Promise<TeamDocument> {
  const memberUids: string[] = [];
  const members = opts.memberIndices.map((idx, i) => {
    const s = fx.student(idx);
    const uid = studentUid(s.index_number);
    memberUids.push(uid);

    return {
      user_uid: uid,
      index_number: s.index_number,
      full_name: s.full_name,
      role: (i === 0 ? 'leader' : 'member') as 'leader' | 'member',
      joined_at: Timestamp.now(),
    };
  });

  // Ensure user records exist
  for (const m of members) {
    const s = fx.student(m.index_number);
    await adminDb.collection('users').doc(m.user_uid).set({
      uid: m.user_uid,
      name: s.full_name,
      email: studentEmail(s.index_number),
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
    });
  }

  const teamDoc: TeamDocument = {
    id: opts.teamId,
    name: opts.name,
    group_number: opts.teamId.toUpperCase(),
    course_id: opts.courseId,
    academic_year_id: YEAR_ID,
    leader_id: memberUids[0]!,
    member_ids: memberUids,
    member_count: memberUids.length,
    max_members: 5,
    status: opts.status,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };

  await adminDb.collection('teams').doc(opts.teamId).set(teamDoc);
  return teamDoc;
}

describe('Defense Panels, Scheduling, and Conflict Detection (08-02)', () => {
  let coordinatorToken: string;
  let chairUid: string; // Prof. Kwame Appiah (programmes: btech-cs, hnd-cs)
  let examinerCsUid: string; // Dr. Yaw Boateng (programmes: btech-cs, btech-ict)
  let examinerIctUid: string; // Dr. Ama Owusu (programmes: btech-ict, hnd-ict)

  const teamCsDefenseReadyId = 'team-cs-ready';
  const teamCsDefenseReady2Id = 'team-cs-ready-2';
  const teamCsApprovedId = 'team-cs-approved';
  const teamIctReadyId = 'team-ict-ready';

  beforeAll(async () => {
    coordinatorToken = await createStaffToken('coordinator@htu.edu.gh', 'coordinator');
    await createStaffToken('kappiah@htu.edu.gh', 'panel_member');
    await createStaffToken('aowusu@htu.edu.gh', 'panel_member');
    await createStaffToken('yboateng@htu.edu.gh', 'panel_member');

    chairUid = staffUid('kappiah@htu.edu.gh');
    examinerCsUid = staffUid('yboateng@htu.edu.gh');
    examinerIctUid = staffUid('aowusu@htu.edu.gh');

    // Create test teams
    await createTestTeam({
      teamId: teamCsDefenseReadyId,
      name: 'CS Defense Ready Team 1',
      courseId: 'btech-cs',
      status: 'defense_ready',
      memberIndices: ['0323000101', '0323000102'],
    });

    await createTestTeam({
      teamId: teamCsDefenseReady2Id,
      name: 'CS Defense Ready Team 2',
      courseId: 'btech-cs',
      status: 'defense_ready',
      memberIndices: ['0323000105', '0323000106'],
    });

    await createTestTeam({
      teamId: teamCsApprovedId,
      name: 'CS Approved Team (Not Ready)',
      courseId: 'btech-cs',
      status: 'topic_approved',
      memberIndices: ['0323000103', '0323000104'],
    });

    await createTestTeam({
      teamId: teamIctReadyId,
      name: 'ICT Defense Ready Team',
      courseId: 'btech-ict',
      status: 'defense_ready',
      memberIndices: ['0323000201', '0323000202'],
    });
  });

  it('rejects cross-programme examiner assignment without justification', async () => {
    // Ama Owusu does not list btech-cs in programmes
    const result = await createDefensePanel(coordinatorToken, {
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      panel_name: 'Panel Alpha CS',
      venue: 'CS Lab 1',
      chair_id: chairUid,
      examiner_ids: [examinerIctUid],
      time_slots: [],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('CROSS_PROGRAMME_JUSTIFICATION_REQUIRED');
  });

  it('allows cross-programme examiner assignment with justification and logs audit', async () => {
    const result = await createDefensePanel(coordinatorToken, {
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      panel_name: 'Panel Alpha CS Cross',
      venue: 'CS Lab 1',
      chair_id: chairUid,
      examiner_ids: [examinerIctUid],
      cross_programme_justification: 'Dr. Owusu brings cloud computing expertise to this session.',
      time_slots: [],
    });

    expect(result.ok).toBe(true);
    expect(result.panelId).toBeDefined();

    // Verify audit log
    const { items: logs } = await listAuditLogs({ limit: 50 });
    const crossLog = logs.find(
      (l) => l.action === 'defense.cross_programme' && l.target_id === result.panelId
    );
    expect(crossLog).toBeDefined();
    expect(crossLog?.metadata?.justification).toContain('cloud computing expertise');
  });

  it('rejects slotting a team from a different course', async () => {
    const panelRes = await createDefensePanel(coordinatorToken, {
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      panel_name: 'Panel Course Check',
      venue: 'CS Room 101',
      chair_id: chairUid,
      examiner_ids: [examinerCsUid],
      time_slots: [
        {
          slot_id: 'slot-course-check-1',
          start_time: '2026-11-15T09:00:00Z',
          end_time: '2026-11-15T10:00:00Z',
          team_id: teamIctReadyId, // btech-ict team in a btech-cs panel
          status: 'scheduled',
        },
      ],
    });

    expect(panelRes.ok).toBe(false);
    expect(panelRes.code).toBe('TEAM_COURSE_MISMATCH');
  });

  it('rejects slotting a team that is not defense_ready', async () => {
    const panelRes = await createDefensePanel(coordinatorToken, {
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      panel_name: 'Panel Status Check',
      venue: 'CS Room 101',
      chair_id: chairUid,
      examiner_ids: [examinerCsUid],
      time_slots: [
        {
          slot_id: 'slot-status-check-1',
          start_time: '2026-11-15T09:00:00Z',
          end_time: '2026-11-15T10:00:00Z',
          team_id: teamCsApprovedId, // approved, NOT defense_ready
          status: 'scheduled',
        },
      ],
    });

    expect(panelRes.ok).toBe(false);
    expect(panelRes.code).toBe('TEAM_NOT_DEFENSE_READY');
  });

  it('blocks publishing when a scheduling conflict exists and returns typed conflicts', async () => {
    // Create Panel 1 with examinerCsUid in 09:00 - 10:00 at CS Lab 1
    const p1 = await createDefensePanel(coordinatorToken, {
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      panel_name: 'Conflict Panel 1',
      venue: 'CS Lab 1',
      chair_id: chairUid,
      examiner_ids: [examinerCsUid],
      time_slots: [
        {
          slot_id: 'slot-p1-1',
          start_time: '2026-11-20T09:00:00Z',
          end_time: '2026-11-20T10:00:00Z',
          team_id: teamCsDefenseReadyId,
          status: 'scheduled',
        },
      ],
    });
    expect(p1.ok).toBe(true);

    // Create Panel 2 also with examinerCsUid in 09:30 - 10:30 (overlapping!)
    const p2 = await createDefensePanel(coordinatorToken, {
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      panel_name: 'Conflict Panel 2',
      venue: 'CS Lab 2',
      chair_id: chairUid,
      examiner_ids: [examinerCsUid],
      time_slots: [
        {
          slot_id: 'slot-p2-1',
          start_time: '2026-11-20T09:30:00Z',
          end_time: '2026-11-20T10:30:00Z',
          status: 'scheduled',
        },
      ],
    });
    expect(p2.ok).toBe(true);

    // Attempting to publish Panel 1 must fail due to examiner conflict
    const pubRes = await publishDefenseSchedule(coordinatorToken, {
      panel_id: p1.panelId,
    });

    expect(pubRes.ok).toBe(false);
    expect(pubRes.code).toBe('DEFENSE_CONFLICTS');
    expect(pubRes.conflicts).toBeDefined();
    expect(pubRes.conflicts?.length).toBeGreaterThan(0);
    expect(pubRes.conflicts?.[0]?.type).toBe('examiner_double_booked');

    // Verify panel 1 is still not published
    const p1Doc = await getDefensePanel(p1.panelId!);
    expect(p1Doc?.is_published).toBeFalsy();
  });

  it('publishes successfully when conflicts are resolved, sends notifications, and writes audit', async () => {
    // Create an independent panel with no conflicts
    const panelRes = await createDefensePanel(coordinatorToken, {
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      panel_name: 'Clean Panel for Publish',
      venue: 'Auditorium CS',
      chair_id: chairUid,
      examiner_ids: [examinerCsUid],
      time_slots: [
        {
          slot_id: 'clean-slot-1',
          start_time: '2026-11-25T14:00:00Z',
          end_time: '2026-11-25T15:00:00Z',
          team_id: teamCsDefenseReady2Id,
          status: 'scheduled',
        },
      ],
    });
    expect(panelRes.ok).toBe(true);
    const panelId = panelRes.panelId!;

    // Publish
    const pubRes = await publishDefenseSchedule(coordinatorToken, {
      panel_id: panelId,
    });

    expect(pubRes.ok).toBe(true);
    expect(pubRes.publishedCount).toBe(1);

    // Verify doc state
    const publishedDoc = await getDefensePanel(panelId);
    expect(publishedDoc?.is_published).toBe(true);
    expect(publishedDoc?.published_at).toBeDefined();

    // Verify notifications:
    // 1. Staff notifications (chair & examiner)
    const staffNotifs = await adminDb
      .collection('notifications')
      .where('type', '==', 'defense_schedule')
      .where('target_url', '==', `/defense/${panelId}`)
      .get();
    expect(staffNotifs.empty).toBe(false);
    const staffUids = staffNotifs.docs.map((d) => d.data().user_id);
    expect(staffUids).toContain(chairUid);
    expect(staffUids).toContain(examinerCsUid);

    // 2. Student notification (/deliverables)
    const studentNotifs = await adminDb
      .collection('notifications')
      .where('type', '==', 'defense_schedule')
      .where('target_url', '==', '/deliverables')
      .get();
    expect(studentNotifs.empty).toBe(false);
    const studentUids = studentNotifs.docs.map((d) => d.data().user_id);
    expect(studentUids).toContain(studentUid('0323000105'));

    // 3. Verify audit log
    const { items: logs } = await listAuditLogs({ limit: 50 });
    const pubAudit = logs.find(
      (l) => l.action === 'defense.published' && l.target_id === panelId
    );
    expect(pubAudit).toBeDefined();
    expect(pubAudit?.actor_email).toBe('coordinator@htu.edu.gh');
  });
});
