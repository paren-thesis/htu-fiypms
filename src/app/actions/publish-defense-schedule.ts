'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { DEFENSE_PANELS_COLLECTION, getDefensePanel } from '@/lib/models/defense-panel/repo';
import { detectConflicts, type DefenseConflict } from '@/lib/defense/conflicts';
import { notify } from '@/lib/notify';
import type { DefensePanelDocument, TeamDocument } from '@/types/firestore';

export interface PublishDefenseScheduleResult {
  ok: boolean;
  publishedCount?: number;
  panelIds?: string[];
  conflicts?: DefenseConflict[];
  error?: string;
  code?: string;
}

const publishDefenseScheduleInputSchema = z
  .object({
    panel_id: z.string().trim().min(1).optional(),
    academic_year_id: z.string().trim().min(1).optional(),
  })
  .refine((data) => Boolean(data.panel_id || data.academic_year_id), {
    message: 'Either panel_id or academic_year_id is required',
  });

type PublishDefenseScheduleInput = z.infer<typeof publishDefenseScheduleInputSchema>;

/**
 * Publishes defense panel schedule(s).
 * - Gated to coordinator or admin.
 * - Refuses if detectConflicts detects any scheduling conflicts.
 * - Sets is_published: true and published_at: serverTimestamp().
 * - Dispatches 'defense_schedule' in-app notifications:
 *     - Chair & Examiners: target_url `/defense/${panelId}`
 *     - Slotted Team Members: target_url `/deliverables`
 * - Logs audit event 'defense.published'.
 */
export async function publishDefenseSchedule(
  idTokenOrInput?: string | (PublishDefenseScheduleInput & { idToken?: string }),
  maybeInput?: PublishDefenseScheduleInput
): Promise<PublishDefenseScheduleResult> {
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
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const authUser = await requireUser(idToken, ['coordinator', 'admin']);
    const input = publishDefenseScheduleInputSchema.parse(rawInput);

    // 1. Identify target panels to publish
    let targetPanels: DefensePanelDocument[] = [];
    let academicYearId = input.academic_year_id;

    if (input.panel_id) {
      const panel = await getDefensePanel(input.panel_id);
      if (!panel) {
        throw new HttpError(404, 'PANEL_NOT_FOUND', `Defense panel not found: ${input.panel_id}`);
      }
      targetPanels = [panel];
      academicYearId = academicYearId || panel.academic_year_id;
    } else if (academicYearId) {
      const snap = await adminDb
        .collection(DEFENSE_PANELS_COLLECTION)
        .where('academic_year_id', '==', academicYearId)
        .get();

      targetPanels = snap.docs.map((doc) => doc.data() as DefensePanelDocument);
      if (targetPanels.length === 0) {
        throw new HttpError(404, 'PANELS_NOT_FOUND', `No defense panels found for academic year: ${academicYearId}`);
      }
    }

    // 2. Fetch all panels in the same scope to run full conflict detection
    const allQuery = academicYearId
      ? adminDb
          .collection(DEFENSE_PANELS_COLLECTION)
          .where('academic_year_id', '==', academicYearId)
      : adminDb.collection(DEFENSE_PANELS_COLLECTION);
    const allSnap = await allQuery.get();
    const allPanelsInScope: DefensePanelDocument[] = allSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<DefensePanelDocument, 'id'>),
    }));

    // 3. Detect conflicts
    const allConflicts = detectConflicts(allPanelsInScope);

    // Filter conflicts relevant to target panels
    const targetPanelIds = new Set(targetPanels.map((p) => p.id));
    const relevantConflicts = allConflicts.filter(
      (c) =>
        targetPanelIds.has(c.panel_ids[0]) || targetPanelIds.has(c.panel_ids[1])
    );

    if (relevantConflicts.length > 0) {
      return {
        ok: false,
        error: 'Cannot publish defense schedule: scheduling conflicts detected.',
        conflicts: relevantConflicts,
        code: 'DEFENSE_CONFLICTS',
      };
    }

    // 4. Update panels to published status
    const batch = adminDb.batch();
    const publishedPanelIds: string[] = [];

    for (const panel of targetPanels) {
      const panelRef = adminDb.collection(DEFENSE_PANELS_COLLECTION).doc(panel.id);
      batch.update(panelRef, {
        is_published: true,
        published_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      publishedPanelIds.push(panel.id);
    }
    await batch.commit();

    // 5. Send notifications
    for (const panel of targetPanels) {
      // Chair & examiners notification
      const panelStaffRecipients = Array.from(
        new Set([panel.chair_id, ...(panel.examiner_ids || [])].filter(Boolean))
      );

      if (panelStaffRecipients.length > 0) {
        await notify(panelStaffRecipients, {
          title: 'Defense Schedule Published',
          body: `Defense panel schedule for "${panel.panel_name}" has been published.`,
          type: 'defense_schedule',
          target_url: `/defense/${panel.id}`,
        });
      }

      // Slotted teams notifications
      const activeSlots = (panel.time_slots || []).filter(
        (slot) => Boolean(slot.team_id) && slot.status !== 'cancelled'
      );

      const teamIds = Array.from(new Set(activeSlots.map((s) => s.team_id as string)));
      for (const teamId of teamIds) {
        const teamDocSnap = await adminDb.collection('teams').doc(teamId).get();
        if (teamDocSnap.exists) {
          const teamData = teamDocSnap.data() as TeamDocument;
          const memberUids = teamData.member_ids || [];

          if (memberUids.length > 0) {
            await notify(memberUids, {
              title: 'Defense Scheduled',
              body: `Your project defense has been scheduled for panel "${panel.panel_name}".`,
              type: 'defense_schedule',
              target_url: '/deliverables',
            });
          }
        }
      }

      // Write audit log per published panel
      await writeAudit({
        actor: {
          uid: authUser.uid,
          email: authUser.email,
          name: (authUser.claims.name as string) || authUser.email,
          role: authUser.activeRole,
        },
        action: 'defense.published',
        target_type: 'defense_panel',
        target_id: panel.id,
        details: {
          panel_id: panel.id,
          panel_name: panel.panel_name,
          slots_count: panel.time_slots?.length || 0,
        },
      });
    }

    return {
      ok: true,
      publishedCount: publishedPanelIds.length,
      panelIds: publishedPanelIds,
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
