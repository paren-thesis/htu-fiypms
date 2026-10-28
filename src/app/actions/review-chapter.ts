'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import { chapterDocId, CHAPTERS_COLLECTION } from '@/lib/models/chapter';
import type { TeamDocument, ChapterDocument, ChapterFeedback } from '@/types/firestore';

const feedbackItemInputSchema = z.object({
  id: z.string().optional(),
  content: z.string().trim().min(1, 'Feedback text cannot be empty'),
});

const reviewChapterInputSchema = z
  .object({
    team_id: z.string().min(1, 'Team ID is required'),
    chapter_number: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    decision: z.enum(['approved', 'revision_needed']),
    feedback: z.array(feedbackItemInputSchema).optional(),
    review_notes: z.string().trim().optional(),
  })
  .strict();

export type ReviewChapterInput = z.infer<typeof reviewChapterInputSchema>;

export interface ReviewChapterResult {
  ok: boolean;
  chapterId?: string;
  status?: 'approved' | 'revision_needed';
  teamStatus?: string;
  error?: string;
  code?: string;
}

/**
 * Server Action: Review a submitted project chapter (Spec FR-05.3, §8.1).
 *
 * Rules:
 * - Only the team's assigned supervisor can review chapters.
 * - Decision must be 'approved' or 'revision_needed'.
 * - Records line-item ChapterFeedback entries and sets reviewed_at.
 * - Notifies all team members with type 'chapter_review'.
 * - When Chapter 5 is approved, atomically updates team.status to 'defense_ready'.
 */
export async function reviewChapter(
  idTokenOrInput: string | (ReviewChapterInput & { idToken: string }),
  maybeInput?: ReviewChapterInput
): Promise<ReviewChapterResult> {
  try {
    let idToken: string;
    let rawInput: ReviewChapterInput;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const input = reviewChapterInputSchema.parse(rawInput);

    // 1. Authorize supervisor
    const user = await requireUser(idToken, ['supervisor', 'coordinator', 'admin']);

    // 2. Execute review transaction
    const targetChapterId = chapterDocId(input.team_id, input.chapter_number);

    const { teamMemberIds, finalTeamStatus } = await adminDb.runTransaction(
      async (tx) => {
        // Load team
        const teamRef = adminDb.collection('teams').doc(input.team_id);
        const teamSnap = await tx.get(teamRef);
        if (!teamSnap.exists) {
          throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
        }

        const team = teamSnap.data() as TeamDocument;

        // Ensure caller is the team's assigned supervisor
        const isAssignedSupervisor = team.assigned_supervisor_id === user.uid;
        const isCoordinatorOrAdmin =
          user.roles.includes('coordinator') || user.roles.includes('admin');

        if (!isAssignedSupervisor && !isCoordinatorOrAdmin) {
          throw new HttpError(
            403,
            'NOT_ASSIGNED_SUPERVISOR',
            'Only the team’s assigned faculty supervisor can review submitted chapters.'
          );
        }

        // Load chapter document
        const chapterRef = adminDb.collection(CHAPTERS_COLLECTION).doc(targetChapterId);
        const chapterSnap = await tx.get(chapterRef);
        if (!chapterSnap.exists) {
          throw new HttpError(404, 'CHAPTER_NOT_FOUND', 'Chapter submission not found.');
        }

        const chapter = chapterSnap.data() as ChapterDocument;
        if (chapter.status !== 'pending') {
          throw new HttpError(
            400,
            'CHAPTER_NOT_PENDING',
            `Chapter ${input.chapter_number} cannot be reviewed because its current status is "${chapter.status}".`
          );
        }

        // Construct line-item feedback entries
        const feedbackEntries: ChapterFeedback[] = [];

        for (const item of (input.feedback || [])) {
          feedbackEntries.push({
            id: item.id || crypto.randomUUID(),
            author_id: user.uid,
            content: item.content,
            created_at: Timestamp.now(),
          });
        }

        if (input.review_notes && input.review_notes.trim()) {
          feedbackEntries.push({
            id: crypto.randomUUID(),
            author_id: user.uid,
            content: input.review_notes.trim(),
            created_at: Timestamp.now(),
          });
        }

        // Update chapter doc
        const combinedFeedback = [...(chapter.feedback || []), ...feedbackEntries];

        tx.update(chapterRef, {
          status: input.decision,
          feedback: combinedFeedback,
          reviewed_at: FieldValue.serverTimestamp(),
        });

        let updatedTeamStatus = team.status;

        // When chapter 5 is approved, transition team to defense_ready
        if (input.chapter_number === 5 && input.decision === 'approved') {
          updatedTeamStatus = 'defense_ready';
          tx.update(teamRef, {
            status: 'defense_ready',
            updated_at: FieldValue.serverTimestamp(),
          });
        }

        // Audit logging
        writeAuditInTx(tx, {
          actor: {
            uid: user.uid,
            name: (user.claims.name as string) || user.email,
            email: user.email,
            role: user.activeRole || 'supervisor',
          },
          action: 'chapter.reviewed',
          target_type: 'chapter',
          target_id: targetChapterId,
          description: `Chapter ${input.chapter_number} marked as ${input.decision} for team ${team.group_number}.`,
          metadata: {
            team_id: input.team_id,
            chapter_number: input.chapter_number,
            decision: input.decision,
            feedback_count: feedbackEntries.length,
            team_status_updated_to: updatedTeamStatus,
          },
        });

        return {
          teamMemberIds: team.member_ids || [],
          groupNumber: team.group_number,
          finalTeamStatus: updatedTeamStatus,
        };
      }
    );

    // 3. Notify team members
    for (const memberId of teamMemberIds) {
      try {
        await createNotification({
          user_id: memberId,
          title: `Chapter ${input.chapter_number} ${input.decision === 'approved' ? 'Approved' : 'Revision Requested'}`,
          body: `Your supervisor marked Chapter ${input.chapter_number} as ${input.decision === 'approved' ? 'Approved' : 'Revision Needed'}.`,
          type: 'chapter_review',
          target_url: `/chapters`,
        });
      } catch (notifyErr) {
        console.error(`Failed to notify team member ${memberId}:`, notifyErr);
      }
    }

    return {
      ok: true,
      chapterId: targetChapterId,
      status: input.decision,
      teamStatus: finalTeamStatus,
    };
  } catch (error: unknown) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}
