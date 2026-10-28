'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getTeam } from '@/lib/models/team/repo';
import { findPanelForTeam } from '@/lib/models/defense-panel/repo';
import { listEvaluationsForTeam } from '@/lib/models/evaluation/repo';
import { getRubric, getActiveRubric } from '@/lib/models/rubric/repo';
import { compositeScore } from '@/lib/defense/scoring';
import type { TeamDocument } from '@/types/firestore';

export interface AggregateDefenseInput {
  team_id: string;
}

export interface AggregateDefenseResult {
  ok: boolean;
  incomplete?: boolean;
  scores_summary?: NonNullable<TeamDocument['scores_summary']>;
  missingEvaluators?: string[];
  error?: string;
  code?: string;
  message?: string;
}

const aggregateDefenseInputSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
  })
  .strict();

/**
 * Aggregates defense scores for a team.
 * - Callable by the panel chair of the team's panel, coordinator, or admin.
 * - Loads the rubric referenced by evaluations (or active rubric).
 * - Recomputes every total from scores (ignores client total_score).
 * - Counts only evaluations from the team's assigned supervisor and members of the team's panel (chair + examiners).
 * - Writes team.scores_summary { supervisor_score, panel_average_score, composite_final_score, is_locked: false }.
 * - grade_classification stays unset (Decision D-02).
 * - Returns the list of missing evaluators.
 * - Idempotent: re-running gives the identical result.
 */
export async function aggregateDefense(
  idTokenOrInput?: string | (AggregateDefenseInput & { idToken?: string }),
  maybeInput?: AggregateDefenseInput | string
): Promise<AggregateDefenseResult> {
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

    const user = await requireUser(idToken, [
      'coordinator',
      'admin',
      'panel_chair',
      'panel_member',
      'supervisor',
    ]);

    const { team_id: teamId } = aggregateDefenseInputSchema.parse(rawInput);

    // 1. Fetch team
    const team = await getTeam(teamId);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', `Team not found: ${teamId}`);
    }

    // 2. Locate the team's defense panel
    const panelInfo = await findPanelForTeam(teamId, team.academic_year_id);
    if (!panelInfo) {
      throw new HttpError(
        404,
        'PANEL_NOT_FOUND',
        `No defense panel scheduled for team: ${teamId}`
      );
    }

    const { panel } = panelInfo;

    // 3. Authorization: coordinator, admin, or the panel chair of this team's panel
    const isCoordinatorOrAdmin =
      user.roles.includes('coordinator') ||
      user.roles.includes('admin') ||
      user.activeRole === 'coordinator' ||
      user.activeRole === 'admin';

    const isPanelChair = panel.chair_id === user.uid;

    if (!isCoordinatorOrAdmin && !isPanelChair) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        'Only the panel chair of the team\'s panel, coordinator, or admin can aggregate defense scores'
      );
    }

    // 4. Fetch all evaluations for this team
    const allEvaluations = await listEvaluationsForTeam(teamId);

    // 5. Filter for approved evaluators (assigned supervisor and panel members only)
    const supervisorUid = team.assigned_supervisor_id;
    const panelMemberUids = new Set([panel.chair_id, ...(panel.examiner_ids || [])]);

    // Supervisor evaluation
    const supervisorEval = supervisorUid
      ? allEvaluations.find((e) => e.evaluator_id === supervisorUid) || null
      : null;

    // Panel evaluations (chair and examiners only; ignore supervisor if they overlap)
    const panelEvals = allEvaluations.filter(
      (e) => panelMemberUids.has(e.evaluator_id) && e.evaluator_id !== supervisorUid
    );

    // 6. Compute expected vs missing evaluators
    const expectedEvaluators: string[] = [];
    if (supervisorUid) {
      expectedEvaluators.push(supervisorUid);
    }
    expectedEvaluators.push(panel.chair_id);
    for (const examinerId of panel.examiner_ids || []) {
      if (!expectedEvaluators.includes(examinerId)) {
        expectedEvaluators.push(examinerId);
      }
    }

    const submittedEvaluatorIds = new Set(
      allEvaluations
        .filter((e) => e.evaluator_id === supervisorUid || panelMemberUids.has(e.evaluator_id))
        .map((e) => e.evaluator_id)
    );

    const missingEvaluators = expectedEvaluators.filter(
      (uid) => !submittedEvaluatorIds.has(uid)
    );

    // 7. Load rubric
    const referencedRubricId =
      supervisorEval?.rubric_id || panelEvals[0]?.rubric_id;

    let rubric = referencedRubricId ? await getRubric(referencedRubricId) : null;
    if (!rubric) {
      rubric = await getActiveRubric();
    }

    if (!rubric) {
      throw new HttpError(
        400,
        'RUBRIC_NOT_FOUND',
        'No valid rubric found for scoring aggregation'
      );
    }

    // 8. Compute composite score (pure function recomputes totals directly from scores)
    const scoringResult = compositeScore(rubric, supervisorEval, panelEvals);

    if (scoringResult.incomplete) {
      return {
        ok: false,
        incomplete: true,
        error: 'INCOMPLETE_EVALUATIONS',
        message: 'Evaluation incomplete: supervisor or panel evaluations are missing',
        missingEvaluators,
      };
    }

    // 9. Write team.scores_summary with is_locked: false (grade_classification stays unset)
    const scoresSummary: NonNullable<TeamDocument['scores_summary']> = {
      supervisor_score: scoringResult.supervisor_score!,
      panel_average_score: scoringResult.panel_average_score!,
      composite_final_score: scoringResult.composite_final_score!,
      is_locked: false,
    };

    await adminDb.collection('teams').doc(teamId).update({
      scores_summary: scoresSummary,
      updated_at: FieldValue.serverTimestamp(),
    });

    // 10. Audit log
    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        activeRole: user.activeRole,
      },
      action: 'defense.aggregated',
      target_type: 'team',
      target_id: teamId,
      description: `Aggregated defense scores for team ${teamId}`,
      metadata: {
        scores_summary: scoresSummary,
        missing_evaluators: missingEvaluators,
      },
    });

    return {
      ok: true,
      scores_summary: scoresSummary,
      missingEvaluators,
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
