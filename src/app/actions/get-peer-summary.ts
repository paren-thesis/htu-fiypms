'use server';

export const runtime = 'nodejs';

import { z } from 'zod';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { getTeam } from '@/lib/models/team/repo';
import { listPeerEvaluationsForTeam } from '@/lib/models/peer-evaluation/repo';
import { summarise, type PeerSummary } from '@/lib/peer/summary';

export interface GetPeerSummaryInput {
  team_id: string;
}

export interface GetPeerSummaryResult {
  ok: boolean;
  summary?: PeerSummary;
  team_id?: string;
  error?: string;
  code?: string;
  message?: string;
}

const getPeerSummaryInputSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
  })
  .strict();

/**
 * Server Action: Get aggregated peer evaluation summary for a team.
 * Spec FR-06.5, FR-06.6.
 *
 * Enforces:
 * - Caller must have role: 'supervisor', 'coordinator', or 'admin'
 * - If supervisor, must be the assigned supervisor for the team
 * - Returns ONLY aggregated summaries: NO rater identities, NO raw rows.
 */
export async function getPeerSummary(
  idTokenOrInput?: string | (GetPeerSummaryInput & { idToken?: string }),
  maybeInput?: GetPeerSummaryInput | string
): Promise<GetPeerSummaryResult> {
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

    const caller = await requireUser(idToken, ['supervisor', 'coordinator', 'admin']);
    const parsed = getPeerSummaryInputSchema.parse(rawInput);

    const team = await getTeam(parsed.team_id);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }

    // Role check: supervisors can only view summary for their own assigned teams
    const isCoordinatorOrAdmin =
      caller.roles.includes('coordinator') ||
      caller.roles.includes('admin') ||
      caller.activeRole === 'coordinator' ||
      caller.activeRole === 'admin';

    if (!isCoordinatorOrAdmin) {
      if (team.assigned_supervisor_id !== caller.uid) {
        throw new HttpError(
          403,
          'FORBIDDEN_SUPERVISOR',
          'You are not the assigned supervisor for this project team'
        );
      }
    }

    const rawEvaluations = await listPeerEvaluationsForTeam(parsed.team_id);

    // Run pure summary: strips all evaluator identities, returns per-student aggregates
    const summary = summarise(rawEvaluations, team.member_ids);

    return {
      ok: true,
      team_id: parsed.team_id,
      summary,
    };
  } catch (err) {
    const actionErr = toActionError(err);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
      message: actionErr.error,
    };
  }
}
