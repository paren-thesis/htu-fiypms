'use server';

// export const runtime = 'nodejs';

// maxDuration = 60;

import { Timestamp } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/auth/require-user';
import { HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getCurrentAcademicYear } from '@/lib/models/academic-year/repo';
import {
  checkExistingIndexNumbers,
  batchCommitRosterStudents,
} from '@/lib/models/roster/repo';
import { rosterRowSchema } from '@/lib/models/roster/schema';
import type { RosterStudentDocument } from '@/types/firestore';
import { studentEmail } from '../../../fixtures';

const ALLOWED_CALLER_ROLES = ['coordinator', 'admin'];

export interface ImportRosterRowInput {
  index_number: string;
  full_name: string;
  contact: string;
  email?: string;
}

export interface ImportRostersActionInput {
  idToken: string;
  course_id: string;
  academic_year_id?: string;
  filename?: string;
  batch_size?: 25 | 50 | 100;
  dry_run?: boolean;
  rows: ImportRosterRowInput[];
}

export interface ImportRowReport {
  index_number: string;
  full_name: string;
  contact: string;
  email: string;
  status: 'imported' | 'skipped' | 'error';
  reason?: string;
}

export interface ImportRostersResult {
  ok: boolean;
  dry_run: boolean;
  course_id: string;
  academic_year_id: string;
  total: number;
  valid: number;
  imported: number;
  skipped: number;
  errors: number;
  rows: ImportRowReport[];
  import_batch_id?: string;
}

/**
 * Server Action executing student roster CSV import pipeline (Spec §5.1, FR-01.4, FR-01.5, D-05).
 * Only Coordinator and Admin roles are authorized.
 * Zero Auth accounts are created during import (Roster-first onboarding).
 */
export async function importRosters(
  input: ImportRostersActionInput
): Promise<ImportRostersResult> {
  const {
    idToken,
    course_id: rawCourseId,
    academic_year_id: requestedYearId,
    filename = 'roster.csv',
    batch_size = 50,
    dry_run = false,
    rows: rawRows = [],
  } = input;

  // 1. Authorize caller: Coordinator or Admin ONLY
  const authUser = await requireUser(idToken, ALLOWED_CALLER_ROLES);

  const course_id = rawCourseId.trim().toLowerCase();
  if (!course_id) {
    throw new HttpError(400, 'BAD_REQUEST', 'Course track identifier is required');
  }

  // 2. Resolve Academic Year
  let academicYearId = requestedYearId?.trim();
  if (!academicYearId) {
    const currentYear = await getCurrentAcademicYear();
    if (!currentYear) {
      throw new HttpError(
        400,
        'NO_ACTIVE_ACADEMIC_YEAR',
        'No active academic year found in system. Please seed or configure an academic year.'
      );
    }
    academicYearId = currentYear.id;
  }

  // 3. Pre-validate rows and track internal file duplicates
  const rowReports: ImportRowReport[] = [];
  const validRowsToProcess: {
    index_number: string;
    full_name: string;
    contact: string;
    email: string;
  }[] = [];

  const seenInFile = new Set<string>();

  for (const raw of rawRows) {
    const parseResult = rosterRowSchema.safeParse(raw);
    const indexNumber = (raw.index_number || '').trim();
    const fullName = (raw.full_name || '').trim();
    const contact = (raw.contact || '').trim();
    const rawEmail = (raw as { email?: string }).email?.trim();
    const derivedEmail = indexNumber ? studentEmail(indexNumber) : '';

    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]?.message || 'Validation error';
      rowReports.push({
        index_number: indexNumber,
        full_name: fullName,
        contact,
        email: rawEmail || derivedEmail,
        status: 'error',
        reason: issue,
      });
      continue;
    }

    const validData = parseResult.data;
    const expectedEmail = studentEmail(validData.index_number);

    // Reject CSV row carrying another email
    if (rawEmail && rawEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
      rowReports.push({
        index_number: validData.index_number,
        full_name: validData.full_name,
        contact: validData.contact,
        email: rawEmail,
        status: 'error',
        reason: `Email ${rawEmail} does not match derived student email ${expectedEmail}`,
      });
      continue;
    }

    // Check intra-file duplicate
    if (seenInFile.has(validData.index_number)) {
      rowReports.push({
        index_number: validData.index_number,
        full_name: validData.full_name,
        contact: validData.contact,
        email: expectedEmail,
        status: 'error',
        reason: `Duplicate index number ${validData.index_number} within file`,
      });
      continue;
    }

    seenInFile.add(validData.index_number);
    validRowsToProcess.push({
      index_number: validData.index_number,
      full_name: validData.full_name,
      contact: validData.contact,
      email: expectedEmail,
    });
  }

  // 4. Query Firestore to detect students already present in current cohort roster
  const candidateIndexNumbers = validRowsToProcess.map((r) => r.index_number);
  const existingInDatabase = await checkExistingIndexNumbers(
    academicYearId,
    candidateIndexNumbers
  );

  const rowsToCommit: RosterStudentDocument[] = [];
  const importBatchId = crypto.randomUUID();
  const now = Timestamp.now();

  for (const validRow of validRowsToProcess) {
    if (existingInDatabase.has(validRow.index_number)) {
      rowReports.push({
        index_number: validRow.index_number,
        full_name: validRow.full_name,
        contact: validRow.contact,
        email: validRow.email,
        status: 'skipped',
        reason: 'Duplicate (already in cohort roster)',
      });
      continue;
    }

    // Mark as imported
    rowReports.push({
      index_number: validRow.index_number,
      full_name: validRow.full_name,
      contact: validRow.contact,
      email: validRow.email,
      status: 'imported',
    });

    rowsToCommit.push({
      index_number: validRow.index_number,
      full_name: validRow.full_name,
      contact: validRow.contact, // Stored on roster doc only (spec §5.1)
      email: validRow.email,
      course_id,
      imported_by_uid: authUser.uid,
      imported_at: now,
      import_batch_id: importBatchId,
      user_uid: null,
      signup_completed_at: null,
      is_active: true,
    });
  }

  const total = rawRows.length;
  const errorCount = rowReports.filter((r) => r.status === 'error').length;
  const skippedCount = rowReports.filter((r) => r.status === 'skipped').length;
  const validCount = validRowsToProcess.length;
  const importedCount = rowsToCommit.length;

  // 5. Dry-run Mode: Return validation report with zero Firestore mutations
  if (dry_run) {
    return {
      ok: true,
      dry_run: true,
      course_id,
      academic_year_id: academicYearId,
      total,
      valid: validCount,
      imported: 0,
      skipped: skippedCount,
      errors: errorCount,
      rows: rowReports,
    };
  }

  // 6. Commit Mode: Write student documents in batches
  if (rowsToCommit.length > 0) {
    await batchCommitRosterStudents(academicYearId, rowsToCommit, batch_size);

    // Record audit log entry
    await writeAudit({
      actor: {
        uid: authUser.uid,
        email: authUser.email,
        role: authUser.activeRole,
      },
      action: 'roster.imported',
      target_type: 'roster',
      target_id: `${academicYearId}/${course_id}`,
      details: {
        course_id,
        filename,
        total,
        imported: importedCount,
        skipped: skippedCount,
        errors: errorCount,
        imported_by_uid: authUser.uid,
        academic_year_id: academicYearId,
        import_batch_id: importBatchId,
      },
    });
  }

  return {
    ok: true,
    dry_run: false,
    course_id,
    academic_year_id: academicYearId,
    total,
    valid: validCount,
    imported: importedCount,
    skipped: skippedCount,
    errors: errorCount,
    rows: rowReports,
    import_batch_id: importBatchId,
  };
}
