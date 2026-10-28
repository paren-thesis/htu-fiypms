import 'server-only';

import ExcelJS from 'exceljs';
import type { BroadsheetDataset, BroadsheetProgrammeSection } from './broadsheet-data';

export const HTU_NAVY_ARGB = 'FF0B2545';
export const HTU_LIGHT_BLUE_ARGB = 'FFE8EFF7';
export const BORDER_GREY_ARGB = 'FFD0D7DE';

/**
 * Builds an Excel workbook conforming to FR-10.1 and FR-10.1a.
 * - One worksheet per academic programme.
 * - Frozen HTU-blue header.
 * - Weights in B1 ($B$1 = 40) and B2 ($B$2 = 60).
 * - Composite score formatted as a live Excel formula: ROUND(C{r}*$B$1/100 + D{r}*$B$2/100, 2)
 * - Landscape A4 print setup.
 * - Never contains student contact information.
 */
export async function generateBroadsheetXlsx(dataset: BroadsheetDataset): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HTU Department of Computer Science (FYPMS)';
  workbook.lastModifiedBy = 'FYPMS System';
  workbook.created = new Date();
  workbook.modified = new Date();

  // If a single programme was filtered or all programmes
  const sectionsToInclude: BroadsheetProgrammeSection[] = dataset.programmes;

  for (const section of sectionsToInclude) {
    const sheetName = section.course_code.slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName, {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    // Column definitions (no contact column!)
    sheet.columns = [
      { key: 'index_number', width: 18 },
      { key: 'full_name', width: 30 },
      { key: 'supervisor_score', width: 24 },
      { key: 'panel_average_score', width: 26 },
      { key: 'composite_final_score', width: 24 },
      { key: 'group_number', width: 16 },
      { key: 'status', width: 16 },
    ];

    // Row 1: Supervisor Weight
    const row1 = sheet.getRow(1);
    row1.getCell(1).value = 'Supervisor Weight (%)';
    row1.getCell(1).font = { bold: true, size: 10 };
    row1.getCell(2).value = 40;
    row1.getCell(2).font = { bold: true, size: 10 };
    row1.getCell(2).alignment = { horizontal: 'center' };

    // Row 2: Defense Panel Weight
    const row2 = sheet.getRow(2);
    row2.getCell(1).value = 'Defense Panel Weight (%)';
    row2.getCell(1).font = { bold: true, size: 10 };
    row2.getCell(2).value = 60;
    row2.getCell(2).font = { bold: true, size: 10 };
    row2.getCell(2).alignment = { horizontal: 'center' };

    // Row 3: Section Title Banner
    const row3 = sheet.getRow(3);
    row3.getCell(1).value = `${section.course_name} (${section.course_code}) — Academic Year ${dataset.academic_year_id}`;
    row3.getCell(1).font = { bold: true, italic: true, size: 11, color: { argb: 'FF334155' } };

    // Row 4: Table Headers
    const headers = [
      'Index Number',
      'Full Name',
      'Supervisor Score (40%)',
      'Panel Average Score (60%)',
      'Composite Final Score',
      'Group Number',
      'Status',
    ];

    const headerRow = sheet.getRow(4);
    headerRow.height = 26;

    headers.forEach((headerText, colIdx) => {
      const cell = headerRow.getCell(colIdx + 1);
      cell.value = headerText;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HTU_NAVY_ARGB },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: HTU_NAVY_ARGB } },
        bottom: { style: 'medium', color: { argb: HTU_NAVY_ARGB } },
        left: { style: 'thin', color: { argb: 'FF1E3A8A' } },
        right: { style: 'thin', color: { argb: 'FF1E3A8A' } },
      };
    });

    // Rows 5+: Student Data Rows
    section.rows.forEach((student, index) => {
      const rowNumber = 5 + index;
      const dataRow = sheet.getRow(rowNumber);
      dataRow.height = 20;

      // Col A: Index Number
      const cellA = dataRow.getCell(1);
      cellA.value = student.index_number;
      cellA.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col B: Full Name
      const cellB = dataRow.getCell(2);
      cellB.value = student.full_name;
      cellB.alignment = { vertical: 'middle', horizontal: 'left' };

      // Col C: Supervisor Score
      const cellC = dataRow.getCell(3);
      if (student.supervisor_score !== null && student.supervisor_score !== undefined) {
        cellC.value = Number(student.supervisor_score.toFixed(2));
        cellC.numFmt = '0.00';
      } else {
        cellC.value = '';
      }
      cellC.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col D: Panel Average Score
      const cellD = dataRow.getCell(4);
      if (student.panel_average_score !== null && student.panel_average_score !== undefined) {
        cellD.value = Number(student.panel_average_score.toFixed(2));
        cellD.numFmt = '0.00';
      } else {
        cellD.value = '';
      }
      cellD.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col E: Composite Score (Live formula with cached result)
      const cellE = dataRow.getCell(5);
      const formula = `ROUND(C${rowNumber}*$B$1/100 + D${rowNumber}*$B$2/100, 2)`;
      const cachedResult =
        student.composite_final_score !== null && student.composite_final_score !== undefined
          ? Number(student.composite_final_score.toFixed(2))
          : undefined;

      cellE.value = {
        formula,
        result: cachedResult,
      };
      cellE.numFmt = '0.00';
      cellE.alignment = { vertical: 'middle', horizontal: 'right' };
      cellE.font = { bold: true };

      // Col F: Group Number
      const cellF = dataRow.getCell(6);
      cellF.value = student.group_number;
      cellF.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col G: Status
      const cellG = dataRow.getCell(7);
      cellG.value = student.is_locked
        ? 'Locked'
        : student.is_incomplete
        ? 'Incomplete'
        : 'Pending Lock';
      cellG.alignment = { vertical: 'middle', horizontal: 'center' };
      cellG.font = {
        color: {
          argb: student.is_locked
            ? 'FF15803D' // Green
            : student.is_incomplete
            ? 'FFDC2626' // Red
            : 'FFB45309', // Amber
        },
      };

      // Zebra striping & thin borders
      const isEven = index % 2 === 0;
      for (let col = 1; col <= 7; col++) {
        const c = dataRow.getCell(col);
        if (!isEven) {
          c.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          };
        }
        c.border = {
          top: { style: 'thin', color: { argb: BORDER_GREY_ARGB } },
          bottom: { style: 'thin', color: { argb: BORDER_GREY_ARGB } },
          left: { style: 'thin', color: { argb: BORDER_GREY_ARGB } },
          right: { style: 'thin', color: { argb: BORDER_GREY_ARGB } },
        };
      }
    });
  }

  const uint8 = await workbook.xlsx.writeBuffer();
  return Buffer.from(uint8);
}
