'use server';

export const runtime = 'nodejs';

import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getTeam } from '@/lib/models/team/repo';
import {
  createPeerEvaluationInSchema,
  type CreatePeerEvaluationIn,
} from '@/lib/models/peer-evaluation/schema';
import {
  getPeerEvaluation,
  createPeerEvaluationDoc,
} from '@/lib/models/peer-evaluation/repo';
import { peerEvaluationId } from '@/lib/models/peer-evaluation/peer-id';

export interface SubmitPeerEvaluationResult {
  ok: boolean;
  id?: string;
  average_score?: number;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Server Action: Submit confidential peer evaluation for a teammate.
 * Spec FR-06.4, FR-06.5, FR-06.6, F-09.
 *
 * Enforces:
 * - Caller must be an authenticated student
 * - Caller must belong to the team
 * - Evaluatee must be a different teammate on the same team (no self-evaluations)
 * - Allowed only when team.status is 'defense_ready' or 'completed'
 * - Scores must be integers 1 to 10
 * - average_score is computed server-side to 1 decimal place
 * - Immutable once written (rejects duplicate submissions with 409)
 */
export async function submitPeerEvaluation(
  idTokenOrInput?: string | (CreatePeerEvaluationIn & { idToken?: string }),
  maybeInput?: CreatePeerEvaluationIn | string
): Promise<SubmitPeerEvaluationResult> {
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

    const caller = await requireUser(idToken, ['student']);
    const parsed = createPeerEvaluationInSchema.parse(rawInput);

    // 1. Prevent self-rating
    if (parsed.evaluatee_id === caller.uid) {
      throw new HttpError(
        400,
        'SELF_EVALUATION_NOT_ALLOWED',
        'You cannot evaluate yourself'
      );
    }

    // 2. Verify team existence
    const team = await getTeam(parsed.team_id);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }

    // 3. Verify lifecycle status
    if (team.status !== 'defense_ready' && team.status !== 'completed') {
      throw new HttpError(
        400,
        'PEER_EVALUATION_NOT_OPEN',
        `Peer evaluations are only open when team status is defense_ready or completed (current: ${team.status})`
      );
    }

    // 4. Verify caller is a teammate
    const memberIds = team.member_ids || [];
    if (!memberIds.includes(caller.uid)) {
      throw new HttpError(
        403,
        'NOT_TEAM_MEMBER',
        'You are not a member of this project team'
      );
    }

    // 5. Verify evaluatee is a teammate
    if (!memberIds.includes(parsed.evaluatee_id)) {
      throw new HttpError(
        400,
        'INVALID_EVALUATEE',
        'The student being evaluated is not a member of your project team'
      );
    }

    // 6. Check immutability / duplicate submission
    const id = peerEvaluationId(parsed.team_id, caller.uid, parsed.evaluatee_id);
    const existing = await getPeerEvaluation(id);
    if (existing) {
      throw new HttpError(
        409,
        'ALREADY_SUBMITTED',
        'You have already submitted a peer evaluation for this teammate'
      );
    }

    // 7. Compute average score (1 decimal place)
    const average_score =
      Math.round(
        ((parsed.punctuality_score +
          parsed.technical_contribution_score +
          parsed.teamwork_score) /
          3) *
          10
      ) / 10;

    // 8. Create document
    await createPeerEvaluationDoc(id, {
      team_id: parsed.team_id,
      evaluator_id: caller.uid,
      evaluatee_id: parsed.evaluatee_id,
      punctuality_score: parsed.punctuality_score,
      technical_contribution_score: parsed.technical_contribution_score,
      teamwork_score: parsed.teamwork_score,
      average_score,
      comments: parsed.comments || '',
    });

    // 9. Write audit log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: 'student',
      },
      action: 'grade.submitted',
      target_type: 'peer_evaluation',
      target_id: id,
      metadata: {
        team_id: parsed.team_id,
        evaluatee_id: parsed.evaluatee_id,
        average_score,
      },
    });

    return {
      ok: true,
      id,
      average_score,
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
