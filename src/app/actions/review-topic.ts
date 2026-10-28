'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser, type AuthenticatedUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { getTopic } from '@/lib/models/topic/repo';
import { getTeam } from '@/lib/models/team/repo';
import { getStaffWhitelist } from '@/lib/models/staff-whitelist/repo';
import { canTransition } from '@/lib/topics/state-machine';
import { ensureContactGrants } from '@/lib/contacts/grants';
import type { TeamDocument, TopicDocument } from '@/types/firestore';

export interface ReviewTopicResult {
  ok: boolean;
  topicId?: string;
  status?: string | number;
  error?: string;
  code?: string;
}

const openTopicSchema = z.object({
  topicId: z.string().min(1, 'Topic ID is required'),
});

const decideTopicSchema = z
  .object({
    topicId: z.string().min(1, 'Topic ID is required'),
    decision: z.enum(['approve', 'reject', 'request_revision']),
    review_notes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'reject' || data.decision === 'request_revision') {
      if (!data.review_notes || data.review_notes.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['review_notes'],
          message: 'Review notes (min 5 characters) are required when requesting revisions or rejecting a proposal.',
        });
      }
    }
  });

export type DecideTopicInput = z.infer<typeof decideTopicSchema>;

/**
 * Validates reviewer authorization against team assignment and programme scope (Spec FR-03.4, FR-04.2a).
 * - Coordinators and admins may review any proposal.
 * - If the team has an assigned supervisor, ONLY that supervisor (or coord/admin) may review.
 * - Otherwise, any supervisor whose staff_whitelist.programmes includes the team's course_id may review.
 * - Students and supervisors of different programmes are denied (403).
 */
async function verifyReviewerAuth(
  caller: AuthenticatedUser,
  team: TeamDocument
): Promise<void> {
  const isCoordOrAdmin =
    caller.activeRole === 'coordinator' ||
    caller.activeRole === 'admin' ||
    caller.roles.includes('coordinator') ||
    caller.roles.includes('admin');

  if (isCoordOrAdmin) {
    return;
  }

  const isSupervisor =
    caller.activeRole === 'supervisor' || caller.roles.includes('supervisor');

  if (!isSupervisor) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Students and unauthorized roles are not permitted to review project proposals.'
    );
  }

  // 1. If assigned supervisor exists, only they may review
  if (team.assigned_supervisor_id) {
    if (team.assigned_supervisor_id !== caller.uid) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        'This team has an assigned supervisor. Only the assigned supervisor or coordinator may review proposals.'
      );
    }
    return;
  }

  // 2. Otherwise, supervisor must have team's course_id in their whitelist programmes
  const staffDoc = await getStaffWhitelist(caller.email);
  if (!staffDoc) {
    throw new HttpError(
      403,
      'STAFF_NOT_WHITELISTED',
      'Supervisor profile is not found in staff whitelist.'
    );
  }

  const teamCourse = team.course_id.toLowerCase();
  const hasProgramme = Array.isArray(staffDoc.programmes) &&
    staffDoc.programmes.some((prog) => prog.toLowerCase() === teamCourse);

  if (!hasProgramme) {
    throw new HttpError(
      403,
      'PROGRAMME_MISMATCH',
      `You are not authorized to review proposals for programme "${team.course_id}".`
    );
  }
}

/**
 * Moves a submitted proposal into under_review state (Spec FR-03.2).
 */
export async function openTopic(
  idToken: string,
  input: { topicId: string }
): Promise<ReviewTopicResult> {
  try {
    const caller = await requireUser(idToken, ['supervisor', 'coordinator', 'admin']);
    const parsed = openTopicSchema.parse(input);

    const topic = await getTopic(parsed.topicId);
    if (!topic) {
      throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic proposal not found.');
    }

    const team = await getTeam(topic.team_id);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Project team not found.');
    }

    await verifyReviewerAuth(caller, team);

    if (topic.status === 'under_review') {
      return { ok: true, topicId: topic.id, status: 'under_review' };
    }

    if (!canTransition(topic.status, 'under_review', 'supervisor')) {
      throw new HttpError(
        400,
        'INVALID_TRANSITION',
        `Cannot open topic with status "${topic.status}". Proposal must be in submitted state.`
      );
    }

    await adminDb.collection('topics').doc(topic.id).update({
      status: 'under_review',
      reviewed_by_user_id: caller.uid,
      reviewed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      topicId: topic.id,
      status: 'under_review',
    };
  } catch (error) {
    return toActionError(error) as ReviewTopicResult;
  }
}

/**
 * Decides a topic proposal: approve | reject | request_revision (Spec FR-03.4).
 * - Review notes required for reject and revision.
 * - Approve runs in a transaction:
 *   - Team must have no approved_topic_id (duplicate approval returns 409).
 *   - Sets topic status approved, team approved_topic_id and status topic_approved.
 *   - Writes audit log and notifies team members.
 *   - Calls ensureContactGrants.
 */
export async function decideTopic(
  idToken: string,
  input: DecideTopicInput
): Promise<ReviewTopicResult> {
  try {
    const caller = await requireUser(idToken, ['supervisor', 'coordinator', 'admin']);
    const parsed = decideTopicSchema.parse(input);

    const initialTopic = await getTopic(parsed.topicId);
    if (!initialTopic) {
      throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic proposal not found.');
    }

    const initialTeam = await getTeam(initialTopic.team_id);
    if (!initialTeam) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Project team not found.');
    }

    await verifyReviewerAuth(caller, initialTeam);

    const topicRef = adminDb.collection('topics').doc(parsed.topicId);
    const teamRef = adminDb.collection('teams').doc(initialTeam.id);

    let targetStatus: 'approved' | 'rejected' | 'revision_requested';
    let auditAction: 'topic.approved' | 'topic.rejected' | 'topic.revision_requested';

    if (parsed.decision === 'approve') {
      targetStatus = 'approved';
      auditAction = 'topic.approved';
    } else if (parsed.decision === 'reject') {
      targetStatus = 'rejected';
      auditAction = 'topic.rejected';
    } else {
      targetStatus = 'revision_requested';
      auditAction = 'topic.revision_requested';
    }

    let finalTopicTitle = initialTopic.title;
    let finalTeamMemberIds = initialTeam.member_ids;

    await adminDb.runTransaction(async (tx) => {
      const topicSnap = await tx.get(topicRef);
      if (!topicSnap.exists) {
        throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic proposal not found.');
      }
      const topicDoc = topicSnap.data() as TopicDocument;
      finalTopicTitle = topicDoc.title;

      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', 'Project team not found.');
      }
      const teamDoc = teamSnap.data() as TeamDocument;
      finalTeamMemberIds = teamDoc.member_ids;

      if (parsed.decision === 'approve') {
        if (teamDoc.approved_topic_id) {
          throw new HttpError(
            409,
            'TOPIC_ALREADY_APPROVED',
            'This team already has an approved topic proposal.'
          );
        }
      }

      // Check transition legitimacy
      const allowedFromStatuses = ['under_review', 'submitted'];
      if (!allowedFromStatuses.includes(topicDoc.status)) {
        throw new HttpError(
          400,
          'INVALID_TRANSITION',
          `Cannot ${parsed.decision} topic currently in status "${topicDoc.status}".`
        );
      }

      // 1. Update Topic
      tx.update(topicRef, {
        status: targetStatus,
        reviewed_by_user_id: caller.uid,
        review_notes: parsed.review_notes || null,
        reviewed_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      // 2. If approved, update Team
      if (parsed.decision === 'approve') {
        tx.update(teamRef, {
          approved_topic_id: topicRef.id,
          status: 'topic_approved',
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      // 3. Write Audit Log
      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: caller.activeRole,
        },
        action: auditAction,
        target_type: 'topics',
        target_id: topicRef.id,
        description: `${auditAction} on proposal "${topicDoc.title}" for group ${teamDoc.group_number}`,
        metadata: {
          team_id: teamRef.id,
          preference_rank: topicDoc.preference_rank,
          decision: parsed.decision,
        },
      });
    });

    // Post-transaction tasks
    if (parsed.decision === 'approve') {
      await ensureContactGrants(adminDb, initialTeam.id);
    }

    // In-app notifications to all team members
    const notifTitle =
      parsed.decision === 'approve'
        ? 'Topic Proposal Approved!'
        : parsed.decision === 'reject'
        ? 'Topic Proposal Rejected'
        : 'Revision Requested on Proposal';

    const notifBody =
      parsed.decision === 'approve'
        ? `Your project proposal "${finalTopicTitle}" has been approved for execution.`
        : parsed.decision === 'reject'
        ? `Your project proposal "${finalTopicTitle}" was not approved: ${parsed.review_notes}`
        : `Revisions requested on "${finalTopicTitle}": ${parsed.review_notes}`;

    await notify(finalTeamMemberIds, {
      title: notifTitle,
      body: notifBody,
      type: 'topic_status',
      target_url: '/proposals',
    });

    return {
      ok: true,
      topicId: parsed.topicId,
      status: targetStatus,
    };
  } catch (error) {
    return toActionError(error) as ReviewTopicResult;
  }
}
