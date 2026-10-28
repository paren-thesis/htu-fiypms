import 'server-only';

import type { BroadsheetStudentRow } from './broadsheet-data';

export const CSV_HEADER_COLUMNS = [
  'index_number',
  'full_name',
  'contact',
  'group_number',
  'supervisor_score',
  'panel_average_score',
  'composite_final_score',
  'is_locked',
] as const;

/**
 * Neutralizes spreadsheet formula injection by prefixing with a single quote (')
 * if the text value begins with =, +, -, or @.
 * Also handles standard RFC 4180 CSV quoting when commas, quotes, or line breaks are present.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Formula injection defense: prefix single quote if starts with dangerous character
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // Escape double quotes and enclose in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates a UTF-8 CSV string with BOM for broadsheet student rows.
 * Exactly matches FR-10.1b column requirements.
 */
export function generateBroadsheetCsv(rows: BroadsheetStudentRow[]): string {
  const BOM = '\uFEFF';
  const headerLine = CSV_HEADER_COLUMNS.join(',');

  const lines = rows.map((row) => {
    const supervisorScoreStr =
      row.supervisor_score !== null && row.supervisor_score !== undefined
        ? String(Number(row.supervisor_score.toFixed(2)))
        : '';

    const panelAverageScoreStr =
      row.panel_average_score !== null && row.panel_average_score !== undefined
        ? String(Number(row.panel_average_score.toFixed(2)))
        : '';

    const compositeScoreStr =
      row.composite_final_score !== null && row.composite_final_score !== undefined
        ? String(Number(row.composite_final_score.toFixed(2)))
        : '';

    const cells = [
      sanitizeCsvCell(row.index_number),
      sanitizeCsvCell(row.full_name),
      sanitizeCsvCell(row.contact),
      sanitizeCsvCell(row.group_number),
      sanitizeCsvCell(supervisorScoreStr),
      sanitizeCsvCell(panelAverageScoreStr),
      sanitizeCsvCell(compositeScoreStr),
      sanitizeCsvCell(row.is_locked ? 'true' : 'false'),
    ];

    return cells.join(',');
  });

  return BOM + [headerLine, ...lines].join('\r\n');
}
