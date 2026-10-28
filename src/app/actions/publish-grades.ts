'use server';

// export const runtime = 'nodejs';
// export const maxDuration = 60;

import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { createNotification } from '@/lib/models/notification/repo';
import { archiveCompletedTeams } from '@/lib/archive/archive-teams';
import type { TeamDocument, AcademicYearDocument } from '@/types/firestore';

const publishGradesInSchema = z
  .object({
    academic_year_id: z.string().trim().min(1, 'Academic year is required'),
    preflight_only: z.boolean().optional(),
    override: z
      .object({
        justification: z.string().trim().min(10, 'Override justification must be at least 10 characters'),
      })
      .optional(),
  })
  .strict();

export type PublishGradesIn = z.infer<typeof publishGradesInSchema>;

export interface PreflightFailure {
  team_id: string;
  group_number: string;
  reason: 'missing_scores' | 'missing_signoff';
  message: string;
}

export interface PublishGradesResult {
  ok: boolean;
  academic_year_id?: string;
  total_teams_published?: number;
  grade_appeal_deadline?: string;
  already_published?: boolean;
  preflight?: {
    can_publish: boolean;
    can_override: boolean;
    total_teams: number;
    ready_teams: number;
    failures: PreflightFailure[];
  };
  failures?: PreflightFailure[];
  error?: string;
  code?: string;
}

/**
 * Server Action: Pre-flight check and formal bulk publication of final grades.
 * Spec: FR-10.2, FR-10.4, F-13.
 * Only Coordinator or Admin.
 */
export async function publishGrades(
  idTokenOrInput?: string | (PublishGradesIn & { idToken?: string }),
  maybeInput?: PublishGradesIn | string
): Promise<PublishGradesResult> {
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

    const parsed = publishGradesInSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }

    const { academic_year_id, preflight_only = false, override } = parsed.data;

    // 1. Verify academic year exists
    const yearRef = adminDb.collection('academic_years').doc(academic_year_id);
    const yearSnap = await yearRef.get();
    if (!yearSnap.exists) {
      throw new HttpError(404, 'NOT_FOUND', `Academic year ${academic_year_id} not found`);
    }
    const yearData = yearSnap.data() as AcademicYearDocument;

    // 2. Query all active teams for this academic year
    const teamsSnap = await adminDb
      .collection('teams')
      .where('academic_year_id', '==', academic_year_id)
      .get();

    const teams: TeamDocument[] = teamsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<TeamDocument, 'id'>) }))
      .filter((t) => t.status !== 'disbanded');

    // 3. Batch check deliverables sign-offs
    const deliverableRefs = teams.map((t) => adminDb.collection('software_deliverables').doc(t.id));
    const deliverableSnaps = deliverableRefs.length > 0 ? await adminDb.getAll(...deliverableRefs) : [];
    const deliverableMap = new Map<string, boolean>();
    deliverableSnaps.forEach((snap) => {
      if (snap.exists) {
        const data = snap.data();
        deliverableMap.set(snap.id, Boolean(data?.approved_by_supervisor_at));
      } else {
        deliverableMap.set(snap.id, false);
      }
    });

    // 4. Run Pre-flight Checks
    const failures: PreflightFailure[] = [];

    for (const team of teams) {
      const summary = team.scores_summary;
      const hasScores =
        summary != null &&
        typeof summary.composite_final_score === 'number' &&
        !isNaN(summary.composite_final_score);

      if (!hasScores) {
        failures.push({
          team_id: team.id,
          group_number: team.group_number || team.id,
          reason: 'missing_scores',
          message: `Team ${team.group_number || team.id} is missing complete composite scores.`,
        });
      }

      const isDeliverableSignedOff = deliverableMap.get(team.id) || false;
      if (!isDeliverableSignedOff) {
        failures.push({
          team_id: team.id,
          group_number: team.group_number || team.id,
          reason: 'missing_signoff',
          message: `Team ${team.group_number || team.id} software deliverable is not signed off by supervisor.`,
        });
      }
    }

    const hasMissingScores = failures.some((f) => f.reason === 'missing_scores');
    const hasMissingSignoffs = failures.some((f) => f.reason === 'missing_signoff');
    const canPublishClean = failures.length === 0;
    const canOverride = !hasMissingScores && hasMissingSignoffs;

    // If preflight check only was requested, return early
    if (preflight_only) {
      return {
        ok: true,
        academic_year_id,
        preflight: {
          can_publish: canPublishClean || (canOverride && Boolean(override?.justification)),
          can_override: canOverride,
          total_teams: teams.length,
          ready_teams: teams.length - failures.length,
          failures,
        },
      };
    }

    // 5. Enforce blockers
    if (hasMissingScores) {
      return {
        ok: false,
        error: 'Cannot publish grades: some teams have incomplete scores',
        code: 'MISSING_SCORES',
        failures,
      };
    }

    if (hasMissingSignoffs) {
      if (!override?.justification || override.justification.trim().length < 10) {
        return {
          ok: false,
          error:
            'Cannot publish grades: some teams are missing supervisor deliverables sign-offs. An administrative override justification is required.',
          code: 'MISSING_SIGNOFFS',
          failures,
        };
      }

      // Record override audit log
      const missingSignoffTeamIds = failures
        .filter((f) => f.reason === 'missing_signoff')
        .map((f) => f.team_id);

      await writeAudit({
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: caller.activeRole || 'coordinator',
        },
        action: 'grades.publish_override',
        target_type: 'academic_year',
        target_id: academic_year_id,
        description: 'Coordinator overridden missing supervisor deliverables sign-offs during grade publication',
        metadata: {
          justification: override.justification,
          teams_overridden: missingSignoffTeamIds,
        },
      });
    }

    // 6. Execute bulk publication effects
    const now = Timestamp.now();
    const appealDeadline = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);

    // Fetch all evaluations for these teams
    const allEvaluationDocs: { id: string; ref: FirebaseFirestore.DocumentReference }[] = [];
    for (const team of teams) {
      const evalsSnap = await adminDb
        .collection('evaluations')
        .where('team_id', '==', team.id)
        .get();
      for (const d of evalsSnap.docs) {
        allEvaluationDocs.push({ id: d.id, ref: d.ref });
      }
    }

    // Chunked batch updates (max 400 operations per batch)
    const BATCH_SIZE = 400;
    for (let i = 0; i < allEvaluationDocs.length; i += BATCH_SIZE) {
      const chunk = allEvaluationDocs.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const item of chunk) {
        batch.update(item.ref, {
          is_published: true,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    // Update teams in batches
    for (let i = 0; i < teams.length; i += BATCH_SIZE) {
      const chunk = teams.slice(i, i + BATCH_SIZE);
      const batch = adminDb.batch();
      for (const team of chunk) {
        const teamRef = adminDb.collection('teams').doc(team.id);
        batch.update(teamRef, {
          'scores_summary.is_locked': true,
          status: 'completed',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }

    // Update academic year document
    await yearRef.set(
      {
        grades_published: true,
        grade_published_at: now,
        deadlines: {
          grade_appeal_deadline: appealDeadline,
        },
      },
      { merge: true }
    );

    // Notify all team members (idempotent / clean)
    for (const team of teams) {
      const memberIds = Array.isArray(team.member_ids) ? team.member_ids : [];
      for (const memberUid of memberIds) {
        await createNotification({
          user_id: memberUid,
          title: 'Official Final Grades Published',
          body: `Final capstone project scores for ${team.name} (${team.group_number}) have been officially published. The 7-day grade appeal window is now open.`,
          type: 'grade_published',
          target_url: '/grades',
        });
      }
    }

    // Archive completed teams idempotently (FR-11.1, A5)
    await archiveCompletedTeams(academic_year_id);

    // Record audit log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.activeRole || 'coordinator',
      },
      action: 'grades.published',
      target_type: 'academic_year',
      target_id: academic_year_id,
      description: 'Published official final grades and locked all evaluations for academic session',
      metadata: {
        total_teams: teams.length,
        total_evaluations: allEvaluationDocs.length,
        appeal_deadline: appealDeadline.toDate().toISOString(),
        was_overridden: Boolean(override?.justification),
      },
    });

    return {
      ok: true,
      academic_year_id,
      total_teams_published: teams.length,
      grade_appeal_deadline: appealDeadline.toDate().toISOString(),
      already_published: yearData.grades_published === true,
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
