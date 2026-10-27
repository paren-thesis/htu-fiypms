'use server';

import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { getTeam } from '@/lib/models/team/repo';
import {
  topicInputSchema,
  topicUpdateInputSchema,
  topicSubmitActionSchema,
  topicResubmitActionSchema,
  type TopicInput,
  type TopicUpdateInput,
  type TopicSubmitActionInput,
  type TopicResubmitActionInput,
} from '@/lib/models/topic/schema';
import { canTransition } from '@/lib/topics/state-machine';
import {
  findSimilarTopics,
  type SimilarTopicWarning,
} from '@/lib/topics/similar';
import { listApprovedHistoricalTopics } from '@/lib/models/topic/repo';
import type { TopicDocument } from '@/types/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface SubmitTopicResult {
  ok: boolean;
  topicId?: string;
  status?: string | number;
  version?: number;
  warnings?: SimilarTopicWarning[];
  error?: string;
  code?: string;
}

/**
 * 1. Create a Topic Proposal Draft (Spec FR-03.1)
 * Any student team member may draft.
 * Rules:
 * - Max 3 current topics per team.
 * - Preference rank (1, 2, 3) must be unique among current topics.
 */
export async function createTopicDraft(
  idToken: string,
  input: TopicInput
): Promise<SubmitTopicResult> {
  try {
    const caller = await requireUser(idToken, ['student']);
    const parsed = topicInputSchema.parse(input);

    const team = await getTeam(parsed.teamId);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
    }

    if (!team.member_ids.includes(caller.uid)) {
      throw new HttpError(
        403,
        'FORBIDDEN_NOT_TEAM_MEMBER',
        'You must be an active member of this team to draft proposals.'
      );
    }

    const newTopicRef = adminDb.collection('topics').doc();

    await adminDb.runTransaction(async (tx) => {
      // Check existing current topics for this team
      const existingTopicsSnap = await tx.get(
        adminDb
          .collection('topics')
          .where('team_id', '==', parsed.teamId)
          .where('is_current', '==', true)
      );

      if (existingTopicsSnap.size >= 3) {
        throw new HttpError(
          400,
          'MAX_TOPICS_REACHED',
          'Each team may have at most 3 active topic proposals.'
        );
      }

      for (const doc of existingTopicsSnap.docs) {
        const data = doc.data() as TopicDocument;
        if (data.preference_rank === parsed.preference_rank) {
          throw new HttpError(
            409,
            'DUPLICATE_RANK',
            `Preference rank ${parsed.preference_rank} is already assigned to proposal "${data.title}".`
          );
        }
      }

      const topicData: Omit<TopicDocument, 'id'> = {
        team_id: parsed.teamId,
        title: parsed.title,
        abstract: parsed.abstract,
        problem_statement: parsed.problem_statement,
        proposed_solution: parsed.proposed_solution,
        tech_stack: parsed.tech_stack,
        preference_rank: parsed.preference_rank,
        version: 1,
        is_current: true,
        status: 'draft',
        submitted_at: Timestamp.now(),
      };

      tx.set(newTopicRef, {
        ...topicData,
        academic_year_id: team.academic_year_id,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });

      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          name: caller.email,
          role: 'student',
        },
        action: 'topic.created_draft',
        target_type: 'topic',
        target_id: newTopicRef.id,
        details: `Created draft topic "${parsed.title}" (Rank ${parsed.preference_rank})`,
        metadata: {
          team_id: parsed.teamId,
          preference_rank: parsed.preference_rank,
        },
      });
    });

    return {
      ok: true,
      topicId: newTopicRef.id,
      status: 'draft',
      version: 1,
    };
  } catch (error) {
    return toActionError(error) as SubmitTopicResult;
  }
}

/**
 * 2. Edit a Topic Proposal Draft
 * Any team member may edit while in 'draft' status.
 */
export async function updateTopicDraft(
  idToken: string,
  input: TopicUpdateInput
): Promise<SubmitTopicResult> {
  try {
    const caller = await requireUser(idToken, ['student']);
    const parsed = topicUpdateInputSchema.parse(input);

    const topicRef = adminDb.collection('topics').doc(parsed.topicId);

    await adminDb.runTransaction(async (tx) => {
      const topicSnap = await tx.get(topicRef);
      if (!topicSnap.exists) {
        throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic proposal not found.');
      }

      const topic = topicSnap.data() as TopicDocument;
      if (topic.status !== 'draft') {
        throw new HttpError(
          400,
          'CANNOT_EDIT_NON_DRAFT',
          `Cannot edit proposal in "${topic.status}" status. Only drafts can be modified.`
        );
      }

      const team = await getTeam(topic.team_id);
      if (!team || !team.member_ids.includes(caller.uid)) {
        throw new HttpError(
          403,
          'FORBIDDEN_NOT_TEAM_MEMBER',
          'You must be a member of the project team to update this proposal.'
        );
      }

      // If updating preference_rank, verify uniqueness among team's current topics
      if (
        parsed.preference_rank &&
        parsed.preference_rank !== topic.preference_rank
      ) {
        const teamTopicsSnap = await tx.get(
          adminDb
            .collection('topics')
            .where('team_id', '==', topic.team_id)
            .where('is_current', '==', true)
        );

        for (const doc of teamTopicsSnap.docs) {
          if (doc.id === parsed.topicId) continue;
          const data = doc.data() as TopicDocument;
          if (data.preference_rank === parsed.preference_rank) {
            throw new HttpError(
              409,
              'DUPLICATE_RANK',
              `Preference rank ${parsed.preference_rank} is already assigned to another proposal.`
            );
          }
        }
      }

      const updates: Record<string, unknown> = {
        updated_at: FieldValue.serverTimestamp(),
      };
      if (parsed.title) updates.title = parsed.title;
      if (parsed.abstract) updates.abstract = parsed.abstract;
      if (parsed.problem_statement) updates.problem_statement = parsed.problem_statement;
      if (parsed.proposed_solution) updates.proposed_solution = parsed.proposed_solution;
      if (parsed.tech_stack) updates.tech_stack = parsed.tech_stack;
      if (parsed.preference_rank) updates.preference_rank = parsed.preference_rank;

      tx.update(topicRef, updates);

      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          name: caller.email,
          role: 'student',
        },
        action: 'topic.updated_draft',
        target_type: 'topic',
        target_id: parsed.topicId,
        details: `Updated draft proposal "${parsed.title || topic.title}"`,
      });
    });

    return {
      ok: true,
      topicId: parsed.topicId,
      status: 'draft',
    };
  } catch (error) {
    return toActionError(error) as SubmitTopicResult;
  }
}

/**
 * 3. Submit a Topic Proposal (Spec FR-03.1, FR-03.2)
 * Rules:
 * - Only the designated Team Leader may submit.
 * - Team must have at least 4 members.
 * - Transitions status from 'draft' to 'submitted'.
 * - First submission flips team.status from 'formation' to 'topic_pending'.
 * - Checks similarity against past approved topics (warnings returned, never blocks).
 */
export async function submitTopic(
  idToken: string,
  input: TopicSubmitActionInput
): Promise<SubmitTopicResult> {
  try {
    const caller = await requireUser(idToken, ['student']);
    const parsed = topicSubmitActionSchema.parse(input);

    const topicRef = adminDb.collection('topics').doc(parsed.topicId);
    let teamId = '';
    let submittedTopicTitle = '';
    let submittedTechStack: string[] = [];
    let academicYearId = '';
    let teamMemberIds: string[] = [];

    await adminDb.runTransaction(async (tx) => {
      const topicSnap = await tx.get(topicRef);
      if (!topicSnap.exists) {
        throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic proposal not found.');
      }

      const topic = topicSnap.data() as TopicDocument;
      teamId = topic.team_id;
      submittedTopicTitle = topic.title;
      submittedTechStack = topic.tech_stack || [];

      const teamRef = adminDb.collection('teams').doc(topic.team_id);
      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      }

      const team = teamSnap.data() as {
        leader_id: string;
        member_ids: string[];
        member_count: number;
        status: string;
        academic_year_id: string;
      };

      academicYearId = team.academic_year_id;
      teamMemberIds = team.member_ids;

      if (!team.member_ids.includes(caller.uid)) {
        throw new HttpError(
          403,
          'FORBIDDEN_NOT_TEAM_MEMBER',
          'You must be a member of the team to submit this proposal.'
        );
      }

      if (team.leader_id !== caller.uid) {
        throw new HttpError(
          403,
          'FORBIDDEN_NOT_LEADER',
          'Only the designated Team Leader can submit proposals.'
        );
      }

      if (team.member_count < 4) {
        throw new HttpError(
          400,
          'INSUFFICIENT_MEMBERS',
          'Teams must have at least 4 members to submit project proposals.'
        );
      }

      if (!canTransition(topic.status, 'submitted', 'team')) {
        throw new HttpError(
          400,
          'INVALID_STATE_TRANSITION',
          `Cannot submit topic in status "${topic.status}".`
        );
      }

      // First submission sets team.status to 'topic_pending'
      if (team.status === 'formation') {
        tx.update(teamRef, {
          status: 'topic_pending',
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      tx.update(topicRef, {
        status: 'submitted',
        submitted_at: Timestamp.now(),
        updated_at: FieldValue.serverTimestamp(),
      });

      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          name: caller.email,
          role: 'student',
        },
        action: 'topic.submitted',
        target_type: 'topic',
        target_id: parsed.topicId,
        details: `Submitted proposal "${topic.title}" (Rank ${topic.preference_rank})`,
        metadata: {
          team_id: teamId,
          preference_rank: topic.preference_rank,
        },
      });
    });

    // Check similarity against historical approved topics (non-blocking)
    const historicalTopics = await listApprovedHistoricalTopics(academicYearId, 300);
    const warnings = findSimilarTopics(
      { title: submittedTopicTitle, tech_stack: submittedTechStack },
      historicalTopics,
      0.6
    );

    // Notify team members
    await notify(teamMemberIds, {
      type: 'topic_status',
      title: 'Proposal Submitted',
      body: `Your Team Leader submitted project proposal "${submittedTopicTitle}".`,
      target_url: '/proposals',
    }).catch((err) => {
      console.error('Failed to notify team of topic submission:', err);
    });

    return {
      ok: true,
      topicId: parsed.topicId,
      status: 'submitted',
      warnings,
    };
  } catch (error) {
    return toActionError(error) as SubmitTopicResult;
  }
}

/**
 * 4. Resubmit a Revision-Requested or Rejected Topic Proposal (Spec FR-03.3)
 * Runs in a transaction:
 * - Copies current doc snapshot to topics/{id}/history/{version}.
 * - Increments version += 1.
 * - Sets status: 'submitted'.
 * - Keeps is_current: true.
 * - Checks similarity against past approved topics (warnings returned, never blocks).
 */
export async function resubmitTopic(
  idToken: string,
  input: TopicResubmitActionInput
): Promise<SubmitTopicResult> {
  try {
    const caller = await requireUser(idToken, ['student']);
    const parsed = topicResubmitActionSchema.parse(input);

    const topicRef = adminDb.collection('topics').doc(parsed.topicId);
    let newVersion = 1;
    let submittedTopicTitle = '';
    let submittedTechStack: string[] = [];
    let academicYearId = '';
    let teamMemberIds: string[] = [];

    await adminDb.runTransaction(async (tx) => {
      const topicSnap = await tx.get(topicRef);
      if (!topicSnap.exists) {
        throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic proposal not found.');
      }

      const topic = topicSnap.data() as TopicDocument;
      const teamRef = adminDb.collection('teams').doc(topic.team_id);
      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      }

      const team = teamSnap.data() as {
        leader_id: string;
        member_ids: string[];
        member_count: number;
        academic_year_id: string;
      };

      academicYearId = team.academic_year_id;
      teamMemberIds = team.member_ids;

      if (!team.member_ids.includes(caller.uid)) {
        throw new HttpError(
          403,
          'FORBIDDEN_NOT_TEAM_MEMBER',
          'You must be a member of the team to resubmit this proposal.'
        );
      }

      if (team.leader_id !== caller.uid) {
        throw new HttpError(
          403,
          'FORBIDDEN_NOT_LEADER',
          'Only the designated Team Leader can resubmit proposals.'
        );
      }

      if (team.member_count < 4) {
        throw new HttpError(
          400,
          'INSUFFICIENT_MEMBERS',
          'Teams must have at least 4 members to submit project proposals.'
        );
      }

      if (!canTransition(topic.status, 'submitted', 'team')) {
        throw new HttpError(
          400,
          'INVALID_STATE_TRANSITION',
          `Cannot resubmit proposal in status "${topic.status}". Allowed states: revision_requested, rejected.`
        );
      }

      // Copy current version snapshot into topics/{id}/history/{version}
      const currentVersion = topic.version || 1;
      const historyRef = topicRef.collection('history').doc(String(currentVersion));

      tx.set(historyRef, {
        ...topic,
        archived_at: Timestamp.now(),
      });

      newVersion = currentVersion + 1;
      submittedTopicTitle = parsed.title || topic.title;
      submittedTechStack = parsed.tech_stack || topic.tech_stack || [];

      const updates: Record<string, unknown> = {
        version: newVersion,
        status: 'submitted',
        is_current: true,
        submitted_at: Timestamp.now(),
        updated_at: FieldValue.serverTimestamp(),
      };

      if (parsed.title) updates.title = parsed.title;
      if (parsed.abstract) updates.abstract = parsed.abstract;
      if (parsed.problem_statement) updates.problem_statement = parsed.problem_statement;
      if (parsed.proposed_solution) updates.proposed_solution = parsed.proposed_solution;
      if (parsed.tech_stack) updates.tech_stack = parsed.tech_stack;

      tx.update(topicRef, updates);

      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          name: caller.email,
          role: 'student',
        },
        action: 'topic.resubmitted',
        target_type: 'topic',
        target_id: parsed.topicId,
        details: `Resubmitted proposal "${submittedTopicTitle}" to version ${newVersion}`,
        metadata: {
          previous_version: currentVersion,
          new_version: newVersion,
        },
      });
    });

    // Check similarity (non-blocking)
    const historicalTopics = await listApprovedHistoricalTopics(academicYearId, 300);
    const warnings = findSimilarTopics(
      { title: submittedTopicTitle, tech_stack: submittedTechStack },
      historicalTopics,
      0.6
    );

    // Notify team members
    await notify(teamMemberIds, {
      type: 'topic_status',
      title: 'Proposal Resubmitted',
      body: `Your Team Leader resubmitted project proposal "${submittedTopicTitle}" (v${newVersion}).`,
      target_url: '/proposals',
    }).catch((err) => {
      console.error('Failed to notify team of topic resubmission:', err);
    });

    return {
      ok: true,
      topicId: parsed.topicId,
      status: 'submitted',
      version: newVersion,
      warnings,
    };
  } catch (error) {
    return toActionError(error) as SubmitTopicResult;
  }
}
