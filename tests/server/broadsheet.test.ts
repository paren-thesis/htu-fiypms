import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import ExcelJS from 'exceljs';
import { generateBroadsheet, getBroadsheetPreview } from '@/app/actions/generate-broadsheet';
import { upsertAcademicYear } from '@/lib/models/academic-year/repo';
import type { UserDocument, TeamDocument, RosterStudentDocument } from '@/types/firestore';
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

async function createStaffToken(email: string, activeRole = 'coordinator'): Promise<string> {
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
      staff_id: 'STAFF-001',
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

describe('Broadsheet Server Action (FR-10.1, FR-10.1a, FR-10.1b)', () => {
  let coordinatorToken: string;
  let supervisorOnlyToken: string;
  let studentToken: string;

  const testStudent1 = fx.students[0]!;
  const testStudent2 = fx.students[1]!;
  const teamId = 'team-broadsheet-test-1';

  beforeAll(async () => {
    // 1. Setup Academic Year
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

    // 2. Setup Coordinator
    coordinatorToken = await createStaffToken('coordinator@htu.edu.gh', 'coordinator');

    // 3. Setup Supervisor-only token (e.g. kappiah)
    supervisorOnlyToken = await createStaffToken('kappiah@htu.edu.gh', 'supervisor');

    // 4. Setup Students
    studentToken = await createStudentToken(testStudent1.index_number);
    await createStudentToken(testStudent2.index_number);

    const uid1 = studentUid(testStudent1.index_number);
    const uid2 = studentUid(testStudent2.index_number);

    // 5. Seed roster collection
    const rosterStudent1: RosterStudentDocument = {
      index_number: testStudent1.index_number,
      full_name: testStudent1.full_name,
      contact: testStudent1.contact,
      email: studentEmail(testStudent1.index_number),
      course_id: testStudent1.course_id,
      imported_by_uid: 'system',
      imported_at: Timestamp.now(),
      import_batch_id: 'batch-broadsheet',
      user_uid: uid1,
      signup_completed_at: Timestamp.now(),
    };
    await adminDb
      .collection('rosters')
      .doc(YEAR_ID)
      .collection('students')
      .doc(testStudent1.index_number)
      .set(rosterStudent1);

    const rosterStudent2: RosterStudentDocument = {
      index_number: testStudent2.index_number,
      full_name: testStudent2.full_name,
      contact: testStudent2.contact,
      email: studentEmail(testStudent2.index_number),
      course_id: testStudent2.course_id,
      imported_by_uid: 'system',
      imported_at: Timestamp.now(),
      import_batch_id: 'batch-broadsheet',
      user_uid: uid2,
      signup_completed_at: Timestamp.now(),
    };
    await adminDb
      .collection('rosters')
      .doc(YEAR_ID)
      .collection('students')
      .doc(testStudent2.index_number)
      .set(rosterStudent2);

    // 6. Seed scored Team
    const testTeam: TeamDocument = {
      id: teamId,
      name: 'Broadsheet Testing Project',
      group_number: 'BCS26_01',
      course_id: testStudent1.course_id,
      academic_year_id: YEAR_ID,
      leader_id: uid1,
      member_ids: [uid1, uid2],
      member_count: 2,
      max_members: 5,
      status: 'completed',
      scores_summary: {
        supervisor_score: 88,
        panel_average_score: 82,
        composite_final_score: 84.4, // 88*0.4 + 82*0.6 = 35.2 + 49.2 = 84.4
        is_locked: true,
      },
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };
    await adminDb.collection('teams').doc(teamId).set(testTeam);
  });

  describe('Role-based Security & Permissions', () => {
    it('rejects student from generating broadsheet with 403', async () => {
      const res = await generateBroadsheet(studentToken, {
        academic_year_id: YEAR_ID,
        course_id: 'all',
        format: 'csv',
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN_ROLE');
    });

    it('rejects supervisor from generating broadsheet with 403', async () => {
      const res = await generateBroadsheet(supervisorOnlyToken, {
        academic_year_id: YEAR_ID,
        course_id: 'all',
        format: 'csv',
      });
      expect(res.ok).toBe(false);
      expect(res.code).toBe('FORBIDDEN_ROLE');
    });

    it('allows coordinator to generate broadsheet', async () => {
      const res = await generateBroadsheet(coordinatorToken, {
        academic_year_id: YEAR_ID,
        course_id: 'all',
        format: 'csv',
      });
      expect(res.ok).toBe(true);
      expect(res.filename).toContain('HTU_Broadsheet_All_Programmes');
      expect(res.mime).toBe('text/csv; charset=utf-8');
      expect(res.base64).toBeDefined();
    });
  });

  describe('CSV Broadsheet Export', () => {
    it('produces valid CSV with UTF-8 BOM, FR-10.1b headers, and contact information', async () => {
      const res = await generateBroadsheet(coordinatorToken, {
        academic_year_id: YEAR_ID,
        course_id: testStudent1.course_id,
        format: 'csv',
      });

      expect(res.ok).toBe(true);
      const csvContent = Buffer.from(res.base64!, 'base64').toString('utf8');

      // BOM check
      expect(csvContent.charCodeAt(0)).toBe(0xfeff);

      const lines = csvContent.slice(1).split('\r\n');
      expect(lines[0]).toBe(
        'index_number,full_name,contact,group_number,supervisor_score,panel_average_score,composite_final_score,is_locked'
      );

      // Student rows present
      expect(csvContent).toContain(testStudent1.index_number);
      expect(csvContent).toContain(testStudent1.full_name);
      expect(csvContent).toContain(testStudent1.contact);
      expect(csvContent).toContain('BCS26_01');
      expect(csvContent).toContain('84.4');
    });
  });

  describe('Excel (.xlsx) Broadsheet Export', () => {
    it('produces valid XLSX with worksheets per programme and live composite formulas', async () => {
      const res = await generateBroadsheet(coordinatorToken, {
        academic_year_id: YEAR_ID,
        course_id: 'all',
        format: 'xlsx',
      });

      expect(res.ok).toBe(true);
      expect(res.mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const buffer = Buffer.from(res.base64!, 'base64');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);

      const csSheet = workbook.getWorksheet('BTECH-CS');
      expect(csSheet).toBeDefined();

      // Check weights
      expect(csSheet?.getCell('B1').value).toBe(40);
      expect(csSheet?.getCell('B2').value).toBe(60);

      // Check row 5 formula
      const row5 = csSheet?.getRow(5);
      const compositeCell = row5?.getCell(5);
      expect(compositeCell?.value).toMatchObject({
        formula: 'ROUND(C5*$B$1/100 + D5*$B$2/100, 2)',
        result: 84.4,
      });

      // Contact MUST NOT be in Excel
      const headers = csSheet?.getRow(4).values as string[];
      expect(headers.some((h) => typeof h === 'string' && h.toLowerCase().includes('contact'))).toBe(false);
    });
  });

  describe('PDF Broadsheet Export', () => {
    it('produces valid printable PDF buffer starting with %PDF-', async () => {
      const res = await generateBroadsheet(coordinatorToken, {
        academic_year_id: YEAR_ID,
        course_id: 'all',
        format: 'pdf',
      });

      expect(res.ok).toBe(true);
      expect(res.mime).toBe('application/pdf');

      const buffer = Buffer.from(res.base64!, 'base64');
      const magic = buffer.toString('utf8', 0, 5);
      expect(magic).toBe('%PDF-');
    });
  });

  describe('Broadsheet Preview Action', () => {
    it('returns first 50 rows, total students count, and publication locked status', async () => {
      const res = await getBroadsheetPreview(coordinatorToken, {
        academic_year_id: YEAR_ID,
        course_id: 'all',
      });

      expect(res.ok).toBe(true);
      expect(res.total_students).toBeGreaterThanOrEqual(2);
      expect(res.rows?.length).toBeGreaterThanOrEqual(2);

      const student1Row = res.rows?.find((r) => r.index_number === testStudent1.index_number);
      expect(student1Row).toBeDefined();
      expect(student1Row?.composite_final_score).toBe(84.4);
      expect(student1Row?.is_locked).toBe(true);
    });
  });
});
