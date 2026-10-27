'use server';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import { validateChapterUrl } from '@/lib/chapters/url';
import {
  chapterDocId,
  getChapterRef,
  DEFAULT_CHAPTER_TITLES,
  CHAPTERS_COLLECTION,
} from '@/lib/models/chapter';
import type { TeamDocument, ChapterDocument, ChapterHistoryEntry } from '@/types/firestore';

const submitChapterInputSchema = z
  .object({
    team_id: z.string().min(1, 'Team ID is required'),
    chapter_number: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    document_url: z.string().trim().min(1, 'Document URL is required'),
    title: z.string().trim().optional(),
  })
  .strict();

export type SubmitChapterInput = z.infer<typeof submitChapterInputSchema>;

export interface SubmitChapterResult {
  ok: boolean;
  chapterId?: string;
  version?: number;
  status?: string;
  error?: string;
  code?: string;
}

/**
 * Server Action: Submit or resubmit an external chapter document link (Spec FR-05.1, FR-05.2, A3).
 *
 * Rules:
 * - Caller must be a member of the team (or coordinator/admin).
 * - Team must have an accepted supervisor and an approved topic.
 * - Sequential chapter rule: Chapter n (for n > 1) requires Chapter n-1 to be approved first.
 * - Chapter 1 is free once prerequisites are met.
 * - Resubmissions are allowed only if the chapter's status is 'revision_needed'.
 * - On resubmission, previous submission is archived in history[], version is incremented, and status returns to 'pending'.
 * - URL must be a valid HTTPS link on Google Drive, OneDrive, or SharePoint.
 * - Dispatches a 'chapter_review' notification to the supervisor.
 */
export async function submitChapter(
  idTokenOrInput: string | (SubmitChapterInput & { idToken: string }),
  maybeInput?: SubmitChapterInput
): Promise<SubmitChapterResult> {
  try {
    let idToken: string;
    let rawInput: SubmitChapterInput;

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

    const input = submitChapterInputSchema.parse(rawInput);

    // 1. Authenticate user
    const user = await requireUser(idToken, ['student', 'coordinator', 'admin']);

    // 2. Pure URL validation
    const urlCheck = validateChapterUrl(input.document_url);
    if (!urlCheck.valid) {
      throw new HttpError(400, 'INVALID_DOCUMENT_URL', urlCheck.error || 'Invalid cloud document URL.');
    }

    // 3. Execute atomic transaction
    const targetChapterId = chapterDocId(input.team_id, input.chapter_number);

    const { version, isResubmission, supervisorId, groupNumber } = await adminDb.runTransaction(
      async (tx) => {
        // Load team
        const teamRef = adminDb.collection('teams').doc(input.team_id);
        const teamSnap = await tx.get(teamRef);
        if (!teamSnap.exists) {
          throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
        }

        const team = teamSnap.data() as TeamDocument;
        if (team.status === 'disbanded') {
          throw new HttpError(400, 'TEAM_DISBANDED', 'Cannot submit chapters for a disbanded team.');
        }

        // Authorize team membership
        const isMember = team.member_ids?.includes(user.uid);
        const isStaff = user.roles.includes('coordinator') || user.roles.includes('admin');
        if (!isMember && !isStaff) {
          throw new HttpError(403, 'NOT_TEAM_MEMBER', 'Only active team members can submit project chapters.');
        }

        // Must have accepted supervisor
        const hasAcceptedSupervisor =
          Boolean(team.assigned_supervisor_id) &&
          team.supervisor_assignment?.status === 'accepted';
        if (!hasAcceptedSupervisor) {
          throw new HttpError(
            400,
            'SUPERVISOR_NOT_ACCEPTED',
            'Your team must have an accepted faculty supervisor before submitting chapters.'
          );
        }

        // Must have approved topic
        const hasApprovedTopic =
          Boolean(team.approved_topic_id) || team.status === 'topic_approved';
        if (!hasApprovedTopic) {
          throw new HttpError(
            400,
            'TOPIC_NOT_APPROVED',
            'Your project topic must be approved by the department before submitting chapters.'
          );
        }

        // Sequential chapter check: Chapter n requires Chapter n-1 to be approved
        if (input.chapter_number > 1) {
          const prevChapterRef = getChapterRef(input.team_id, input.chapter_number - 1);
          const prevChapterSnap = await tx.get(prevChapterRef);

          if (!prevChapterSnap.exists) {
            throw new HttpError(
              400,
              'PREVIOUS_CHAPTER_NOT_APPROVED',
              `Chapter ${input.chapter_number} requires Chapter ${input.chapter_number - 1} to be approved first.`
            );
          }

          const prevChapter = prevChapterSnap.data() as ChapterDocument;
          if (prevChapter.status !== 'approved') {
            throw new HttpError(
              400,
              'PREVIOUS_CHAPTER_NOT_APPROVED',
              `Chapter ${input.chapter_number} requires Chapter ${input.chapter_number - 1} to be approved first (current status: ${prevChapter.status}).`
            );
          }
        }

        // Current chapter check
        const currentChapterRef = adminDb.collection(CHAPTERS_COLLECTION).doc(targetChapterId);
        const currentChapterSnap = await tx.get(currentChapterRef);

        let finalVersion = 1;
        let resubmission = false;

        if (!currentChapterSnap.exists) {
          // Initial submission
          const title =
            input.title ||
            DEFAULT_CHAPTER_TITLES[input.chapter_number] ||
            `Chapter ${input.chapter_number}`;

          const newDoc: ChapterDocument = {
            id: targetChapterId,
            team_id: input.team_id,
            chapter_number: input.chapter_number,
            title,
            document_url: input.document_url,
            version: 1,
            status: 'pending',
            feedback: [],
            history: [],
            submitted_at: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
          };

          tx.set(currentChapterRef, newDoc);

          writeAuditInTx(tx, {
            actor: {
              uid: user.uid,
              name: (user.claims.name as string) || user.email,
              email: user.email,
              role: user.activeRole || 'student',
            },
            action: 'chapter.submitted',
            target_type: 'chapter',
            target_id: targetChapterId,
            description: `Submitted Chapter ${input.chapter_number} (${title}) for team ${team.group_number}.`,
            metadata: {
              team_id: input.team_id,
              chapter_number: input.chapter_number,
              version: 1,
            },
          });
        } else {
          // Chapter exists
          const existing = currentChapterSnap.data() as ChapterDocument;

          if (existing.status === 'approved') {
            throw new HttpError(
              400,
              'CHAPTER_ALREADY_APPROVED',
              `Chapter ${input.chapter_number} is already approved and cannot be resubmitted.`
            );
          }

          if (existing.status === 'pending') {
            throw new HttpError(
              400,
              'CHAPTER_PENDING_REVIEW',
              `Chapter ${input.chapter_number} is currently pending review by your supervisor.`
            );
          }

          if (existing.status !== 'revision_needed') {
            throw new HttpError(
              400,
              'INVALID_CHAPTER_STATUS',
              `Chapter cannot be resubmitted while in status "${existing.status}".`
            );
          }

          // Spec amendment A3: push prior submission snapshot into history[]
          resubmission = true;
          finalVersion = existing.version + 1;

          const historyEntry: ChapterHistoryEntry = {
            version: existing.version,
            document_url: existing.document_url,
            submitted_at: existing.submitted_at,
            reviewed_at: existing.reviewed_at,
            status: existing.status,
          };

          const updatedHistory = [...(existing.history || []), historyEntry];

          tx.update(currentChapterRef, {
            version: finalVersion,
            document_url: input.document_url,
            title: input.title || existing.title,
            status: 'pending',
            history: updatedHistory,
            submitted_at: FieldValue.serverTimestamp(),
            reviewed_at: FieldValue.delete(),
          });

          writeAuditInTx(tx, {
            actor: {
              uid: user.uid,
              name: (user.claims.name as string) || user.email,
              email: user.email,
              role: user.activeRole || 'student',
            },
            action: 'chapter.resubmitted',
            target_type: 'chapter',
            target_id: targetChapterId,
            description: `Resubmitted Chapter ${input.chapter_number} (v${finalVersion}) for team ${team.group_number}.`,
            metadata: {
              team_id: input.team_id,
              chapter_number: input.chapter_number,
              version: finalVersion,
            },
          });
        }

        return {
          version: finalVersion,
          isResubmission: resubmission,
          supervisorId: team.assigned_supervisor_id!,
          groupNumber: team.group_number,
        };
      }
    );

    // 4. Notify supervisor
    try {
      await createNotification({
        user_id: supervisorId,
        title: `Chapter ${input.chapter_number} ${isResubmission ? 'Resubmitted' : 'Submitted'}`,
        body: `Team ${groupNumber} submitted Chapter ${input.chapter_number} (v${version}) for review.`,
        type: 'chapter_review',
        target_url: `/chapters?teamId=${input.team_id}`,
      });
    } catch (notifyErr) {
      console.error('Failed to dispatch chapter submission notification:', notifyErr);
    }

    return {
      ok: true,
      chapterId: targetChapterId,
      version,
      status: 'pending',
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
