import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import ExcelJS from 'exceljs';
import {
  assembleStudentRows,
  groupRowsByProgramme,
  generateBroadsheetCsv,
  generateBroadsheetXlsx,
  generateBroadsheetPdf,
  type BroadsheetStudentRow,
  type BroadsheetDataset,
} from './index';
import type { TeamDocument, RosterStudentDocument, UserDocument } from '@/types/firestore';

const dummyTimestamp = {
  seconds: 0,
  nanoseconds: 0,
  toDate: () => new Date(0),
  toMillis: () => 0,
  isEqual: () => false,
  valueOf: () => '',
} as unknown as FirebaseFirestore.Timestamp;

describe('Broadsheet Export Suite', () => {
  // Test Mock Data Fixtures
  const mockRoster: RosterStudentDocument[] = [
    {
      index_number: '0323080001',
      full_name: 'Alice Mensah',
      contact: '+233241112233',
      email: '0323080001@htu.edu.gh',
      course_id: 'btech-cs',
      imported_by_uid: 'coord-1',
      imported_at: dummyTimestamp,
      import_batch_id: 'b1',
      user_uid: 'uid-alice',
      signup_completed_at: dummyTimestamp,
    },
    {
      index_number: '0323080002',
      full_name: 'Bob Owusu',
      contact: '+233242223344',
      email: '0323080002@htu.edu.gh',
      course_id: 'btech-cs',
      imported_by_uid: 'coord-1',
      imported_at: dummyTimestamp,
      import_batch_id: 'b1',
      user_uid: 'uid-bob',
      signup_completed_at: dummyTimestamp,
    },
    {
      index_number: '0323080101',
      full_name: 'Charlie Koffi',
      contact: '+233243334455',
      email: '0323080101@htu.edu.gh',
      course_id: 'btech-ict',
      imported_by_uid: 'coord-1',
      imported_at: dummyTimestamp,
      import_batch_id: 'b1',
      user_uid: 'uid-charlie',
      signup_completed_at: dummyTimestamp,
    },
  ];

  const mockUsers: UserDocument[] = [
    {
      uid: 'uid-alice',
      name: 'Alice Mensah',
      email: '0323080001@htu.edu.gh',
      role: 'student',
      roles: ['student'],
      active_role: 'student',
      profile: {
        index_number: '0323080001',
        course_id: 'btech-cs',
        registered: true,
        profile_complete: true,
      },
      created_at: dummyTimestamp,
      updated_at: dummyTimestamp,
    },
    {
      uid: 'uid-bob',
      name: 'Bob Owusu',
      email: '0323080002@htu.edu.gh',
      role: 'student',
      roles: ['student'],
      active_role: 'student',
      profile: {
        index_number: '0323080002',
        course_id: 'btech-cs',
        registered: true,
        profile_complete: true,
      },
      created_at: dummyTimestamp,
      updated_at: dummyTimestamp,
    },
    {
      uid: 'uid-charlie',
      name: 'Charlie Koffi',
      email: '0323080101@htu.edu.gh',
      role: 'student',
      roles: ['student'],
      active_role: 'student',
      profile: {
        index_number: '0323080101',
        course_id: 'btech-ict',
        registered: true,
        profile_complete: true,
      },
      created_at: dummyTimestamp,
      updated_at: dummyTimestamp,
    },
  ];

  const mockTeams: TeamDocument[] = [
    {
      id: 'team-cs-1',
      name: 'AI Diagnostics',
      group_number: 'BCS26_01',
      course_id: 'btech-cs',
      academic_year_id: '2025-2026',
      leader_id: 'uid-alice',
      member_ids: ['uid-alice', 'uid-bob'],
      member_count: 2,
      max_members: 5,
      status: 'completed',
      scores_summary: {
        supervisor_score: 85,
        panel_average_score: 80,
        composite_final_score: 82, // 85*0.4 + 80*0.6 = 34 + 48 = 82
        is_locked: true,
      },
      created_at: dummyTimestamp,
      updated_at: dummyTimestamp,
    },
    {
      id: 'team-ict-1',
      name: 'Smart Campus IoT',
      group_number: 'BICT26_01',
      course_id: 'btech-ict',
      academic_year_id: '2025-2026',
      leader_id: 'uid-charlie',
      member_ids: ['uid-charlie'],
      member_count: 1,
      max_members: 5,
      status: 'defense_ready',
      // No scores_summary -> incomplete
      created_at: dummyTimestamp,
      updated_at: dummyTimestamp,
    },
  ];

  describe('1. Data Assembly', () => {
    it('compiles student rows carrying team scores and contact from roster', () => {
      const rows = assembleStudentRows({
        teams: mockTeams,
        rosterStudents: mockRoster,
        users: mockUsers,
      });

      expect(rows).toHaveLength(3);

      // Alice
      const alice = rows.find((r) => r.index_number === '0323080001');
      expect(alice).toBeDefined();
      expect(alice?.full_name).toBe('Alice Mensah');
      expect(alice?.contact).toBe('+233241112233');
      expect(alice?.group_number).toBe('BCS26_01');
      expect(alice?.supervisor_score).toBe(85);
      expect(alice?.panel_average_score).toBe(80);
      expect(alice?.composite_final_score).toBe(82);
      expect(alice?.is_locked).toBe(true);
      expect(alice?.is_incomplete).toBe(false);

      // Bob (same team composite)
      const bob = rows.find((r) => r.index_number === '0323080002');
      expect(bob).toBeDefined();
      expect(bob?.composite_final_score).toBe(82);
      expect(bob?.is_locked).toBe(true);

      // Charlie (incomplete team)
      const charlie = rows.find((r) => r.index_number === '0323080101');
      expect(charlie).toBeDefined();
      expect(charlie?.is_incomplete).toBe(true);
      expect(charlie?.composite_final_score).toBeNull();
      expect(charlie?.is_locked).toBe(false);
    });

    it('enforces category segregation: programme sections contain only their students', () => {
      const rows = assembleStudentRows({
        teams: mockTeams,
        rosterStudents: mockRoster,
        users: mockUsers,
      });

      const sections = groupRowsByProgramme(rows);
      const csSection = sections.find((s) => s.course_id === 'btech-cs');
      const ictSection = sections.find((s) => s.course_id === 'btech-ict');

      expect(csSection).toBeDefined();
      expect(csSection?.rows).toHaveLength(2);
      expect(csSection?.rows.every((r) => r.course_id === 'btech-cs')).toBe(true);

      expect(ictSection).toBeDefined();
      expect(ictSection?.rows).toHaveLength(1);
      expect(ictSection?.rows[0]?.course_id).toBe('btech-ict');
    });

    it('filters strictly by course_id when specified', () => {
      const rows = assembleStudentRows({
        teams: mockTeams,
        rosterStudents: mockRoster,
        users: mockUsers,
        courseId: 'btech-cs',
      });

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.course_id === 'btech-cs')).toBe(true);
    });

    it('sorts rows by course_id, group_number, and index_number', () => {
      const rows = assembleStudentRows({
        teams: mockTeams,
        rosterStudents: mockRoster,
        users: mockUsers,
      });

      expect(rows[0]?.index_number).toBe('0323080001'); // Alice (btech-cs, BCS26_01)
      expect(rows[1]?.index_number).toBe('0323080002'); // Bob (btech-cs, BCS26_01)
      expect(rows[2]?.index_number).toBe('0323080101'); // Charlie (btech-ict, BICT26_01)
    });
  });

  describe('2. CSV Export (FR-10.1b)', () => {
    it('produces exact header matching FR-10.1b and starts with UTF-8 BOM', () => {
      const rows = assembleStudentRows({
        teams: mockTeams,
        rosterStudents: mockRoster,
        users: mockUsers,
      });

      const csv = generateBroadsheetCsv(rows);

      // Must start with UTF-8 BOM
      expect(csv.charCodeAt(0)).toBe(0xfeff);

      const lines = csv.slice(1).split('\r\n');
      expect(lines[0]).toBe(
        'index_number,full_name,contact,group_number,supervisor_score,panel_average_score,composite_final_score,is_locked'
      );
    });

    it('neutralizes formula injection characters (=, +, -, @)', () => {
      const injectionRows: BroadsheetStudentRow[] = [
        {
          index_number: '0323080999',
          full_name: '=cmd|/c calc!A0',
          contact: '+233240001122',
          group_number: '@group1',
          course_id: 'btech-cs',
          supervisor_score: 90,
          panel_average_score: 85,
          composite_final_score: 87,
          is_locked: true,
          is_incomplete: false,
        },
      ];

      const csv = generateBroadsheetCsv(injectionRows);
      const lines = csv.slice(1).split('\r\n');
      const dataRow = lines[1];

      // Values starting with = and @ must be prefixed with single quote
      expect(dataRow).toContain("'=cmd|/c calc!A0");
      expect(dataRow).toContain("'+233240001122");
      expect(dataRow).toContain("'@group1");
    });
  });

  describe('3. Excel Export (exceljs)', () => {
    const dataset: BroadsheetDataset = {
      academic_year_id: '2025-2026',
      course_id: 'all',
      generated_at: new Date().toISOString(),
      is_all_locked: false,
      has_incomplete: true,
      total_students: 3,
      rows: assembleStudentRows({
        teams: mockTeams,
        rosterStudents: mockRoster,
        users: mockUsers,
      }),
      programmes: groupRowsByProgramme(
        assembleStudentRows({
          teams: mockTeams,
          rosterStudents: mockRoster,
          users: mockUsers,
        })
      ),
    };

    it('produces a worksheet per programme with formula and weights present', async () => {
      const buffer = await generateBroadsheetXlsx(dataset);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);

      // Read back with exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);

      // Sheets check
      const csSheet = workbook.getWorksheet('BTECH-CS');
      expect(csSheet).toBeDefined();

      // Check weights in B1 and B2
      expect(csSheet?.getCell('B1').value).toBe(40);
      expect(csSheet?.getCell('B2').value).toBe(60);

      // Check Header row (Row 4)
      const headerRow = csSheet?.getRow(4);
      expect(headerRow?.getCell(1).value).toBe('Index Number');
      expect(headerRow?.getCell(2).value).toBe('Full Name');
      expect(headerRow?.getCell(5).value).toBe('Composite Final Score');

      // Check that Contact column does NOT exist in Excel
      const headers = headerRow?.values as string[];
      expect(headers.some((h) => typeof h === 'string' && h.toLowerCase().includes('contact'))).toBe(false);

      // Check Student Data row 5 (Alice) has composite formula
      const row5 = csSheet?.getRow(5);
      const compositeCell = row5?.getCell(5);
      expect(compositeCell?.value).toMatchObject({
        formula: 'ROUND(C5*$B$1/100 + D5*$B$2/100, 2)',
        result: 82,
      });

      // Check Frozen Header view
      expect(csSheet?.views[0]).toMatchObject({
        state: 'frozen',
        ySplit: 4,
      });
    });
  });

  describe('4. PDF Export (@react-pdf/renderer)', () => {
    it('generates a valid PDF buffer starting with %PDF', async () => {
      const dataset: BroadsheetDataset = {
        academic_year_id: '2025-2026',
        course_id: 'all',
        generated_at: new Date().toISOString(),
        is_all_locked: false,
        has_incomplete: true,
        total_students: 3,
        rows: assembleStudentRows({
          teams: mockTeams,
          rosterStudents: mockRoster,
          users: mockUsers,
        }),
        programmes: groupRowsByProgramme(
          assembleStudentRows({
            teams: mockTeams,
            rosterStudents: mockRoster,
            users: mockUsers,
          })
        ),
      };

      const buffer = await generateBroadsheetPdf(dataset);
      expect(Buffer.isBuffer(buffer)).toBe(true);

      // PDF magic bytes check (%PDF-)
      const headerStr = buffer.toString('utf8', 0, 5);
      expect(headerStr).toBe('%PDF-');
    });
  });
});
