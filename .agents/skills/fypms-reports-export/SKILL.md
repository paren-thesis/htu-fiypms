---
name: fypms-reports-export
description: FYPMS department broadsheet exports to Excel (.xlsx with formulas), CSV and printable PDF with signature lines, grouped by course. Use for generate-broadsheet.ts, lib/export/excel.ts, lib/export/pdf.ts, reports page.
---

# Rules
- Server Action/Route Handler: `export const runtime = 'nodejs'; export const maxDuration = 60;` coordinator/admin only; verify token.
- Group strictly by `course_id` (BTECH-CS, BTECH-ICT, HND-CS, HND-ICT): separate sheet/section and separate signature block per programme. Never mix.
- **Final mark is per team.** One row per student, each carrying their team's scores: Identity columns first: **`index_number, full_name, contact`**, then `group_number, supervisor_score, panel_average_score, composite_final_score, is_locked`. **No grade classification column** until thresholds are defined (`grade_classification` is unset). `contact` comes from the roster doc and is exported in the **CSV only**; leave it out of the Excel and PDF broadsheets.
- **Excel** (`exceljs`): one worksheet per programme, HTU-styled header, composite as a live formula referencing weight cells (`=ROUND(C2*$B$1/100 + D2*$B$2/100, 2)`), frozen header, number formats, print setup landscape.
- **CSV**: flat, registrar-compatible, the full column set above including `contact`, UTF-8 with BOM; neutralise formula injection (prefix `'` to cells starting `= + - @`).
- **PDF** (`@react-pdf/renderer`): A4 landscape, repeating header, page numbers, signature lines for Head of Department and Dean per programme.
- Return `{ filename, mime, base64 }` and build a Blob on the client (`lib/export/*` stay server-only; never import them in client components).
- Pre-publication exports are marked "DRAFT – not published"; published exports read locked data only.
