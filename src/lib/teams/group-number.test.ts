import { describe, it, expect } from 'vitest';
import {
  coursePrefix,
  formatGroupNumber,
  COURSE_PREFIX_MAP,
} from './group-number';

describe('Group Number Utilities (Pure)', () => {
  describe('coursePrefix', () => {
    it('correctly maps all 4 courses to their expected prefixes', () => {
      expect(coursePrefix('btech-cs')).toBe('BCS');
      expect(coursePrefix('btech-ict')).toBe('BICT');
      expect(coursePrefix('hnd-cs')).toBe('HCS');
      expect(coursePrefix('hnd-ict')).toBe('HICT');
    });

    it('handles uppercase or untrimmed courseId input', () => {
      expect(coursePrefix(' BTECH-CS ')).toBe('BCS');
      expect(coursePrefix('HND-ICT')).toBe('HICT');
    });

    it('throws on unknown course ID', () => {
      expect(() => coursePrefix('unknown-course')).toThrowError(
        /Unknown or invalid course ID/
      );
      expect(() => coursePrefix('')).toThrowError(/Unknown or invalid course ID/);
    });

    it('COURSE_PREFIX_MAP contains exactly the 4 required courses', () => {
      expect(Object.keys(COURSE_PREFIX_MAP)).toEqual([
        'btech-cs',
        'btech-ict',
        'hnd-cs',
        'hnd-ict',
      ]);
    });
  });

  describe('formatGroupNumber', () => {
    it('formats group numbers with leading zero for single-digit sequence', () => {
      expect(formatGroupNumber('BCS', '26', 1)).toBe('BCS26_01');
      expect(formatGroupNumber('BICT', 26, 2)).toBe('BICT26_02');
      expect(formatGroupNumber('HCS', '2026', 9)).toBe('HCS26_09');
    });

    it('formats group numbers for two-digit sequence without extra padding', () => {
      expect(formatGroupNumber('HICT', '26', 10)).toBe('HICT26_10');
      expect(formatGroupNumber('BCS', 2026, 45)).toBe('BCS26_45');
    });

    it('handles full academic year IDs like "2026-2027"', () => {
      expect(formatGroupNumber('BICT', '2026-2027', 5)).toBe('BICT26_05');
    });

    it('uppercases prefix if lowercase prefix passed', () => {
      expect(formatGroupNumber('bcs', 26, 3)).toBe('BCS26_03');
    });
  });
});
