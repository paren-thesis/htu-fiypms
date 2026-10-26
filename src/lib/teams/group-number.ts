export type CoursePrefix = 'BCS' | 'BICT' | 'HCS' | 'HICT';

export const COURSE_PREFIX_MAP: Record<string, CoursePrefix> = {
  'btech-cs': 'BCS',
  'btech-ict': 'BICT',
  'hnd-cs': 'HCS',
  'hnd-ict': 'HICT',
};

/**
 * Returns the uppercase course prefix for a given course ID.
 * btech-cs -> BCS, btech-ict -> BICT, hnd-cs -> HCS, hnd-ict -> HICT
 */
export function coursePrefix(courseId: string): CoursePrefix {
  const normalized = courseId.trim().toLowerCase();
  const prefix = COURSE_PREFIX_MAP[normalized];
  if (!prefix) {
    throw new Error(`Unknown or invalid course ID: "${courseId}"`);
  }
  return prefix;
}

/**
 * Formats a project team group number.
 * Pattern: {CoursePrefix}{YY}_{Sequence:02d} (e.g. BICT26_01, BCS26_02)
 *
 * @param prefix Course prefix (BCS, BICT, HCS, HICT)
 * @param yearYY 2-digit year (or 4-digit start year / year range string e.g. 2026, '2026-2027', '26')
 * @param seq Sequence counter number (1-based)
 */
export function formatGroupNumber(
  prefix: string,
  yearYY: string | number,
  seq: number
): string {
  let yyStr = String(yearYY).trim();
  // If yearYY is e.g. "2026-2027", extract first 4-digit year "2026"
  if (yyStr.includes('-')) {
    yyStr = yyStr.split('-')[0] ?? yyStr;
  }
  // Take the last 2 digits
  const yy = yyStr.length >= 2 ? yyStr.slice(-2) : yyStr.padStart(2, '0');
  const seqPadded = String(seq).padStart(2, '0');

  return `${prefix.toUpperCase()}${yy}_${seqPadded}`;
}
