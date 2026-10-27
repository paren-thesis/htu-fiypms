import Papa from 'papaparse';

export interface ParsedRosterRow {
  rowNumber: number;
  index_number: string;
  full_name: string;
  contact: string;
  email: string;
  status: 'valid' | 'error' | 'duplicate_in_file';
  error?: string;
}

export interface RosterParseSummary {
  total: number;
  valid: number;
  errors: number;
  duplicatesInFile: number;
}

export interface RosterCsvParseResult {
  ok: boolean;
  error?: string;
  rows: ParsedRosterRow[];
  summary: RosterParseSummary;
}

/**
 * Normalizes contact string by stripping spaces, dashes, and parentheses.
 */
export function normalizeContact(contact: string): string {
  if (!contact) return '';
  return contact.replace(/[\s\-()]/g, '');
}

/**
 * Validates normalized contact format (7-15 digits with optional '+' prefix).
 */
export function isValidContact(contact: string): boolean {
  const normalized = normalizeContact(contact);
  return /^\+?[0-9]{7,15}$/.test(normalized);
}

/**
 * Validates 10-digit student index number format.
 */
export function isValidIndexNumber(indexNumber: string): boolean {
  return /^[0-9]{10}$/.test(indexNumber.trim());
}

/**
 * Automatically detects the course track from the uploaded CSV filename.
 * Supports delimiters _, -, space and case-insensitivity.
 *
 * Patterns:
 * - btech_cs, btech-cs, btech cs -> btech-cs
 * - btech_ict, btech-ict, btech ict -> btech-ict
 * - hnd_cs, hnd-cs, hnd cs -> hnd-cs
 * - hnd_ict, hnd-ict, hnd ict -> hnd-ict
 */
export function detectCourseFromFilename(filename: string): string | null {
  if (!filename) return null;

  // Clean filename: remove extension, lower case, replace non-alphanumeric with hyphen
  const clean = filename
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[\s_]+/g, '-');

  if (clean.includes('btech-cs')) return 'btech-cs';
  if (clean.includes('btech-ict')) return 'btech-ict';
  if (clean.includes('hnd-cs')) return 'hnd-cs';
  if (clean.includes('hnd-ict')) return 'hnd-ict';

  return null;
}

/**
 * Pure parser for student roster CSV.
 * Validates required headers: index_number, full_name, contact.
 * Validates row format and flags intra-file duplicates.
 */
export function parseRosterCsv(csvContent: string): RosterCsvParseResult {
  if (!csvContent || !csvContent.trim()) {
    return {
      ok: false,
      error: 'CSV content is empty',
      rows: [],
      summary: { total: 0, valid: 0, errors: 0, duplicatesInFile: 0 },
    };
  }

  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const headers = parsed.meta.fields || [];
  const requiredHeaders = ['index_number', 'full_name', 'contact'];
  const missingHeaders = requiredHeaders.filter((req) => !headers.includes(req));

  if (missingHeaders.length > 0) {
    return {
      ok: false,
      error: `Missing required header column(s): ${missingHeaders.join(', ')}. Expected: index_number, full_name, contact`,
      rows: [],
      summary: { total: 0, valid: 0, errors: 0, duplicatesInFile: 0 },
    };
  }

  const rows: ParsedRosterRow[] = [];
  const seenIndexNumbers = new Set<string>();

  let validCount = 0;
  let errorCount = 0;
  let dupCount = 0;

  parsed.data.forEach((rawRow, index) => {
    const rowNumber = index + 2; // Row 1 is header
    const rawIndexNumber = (rawRow.index_number || '').trim();
    const rawFullName = (rawRow.full_name || '').trim();
    const rawContact = (rawRow.contact || '').trim();
    const normalizedContact = normalizeContact(rawContact);
    const email = `${rawIndexNumber}@htu.edu.gh`;

    // 1. Index number check
    if (!rawIndexNumber) {
      errorCount++;
      rows.push({
        rowNumber,
        index_number: '',
        full_name: rawFullName,
        contact: normalizedContact,
        email: '',
        status: 'error',
        error: 'Missing index number',
      });
      return;
    }

    if (!isValidIndexNumber(rawIndexNumber)) {
      errorCount++;
      rows.push({
        rowNumber,
        index_number: rawIndexNumber,
        full_name: rawFullName,
        contact: normalizedContact,
        email,
        status: 'error',
        error: 'Index number must be exactly 10 digits',
      });
      return;
    }

    // 2. Full name check
    if (!rawFullName) {
      errorCount++;
      rows.push({
        rowNumber,
        index_number: rawIndexNumber,
        full_name: '',
        contact: normalizedContact,
        email,
        status: 'error',
        error: 'Full name is required',
      });
      return;
    }

    // 3. Contact check
    if (!rawContact) {
      errorCount++;
      rows.push({
        rowNumber,
        index_number: rawIndexNumber,
        full_name: rawFullName,
        contact: '',
        email,
        status: 'error',
        error: 'Contact phone number is required',
      });
      return;
    }

    if (!isValidContact(rawContact)) {
      errorCount++;
      rows.push({
        rowNumber,
        index_number: rawIndexNumber,
        full_name: rawFullName,
        contact: normalizedContact,
        email,
        status: 'error',
        error: 'Contact must be 7-15 digits (optional + prefix)',
      });
      return;
    }

    // 4. Intra-file duplicate check
    if (seenIndexNumbers.has(rawIndexNumber)) {
      dupCount++;
      rows.push({
        rowNumber,
        index_number: rawIndexNumber,
        full_name: rawFullName,
        contact: normalizedContact,
        email,
        status: 'duplicate_in_file',
        error: `Duplicate index number ${rawIndexNumber} within file`,
      });
      return;
    }

    seenIndexNumbers.add(rawIndexNumber);
    validCount++;

    rows.push({
      rowNumber,
      index_number: rawIndexNumber,
      full_name: rawFullName,
      contact: normalizedContact,
      email,
      status: 'valid',
    });
  });

  return {
    ok: true,
    rows,
    summary: {
      total: rows.length,
      valid: validCount,
      errors: errorCount,
      duplicatesInFile: dupCount,
    },
  };
}

/**
 * Returns a template CSV string with header and one example row.
 */
export function generateRosterTemplateCsv(): string {
  return 'index_number,full_name,contact\n0323080001,John Mensah Doe,+233241234567\n';
}
