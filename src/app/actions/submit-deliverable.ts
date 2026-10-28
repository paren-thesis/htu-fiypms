'use server';

export const runtime = 'nodejs';

import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getTeam } from '@/lib/models/team/repo';
import {
  submitDeliverableInSchema,
  type SubmitDeliverableIn,
} from '@/lib/models/software-deliverable/schema';
import {
  getDeliverable,
  upsertDeliverable,
} from '@/lib/models/software-deliverable/repo';

export interface SubmitDeliverableResult {
  ok: boolean;
  team_id?: string;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Server Action: Submit final software deliverables and environment setup notes.
 * Spec FR-08.1, FR-08.2, F-12.
 *
 * Enforces:
 * - Caller must be an authenticated student member of the team
 * - Allowed only when team.status is 'defense_ready' or 'completed'
 * - Blocked if the deliverable has already received formal supervisor sign-off
 * - Repository URL must be valid GitHub or GitLab link
 * - Environment setup notes must be markdown up to 20,000 characters
 */
export async function submitDeliverable(
  idTokenOrInput?: string | (SubmitDeliverableIn & { idToken?: string }),
  maybeInput?: SubmitDeliverableIn | string
): Promise<SubmitDeliverableResult> {
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
    const parsed = submitDeliverableInSchema.parse(rawInput);

    // 1. Verify team existence
    const team = await getTeam(parsed.team_id);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }

    // 2. Verify caller is a team member
    const memberIds = team.member_ids || [];
    if (!memberIds.includes(caller.uid)) {
      throw new HttpError(
        403,
        'NOT_TEAM_MEMBER',
        'You are not a member of this project team'
      );
    }

    // 3. Verify lifecycle status (defense_ready or completed)
    if (team.status !== 'defense_ready' && team.status !== 'completed') {
      throw new HttpError(
        400,
        'DELIVERABLE_NOT_OPEN',
        `Software deliverables can only be submitted when team status is defense_ready or completed (current: ${team.status})`
      );
    }

    // 4. Block modification if already signed off by supervisor (Spec F-12)
    const existing = await getDeliverable(parsed.team_id);
    if (existing?.approved_by_supervisor_at) {
      throw new HttpError(
        400,
        'DELIVERABLE_ALREADY_SIGNED_OFF',
        'Deliverables are locked and cannot be modified after supervisor sign-off'
      );
    }

    // 5. Upsert deliverable document
    await upsertDeliverable(parsed.team_id, {
      github_repository_url: parsed.github_repository_url,
      live_demo_url: parsed.live_demo_url || '',
      google_drive_url: parsed.google_drive_url || '',
      environment_setup_notes: parsed.environment_setup_notes,
      submitted_by_user_id: caller.uid,
    });

    // 6. Write audit log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: 'student',
      },
      action: 'deliverable.submitted',
      target_type: 'software_deliverable',
      target_id: parsed.team_id,
      metadata: {
        team_id: parsed.team_id,
        github_repository_url: parsed.github_repository_url,
        live_demo_url: parsed.live_demo_url || null,
        google_drive_url: parsed.google_drive_url || null,
      },
    });

    return {
      ok: true,
      team_id: parsed.team_id,
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
