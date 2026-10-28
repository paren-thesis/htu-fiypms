'use server';

// export const runtime = 'nodejs';
// export const maxDuration = 60;

import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import {
  fetchBroadsheetData,
  generateBroadsheetCsv,
  generateBroadsheetXlsx,
  generateBroadsheetPdf,
  type BroadsheetStudentRow,
} from '@/lib/export';

const generateBroadsheetInSchema = z
  .object({
    academic_year_id: z.string().trim().min(1, 'Academic year is required'),
    course_id: z.string().trim().min(1, 'Course ID is required').default('all'),
    format: z.enum(['xlsx', 'csv', 'pdf']),
  })
  .strict();

export type GenerateBroadsheetIn = z.infer<typeof generateBroadsheetInSchema>;

export interface GenerateBroadsheetResult {
  ok: boolean;
  filename?: string;
  mime?: string;
  base64?: string;
  error?: string;
  code?: string;
}

export interface BroadsheetPreviewResult {
  ok: boolean;
  academic_year_id?: string;
  course_id?: string;
  total_students?: number;
  is_all_locked?: boolean;
  has_incomplete?: boolean;
  rows?: BroadsheetStudentRow[];
  error?: string;
  code?: string;
}

const MIME_TYPES: Record<'xlsx' | 'csv' | 'pdf', string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/**
 * Server Action: Generates broadsheets in CSV, Excel, or PDF format.
 * Spec: FR-10.1, FR-10.1a, FR-10.1b.
 * Only accessible by Coordinator or Admin.
 */
export async function generateBroadsheet(
  idTokenOrInput?: string | (GenerateBroadsheetIn & { idToken?: string }),
  maybeInput?: GenerateBroadsheetIn | string
): Promise<GenerateBroadsheetResult> {
  try {
    let idToken: string | undefined;
    let rawInput: unknown;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput;
    } else if (idTokenOrInput && typeof idTokenOrInput === 'object') {
      idToken = idTokenOrInput.idToken;
      const copy = { ...idTokenOrInput };
      delete copy.idToken;
      rawInput = copy;
      if (!idToken && typeof maybeInput === 'string') {
        idToken = maybeInput;
      }
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
    }

    // Role check: coordinator or admin only
    await requireUser(idToken, ['coordinator', 'admin']);

    // Validate input payload
    const parsed = generateBroadsheetInSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { academic_year_id, course_id, format } = parsed.data;

    // Fetch compiled dataset
    const dataset = await fetchBroadsheetData(academic_year_id, course_id);

    let fileBuffer: Buffer;
    if (format === 'csv') {
      const csvString = generateBroadsheetCsv(dataset.rows);
      fileBuffer = Buffer.from(csvString, 'utf-8');
    } else if (format === 'xlsx') {
      fileBuffer = await generateBroadsheetXlsx(dataset);
    } else if (format === 'pdf') {
      fileBuffer = await generateBroadsheetPdf(dataset);
    } else {
      throw new HttpError(400, 'UNSUPPORTED_FORMAT', `Unsupported format: ${format}`);
    }

    const safeCourse = course_id.toLowerCase() === 'all' ? 'All_Programmes' : course_id.toUpperCase();
    const filename = `HTU_Broadsheet_${safeCourse}_${academic_year_id}.${format}`;

    return {
      ok: true,
      filename,
      mime: MIME_TYPES[format],
      base64: fileBuffer.toString('base64'),
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

/**
 * Server Action: Fetches preview data (first 50 rows) and broadsheet metadata for the reports UI.
 */
export async function getBroadsheetPreview(
  idTokenOrInput?: string | ({ academic_year_id: string; course_id: string } & { idToken?: string }),
  maybeInput?: { academic_year_id: string; course_id: string } | string
): Promise<BroadsheetPreviewResult> {
  try {
    let idToken: string | undefined;
    let rawInput: unknown;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput;
    } else if (idTokenOrInput && typeof idTokenOrInput === 'object') {
      idToken = idTokenOrInput.idToken;
      const copy = { ...idTokenOrInput };
      delete copy.idToken;
      rawInput = copy;
      if (!idToken && typeof maybeInput === 'string') {
        idToken = maybeInput;
      }
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
    }

    // Role check: coordinator or admin only
    await requireUser(idToken, ['coordinator', 'admin']);

    const previewSchema = z.object({
      academic_year_id: z.string().trim().min(1, 'Academic year is required'),
      course_id: z.string().trim().min(1, 'Course ID is required').default('all'),
    });

    const parsed = previewSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { academic_year_id, course_id } = parsed.data;
    const dataset = await fetchBroadsheetData(academic_year_id, course_id);

    return {
      ok: true,
      academic_year_id: dataset.academic_year_id,
      course_id: dataset.course_id,
      total_students: dataset.total_students,
      is_all_locked: dataset.is_all_locked,
      has_incomplete: dataset.has_incomplete,
      rows: dataset.rows.slice(0, 50),
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}
