import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { getSupervisorRecommendations } from '@/app/actions/get-supervisor-recommendations';
import { proposeSupervisor } from '@/app/actions/propose-supervisor';
import { respondSupervisorAssignment } from '@/app/actions/respond-supervisor-assignment';
import { decideTopic } from '@/app/actions/review-topic';
import { createTopicDraft, submitTopic } from '@/app/actions/submit-topic';
import { createTeamInTx } from '@/lib/teams/create-team-tx';
import { ensureSupervisionDoc, supervisionDocId, getSupervision } from '@/lib/models/supervision';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { listAuditLogs } from '@/lib/models/audit-log/repo';
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

async function createTestTeam(
  leaderIndex: string,
  courseId: string,
  teamName: string,
  extraMemberIndices: string[] = []
): Promise<{ teamId: string; leaderUid: string }> {
  const allIndices = [leaderIndex, ...extraMemberIndices];
  const allUids: string[] = [];

  for (const idx of allIndices) {
    const s = fx.student(idx);
    const uid = studentUid(s.index_number);
    allUids.push(uid);
    const email = studentEmail(s.index_number);

    await adminAuth.createUser({ uid, email, displayName: s.full_name }).catch(() => {});
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
        course_id: courseId,
        index_number: s.index_number,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('users').doc(uid).set(userDoc);
  }

  const leaderUid = allUids[0]!;
  const teamId = await adminDb.runTransaction(async (tx) => {
    const res = await createTeamInTx(tx, {
      leaderUid,
      memberUids: [leaderUid],
      courseId,
      yearId: YEAR_ID,
      name: teamName,
    });
    return res.teamId;
  });

  if (extraMemberIndices.length > 0) {
    await adminDb.collection('teams').doc(teamId).update({
      member_ids: allUids,
      member_count: allUids.length,
    });
    for (let i = 1; i < allUids.length; i++) {
      const memberUid = allUids[i]!;
      await adminDb
        .collection('teams')
        .doc(teamId)
        .collection('members')
        .doc(memberUid)
        .set({
          uid: memberUid,
          role: 'member',
          joined_at: Timestamp.now(),
        });
    }
  }

  return { teamId, leaderUid };
}

describe('Supervision Model and Assignment Workflow (06-02)', () => {
  let coordinatorToken: string;
  let supervisorToken: string; // kappiah (btech-cs, hnd-cs)
  let otherSupervisorToken: string; // aowusu (btech-ict, hnd-ict)
  let coordinatorEmail: string;
  let supervisorEmail: string;
  let otherSupervisorEmail: string;
  let supervisorUid: string;
  let otherSupervisorUid: string;

  beforeAll(async () => {
    coordinatorEmail = 'coordinator@htu.edu.gh';
    supervisorEmail = 'kappiah@htu.edu.gh';
    otherSupervisorEmail = 'aowusu@htu.edu.gh';
    supervisorUid = staffUid(supervisorEmail);
    otherSupervisorUid = staffUid(otherSupervisorEmail);

    // Seed courses
    await adminDb.collection('courses').doc('btech-cs').set({
      id: 'btech-cs',
      code: 'BCS',
      name: 'BTech Computer Science',
      department: 'Computer Science',
    });
    await adminDb.collection('courses').doc('btech-ict').set({
      id: 'btech-ict',
      code: 'BICT',
      name: 'BTech ICT',
      department: 'Computer Science',
    });

    await upsertAcademicYear({
      id: YEAR_ID,
      code: '2026/2027',
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

    coordinatorToken = await createStaffToken(coordinatorEmail, 'coordinator');
    supervisorToken = await createStaffToken(supervisorEmail, 'supervisor');
    otherSupervisorToken = await createStaffToken(otherSupervisorEmail, 'supervisor');

    // Ensure initial supervision documents exist
    await ensureSupervisionDoc(supervisorUid, YEAR_ID, 5);
    await ensureSupervisionDoc(otherSupervisorUid, YEAR_ID, 5);
  });

  it('1. Programme filter and override audit', async () => {
    // Create a team in btech-cs with fixture student 0323000101
    const { teamId } = await createTestTeam('0323000101', 'btech-cs', 'Filter Test Team');

    // Recommendations test: kappiah covers btech-cs, aowusu does not
    const recs = await getSupervisorRecommendations(coordinatorToken, teamId);
    expect(recs.ok).toBe(true);
    expect(recs.recommendations).toBeDefined();

    const candidateIds = recs.recommendations!.map((r) => r.candidate.id);
    expect(candidateIds).toContain(supervisorUid); // kappiah
    expect(candidateIds).not.toContain(otherSupervisorUid); // aowusu excluded by programme filter

    // Coordinator proposes kappiah (eligible programme): succeeds without override_reason
    const validProposal = await proposeSupervisor(coordinatorToken, {
      team_id: teamId,
      supervisor_id: supervisorUid,
    });
    expect(validProposal.ok).toBe(true);

    // Create a team in btech-ict (aowusu is in btech-ict; kappiah is NOT) with student 0323000201
    const { teamId: ictTeamId } = await createTestTeam('0323000201', 'btech-ict', 'ICT Team');

    // Proposing kappiah for btech-ict without override_reason must fail
    const invalidProposal = await proposeSupervisor(coordinatorToken, {
      team_id: ictTeamId,
      supervisor_id: supervisorUid,
    });
    expect(invalidProposal.ok).toBe(false);
    expect(invalidProposal.code).toBe('PROGRAMME_MISMATCH');

    // Proposing kappiah for btech-ict WITH override_reason must succeed and log supervision.override
    const overrideReason = 'Special expertise in ML required for cross-disciplinary project';
    const overrideProposal = await proposeSupervisor(coordinatorToken, {
      team_id: ictTeamId,
      supervisor_id: supervisorUid,
      override_reason: overrideReason,
    });
    expect(overrideProposal.ok).toBe(true);

    // Verify audit log has supervision.override
    const audits = await listAuditLogs({ action: 'supervision.override', limit: 5 });
    const match = audits.items.find(
      (a) => a.target_id === ictTeamId && a.action === 'supervision.override'
    );
    expect(match).toBeDefined();
    expect(match?.metadata?.override_reason).toBe(overrideReason);
  });

  it('2. Capacity race (two accepts at count = max - 1)', async () => {
    // Set otherSupervisor max_capacity = 2 and current_assigned_count = 1
    const supDocId = supervisionDocId(otherSupervisorUid, YEAR_ID);
    await adminDb.collection('supervisions').doc(supDocId).set(
      {
        id: supDocId,
        supervisor_id: otherSupervisorUid,
        academic_year_id: YEAR_ID,
        max_capacity: 2,
        current_assigned_count: 1,
        assigned_team_ids: ['dummy-team-previous'],
        status: 'available',
        updated_at: Timestamp.now(),
      },
      { merge: true }
    );

    // Create two teams in btech-ict with fixture students 0323000202 and 0323000203
    const { teamId: teamA } = await createTestTeam('0323000202', 'btech-ict', 'Race Team A');
    const { teamId: teamB } = await createTestTeam('0323000203', 'btech-ict', 'Race Team B');

    // Propose otherSupervisor to both teams
    const propA = await proposeSupervisor(coordinatorToken, {
      team_id: teamA,
      supervisor_id: otherSupervisorUid,
    });
    expect(propA.ok).toBe(true);

    const propB = await proposeSupervisor(coordinatorToken, {
      team_id: teamB,
      supervisor_id: otherSupervisorUid,
    });
    expect(propB.ok).toBe(true);

    // Concurrently accept both assignments
    const [resA, resB] = await Promise.all([
      respondSupervisorAssignment(otherSupervisorToken, {
        team_id: teamA,
        decision: 'accept',
      }),
      respondSupervisorAssignment(otherSupervisorToken, {
        team_id: teamB,
        decision: 'accept',
      }),
    ]);

    const successes = [resA, resB].filter((r) => r.ok);
    const conflicts = [resA, resB].filter((r) => !r.ok && r.status === 409);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.code).toBe('SUPERVISOR_AT_CAPACITY');

    // Supervision record must be at capacity
    const finalSup = await getSupervision(otherSupervisorUid, YEAR_ID);
    expect(finalSup?.current_assigned_count).toBe(2);
    expect(finalSup?.status).toBe('at_capacity');
  });

  it('3. Expiry and replacement of expired proposal', async () => {
    // Fixture student 0323000102
    const { teamId: expiredTeamId } = await createTestTeam(
      '0323000102',
      'btech-cs',
      'Expiry Test Team'
    );

    // Propose supervisor
    await proposeSupervisor(coordinatorToken, {
      team_id: expiredTeamId,
      supervisor_id: supervisorUid,
    });

    // Artificially set window_expires_at into the past (expired)
    const expiredTimestamp = Timestamp.fromMillis(Date.now() - 5000);
    await adminDb.collection('teams').doc(expiredTeamId).update({
      'supervisor_assignment.window_expires_at': expiredTimestamp,
    });

    // Attempting to accept must fail with PROPOSAL_EXPIRED
    const acceptExpired = await respondSupervisorAssignment(supervisorToken, {
      team_id: expiredTeamId,
      decision: 'accept',
    });
    expect(acceptExpired.ok).toBe(false);
    expect(acceptExpired.code).toBe('PROPOSAL_EXPIRED');

    // Coordinator replaces the expired proposal: succeeds
    const replacedProposal = await proposeSupervisor(coordinatorToken, {
      team_id: expiredTeamId,
      supervisor_id: supervisorUid,
    });
    expect(replacedProposal.ok).toBe(true);
    expect(replacedProposal.windowExpiresAt).toBeDefined();
  });

  it('4. Decline path clears assigned_supervisor_id and records reason', async () => {
    // Fixture student 0323000103
    const { teamId: declineTeamId } = await createTestTeam(
      '0323000103',
      'btech-cs',
      'Decline Test Team'
    );

    await proposeSupervisor(coordinatorToken, {
      team_id: declineTeamId,
      supervisor_id: supervisorUid,
    });

    const declineReason = 'Scheduling conflict with sabbatical leaves';
    const declineRes = await respondSupervisorAssignment(supervisorToken, {
      team_id: declineTeamId,
      decision: 'decline',
      decline_reason: declineReason,
    });

    expect(declineRes.ok).toBe(true);
    expect(declineRes.decision).toBe('decline');

    // Team document verification
    const teamDoc = (
      await adminDb.collection('teams').doc(declineTeamId).get()
    ).data() as TeamDocument;
    expect(teamDoc.assigned_supervisor_id).toBeUndefined();
    expect(teamDoc.supervisor_assignment?.status).toBe('declined');
    expect(teamDoc.supervisor_assignment?.decline_reason).toBe(declineReason);
  });

  it('5. Contact grants created only after both acceptance and approved topic', async () => {
    // Subcase A: Assignment accepted first, topic not approved yet
    // Fixture students 0323000104 to 0323000107 (4 members)
    const { teamId: teamA, leaderUid: leaderA } = await createTestTeam(
      '0323000104',
      'btech-cs',
      'Grants Gate Team A',
      ['0323000105', '0323000106', '0323000107']
    );
    const studentTokenA = await createStudentToken('0323000104');

    await proposeSupervisor(coordinatorToken, {
      team_id: teamA,
      supervisor_id: supervisorUid,
    });
    const acceptA = await respondSupervisorAssignment(supervisorToken, {
      team_id: teamA,
      decision: 'accept',
    });
    expect(acceptA.ok).toBe(true);

    // Topic is NOT approved yet -> check no contact grant
    const grantSnapA = await adminDb
      .collection('supervisor_contacts')
      .doc(supervisorUid)
      .collection('grants')
      .doc(leaderA)
      .get();
    expect(grantSnapA.exists).toBe(false);

    // Create, submit and approve a topic for Team A
    const draftRes = await createTopicDraft(studentTokenA, {
      teamId: teamA,
      title: 'AI Based Attendance Tracking',
      abstract: 'Abstract for attendance tracking using face recognition.',
      problem_statement: 'Manual attendance is slow and error prone.',
      proposed_solution: 'Automated camera logging and attendance recognition.',
      tech_stack: ['python', 'opencv', 'fastapi'],
      preference_rank: 1,
    });
    expect(draftRes.ok).toBe(true);
    const topicId = draftRes.topicId!;

    await submitTopic(studentTokenA, { topicId });
    const decideRes = await decideTopic(coordinatorToken, {
      topicId,
      decision: 'approve',
      review_notes: 'Approved topic for team.',
    });
    expect(decideRes.ok).toBe(true);

    // Now topic is approved and assignment is accepted -> contact grant must exist!
    const updatedGrantA = await adminDb
      .collection('supervisor_contacts')
      .doc(supervisorUid)
      .collection('grants')
      .doc(leaderA)
      .get();
    expect(updatedGrantA.exists).toBe(true);

    // Subcase B: Topic approved first, assignment accepted second
    // Fixture students 0323000108 with extra members 0323000101-0323000103
    const { teamId: teamB, leaderUid: leaderB } = await createTestTeam(
      '0323000108',
      'btech-cs',
      'Grants Gate Team B',
      ['0323000101', '0323000102', '0323000103']
    );
    const studentTokenB = await createStudentToken('0323000108');

    // Create, submit and approve topic first
    const draftResB = await createTopicDraft(studentTokenB, {
      teamId: teamB,
      title: 'Smart Campus Waste Monitoring',
      abstract: 'IoT sensors detecting trash can overflow and bin status.',
      problem_statement: 'Litter accumulation and unoptimized trash pickup.',
      proposed_solution: 'Ultrasonic sensors with cellular reporting to dispatch.',
      tech_stack: ['iot', 'python', 'next.js'],
      preference_rank: 1,
    });
    const topicIdB = draftResB.topicId!;
    await submitTopic(studentTokenB, { topicId: topicIdB });
    await decideTopic(coordinatorToken, {
      topicId: topicIdB,
      decision: 'approve',
      review_notes: 'Great environmental IoT topic.',
    });

    // Propose supervisor
    await proposeSupervisor(coordinatorToken, {
      team_id: teamB,
      supervisor_id: supervisorUid,
    });

    // Before accepting: assignment status is 'proposed' -> grant should NOT exist yet
    const preGrantB = await adminDb
      .collection('supervisor_contacts')
      .doc(supervisorUid)
      .collection('grants')
      .doc(leaderB)
      .get();
    expect(preGrantB.exists).toBe(false);

    // Now accept assignment
    const acceptB = await respondSupervisorAssignment(supervisorToken, {
      team_id: teamB,
      decision: 'accept',
    });
    expect(acceptB.ok).toBe(true);

    // After accepting -> grant must exist!
    const postGrantB = await adminDb
      .collection('supervisor_contacts')
      .doc(supervisorUid)
      .collection('grants')
      .doc(leaderB)
      .get();
    expect(postGrantB.exists).toBe(true);
  });
});
