import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  createTopicDraft,
  updateTopicDraft,
  submitTopic,
  resubmitTopic,
} from '@/app/actions/submit-topic';
import { createTeamInTx } from '@/lib/teams/create-team-tx';
import { getTopic, getTopicHistory } from '@/lib/models/topic/repo';
import { getTeam } from '@/lib/models/team/repo';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { Timestamp } from 'firebase-admin/firestore';
import type { UserDocument } from '@/types/firestore';
import { fx, studentEmail, studentUid } from '../../fixtures';
import { resetTestEmulator } from '../helpers/reset';

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

  try {
    await adminAuth.deleteUser(uid);
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

describe('Topic Model & Submission Server Actions (FR-03.1 - FR-03.5)', () => {
  const yearId = '2026-2027';
  let leaderToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let leaderUid: string;
  let memberUid: string;
  let teamId4Members: string;
  let teamIdSmall: string;

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

    // 2. Clean up topics and teams
    const topicsSnap = await adminDb.collection('topics').get();
    for (const d of topicsSnap.docs) {
      const hist = await d.ref.collection('history').get();
      for (const h of hist.docs) await h.ref.delete();
      await d.ref.delete();
    }

    const teamsSnap = await adminDb.collection('teams').where('academic_year_id', '==', yearId).get();
    for (const d of teamsSnap.docs) {
      const mems = await d.ref.collection('members').get();
      for (const m of mems.docs) await m.ref.delete();
      const priv = await d.ref.collection('private').get();
      for (const p of priv.docs) await p.ref.delete();
      await d.ref.delete();
    }

    // 3. Create student tokens from fixtures
    // BTech CS students
    const bcsStudents = fx.students.filter((s) => s.course_id === 'btech-cs');
    const leaderStudent = bcsStudents[0]!;
    const memberStudent = bcsStudents[1]!;
    const student3 = bcsStudents[2]!;
    const student4 = bcsStudents[3]!;
    const outsiderStudent = bcsStudents[4]!;

    leaderToken = await createStudentToken(leaderStudent.index_number);
    memberToken = await createStudentToken(memberStudent.index_number);
    outsiderToken = await createStudentToken(outsiderStudent.index_number);

    leaderUid = studentUid(leaderStudent.index_number);
    memberUid = studentUid(memberStudent.index_number);
    const uid3 = studentUid(student3.index_number);
    const uid4 = studentUid(student4.index_number);

    // 4. Create a full team of 4 members
    await adminDb.runTransaction(async (tx) => {
      const res = await createTeamInTx(tx, {
        leaderUid,
        memberUids: [leaderUid, memberUid, uid3, uid4],
        courseId: 'btech-cs',
        yearId,
        name: 'Full Capstone Group',
      });
      teamId4Members = res.teamId;
    });

    // 5. Create a small team of 2 members (< 4 members)
    const hcsStudents = fx.students.filter((s) => s.course_id === 'hnd-cs');
    const hcsLead = hcsStudents[0]!;
    const hcsMem = hcsStudents[1]!;
    const hcsLeadUid = studentUid(hcsLead.index_number);
    const hcsMemUid = studentUid(hcsMem.index_number);
    await createStudentToken(hcsLead.index_number);
    await createStudentToken(hcsMem.index_number);

    await adminDb.runTransaction(async (tx) => {
      const res = await createTeamInTx(tx, {
        leaderUid: hcsLeadUid,
        memberUids: [hcsLeadUid, hcsMemUid],
        courseId: 'hnd-cs',
        yearId,
        name: 'Small Group',
      });
      teamIdSmall = res.teamId;
    });

    // 6. Seed a historical approved topic from earlier academic year for similarity testing
    await adminDb.collection('topics').doc('historical-topic-01').set({
      title: 'Smart Campus Attendance System using IoT & RFID',
      abstract: 'An automated student attendance monitoring system using RFID cards and cloud sync.',
      problem_statement: 'Manual roll calling causes errors and instructional time loss.',
      proposed_solution: 'RFID readers at lecture entrances logging timestamps to Cloud Firestore.',
      tech_stack: ['rfid', 'iot', 'esp32', 'firebase', 'next.js'],
      preference_rank: 1,
      version: 1,
      is_current: true,
      status: 'approved',
      academic_year_id: '2025-2026',
      submitted_at: Timestamp.now(),
    });
  });

  afterAll(async () => {
    await resetTestEmulator();
  });

  it('1. Any team member can draft a proposal, but preference ranks must be unique (1, 2, 3)', async () => {
    // Member drafts Rank 1
    const draftRes1 = await createTopicDraft(memberToken, {
      teamId: teamId4Members,
      title: 'Decentralized Identity Verification for Academic Records',
      abstract: 'A privacy-preserving credentials verification platform using zero knowledge proofs.',
      problem_statement: 'Verification of academic diplomas across universities is slow and prone to forgery.',
      proposed_solution: 'Digital certificates anchored to verifiable registry contracts.',
      tech_stack: ['ethereum', 'solidity', 'react', 'typescript'],
      preference_rank: 1,
    });

    expect(draftRes1.ok).toBe(true);
    expect(draftRes1.topicId).toBeDefined();
    expect(draftRes1.status).toBe('draft');

    // Attempting to draft another proposal with Rank 1 fails with 409 DUPLICATE_RANK
    const dupRankRes = await createTopicDraft(leaderToken, {
      teamId: teamId4Members,
      title: 'Autonomous Agricultural Drone Crop Health Assessment',
      abstract: 'Multispectral aerial imaging for detecting pest infestation in regional farms.',
      problem_statement: 'Farmers lack rapid diagnostic tools for crop health assessment.',
      proposed_solution: 'Edge computer vision deployed on lightweight UAV hardware.',
      tech_stack: ['python', 'opencv', 'raspberry-pi'],
      preference_rank: 1, // Duplicate!
    });

    expect(dupRankRes.ok).toBe(false);
    expect(dupRankRes.code).toBe('DUPLICATE_RANK');

    // Drafting Rank 2 succeeds
    const draftRes2 = await createTopicDraft(leaderToken, {
      teamId: teamId4Members,
      title: 'Autonomous Agricultural Drone Crop Health Assessment',
      abstract: 'Multispectral aerial imaging for detecting pest infestation in regional farms.',
      problem_statement: 'Farmers lack rapid diagnostic tools for crop health assessment.',
      proposed_solution: 'Edge computer vision deployed on lightweight UAV hardware.',
      tech_stack: ['python', 'opencv', 'raspberry-pi'],
      preference_rank: 2,
    });
    expect(draftRes2.ok).toBe(true);
  });

  it('2. Enforces maximum of 3 active proposals per team', async () => {
    // Draft Rank 3
    const draftRes3 = await createTopicDraft(memberToken, {
      teamId: teamId4Members,
      title: 'Real-time Hospital Bed Availability Telemetry Network',
      abstract: 'Centralized emergency telemetry for regional hospital bed vacancy coordination.',
      problem_statement: 'Emergency dispatchers lack real-time visibility into bed occupancy.',
      proposed_solution: 'Secure REST endpoints and webhook dashboard for hospital nurses.',
      tech_stack: ['node.js', 'redis', 'react', 'postgresql'],
      preference_rank: 3,
    });
    expect(draftRes3.ok).toBe(true);

    // Attempting 4th proposal fails with 400 MAX_TOPICS_REACHED
    const draftRes4 = await createTopicDraft(leaderToken, {
      teamId: teamId4Members,
      title: 'Excess Fourth Project Proposal',
      abstract: 'Testing capacity boundary condition for student proposals.',
      problem_statement: 'Boundary checking for project proposal capacity.',
      proposed_solution: 'Graceful rejection by server action.',
      tech_stack: ['typescript'],
      preference_rank: 2,
    });
    expect(draftRes4.ok).toBe(false);
    expect(draftRes4.code).toBe('MAX_TOPICS_REACHED');
  });

  it('3. Rejects submission when team has fewer than 4 members', async () => {
    const hcsStudents = fx.students.filter((s) => s.course_id === 'hnd-cs');
    const hcsLeadToken = await createStudentToken(hcsStudents[0]!.index_number);

    // Draft topic in small team
    const draftRes = await createTopicDraft(hcsLeadToken, {
      teamId: teamIdSmall,
      title: 'Understaffed Team Small Project',
      abstract: 'A proposal created by a team with only two members.',
      problem_statement: 'Team lacks sufficient members to proceed with capstone.',
      proposed_solution: 'Should be rejected upon submission attempt.',
      tech_stack: ['react', 'firebase'],
      preference_rank: 1,
    });
    expect(draftRes.ok).toBe(true);

    // Leader submits -> rejected because team has 2 < 4 members
    const submitRes = await submitTopic(hcsLeadToken, { topicId: draftRes.topicId! });
    expect(submitRes.ok).toBe(false);
    expect(submitRes.code).toBe('INSUFFICIENT_MEMBERS');
  });

  it('4. Rejects submission by non-leader members or outsiders', async () => {
    // Find topic with Rank 1
    const topicsSnap = await adminDb
      .collection('topics')
      .where('team_id', '==', teamId4Members)
      .where('preference_rank', '==', 1)
      .get();
    const topic1Id = topicsSnap.docs[0]!.id;

    // Non-leader member tries to submit
    const memSubmitRes = await submitTopic(memberToken, { topicId: topic1Id });
    expect(memSubmitRes.ok).toBe(false);
    expect(memSubmitRes.code).toBe('FORBIDDEN_NOT_LEADER');

    // Outsider tries to submit
    const outsiderSubmitRes = await submitTopic(outsiderToken, { topicId: topic1Id });
    expect(outsiderSubmitRes.ok).toBe(false);
    expect(outsiderSubmitRes.code).toBe('FORBIDDEN_NOT_TEAM_MEMBER');
  });

  it('5. Leader submits proposal: flips team to topic_pending and flags high similarity', async () => {
    // Draft a proposal that overlaps heavily with historical-topic-01
    const similarDraftRes = await createTopicDraft(leaderToken, {
      teamId: teamId4Members,
      title: 'IoT RFID Smart Campus Attendance System',
      abstract: 'Student attendance monitoring with cloud-connected RFID badges.',
      problem_statement: 'Manual attendance is slow and inaccurate.',
      proposed_solution: 'RFID card readers stationed at lecture halls.',
      tech_stack: ['rfid', 'iot', 'esp32', 'firebase', 'next.js'],
      preference_rank: 1, // Will update draft 1
    });

    let targetTopicId = '';
    if (similarDraftRes.ok) {
      targetTopicId = similarDraftRes.topicId!;
    } else {
      // Update existing Rank 1 draft with overlapping keywords
      const topicsSnap = await adminDb
        .collection('topics')
        .where('team_id', '==', teamId4Members)
        .where('preference_rank', '==', 1)
        .get();
      targetTopicId = topicsSnap.docs[0]!.id;

      await updateTopicDraft(leaderToken, {
        topicId: targetTopicId,
        title: 'IoT RFID Smart Campus Attendance System',
        tech_stack: ['rfid', 'iot', 'esp32', 'firebase', 'next.js'],
      });
    }

    // Verify team is in formation
    const teamBefore = await getTeam(teamId4Members);
    expect(teamBefore!.status).toBe('formation');

    // Leader submits proposal
    const submitRes = await submitTopic(leaderToken, { topicId: targetTopicId });
    expect(submitRes.ok).toBe(true);
    expect(submitRes.status).toBe('submitted');

    // Verify team.status flipped to topic_pending
    const teamAfter = await getTeam(teamId4Members);
    expect(teamAfter!.status).toBe('topic_pending');

    // Verify similarity warning was returned and score >= 0.6
    expect(submitRes.warnings).toBeDefined();
    expect(submitRes.warnings!.length).toBeGreaterThanOrEqual(1);
    expect(submitRes.warnings![0]!.topic_id).toBe('historical-topic-01');
    expect(submitRes.warnings![0]!.score).toBeGreaterThanOrEqual(0.6);
  });

  it('6. Resubmission writes snapshot to topics/{id}/history and increments version', async () => {
    // Find submitted topic
    const topicsSnap = await adminDb
      .collection('topics')
      .where('team_id', '==', teamId4Members)
      .where('status', '==', 'submitted')
      .get();
    const topicDoc = topicsSnap.docs[0]!;
    const topicId = topicDoc.id;

    // Simulate supervisor review: set status to 'revision_requested'
    await adminDb.collection('topics').doc(topicId).update({
      status: 'revision_requested',
      review_notes: 'Please enhance the security section and specify hardware component models.',
      reviewed_at: Timestamp.now(),
    });

    const topicBefore = await getTopic(topicId);
    expect(topicBefore!.status).toBe('revision_requested');
    expect(topicBefore!.version).toBe(1);

    // Leader resubmits proposal with revised abstract and solution
    const resubmitRes = await resubmitTopic(leaderToken, {
      topicId,
      abstract: 'Enhanced student attendance telemetry with encrypted RFID credentials and anti-cloning.',
      proposed_solution: 'ESP32 microcontrollers with cryptographic security elements.',
    });

    expect(resubmitRes.ok).toBe(true);
    expect(resubmitRes.status).toBe('submitted');
    expect(resubmitRes.version).toBe(2);

    // Verify current topic doc has version 2, submitted status, is_current true
    const topicAfter = await getTopic(topicId);
    expect(topicAfter!.version).toBe(2);
    expect(topicAfter!.status).toBe('submitted');
    expect(topicAfter!.is_current).toBe(true);
    expect(topicAfter!.abstract).toContain('encrypted RFID credentials');

    // Verify history subcollection contains version 1 snapshot
    const history = await getTopicHistory(topicId);
    expect(history).toHaveLength(1);
    expect(history[0]!.versionId).toBe('1');
    expect(history[0]!.version).toBe(1);
    expect(history[0]!.status).toBe('revision_requested');
    expect(history[0]!.review_notes).toBe(
      'Please enhance the security section and specify hardware component models.'
    );
  });
});
