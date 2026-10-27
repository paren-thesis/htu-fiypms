import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { createTeam } from '@/app/actions/create-team';
import { joinTeam } from '@/app/actions/join-team';
import { renameTeam } from '@/app/actions/rename-team';
import { createTeamInTx } from '@/lib/teams/create-team-tx';
import { getTeam, getTeamInviteCode, getTeamMembers } from '@/lib/models/team/repo';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import { getCoursePrefix, formatGroupNumber } from '@/lib/teams/invite-code';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { UserDocument } from '@/types/firestore';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

async function createStudentToken(
  uid: string,
  email: string,
  courseId: string
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
    roles: ['student'],
    activeRole: 'student',
    registered: true,
    profileComplete: true,
  });

  // Write user document
  const userDoc: UserDocument = {
    uid,
    name: `Student ${uid}`,
    email,
    role: 'student',
    roles: ['student'],
    active_role: 'student',
    profile: {
      registered: true,
      profile_complete: true,
      course_id: courseId,
      index_number: `032308${uid.slice(-4).padStart(4, '0')}`,
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

describe('Server Actions & Team Model (Spec FR-02.1 - FR-02.5a, F-06, F-14)', () => {
  const yearId = '2026-2027';

  beforeAll(async () => {
    // Seed active academic year
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

    // Reset counters for the test
    await adminDb.collection('academic_years').doc(yearId).collection('counters').doc('btech-cs').delete();
    await adminDb.collection('academic_years').doc(yearId).collection('counters').doc('btech-ict').delete();
    await adminDb.collection('academic_years').doc(yearId).collection('counters').doc('hnd-cs').delete();
    await adminDb.collection('academic_years').doc(yearId).collection('counters').doc('hnd-ict').delete();

    // Clean up all teams and invite codes for a clean test run
    const teamsSnap = await adminDb.collection('teams').where('academic_year_id', '==', yearId).get();
    for (const doc of teamsSnap.docs) {
      const mems = await doc.ref.collection('members').get();
      for (const m of mems.docs) await m.ref.delete();
      const priv = await doc.ref.collection('private').get();
      for (const p of priv.docs) await p.ref.delete();
      await doc.ref.delete();
    }

    const invitesSnap = await adminDb.collection('invite_codes').get();
    for (const doc of invitesSnap.docs) {
      await doc.ref.delete();
    }
  });

  it('1. Derives group number prefix strictly from course_id (FR-02.5a)', () => {
    expect(getCoursePrefix('btech-cs')).toBe('BCS');
    expect(getCoursePrefix('btech-ict')).toBe('BICT');
    expect(getCoursePrefix('hnd-cs')).toBe('HCS');
    expect(getCoursePrefix('hnd-ict')).toBe('HICT');

    expect(formatGroupNumber('btech-cs', yearId, 1)).toBe('BCS26_01');
    expect(formatGroupNumber('btech-ict', yearId, 2)).toBe('BICT26_02');
    expect(formatGroupNumber('hnd-cs', yearId, 12)).toBe('HCS26_12');
    expect(formatGroupNumber('hnd-ict', yearId, 5)).toBe('HICT26_05');
  });

  it('2. Student creates a team with derived course_id, group_number, and hidden invite code (F-06)', async () => {
    const student1Token = await createStudentToken('std-lead-1', 'lead1@htu.edu.gh', 'btech-cs');

    const res = await createTeam(student1Token, { name: 'Alpha Tech Innovators' });
    expect(res.ok).toBe(true);
    expect(res.teamId).toBeDefined();
    expect(res.groupNumber).toBe('BCS26_01');
    expect(res.inviteCode).toHaveLength(6);

    const team = await getTeam(res.teamId!);
    expect(team).not.toBeNull();
    expect(team!.name).toBe('Alpha Tech Innovators');
    expect(team!.course_id).toBe('btech-cs');
    expect(team!.academic_year_id).toBe(yearId);
    expect(team!.leader_id).toBe('std-lead-1');
    expect(team!.member_ids).toEqual(['std-lead-1']);
    expect(team!.member_count).toBe(1);
    expect(team!.status).toBe('formation');

    // Verify F-06: invite code is NEVER on the team document itself
    expect((team as unknown as Record<string, unknown>).invite_code).toBeUndefined();

    // Verify private invite copy exists
    const privateCode = await getTeamInviteCode(res.teamId!);
    expect(privateCode).toBe(res.inviteCode);

    // Verify member subcollection
    const members = await getTeamMembers(res.teamId!);
    expect(members).toHaveLength(1);
    expect(members[0]!.uid).toBe('std-lead-1');
    expect(members[0]!.role).toBe('leader');
  });

  it('3. Course mismatch rejects join with 409 and exact spec message (FR-02.4a)', async () => {
    // Team leader is in btech-cs
    const leadToken = await createStudentToken('std-bcs-lead', 'bcslead@htu.edu.gh', 'btech-cs');
    const createRes = await createTeam(leadToken, { name: 'BCS Core Group' });
    expect(createRes.ok).toBe(true);

    // Mismatched student in btech-ict tries to join
    const ictStudentToken = await createStudentToken('std-ict-joiner', 'ictjoin@htu.edu.gh', 'btech-ict');
    const joinRes = await joinTeam(ictStudentToken, { inviteCode: createRes.inviteCode! });

    expect(joinRes.ok).toBe(false);
    expect(joinRes.status).toBe(409);
    expect(joinRes.code).toBe('COURSE_MISMATCH');
    expect(joinRes.error).toBe(
      'This team belongs to a different programme. You can only join teams in your own course track.'
    );
  });

  it('4. Same-course student joins team successfully', async () => {
    const leadToken = await createStudentToken('std-bcs-lead-2', 'bcslead2@htu.edu.gh', 'btech-cs');
    const createRes = await createTeam(leadToken, { name: 'BCS Project Two' });
    expect(createRes.ok).toBe(true);

    const peerToken = await createStudentToken('std-bcs-member-1', 'bcsmem1@htu.edu.gh', 'btech-cs');
    const joinRes = await joinTeam(peerToken, { inviteCode: createRes.inviteCode! });

    expect(joinRes.ok).toBe(true);
    expect(joinRes.teamId).toBe(createRes.teamId);

    const team = await getTeam(createRes.teamId!);
    expect(team!.member_count).toBe(2);
    expect(team!.member_ids).toContain('std-bcs-member-1');

    const members = await getTeamMembers(createRes.teamId!);
    expect(members).toHaveLength(2);
    const peerMember = members.find((m) => m.uid === 'std-bcs-member-1');
    expect(peerMember).toBeDefined();
    expect(peerMember!.role).toBe('member');
  });

  it('5. Full team rejects additional members with 400 (FR-02.4 cap: 5)', async () => {
    const leadToken = await createStudentToken('std-cap-lead', 'caplead@htu.edu.gh', 'hnd-cs');
    const createRes = await createTeam(leadToken, { name: 'HND Max Group' });

    // Join 4 more students (total 5)
    for (let i = 1; i <= 4; i++) {
      const memToken = await createStudentToken(`std-cap-mem-${i}`, `capmem${i}@htu.edu.gh`, 'hnd-cs');
      const jRes = await joinTeam(memToken, { inviteCode: createRes.inviteCode! });
      expect(jRes.ok).toBe(true);
    }

    const team = await getTeam(createRes.teamId!);
    expect(team!.member_count).toBe(5);

    // 6th student tries to join
    const excessToken = await createStudentToken('std-cap-mem-6', 'capmem6@htu.edu.gh', 'hnd-cs');
    const excessRes = await joinTeam(excessToken, { inviteCode: createRes.inviteCode! });

    expect(excessRes.ok).toBe(false);
    expect(excessRes.status).toBe(400);
    expect(excessRes.code).toBe('TEAM_FULL');
    expect(excessRes.error).toContain('maximum 5 members');
  });

  it('6. Double membership rejected: cannot create or join multiple active teams in the same year (FR-02.5)', async () => {
    const token = await createStudentToken('std-double-1', 'double1@htu.edu.gh', 'btech-ict');
    const createRes1 = await createTeam(token, { name: 'First Team' });
    expect(createRes1.ok).toBe(true);

    // Cannot create second team
    const createRes2 = await createTeam(token, { name: 'Second Team' });
    expect(createRes2.ok).toBe(false);
    expect(createRes2.status).toBe(409);
    expect(createRes2.code).toBe('ALREADY_IN_TEAM');

    // Another leader creates a team
    const otherLeaderToken = await createStudentToken('std-other-lead', 'otherlead@htu.edu.gh', 'btech-ict');
    const otherTeamRes = await createTeam(otherLeaderToken, { name: 'Other Team' });
    expect(otherTeamRes.ok).toBe(true);

    // First student cannot join second team
    const joinRes = await joinTeam(token, { inviteCode: otherTeamRes.inviteCode! });
    expect(joinRes.ok).toBe(false);
    expect(joinRes.status).toBe(409);
    expect(joinRes.code).toBe('ALREADY_IN_TEAM');
  });

  it('7. Five parallel team creations in one course produce five unique sequential group numbers (F-14)', async () => {
    // Reset btech-ict counter for clear 01-05 sequence
    await adminDb.collection('academic_years').doc(yearId).collection('counters').doc('btech-ict').set({
      next_sequence: 1,
    });

    const tokens = await Promise.all([
      createStudentToken('std-conc-1', 'conc1@htu.edu.gh', 'btech-ict'),
      createStudentToken('std-conc-2', 'conc2@htu.edu.gh', 'btech-ict'),
      createStudentToken('std-conc-3', 'conc3@htu.edu.gh', 'btech-ict'),
      createStudentToken('std-conc-4', 'conc4@htu.edu.gh', 'btech-ict'),
      createStudentToken('std-conc-5', 'conc5@htu.edu.gh', 'btech-ict'),
    ]);

    // Launch all 5 team creations in parallel
    const results = await Promise.all(
      tokens.map((token, idx) =>
        createTeam(token, { name: `Concurrent Team ${idx + 1}` })
      )
    );

    for (const res of results) {
      expect(res.ok).toBe(true);
    }

    const groupNumbers = results.map((r) => r.groupNumber!).sort();
    expect(groupNumbers).toHaveLength(5);
    expect(new Set(groupNumbers).size).toBe(5); // Strictly unique
    expect(groupNumbers).toEqual([
      'BICT26_01',
      'BICT26_02',
      'BICT26_03',
      'BICT26_04',
      'BICT26_05',
    ]);
  });

  it('8. Invite-code collision retry mechanism handles collisions gracefully', async () => {
    // Ensure 222222 is free and 555555 is occupied
    await adminDb.collection('invite_codes').doc('222222').delete();
    const collidedCode = '555555';
    await adminDb.collection('invite_codes').doc(collidedCode).set({
      code: collidedCode,
      team_id: 'fake-collided-team',
      created_at: FieldValue.serverTimestamp(),
    });

    // Mock RNG: 1st attempt generates '555555' (which collides), 2nd attempt generates '222222' (free)
    let callCount = 0;
    const mockRng = () => {
      callCount++;
      return callCount <= 6 ? 0.1 : 0.0;
    };

    // Call createTeamInTx directly with collision simulation
    await adminDb.runTransaction(async (tx) => {
      const res = await createTeamInTx(tx, {
        leaderUid: 'std-collision-lead',
        memberUids: ['std-collision-lead'],
        courseId: 'hnd-ict',
        yearId,
        name: 'Retry Resilient Team',
        rng: mockRng,
      });

      expect(res.inviteCode).toBe('222222');
      expect(callCount).toBe(12); // Exactly 6 calls for attempt 1 + 6 calls for attempt 2
    });
  });

  it('9. Leader may rename the team, non-leader is rejected with 403 (F-05)', async () => {
    const leadToken = await createStudentToken('std-rename-lead', 'renamelead@htu.edu.gh', 'btech-cs');
    const createRes = await createTeam(leadToken, { name: 'Initial Group Name' });

    const memberToken = await createStudentToken('std-rename-mem', 'renamemem@htu.edu.gh', 'btech-cs');
    await joinTeam(memberToken, { inviteCode: createRes.inviteCode! });

    // Non-leader attempts rename
    const failRes = await renameTeam(memberToken, {
      teamId: createRes.teamId!,
      name: 'Hacked Team Name',
    });
    expect(failRes.ok).toBe(false);
    expect(failRes.status).toBe(403);
    expect(failRes.code).toBe('FORBIDDEN_NOT_LEADER');

    // Leader renames successfully
    const successRes = await renameTeam(leadToken, {
      teamId: createRes.teamId!,
      name: 'Official Capstone Team',
    });
    expect(successRes.ok).toBe(true);

    const team = await getTeam(createRes.teamId!);
    expect(team!.name).toBe('Official Capstone Team');
  });
});
