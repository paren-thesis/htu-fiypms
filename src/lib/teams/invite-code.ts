/**
 * Invite Code & Group Number Utilities (Spec §8.1, FR-02.2, FR-02.3, FR-02.5a, F-06, F-14)
 * Pure functions for invite code generation and group number formatting.
 */

/**
 * 6-character uppercase alphanumeric character set excluding visually ambiguous 0, O, 1, I.
 * Contains 32 characters (8 digits + 24 uppercase letters).
 */
export const INVITE_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Maps course IDs to their canonical 3-4 letter uppercase group number prefix.
 * btech-cs  -> BCS
 * btech-ict -> BICT
 * hnd-cs    -> HCS
 * hnd-ict   -> HICT
 */
export const COURSE_PREFIX_MAP: Record<string, string> = {
  'btech-cs': 'BCS',
  'btech-ict': 'BICT',
  'hnd-cs': 'HCS',
  'hnd-ict': 'HICT',
};

/**
 * Derives group number prefix from course_id (FR-02.5a).
 * The prefix is never user-supplied.
 */
export function getCoursePrefix(courseId: string): string {
  const normalized = courseId.toLowerCase().trim();
  const prefix = COURSE_PREFIX_MAP[normalized];
  if (!prefix) {
    throw new Error(
      `Unknown course track "${courseId}". Valid tracks: btech-cs, btech-ict, hnd-cs, hnd-ict.`
    );
  }
  return prefix;
}

/**
 * Formats a 2-digit academic year string from yearId (e.g. "2026-2027" -> "26").
 */
export function formatYearYY(yearIdOrCode: string): string {
  const match = yearIdOrCode.match(/\b(20\d{2})\b/);
  if (match && match[1]) {
    return match[1].slice(-2);
  }
  // Fallback to last 2 digits if available
  const digits = yearIdOrCode.replace(/\D/g, '');
  if (digits.length >= 2) {
    return digits.slice(0, 4).slice(-2);
  }
  return '26';
}

/**
 * Formats a group number according to specification:
 * {CourseCode}{YY}_{Sequence:02d} (e.g. BICT26_01, BCS26_02).
 */
export function formatGroupNumber(
  courseId: string,
  yearIdOrCode: string,
  sequence: number
): string {
  const prefix = getCoursePrefix(courseId);
  const yy = formatYearYY(yearIdOrCode);
  const paddedSeq = String(sequence).padStart(2, '0');
  return `${prefix}${yy}_${paddedSeq}`;
}

/**
 * Generates a 6-character uppercase invite code using only allowed characters.
 * Supports injectable RNG for deterministic testing and collision simulations.
 */
export function generateInviteCode(rng: () => number = Math.random): string {
  let code = '';
  const len = INVITE_CODE_CHARS.length;
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(rng() * len);
    code += INVITE_CODE_CHARS[idx];
  }
  return code;
}

/**
 * Validates whether a given string is a valid 6-character invite code.
 */
export function isValidInviteCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  if (code.length !== 6) return false;
  const regex = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
  return regex.test(code.toUpperCase());
}
