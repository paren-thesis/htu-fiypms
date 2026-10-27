import { describe, it, expect } from 'vitest';
import {
  parseRosterCsv,
  detectCourseFromFilename,
  normalizeContact,
  isValidContact,
  generateRosterTemplateCsv,
} from './csv';

describe('Pure Logic: Roster CSV Parser & Utilities (Spec §5.1, FR-01.4, FR-01.5)', () => {
  it('1. Parses valid CSV content and normalizes phone numbers', () => {
    const csv = `index_number,full_name,contact
0323080001,John Mensah Doe,+233 24 123 4567
0323080002,Jane Akosua Mensah,024-456-7890
0323080003,Kofi Boateng,(020) 1122334`;

    const result = parseRosterCsv(csv);
    expect(result.ok).toBe(true);
    expect(result.summary.total).toBe(3);
    expect(result.summary.valid).toBe(3);
    expect(result.summary.errors).toBe(0);
    expect(result.summary.duplicatesInFile).toBe(0);

    expect(result.rows[0]!.contact).toBe('+233241234567');
    expect(result.rows[0]!.email).toBe('0323080001@htu.edu.gh');
    expect(result.rows[1]!.contact).toBe('0244567890');
    expect(result.rows[2]!.contact).toBe('0201122334');
  });

  it('2. Flags invalid index numbers (letters, not 10 digits)', () => {
    const csv = `index_number,full_name,contact
12345,Too Short,+233241234567
12345678901,Too Long,+233241234567
032308000A,Contains Letter,+233241234567
0323080004,Valid Student,+233241234567`;

    const result = parseRosterCsv(csv);
    expect(result.ok).toBe(true);
    expect(result.summary.total).toBe(4);
    expect(result.summary.valid).toBe(1);
    expect(result.summary.errors).toBe(3);

    expect(result.rows[0]!.status).toBe('error');
    expect(result.rows[0]!.error).toContain('10 digits');
    expect(result.rows[1]!.status).toBe('error');
    expect(result.rows[2]!.status).toBe('error');
    expect(result.rows[3]!.status).toBe('valid');
  });

  it('3. Flags invalid or missing contact numbers', () => {
    const csv = `index_number,full_name,contact
0323080001,Short Contact,12345
0323080002,Letters in Contact,0244ABCDEF
0323080003,Empty Contact,
0323080004,Valid Contact,+233501234567`;

    const result = parseRosterCsv(csv);
    expect(result.ok).toBe(true);
    expect(result.summary.total).toBe(4);
    expect(result.summary.valid).toBe(1);
    expect(result.summary.errors).toBe(3);

    expect(result.rows[0]!.status).toBe('error');
    expect(result.rows[0]!.error).toContain('Contact must be 7-15 digits');
    expect(result.rows[1]!.status).toBe('error');
    expect(result.rows[2]!.status).toBe('error');
    expect(result.rows[3]!.status).toBe('valid');
  });

  it('4. Flags duplicate index numbers within the same file', () => {
    const csv = `index_number,full_name,contact
0323080001,Student First Entry,+233241234567
0323080002,Student Two,+233241234568
0323080001,Student Duplicate Row,+233241234567`;

    const result = parseRosterCsv(csv);
    expect(result.ok).toBe(true);
    expect(result.summary.total).toBe(3);
    expect(result.summary.valid).toBe(2);
    expect(result.summary.duplicatesInFile).toBe(1);

    expect(result.rows[0]!.status).toBe('valid');
    expect(result.rows[2]!.status).toBe('duplicate_in_file');
    expect(result.rows[2]!.error).toContain('Duplicate index number');
  });

  it('5. Rejects CSVs with missing required headers', () => {
    const wrongHeaderCsv = `id_number,name,phone
0323080001,John Doe,0241234567`;

    const result = parseRosterCsv(wrongHeaderCsv);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Missing required header');

    const emptyCsv = '';
    const emptyResult = parseRosterCsv(emptyCsv);
    expect(emptyResult.ok).toBe(false);
  });

  it('6. Detects course track from filename variants', () => {
    expect(detectCourseFromFilename('btech_cs_2026.csv')).toBe('btech-cs');
    expect(detectCourseFromFilename('BTech-CS-Roster.csv')).toBe('btech-cs');
    expect(detectCourseFromFilename('final_year_btech cs.csv')).toBe('btech-cs');

    expect(detectCourseFromFilename('btech_ict_students.csv')).toBe('btech-ict');
    expect(detectCourseFromFilename('BTech-ICT-Cohort.csv')).toBe('btech-ict');
    expect(detectCourseFromFilename('btech ict.csv')).toBe('btech-ict');

    expect(detectCourseFromFilename('hnd_cs_roster.csv')).toBe('hnd-cs');
    expect(detectCourseFromFilename('HND-CS-Students.csv')).toBe('hnd-cs');

    expect(detectCourseFromFilename('hnd_ict_final.csv')).toBe('hnd-ict');
    expect(detectCourseFromFilename('HND-ICT.csv')).toBe('hnd-ict');

    // Unknown or ambiguous filenames return null
    expect(detectCourseFromFilename('general_roster_2026.csv')).toBeNull();
    expect(detectCourseFromFilename('students.xlsx')).toBeNull();
    expect(detectCourseFromFilename('')).toBeNull();
  });

  it('7. Normalizes and validates contacts correctly', () => {
    expect(normalizeContact('+233 (24) 123-4567')).toBe('+233241234567');
    expect(isValidContact('+233241234567')).toBe(true);
    expect(isValidContact('0244123456')).toBe(true);
    expect(isValidContact('12345')).toBe(false); // too short
    expect(isValidContact('1234567890123456')).toBe(false); // too long
  });

  it('8. Template generator output matches expected schema', () => {
    const template = generateRosterTemplateCsv();
    const result = parseRosterCsv(template);
    expect(result.ok).toBe(true);
    expect(result.summary.valid).toBe(1);
    expect(result.rows[0]!.index_number).toBe('0323080001');
  });
});
