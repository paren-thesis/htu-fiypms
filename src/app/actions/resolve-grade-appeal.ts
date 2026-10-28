'use server';

export const runtime = 'nodejs';

import { Timestamp } from 'firebase-admin/firestore';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import {
  resolveGradeAppealInSchema,
  type ResolveGradeAppealIn,
} from '@/lib/models/grade-appeal/schema';
import {
  getGradeAppeal,
  updateGradeAppealStatus,
} from '@/lib/models/grade-appeal/repo';
import type { GradeAppealStatus } from '@/types/firestore';

export interface ResolveGradeAppealResult {
  ok: boolean;
  appeal_id?: string;
  appeal_status?: GradeAppealStatus;
  status?: number | GradeAppealStatus;
  error?: string;
  code?: string;
}

/**
 * Server Action: Review, resolve, or reject a grade appeal.
 * Spec: FR-10.4, Amendment A-04.
 * Restricted to Departmental Coordinators and Administrators.
 * Note: Actual grade adjustments must be executed separately via amendGrade.
 */
export async function resolveGradeAppeal(
  idTokenOrInput?: string | (ResolveGradeAppealIn & { idToken?: string }),
  maybeInput?: ResolveGradeAppealIn | string
): Promise<ResolveGradeAppealResult> {
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

    // Must be Coordinator or Administrator
    const caller = await requireUser(idToken, ['coordinator', 'admin']);

    const parsed = resolveGradeAppealInSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { appeal_id, status, resolution_notes } = parsed.data;

    // 1. Fetch appeal
    const appeal = await getGradeAppeal(appeal_id);
    if (!appeal) {
      throw new HttpError(404, 'NOT_FOUND', `Grade appeal ${appeal_id} does not exist`);
    }

    // 2. Update appeal record
    const resolvedAt = status === 'resolved' || status === 'rejected' ? Timestamp.now() : undefined;

    await updateGradeAppealStatus(appeal_id, {
      status,
      resolution_notes,
      resolved_by: caller.uid,
      resolved_at: resolvedAt,
    });

    // 3. Notify the student (system)
    const statusLabels: Record<GradeAppealStatus, string> = {
      submitted: 'Submitted',
      under_review: 'Under Review',
      resolved: 'Resolved',
      rejected: 'Rejected',
    };

    await createNotification({
      user_id: appeal.student_id,
      title: 'Grade Appeal Status Updated',
      body: `Your grade appeal has been marked as "${statusLabels[status]}". Administrative notes: ${resolution_notes}`,
      type: 'system',
      target_url: '/grades',
    });

    // 4. Write Audit Log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.activeRole || 'coordinator',
      },
      action: 'grade_appeal.resolved',
      target_type: 'grade_appeal',
      target_id: appeal_id,
      description: `Grade appeal ${appeal_id} updated to "${status}" by ${caller.email}`,
      metadata: {
        previous_status: appeal.status,
        new_status: status,
        resolution_notes,
      },
    });

    return {
      ok: true,
      appeal_id,
      appeal_status: status,
    };
  } catch (err: unknown) {
    return toActionError(err);
  }
}
