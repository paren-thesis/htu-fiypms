import { describe, it, expect } from 'vitest';
import {
  generateInviteCode,
  isValidInviteCode,
  getCoursePrefix,
  formatGroupNumber,
  formatYearYY,
  INVITE_CODE_CHARS,
} from './invite-code';

describe('Pure Logic: Invite Code & Group Number Formatting (Spec §8.1, FR-02.2, FR-02.5a, F-06, F-14)', () => {
  it('1. Generates 6-character invite code using only allowed characters (excludes 0, O, 1, I)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
      expect(isValidInviteCode(code)).toBe(true);

      // Verify forbidden ambiguous characters never appear
      expect(code).not.toContain('0');
      expect(code).not.toContain('O');
      expect(code).not.toContain('1');
      expect(code).not.toContain('I');

      // Verify each character is in INVITE_CODE_CHARS
      for (const char of code) {
        expect(INVITE_CODE_CHARS).toContain(char);
      }
    }
  });

  it('2. Supports injectable RNG for deterministic invite code generation', () => {
    // Deterministic mock RNG always returning index 0 (character '2')
    const mockRngMin = () => 0.0;
    expect(generateInviteCode(mockRngMin)).toBe('222222');

    // Deterministic mock RNG always returning last index (character 'Z')
    const mockRngMax = () => 0.9999;
    expect(generateInviteCode(mockRngMax)).toBe('ZZZZZZ');
  });

  it('3. Validates invite code strings correctly', () => {
    expect(isValidInviteCode('K9X2P4')).toBe(true);
    expect(isValidInviteCode('234567')).toBe(true);
    expect(isValidInviteCode('BCDFGH')).toBe(true);

    // Invalid codes
    expect(isValidInviteCode('K9X2P')).toBe(false); // 5 chars
    expect(isValidInviteCode('K9X2P4A')).toBe(false); // 7 chars
    expect(isValidInviteCode('K9X2P0')).toBe(false); // contains '0'
    expect(isValidInviteCode('K9X2PO')).toBe(false); // contains 'O'
    expect(isValidInviteCode('K9X2P1')).toBe(false); // contains '1'
    expect(isValidInviteCode('K9X2PI')).toBe(false); // contains 'I'
    expect(isValidInviteCode('k9x2p4')).toBe(true); // case-insensitive check
    expect(isValidInviteCode('')).toBe(false);
  });

  it('4. Derives course prefix accurately from course_id', () => {
    expect(getCoursePrefix('btech-cs')).toBe('BCS');
    expect(getCoursePrefix('btech-ict')).toBe('BICT');
    expect(getCoursePrefix('hnd-cs')).toBe('HCS');
    expect(getCoursePrefix('hnd-ict')).toBe('HICT');

    // Case-insensitive
    expect(getCoursePrefix('BTECH-CS')).toBe('BCS');
    expect(getCoursePrefix('Hnd-Ict')).toBe('HICT');

    // Invalid course throws error
    expect(() => getCoursePrefix('invalid-course')).toThrowError(/Unknown course track/);
  });

  it('5. Formats academic year 2-digit representation', () => {
    expect(formatYearYY('2026-2027')).toBe('26');
    expect(formatYearYY('2025/2026')).toBe('25');
    expect(formatYearYY('2030')).toBe('30');
  });

  it('6. Formats group numbers according to spec: {CourseCode}{YY}_{Sequence:02d}', () => {
    expect(formatGroupNumber('btech-ict', '2026-2027', 1)).toBe('BICT26_01');
    expect(formatGroupNumber('btech-cs', '2026-2027', 2)).toBe('BCS26_02');
    expect(formatGroupNumber('hnd-cs', '2026-2027', 15)).toBe('HCS26_15');
    expect(formatGroupNumber('hnd-ict', '2025-2026', 9)).toBe('HICT25_09');
  });
});
