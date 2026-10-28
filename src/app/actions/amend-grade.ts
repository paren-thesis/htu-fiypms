'use server';

export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import type { TeamDocument } from '@/types/firestore';

export const amendGradeInSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
    supervisor_score: z.number().min(0, 'Score cannot be negative').max(100, 'Score cannot exceed 100'),
    panel_average_score: z.number().min(0, 'Score cannot be negative').max(100, 'Score cannot exceed 100'),
    composite_final_score: z.number().min(0, 'Score cannot be negative').max(100, 'Score cannot exceed 100'),
    justification: z
      .string()
      .trim()
      .min(20, 'Written justification must be at least 20 characters in length'),
  })
  .strict();

export type AmendGradeIn = z.infer<typeof amendGradeInSchema>;

export interface AmendGradeResult {
  ok: boolean;
  team_id?: string;
  scores_summary?: {
    supervisor_score: number;
    panel_average_score: number;
    composite_final_score: number;
    is_locked: boolean;
  };
  error?: string;
  code?: string;
}

/**
 * Server Action: Post-publication administrative grade amendment.
 * Spec: FR-10.3.
 * Restricted strictly to Departmental Coordinators and Administrators.
 * Writes new scores, logs old and new in /audit_logs, and notifies team members.
 */
export async function amendGrade(
  idTokenOrInput?: string | (AmendGradeIn & { idToken?: string }),
  maybeInput?: AmendGradeIn | string
): Promise<AmendGradeResult> {
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

    const caller = await requireUser(idToken, ['coordinator', 'admin']);

    const parsed = amendGradeInSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { team_id, supervisor_score, panel_average_score, composite_final_score, justification } = parsed.data;

    const teamRef = adminDb.collection('teams').doc(team_id);
    const teamSnap = await teamRef.get();

    if (!teamSnap.exists) {
      throw new HttpError(404, 'NOT_FOUND', `Team ${team_id} does not exist`);
    }

    const teamData = teamSnap.data() as TeamDocument;
    const oldSummary = teamData.scores_summary || null;

    const newSummary = {
      supervisor_score: Number(supervisor_score.toFixed(2)),
      panel_average_score: Number(panel_average_score.toFixed(2)),
      composite_final_score: Number(composite_final_score.toFixed(2)),
      is_locked: true,
    };

    // Update team document
    await teamRef.update({
      scores_summary: newSummary,
      updated_at: FieldValue.serverTimestamp(),
    });

    // Write audit log (old, new, justification, timestamp)
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.activeRole || 'coordinator',
      },
      action: 'grades.amended',
      target_type: 'team',
      target_id: team_id,
      description: `Formal administrative grade amendment for team ${teamData.name} (${teamData.group_number || team_id})`,
      metadata: {
        old: oldSummary,
        new: newSummary,
        justification,
        timestamp: new Date().toISOString(),
      },
    });

    // Notify team members
    const memberIds = Array.isArray(teamData.member_ids) ? teamData.member_ids : [];
    for (const uid of memberIds) {
      await createNotification({
        user_id: uid,
        title: 'Final Grade Amended',
        body: `An official post-publication grade amendment was recorded for your team. Composite Score: ${newSummary.composite_final_score} / 100.`,
        type: 'system',
        target_url: '/grades',
      });
    }

    return {
      ok: true,
      team_id,
      scores_summary: newSummary,
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
