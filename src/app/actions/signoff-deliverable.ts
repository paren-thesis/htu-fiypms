'use server';

export const runtime = 'nodejs';

import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getTeam } from '@/lib/models/team/repo';
import { createNotification } from '@/lib/models/notification/repo';
import {
  signoffDeliverableInSchema,
  type SignoffDeliverableIn,
} from '@/lib/models/software-deliverable/schema';
import {
  getDeliverable,
  recordSupervisorSignoff,
} from '@/lib/models/software-deliverable/repo';

export interface SignoffDeliverableResult {
  ok: boolean;
  team_id?: string;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Server Action: Formal supervisor sign-off on a team's software deliverable.
 * Spec FR-08.3, F-12.
 *
 * Enforces:
 * - Caller must be the assigned supervisor for the project team
 * - Deliverable must already be submitted
 * - Sets approved_by_supervisor_at timestamp and supervisor_signoff_notes
 * - Logs audit event 'deliverable.signed_off'
 * - Dispatches notifications to all team members
 */
export async function signoffDeliverable(
  idTokenOrInput?: string | (SignoffDeliverableIn & { idToken?: string }),
  maybeInput?: SignoffDeliverableIn | string
): Promise<SignoffDeliverableResult> {
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
    const parsed = signoffDeliverableInSchema.parse(rawInput);

    // 1. Verify team existence
    const team = await getTeam(parsed.team_id);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }

    // 2. Enforce assigned supervisor ownership (Spec F-12)
    // Non-assigned supervisors (even if supervisor role) cannot sign off!
    if (team.assigned_supervisor_id !== caller.uid) {
      throw new HttpError(
        403,
        'FORBIDDEN_SUPERVISOR',
        'Only the assigned supervisor can formally sign off on this team software deliverable'
      );
    }

    // 3. Verify deliverable has been submitted
    const deliverable = await getDeliverable(parsed.team_id);
    if (!deliverable) {
      throw new HttpError(
        400,
        'NO_DELIVERABLE_FOUND',
        'Deliverable has not been submitted yet for this team'
      );
    }

    // 4. Record sign-off in repo
    await recordSupervisorSignoff(parsed.team_id, parsed.supervisor_signoff_notes);

    // 5. Write audit log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.activeRole || 'supervisor',
      },
      action: 'deliverable.signed_off',
      target_type: 'software_deliverable',
      target_id: parsed.team_id,
      metadata: {
        team_id: parsed.team_id,
        supervisor_signoff_notes: parsed.supervisor_signoff_notes || '',
      },
    });

    // 6. Notify team members
    const memberIds = team.member_ids || [];
    for (const memberId of memberIds) {
      try {
        await createNotification({
          user_id: memberId,
          title: 'Software Deliverable Approved',
          body: `Your project supervisor has verified and signed off on your final software deliverables.`,
          type: 'team_update',
          target_url: '/deliverables',
        });
      } catch (notifyErr) {
        console.error('Failed to dispatch sign-off notification to member:', memberId, notifyErr);
      }
    }

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
