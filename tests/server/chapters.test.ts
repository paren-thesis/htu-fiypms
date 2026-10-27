import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { submitChapter } from '@/app/actions/submit-chapter';
import { reviewChapter } from '@/app/actions/review-chapter';
import { createTeamInTx } from '@/lib/teams/create-team-tx';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { getChapter } from '@/lib/models/chapter';
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
      index_number: s.index_number,
      course_id: s.course_id,
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

async function createStaffToken(email: string, activeRole = 'supervisor'): Promise<string> {
  const staff = fx.staffByEmail(email);
  const uid = staffUid(staff.email);

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

    await adminDb.collection('users').doc(uid).set({
      uid,
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

  if (allUids.length > 1) {
    await adminDb.collection('teams').doc(teamId).update({
      member_ids: allUids,
      member_count: allUids.length,
    });
  }

  return { teamId, leaderUid };
}

describe('Chapter Model and Review Workflow (07-01)', () => {
  beforeAll(async () => {
    await upsertAcademicYear({
      id: YEAR_ID,
      code: '2026/2027',
      semester: 2,
      deadlines: {
        roster_import_deadline: Timestamp.now(),
        team_formation_deadline: Timestamp.now(),
        topic_submission_deadline: Timestamp.now(),
        chapters_deadline: Timestamp.now(),
        defense_start_date: Timestamp.now(),
        defense_end_date: Timestamp.now(),
      },
      is_active: true,
    });
  });

  it('1. Sequence enforcement and URL validation', async () => {
    const leaderIndex = '0323000101';
    const courseId = 'btech-cs';
    const { teamId } = await createTestTeam(leaderIndex, courseId, 'Alpha Sequential Team');
    const studentToken = await createStudentToken(leaderIndex);

    // Attempt to submit without accepted supervisor
    const noSupRes = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: 'https://drive.google.com/file/d/test1/view',
    });
    expect(noSupRes.ok).toBe(false);
    expect(noSupRes.code).toBe('SUPERVISOR_NOT_ACCEPTED');

    // Assign supervisor and approve topic
    const supEmail = 'kappiah@htu.edu.gh';
    const supUid = staffUid(supEmail);
    await createStaffToken(supEmail, 'supervisor');

    await adminDb.collection('teams').doc(teamId).update({
      assigned_supervisor_id: supUid,
      supervisor_assignment: {
        status: 'accepted',
        proposed_by: 'system',
        proposed_at: Timestamp.now(),
        window_expires_at: Timestamp.fromMillis(Date.now() + 86400000),
      },
      approved_topic_id: 'topic-123',
      status: 'topic_approved',
    });

    // Attempt with Dropbox link (Acceptance: A Dropbox or http link is rejected)
    const dropboxRes = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: 'https://dropbox.com/s/xyz/doc.docx',
    });
    expect(dropboxRes.ok).toBe(false);
    expect(dropboxRes.code).toBe('INVALID_DOCUMENT_URL');

    // Attempt with http link
    const httpRes = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: 'http://drive.google.com/file/d/test1/view',
    });
    expect(httpRes.ok).toBe(false);
    expect(httpRes.code).toBe('INVALID_DOCUMENT_URL');

    // Attempt to submit Chapter 3 before Chapter 2 is approved (Acceptance: Submitting chapter 3 before chapter 2 is approved returns an error)
    const ch3Res = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 3,
      document_url: 'https://drive.google.com/file/d/ch3/view',
    });
    expect(ch3Res.ok).toBe(false);
    expect(ch3Res.code).toBe('PREVIOUS_CHAPTER_NOT_APPROVED');

    // Submit Chapter 1 with valid Google Drive link -> succeeds
    const ch1Res = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: 'https://drive.google.com/file/d/ch1/view',
    });
    expect(ch1Res.ok).toBe(true);
    expect(ch1Res.version).toBe(1);
    expect(ch1Res.status).toBe('pending');

    const ch1Doc = await getChapter(teamId, 1);
    expect(ch1Doc).not.toBeNull();
    expect(ch1Doc?.title).toBe('Chapter 1: Introduction');
    expect(ch1Doc?.history).toEqual([]);
  });

  it('2. Review workflow, supervisor permissions, and line-item feedback', async () => {
    const leaderIndex = '0323000102';
    const courseId = 'btech-cs';
    const { teamId } = await createTestTeam(leaderIndex, courseId, 'Beta Review Team');
    const studentToken = await createStudentToken(leaderIndex);

    const supEmail = 'kappiah@htu.edu.gh';
    const supUid = staffUid(supEmail);
    const supToken = await createStaffToken(supEmail, 'supervisor');

    const otherSupEmail = 'aowusu@htu.edu.gh';
    const otherSupToken = await createStaffToken(otherSupEmail, 'supervisor');

    await adminDb.collection('teams').doc(teamId).update({
      assigned_supervisor_id: supUid,
      supervisor_assignment: {
        status: 'accepted',
        proposed_by: 'system',
        proposed_at: Timestamp.now(),
        window_expires_at: Timestamp.fromMillis(Date.now() + 86400000),
      },
      approved_topic_id: 'topic-beta',
      status: 'topic_approved',
    });

    // Student submits Chapter 1
    await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: 'https://1drv.ms/w/s!test-chapter-1',
    });

    // Unauthorized supervisor attempts to review -> 403
    const unauthReview = await reviewChapter(otherSupToken, {
      team_id: teamId,
      chapter_number: 1,
      decision: 'approved',
    });
    expect(unauthReview.ok).toBe(false);
    expect(unauthReview.code).toBe('NOT_ASSIGNED_SUPERVISOR');

    // Assigned supervisor reviews with revision_needed and line-item feedback
    const reviewRes = await reviewChapter(supToken, {
      team_id: teamId,
      chapter_number: 1,
      decision: 'revision_needed',
      feedback: [
        { content: 'Expand problem statement in section 1.2' },
        { content: 'Add quantitative project objectives' },
      ],
      review_notes: 'Overall promising draft, but requires stronger methodology motivation.',
    });
    expect(reviewRes.ok).toBe(true);
    expect(reviewRes.status).toBe('revision_needed');

    const ch1Doc = await getChapter(teamId, 1);
    expect(ch1Doc?.status).toBe('revision_needed');
    expect(ch1Doc?.feedback.length).toBe(3);
    expect(ch1Doc?.reviewed_at).toBeDefined();
  });

  it('3. Resubmission and history growth (Spec amendment A3)', async () => {
    const leaderIndex = '0323000103';
    const courseId = 'btech-cs';
    const { teamId } = await createTestTeam(leaderIndex, courseId, 'Gamma History Team');
    const studentToken = await createStudentToken(leaderIndex);

    const supEmail = 'kappiah@htu.edu.gh';
    const supUid = staffUid(supEmail);
    const supToken = await createStaffToken(supEmail, 'supervisor');

    await adminDb.collection('teams').doc(teamId).update({
      assigned_supervisor_id: supUid,
      supervisor_assignment: {
        status: 'accepted',
        proposed_by: 'system',
        proposed_at: Timestamp.now(),
        window_expires_at: Timestamp.fromMillis(Date.now() + 86400000),
      },
      approved_topic_id: 'topic-gamma',
      status: 'topic_approved',
    });

    // Initial submission (v1)
    const initialUrl = 'https://docs.google.com/document/d/gamma-v1/edit';
    await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: initialUrl,
    });

    // Mark as revision_needed
    await reviewChapter(supToken, {
      team_id: teamId,
      chapter_number: 1,
      decision: 'revision_needed',
      review_notes: 'Please address review comments.',
    });

    // Resubmit with new link (v2) -> pushes prior snapshot to history[]
    const resubmitUrl = 'https://docs.google.com/document/d/gamma-v2/edit';
    const resubmitRes = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: resubmitUrl,
    });
    expect(resubmitRes.ok).toBe(true);
    expect(resubmitRes.version).toBe(2);
    expect(resubmitRes.status).toBe('pending');

    const chDocV2 = await getChapter(teamId, 1);
    expect(chDocV2?.version).toBe(2);
    expect(chDocV2?.document_url).toBe(resubmitUrl);
    expect(chDocV2?.status).toBe('pending');
    expect(chDocV2?.history.length).toBe(1);
    expect(chDocV2?.history?.[0]?.version).toBe(1);
    expect(chDocV2?.history?.[0]?.document_url).toBe(initialUrl);
    expect(chDocV2?.history?.[0]?.status).toBe('revision_needed');

    // Attempting to resubmit while pending fails
    const pendingResubmit = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 1,
      document_url: 'https://docs.google.com/document/d/gamma-v3/edit',
    });
    expect(pendingResubmit.ok).toBe(false);
    expect(pendingResubmit.code).toBe('CHAPTER_PENDING_REVIEW');
  });

  it('4. Full sequential approval through Chapter 5 and defense_ready transition', async () => {
    const leaderIndex = '0323000104';
    const courseId = 'btech-cs';
    const { teamId } = await createTestTeam(leaderIndex, courseId, 'Delta Final Team');
    const studentToken = await createStudentToken(leaderIndex);

    const supEmail = 'kappiah@htu.edu.gh';
    const supUid = staffUid(supEmail);
    const supToken = await createStaffToken(supEmail, 'supervisor');

    await adminDb.collection('teams').doc(teamId).update({
      assigned_supervisor_id: supUid,
      supervisor_assignment: {
        status: 'accepted',
        proposed_by: 'system',
        proposed_at: Timestamp.now(),
        window_expires_at: Timestamp.fromMillis(Date.now() + 86400000),
      },
      approved_topic_id: 'topic-delta',
      status: 'topic_approved',
    });

    // Sequentially submit and approve Chapters 1 to 4
    for (let ch = 1; ch <= 4; ch++) {
      const submitRes = await submitChapter(studentToken, {
        team_id: teamId,
        chapter_number: ch as 1 | 2 | 3 | 4,
        document_url: `https://htu-my.sharepoint.com/personal/student/ch${ch}.docx`,
      });
      expect(submitRes.ok).toBe(true);

      const reviewRes = await reviewChapter(supToken, {
        team_id: teamId,
        chapter_number: ch as 1 | 2 | 3 | 4,
        decision: 'approved',
      });
      expect(reviewRes.ok).toBe(true);
    }

    // Verify team is still topic_approved before chapter 5
    const preCh5Team = (await adminDb.collection('teams').doc(teamId).get()).data() as TeamDocument;
    expect(preCh5Team.status).toBe('topic_approved');

    // Submit Chapter 5
    const ch5Submit = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 5,
      document_url: 'https://htu-my.sharepoint.com/personal/student/ch5.docx',
    });
    expect(ch5Submit.ok).toBe(true);

    // Approve Chapter 5 -> triggers automatic transition to defense_ready
    const ch5Review = await reviewChapter(supToken, {
      team_id: teamId,
      chapter_number: 5,
      decision: 'approved',
      review_notes: 'Full capstone project approved for departmental oral defense.',
    });
    expect(ch5Review.ok).toBe(true);
    expect(ch5Review.teamStatus).toBe('defense_ready');

    const postCh5Team = (await adminDb.collection('teams').doc(teamId).get()).data() as TeamDocument;
    expect(postCh5Team.status).toBe('defense_ready');

    // Approved chapters cannot be resubmitted
    const ch5Resubmit = await submitChapter(studentToken, {
      team_id: teamId,
      chapter_number: 5,
      document_url: 'https://htu-my.sharepoint.com/personal/student/ch5-attempt.docx',
    });
    expect(ch5Resubmit.ok).toBe(false);
    expect(ch5Resubmit.code).toBe('CHAPTER_ALREADY_APPROVED');
  });
});
