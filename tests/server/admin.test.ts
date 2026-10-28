import { describe, it, expect, beforeAll } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  updateRoles,
  forceRevokeSession,
  changeStudentCourse,
  queryAuditLogs,
} from '@/app/actions/admin-users';
import {
  changeMaxMembers,
  transferMember,
  disbandTeam,
} from '@/app/actions/admin-team-override';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
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

  // Also seed roster entry
  await adminDb
    .collection('rosters')
    .doc(YEAR_ID)
    .collection('students')
    .doc(s.index_number)
    .set({
      index_number: s.index_number,
      full_name: s.full_name,
      contact: s.contact,
      email,
      course_id: s.course_id,
      imported_by_uid: 'system',
      imported_at: Timestamp.now(),
      import_batch_id: 'batch-admin-test',
      user_uid: uid,
      signup_completed_at: Timestamp.now(),
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

async function createStaffToken(email: string, activeRole?: string): Promise<string> {
  const staff = fx.staffByEmail(email);
  const uid = staffUid(staff.email);
  const chosenRole = activeRole || staff.roles[0] || 'supervisor';

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
    activeRole: chosenRole,
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
    role: (staff.roles[0] as UserDocument['role']) || 'supervisor',
    roles: staff.roles as UserDocument['roles'],
    active_role: chosenRole as UserDocument['active_role'],
    profile: {
      registered: true,
      profile_complete: true,
      staff_id: `STAFF-${uid}`,
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

describe('Admin Users, Team Overrides & Audit Log Viewer (12-03)', () => {
  let adminToken: string;
  let coordinatorToken: string;
  let studentToken: string;

  const adminUid = staffUid('admin@htu.edu.gh');
  const supUid = staffUid('kappiah@htu.edu.gh');
  const sup2Uid = staffUid('yboateng@htu.edu.gh');

  // CS students
  const csStudent1 = fx.student('0323000101');
  const csStudent2 = fx.student('0323000102');
  const csStudent3 = fx.student('0323000106');
  const csStudentUnassigned = fx.student('0323000105');

  // ICT student
  const ictStudent1 = fx.student('0323000201');

  const csUid1 = studentUid(csStudent1.index_number);
  const csUid2 = studentUid(csStudent2.index_number);
  const csUid3 = studentUid(csStudent3.index_number);
  const csUidUnassigned = studentUid(csStudentUnassigned.index_number);
  const ictUid1 = studentUid(ictStudent1.index_number);

  const teamCs1Id = 'team-admin-cs-1';
  const teamCs2Id = 'team-admin-cs-2';
  const teamIct1Id = 'team-admin-ict-1';

  beforeAll(async () => {
    await upsertAcademicYear({
      id: YEAR_ID,
      code: '2026/2027',
      semester: 2,
      is_active: true,
      deadlines: {
        roster_import_deadline: new Date('2026-11-01'),
        team_formation_deadline: new Date('2026-11-15'),
        topic_submission_deadline: new Date('2026-11-30'),
        chapters_deadline: new Date('2027-04-01'),
        defense_start_date: new Date('2027-05-01'),
        defense_end_date: new Date('2027-05-15'),
      },
    });

    // Ensure no leftover extra admin users exist before testing the last-admin guard
    const existingAdmins = await adminDb
      .collection('users')
      .where('roles', 'array-contains', 'admin')
      .get();
    for (const d of existingAdmins.docs) {
      if (d.id !== adminUid) {
        await d.ref.update({ roles: ['supervisor'], role: 'supervisor' });
      }
    }

    adminToken = await createStaffToken('admin@htu.edu.gh', 'admin');
    coordinatorToken = await createStaffToken('coordinator@htu.edu.gh', 'coordinator');
    await createStaffToken('kappiah@htu.edu.gh', 'supervisor');
    await createStaffToken('yboateng@htu.edu.gh', 'supervisor');

    studentToken = await createStudentToken(csStudent1.index_number);
    await createStudentToken(csStudent2.index_number);
    await createStudentToken(csStudent3.index_number);
    await createStudentToken(csStudentUnassigned.index_number);
    await createStudentToken(ictStudent1.index_number);

    // Ensure csStudentUnassigned is not in any active team from earlier test files
    const priorTeamsSnap = await adminDb
      .collection('teams')
      .where('member_ids', 'array-contains', csUidUnassigned)
      .get();
    for (const d of priorTeamsSnap.docs) {
      await d.ref.update({ status: 'disbanded', member_ids: [], member_count: 0 });
    }

    // Seed CS Team 1 (with csUid1, csUid2) + accepted supervisor + contact grant
    const teamCs1: TeamDocument = {
      id: teamCs1Id,
      name: 'Admin Override CS Team 1',
      group_number: 'BCS26_91',
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      leader_id: csUid1,
      member_ids: [csUid1, csUid2],
      member_count: 2,
      max_members: 5,
      status: 'topic_approved',
      assigned_supervisor_id: supUid,
      approved_topic_id: 'topic-cs-91',
      supervisor_assignment: {
        status: 'accepted',
        proposed_by: adminUid,
        proposed_at: Timestamp.now(),
        window_expires_at: Timestamp.now(),
        responded_at: Timestamp.now(),
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(teamCs1Id).set(teamCs1);
    await adminDb
      .collection('teams')
      .doc(teamCs1Id)
      .collection('members')
      .doc(csUid1)
      .set({ uid: csUid1, role: 'leader', joined_at: Timestamp.now() });
    await adminDb
      .collection('teams')
      .doc(teamCs1Id)
      .collection('members')
      .doc(csUid2)
      .set({ uid: csUid2, role: 'member', joined_at: Timestamp.now() });

    // Seed grant on supUid for csUid2
    await adminDb
      .collection('supervisor_contacts')
      .doc(supUid)
      .collection('grants')
      .doc(csUid2)
      .set({
        student_id: csUid2,
        team_id: teamCs1Id,
        granted_at: Timestamp.now(),
      });

    // Seed CS Team 2 (with csUid3) + accepted supervisor sup2Uid
    const teamCs2: TeamDocument = {
      id: teamCs2Id,
      name: 'Admin Override CS Team 2',
      group_number: 'BCS26_92',
      course_id: 'btech-cs',
      academic_year_id: YEAR_ID,
      leader_id: csUid3,
      member_ids: [csUid3],
      member_count: 1,
      max_members: 5,
      status: 'topic_approved',
      assigned_supervisor_id: sup2Uid,
      approved_topic_id: 'topic-cs-92',
      supervisor_assignment: {
        status: 'accepted',
        proposed_by: adminUid,
        proposed_at: Timestamp.now(),
        window_expires_at: Timestamp.now(),
        responded_at: Timestamp.now(),
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(teamCs2Id).set(teamCs2);
    await adminDb
      .collection('teams')
      .doc(teamCs2Id)
      .collection('members')
      .doc(csUid3)
      .set({ uid: csUid3, role: 'leader', joined_at: Timestamp.now() });

    // Seed ICT Team 1 (with ictUid1) + invite code
    const teamIct1: TeamDocument = {
      id: teamIct1Id,
      name: 'Admin Override ICT Team 1',
      group_number: 'BICT26_91',
      course_id: 'btech-ict',
      academic_year_id: YEAR_ID,
      leader_id: ictUid1,
      member_ids: [ictUid1],
      member_count: 1,
      max_members: 5,
      status: 'formation',
      assigned_supervisor_id: supUid,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(teamIct1Id).set(teamIct1);
    await adminDb
      .collection('teams')
      .doc(teamIct1Id)
      .collection('members')
      .doc(ictUid1)
      .set({ uid: ictUid1, role: 'leader', joined_at: Timestamp.now() });
    await adminDb
      .collection('teams')
      .doc(teamIct1Id)
      .collection('private')
      .doc('invite')
      .set({ code: 'ADM991' });
    await adminDb.collection('invite_codes').doc('ADM991').set({
      code: 'ADM991',
      team_id: teamIct1Id,
      created_at: Timestamp.now(),
    });
  });

  describe('1. Role & Session Management (admin-users.ts)', () => {
    it('denies non-admin roles from calling admin user actions', async () => {
      const coordRes = await updateRoles(coordinatorToken, {
        uid: supUid,
        roles: ['supervisor', 'coordinator'],
      });
      expect(coordRes.ok).toBe(false);
      expect(coordRes.code).toBe('FORBIDDEN_ROLE');

      const stuRes = await forceRevokeSession(studentToken, {
        uid: supUid,
      });
      expect(stuRes.ok).toBe(false);
      expect(stuRes.code).toBe('FORBIDDEN_ROLE');
    });

    it('enforces the last-admin guard when attempting to remove the final admin', async () => {
      const res = await updateRoles(adminToken, {
        uid: adminUid,
        roles: ['coordinator'],
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('LAST_ADMIN_GUARD');
    });

    it('updates users.roles, staff_whitelist.roles, and custom claims consistently', async () => {
      const res = await updateRoles(adminToken, {
        uid: supUid,
        roles: ['supervisor', 'coordinator', 'panel_member'],
      });
      expect(res.ok).toBe(true);
      expect(res.roles).toEqual(['supervisor', 'coordinator', 'panel_member']);

      const userSnap = await adminDb.collection('users').doc(supUid).get();
      expect(userSnap.data()?.roles).toEqual([
        'supervisor',
        'coordinator',
        'panel_member',
      ]);

      const wlSnap = await adminDb
        .collection('staff_whitelist')
        .doc('kappiah@htu.edu.gh')
        .get();
      expect(wlSnap.data()?.roles).toEqual([
        'supervisor',
        'coordinator',
        'panel_member',
      ]);

      const authUser = await adminAuth.getUser(supUid);
      expect(authUser.customClaims?.roles).toEqual([
        'supervisor',
        'coordinator',
        'panel_member',
      ]);
    });

    it('forceRevokeSession revokes refresh tokens and writes audit log', async () => {
      const res = await forceRevokeSession(adminToken, {
        uid: supUid,
        reason: 'Role elevation token refresh required',
      });
      expect(res.ok).toBe(true);
      expect(res.revoked).toBe(true);
    });
  });

  describe('2. Student Course Change (FR-01.10)', () => {
    it('blocks course change when student belongs to an active team', async () => {
      const res = await changeStudentCourse(adminToken, {
        uid: csUid1,
        new_course_id: 'btech-ict',
        justification: 'Registrar transfer letter ref HTU/REG/2026/88',
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('STUDENT_IN_ACTIVE_TEAM');
    });

    it('updates users.profile.course_id and roster entry when student is not on an active team', async () => {
      const res = await changeStudentCourse(adminToken, {
        uid: csUidUnassigned,
        new_course_id: 'btech-ict',
        justification: 'Registrar transfer letter ref HTU/REG/2026/99',
        academic_year_id: YEAR_ID,
      });
      expect(res.ok).toBe(true);
      expect(res.old_course_id).toBe('btech-cs');
      expect(res.new_course_id).toBe('btech-ict');

      const userSnap = await adminDb.collection('users').doc(csUidUnassigned).get();
      expect(userSnap.data()?.profile?.course_id).toBe('btech-ict');

      const rosterSnap = await adminDb
        .collection('rosters')
        .doc(YEAR_ID)
        .collection('students')
        .doc(csStudentUnassigned.index_number)
        .get();
      expect(rosterSnap.data()?.course_id).toBe('btech-ict');
    });
  });

  describe('3. Team Overrides (admin-team-override.ts, FR-02.7)', () => {
    it('changeMaxMembers updates max_members and rejects values below current member_count', async () => {
      const badRes = await changeMaxMembers(adminToken, {
        team_id: teamCs1Id,
        max_members: 1, // teamCs1 has 2 members
      });
      expect(badRes.ok).toBe(false);
      expect(badRes.code).toBe('MAX_BELOW_CURRENT_COUNT');

      const okRes = await changeMaxMembers(adminToken, {
        team_id: teamCs1Id,
        max_members: 6,
        reason: 'Special 6-student research project approval',
      });
      expect(okRes.ok).toBe(true);
      expect(okRes.max_members).toBe(6);

      const teamSnap = await adminDb.collection('teams').doc(teamCs1Id).get();
      expect(teamSnap.data()?.max_members).toBe(6);
    });

    it('rejects cross-programme member transfers', async () => {
      const res = await transferMember(adminToken, {
        student_uid: csUid2,
        from_team_id: teamCs1Id,
        to_team_id: teamIct1Id,
        reason: 'Attempted cross-programme transfer',
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('COURSE_MISMATCH');
    });

    it('transfers member between teams of the same course and updates counts, members subcollection, and contact grants', async () => {
      const res = await transferMember(adminToken, {
        student_uid: csUid2,
        from_team_id: teamCs1Id,
        to_team_id: teamCs2Id,
        reason: 'Rebalancing BTech CS capstone groups',
      });
      expect(res.ok).toBe(true);

      const [fromSnap, toSnap, oldGrantSnap, newGrantSnap] = await Promise.all([
        adminDb.collection('teams').doc(teamCs1Id).get(),
        adminDb.collection('teams').doc(teamCs2Id).get(),
        adminDb
          .collection('supervisor_contacts')
          .doc(supUid)
          .collection('grants')
          .doc(csUid2)
          .get(),
        adminDb
          .collection('supervisor_contacts')
          .doc(sup2Uid)
          .collection('grants')
          .doc(csUid2)
          .get(),
      ]);

      expect(fromSnap.data()?.member_ids).toEqual([csUid1]);
      expect(fromSnap.data()?.member_count).toBe(1);

      expect(toSnap.data()?.member_ids).toEqual([csUid3, csUid2]);
      expect(toSnap.data()?.member_count).toBe(2);

      // Old supervisor grant removed, new supervisor grant created
      expect(oldGrantSnap.exists).toBe(false);
      expect(newGrantSnap.exists).toBe(true);
      expect(newGrantSnap.data()?.team_id).toBe(teamCs2Id);
    });

    it('disbandTeam sets status disbanded, frees members, cleans invite codes, and sends team_update notifications', async () => {
      const res = await disbandTeam(adminToken, {
        team_id: teamIct1Id,
        reason: 'Group merged into new cohort track',
      });
      expect(res.ok).toBe(true);
      expect(res.freed_members).toEqual([ictUid1]);

      const [teamSnap, inviteSnap, notifSnap] = await Promise.all([
        adminDb.collection('teams').doc(teamIct1Id).get(),
        adminDb.collection('invite_codes').doc('ADM991').get(),
        adminDb
          .collection('notifications')
          .where('user_id', '==', ictUid1)
          .get(),
      ]);

      expect(teamSnap.data()?.status).toBe('disbanded');
      expect(teamSnap.data()?.member_ids).toEqual([]);
      expect(teamSnap.data()?.member_count).toBe(0);
      expect(inviteSnap.exists).toBe(false);

      const teamUpdateNotifs = notifSnap.docs.filter(
        (d) => d.data().type === 'team_update'
      );
      expect(teamUpdateNotifs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('4. Audit Log Viewer Query (queryAuditLogs)', () => {
    it('records and returns every admin action in /audit-logs with old/new payload metadata', async () => {
      const logsRes = await queryAuditLogs(coordinatorToken, {
        limit: 50,
      });
      expect(logsRes.ok).toBe(true);

      const actionsRecorded = new Set((logsRes.items || []).map((i) => i.action));
      expect(actionsRecorded.has('user.roles_updated')).toBe(true);
      expect(actionsRecorded.has('user.session_revoked')).toBe(true);
      expect(actionsRecorded.has('student.course_changed')).toBe(true);
      expect(actionsRecorded.has('team.max_members_changed')).toBe(true);
      expect(actionsRecorded.has('team.member_transferred')).toBe(true);
      expect(actionsRecorded.has('team.disbanded')).toBe(true);

      // Filter by specific action
      const transferLogs = await queryAuditLogs(adminToken, {
        action: 'team.member_transferred',
        target: teamCs2Id,
      });
      expect(transferLogs.ok).toBe(true);
      expect(transferLogs.items?.length).toBeGreaterThanOrEqual(1);
      expect(transferLogs.items?.[0]?.metadata?.old).toBeDefined();
      expect(transferLogs.items?.[0]?.metadata?.new).toBeDefined();
    });
  });
});

