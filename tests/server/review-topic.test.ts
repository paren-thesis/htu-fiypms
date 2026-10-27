import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { openTopic, decideTopic } from '@/app/actions/review-topic';
import { createTopicDraft, submitTopic, resubmitTopic } from '@/app/actions/submit-topic';
import { createTeamInTx } from '@/lib/teams/create-team-tx';
import { ensureContactGrants, revokeContactGrants } from '@/lib/contacts/grants';
import { getTopic } from '@/lib/models/topic/repo';
import { getTeam } from '@/lib/models/team/repo';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { Timestamp } from 'firebase-admin/firestore';
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

  // Seed staff_whitelist document
  await adminDb.collection('staff_whitelist').doc(email.toLowerCase()).set({
    email: email.toLowerCase(),
    full_name: staff.full_name,
    roles: staff.roles,
    department: staff.department,
    programmes: staff.programmes,
    is_active: true,
    added_by_uid: 'system',
    added_at: Timestamp.now(),
    user_uid: uid,
  });

  const userDoc: UserDocument = {
    uid,
    name: staff.full_name,
    email,
    role: activeRole as 'coordinator' | 'admin' | 'supervisor' | 'student' | 'panel_member',
    roles: staff.roles,
    active_role: activeRole as 'coordinator' | 'admin' | 'supervisor' | 'student' | 'panel_member',
    profile: {
      registered: true,
      profile_complete: true,
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

describe('Topic Review & Supervisor Contact Grants (FR-03.4, FR-04.4, F-03)', () => {
  const yearId = '2026-2027';

  let studentLeaderToken: string;
  let matchingSupervisorToken: string;
  let mismatchedSupervisorToken: string;
  let coordinatorToken: string;

  let teamId: string;
  let topic1Id: string;
  let topic2Id: string;

  beforeAll(async () => {
    // 1. Seed active academic year
    await upsertAcademicYear({
      id: yearId,
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

    // 2. Mint tokens
    // Student: 0323000101 (BTech CS)
    studentLeaderToken = await createStudentToken('0323000101');
    await createStudentToken('0323000102');
    await createStudentToken('0323000103');
    await createStudentToken('0323000104');
    await createStudentToken('0323000105');

    // Matching supervisor: Prof. Kwame Appiah (programmes: btech-cs, hnd-cs)
    matchingSupervisorToken = await createStaffToken('kappiah@htu.edu.gh', 'supervisor');

    // Mismatched supervisor: Dr. Ama Owusu (programmes: btech-ict, hnd-ict)
    mismatchedSupervisorToken = await createStaffToken('aowusu@htu.edu.gh', 'supervisor');

    // Coordinator: Dr. Samuel Ampofo
    coordinatorToken = await createStaffToken('coordinator@htu.edu.gh', 'coordinator');

    // 3. Create full team with 5 members for BTech CS
    const teamResult = await adminDb.runTransaction((tx) =>
      createTeamInTx(tx, {
        leaderUid: studentUid('0323000101'),
        memberUids: [studentUid('0323000101')],
        courseId: 'btech-cs',
        yearId,
        name: 'Distributed Cloud Review Team',
      })
    );
    teamId = teamResult.team.id;

    // Add members to reach 5 members
    const members = ['0323000102', '0323000103', '0323000104', '0323000105'];
    for (const idx of members) {
      const uid = studentUid(idx);
      await adminDb.collection('teams').doc(teamId).update({
        member_ids: [studentUid('0323000101'), ...members.slice(0, members.indexOf(idx) + 1).map(studentUid)],
        member_count: 2 + members.indexOf(idx),
      });
      await adminDb.collection('teams').doc(teamId).collection('members').doc(uid).set({
        uid,
        role: 'member',
        joined_at: Timestamp.now(),
      });
    }

    // 4. Create and submit Topic 1 (Rank 1)
    const t1Res = await createTopicDraft(studentLeaderToken, {
      teamId,
      title: 'Automated Microservice Observability Platform',
      preference_rank: 1,
      abstract: 'A distributed telemetry system tracking traces and metrics in cloud environments.',
      problem_statement: 'High latency and unobserved microservice failures in cloud computing.',
      proposed_solution: 'An automated telemetry pipeline utilizing eBPF and OpenTelemetry collectors.',
      tech_stack: ['Go', 'Kubernetes', 'Prometheus', 'eBPF'],
    });
    topic1Id = t1Res.topicId!;
    await submitTopic(studentLeaderToken, { topicId: topic1Id });

    // 5. Create and submit Topic 2 (Rank 2)
    const t2Res = await createTopicDraft(studentLeaderToken, {
      teamId,
      title: 'Zero Trust Authentication for IoT Edge Devices',
      preference_rank: 2,
      abstract: 'Decentralized mutual TLS architecture for resource-constrained IoT gateways.',
      problem_statement: 'Insecure communication protocols between edge IoT sensors and core servers.',
      proposed_solution: 'Lightweight cryptographic identity certificates with continuous challenge tokens.',
      tech_stack: ['Rust', 'mTLS', 'MQTT', 'Docker'],
    });
    topic2Id = t2Res.topicId!;
    await submitTopic(studentLeaderToken, { topicId: topic2Id });
  });

  describe('Authorization Rules', () => {
    it('denies a student attempting to open or decide a topic proposal', async () => {
      const openRes = await openTopic(studentLeaderToken, { topicId: topic1Id });
      expect(openRes.ok).toBe(false);
      expect(['FORBIDDEN', 'FORBIDDEN_ROLE']).toContain(openRes.code);

      const decideRes = await decideTopic(studentLeaderToken, {
        topicId: topic1Id,
        decision: 'approve',
      });
      expect(decideRes.ok).toBe(false);
      expect(['FORBIDDEN', 'FORBIDDEN_ROLE']).toContain(decideRes.code);
    });

    it('denies a supervisor of a different academic programme (403 PROGRAMME_MISMATCH)', async () => {
      // Dr. Ama Owusu (btech-ict) attempting to review a BTech CS topic
      const openRes = await openTopic(mismatchedSupervisorToken, { topicId: topic1Id });
      expect(openRes.ok).toBe(false);
      expect(openRes.code).toBe('PROGRAMME_MISMATCH');

      const decideRes = await decideTopic(mismatchedSupervisorToken, {
        topicId: topic1Id,
        decision: 'approve',
      });
      expect(decideRes.ok).toBe(false);
      expect(decideRes.code).toBe('PROGRAMME_MISMATCH');
    });

    it('allows a supervisor of the matching programme to open topic (submitted -> under_review)', async () => {
      // Prof. Kwame Appiah (btech-cs)
      const openRes = await openTopic(matchingSupervisorToken, { topicId: topic1Id });
      expect(openRes.ok).toBe(true);
      expect(openRes.status).toBe('under_review');

      const updatedTopic = await getTopic(topic1Id);
      expect(updatedTopic?.status).toBe('under_review');
    });

    it('allows a coordinator to review topic proposals across all programmes', async () => {
      // Topic 2 is in 'submitted' state
      const openRes = await openTopic(coordinatorToken, { topicId: topic2Id });
      expect(openRes.ok).toBe(true);
      expect(openRes.status).toBe('under_review');
    });
  });

  describe('Decision State Machine & Revisions', () => {
    it('requires review notes when requesting revisions or rejecting', async () => {
      const res = await decideTopic(matchingSupervisorToken, {
        topicId: topic1Id,
        decision: 'request_revision',
        review_notes: '', // missing
      });
      expect(res.ok).toBe(false);
    });

    it('successfully requests revision with notes and allows student resubmission', async () => {
      const res = await decideTopic(matchingSupervisorToken, {
        topicId: topic1Id,
        decision: 'request_revision',
        review_notes: 'Scope is too broad. Narrow evaluation benchmarks to Kubernetes clusters.',
      });
      expect(res.ok).toBe(true);
      expect(res.status).toBe('revision_requested');

      const topicAfterRev = await getTopic(topic1Id);
      expect(topicAfterRev?.status).toBe('revision_requested');
      expect(topicAfterRev?.review_notes).toContain('Kubernetes clusters');

      // Student resubmits revised proposal
      const resubmitRes = await resubmitTopic(studentLeaderToken, {
        topicId: topic1Id,
        title: 'Kubernetes Microservice Observability Platform',
        abstract: 'A distributed telemetry system tracking traces and metrics on Kubernetes.',
        problem_statement: 'High latency and unobserved microservice failures in cloud computing.',
        proposed_solution: 'An automated telemetry pipeline utilizing eBPF on Kubernetes.',
        tech_stack: ['Go', 'Kubernetes', 'Prometheus', 'eBPF'],
      });
      expect(resubmitRes.ok).toBe(true);
      expect(resubmitRes.version).toBe(2);

      const topicAfterResubmit = await getTopic(topic1Id);
      expect(topicAfterResubmit?.status).toBe('submitted');
      expect(topicAfterResubmit?.version).toBe(2);
    });

    it('supervisor approves the resubmitted proposal', async () => {
      // Open topic
      const openRes = await openTopic(matchingSupervisorToken, { topicId: topic1Id });
      expect(openRes.ok).toBe(true);

      // Approve topic
      const approveRes = await decideTopic(matchingSupervisorToken, {
        topicId: topic1Id,
        decision: 'approve',
        review_notes: 'Excellent revision. Approved for final execution.',
      });
      expect(approveRes.ok).toBe(true);
      expect(approveRes.status).toBe('approved');

      // Verify Topic doc
      const topicDoc = await getTopic(topic1Id);
      expect(topicDoc?.status).toBe('approved');

      // Verify Team doc
      const teamDoc = await getTeam(teamId);
      expect(teamDoc?.approved_topic_id).toBe(topic1Id);
      expect(teamDoc?.status).toBe('topic_approved');
    });

    it('rejects a second topic approval for the same team with 409 conflict', async () => {
      // Topic 2 is in 'submitted' state for the same team
      const approveTopic2Res = await decideTopic(matchingSupervisorToken, {
        topicId: topic2Id,
        decision: 'approve',
      });

      expect(approveTopic2Res.ok).toBe(false);
      expect(approveTopic2Res.code).toBe('TOPIC_ALREADY_APPROVED');
    });
  });

  describe('Supervisor Contact Grants Helper (FR-04.4, §8.1)', () => {
    it('does nothing when assignment is not yet accepted', async () => {
      // Currently, team has approved_topic_id, but NO assigned_supervisor_id or accepted assignment
      const grantRes = await ensureContactGrants(adminDb, teamId);
      expect(grantRes.granted).toBe(false);
      expect(grantRes.memberCount).toBe(0);

      // Verify no grant document created
      const leaderGrant = await adminDb
        .collection('supervisor_contacts')
        .doc(staffUid('kappiah@htu.edu.gh'))
        .collection('grants')
        .doc(studentUid('0323000101'))
        .get();
      expect(leaderGrant.exists).toBe(false);
    });

    it('creates contact grants for all members once assignment is accepted and topic approved', async () => {
      const supervisorId = staffUid('kappiah@htu.edu.gh');

      // Simulate phase 6 supervisor assignment & acceptance on the team doc
      await adminDb.collection('teams').doc(teamId).update({
        assigned_supervisor_id: supervisorId,
        supervisor_assignment: {
          status: 'accepted',
          assigned_at: Timestamp.now(),
        },
      });

      // Now ensureContactGrants should succeed for all team members
      const grantRes = await ensureContactGrants(adminDb, teamId);
      expect(grantRes.granted).toBe(true);
      expect(grantRes.memberCount).toBe(5);

      // Verify grant document exists for the leader and each member
      const leaderGrantSnap = await adminDb
        .collection('supervisor_contacts')
        .doc(supervisorId)
        .collection('grants')
        .doc(studentUid('0323000101'))
        .get();

      expect(leaderGrantSnap.exists).toBe(true);
      expect(leaderGrantSnap.data()?.student_id).toBe(studentUid('0323000101'));
      expect(leaderGrantSnap.data()?.team_id).toBe(teamId);

      // Verify member 2
      const member2GrantSnap = await adminDb
        .collection('supervisor_contacts')
        .doc(supervisorId)
        .collection('grants')
        .doc(studentUid('0323000102'))
        .get();
      expect(member2GrantSnap.exists).toBe(true);
    });

    it('revokes contact grants when requested', async () => {
      const supervisorId = staffUid('kappiah@htu.edu.gh');

      const revokeRes = await revokeContactGrants(adminDb, teamId);
      expect(revokeRes.revokedCount).toBe(5);

      // Verify grant is removed
      const leaderGrantSnap = await adminDb
        .collection('supervisor_contacts')
        .doc(supervisorId)
        .collection('grants')
        .doc(studentUid('0323000101'))
        .get();

      expect(leaderGrantSnap.exists).toBe(false);
    });
  });
});
