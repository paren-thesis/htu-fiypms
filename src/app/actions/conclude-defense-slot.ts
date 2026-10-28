'use server';

export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import { getDefensePanel, DEFENSE_PANELS_COLLECTION } from '@/lib/models/defense-panel/repo';
import { aggregateDefense, type AggregateDefenseResult } from './aggregate-defense';
import type { DefenseTimeSlot } from '@/types/firestore';

export interface ConcludeDefenseSlotInput {
  panel_id: string;
  slot_id: string;
}

export interface ConcludeDefenseSlotResult {
  ok: boolean;
  slot?: DefenseTimeSlot;
  aggregation?: AggregateDefenseResult;
  error?: string;
  code?: string;
  message?: string;
}

const concludeDefenseSlotInputSchema = z
  .object({
    panel_id: z.string().trim().min(1, 'Panel ID is required'),
    slot_id: z.string().trim().min(1, 'Slot ID is required'),
  })
  .strict();

/**
 * Concludes a defense time slot.
 * - Authorized for panel chair of the panel, coordinator, or admin.
 * - Updates the slot status to 'completed'.
 * - Runs the defense score aggregation for the slotted team.
 * - Logs audit event 'defense.slot_concluded'.
 */
export async function concludeDefenseSlot(
  idTokenOrInput?: string | (ConcludeDefenseSlotInput & { idToken?: string }),
  maybeInput?: ConcludeDefenseSlotInput | string
): Promise<ConcludeDefenseSlotResult> {
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

    const user = await requireUser(idToken, [
      'coordinator',
      'admin',
      'panel_chair',
      'panel_member',
    ]);

    const { panel_id: panelId, slot_id: slotId } =
      concludeDefenseSlotInputSchema.parse(rawInput);

    // 1. Fetch defense panel
    const panel = await getDefensePanel(panelId);
    if (!panel) {
      throw new HttpError(404, 'PANEL_NOT_FOUND', `Defense panel not found: ${panelId}`);
    }

    // 2. Authorization: coordinator, admin, or chair of this panel
    const isCoordinatorOrAdmin =
      user.roles.includes('coordinator') ||
      user.roles.includes('admin') ||
      user.activeRole === 'coordinator' ||
      user.activeRole === 'admin';

    const isPanelChair = panel.chair_id === user.uid;

    if (!isCoordinatorOrAdmin && !isPanelChair) {
      throw new HttpError(
        403,
        'FORBIDDEN',
        'Only the panel chair, coordinator, or admin can conclude a defense slot'
      );
    }

    // 3. Find the slot
    const slots = [...(panel.time_slots || [])];
    const slotIndex = slots.findIndex((s) => s.slot_id === slotId);
    if (slotIndex === -1) {
      throw new HttpError(404, 'SLOT_NOT_FOUND', `Slot ${slotId} not found in panel ${panelId}`);
    }

    const targetSlot = slots[slotIndex];
    if (!targetSlot) {
      throw new HttpError(404, 'SLOT_NOT_FOUND', `Slot ${slotId} not found in panel ${panelId}`);
    }

    const updatedSlot: DefenseTimeSlot = {
      slot_id: targetSlot.slot_id,
      team_id: targetSlot.team_id,
      start_time: targetSlot.start_time,
      end_time: targetSlot.end_time,
      status: 'completed',
    };
    slots[slotIndex] = updatedSlot;

    // 4. Update the panel document
    await adminDb.collection(DEFENSE_PANELS_COLLECTION).doc(panelId).update({
      time_slots: slots,
      updated_at: FieldValue.serverTimestamp(),
    });

    // 5. Audit log
    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        activeRole: user.activeRole,
      },
      action: 'defense.slot_concluded',
      target_type: 'defense_panel',
      target_id: panelId,
      description: `Concluded defense slot ${slotId} for team ${targetSlot.team_id || 'unassigned'}`,
      metadata: {
        slot_id: slotId,
        team_id: targetSlot.team_id,
      },
    });

    // 6. Run score aggregation if a team was slotted
    let aggregationResult: AggregateDefenseResult | undefined;
    if (targetSlot.team_id) {
      aggregationResult = await aggregateDefense(idToken, {
        team_id: targetSlot.team_id,
      });
    }

    return {
      ok: true,
      slot: updatedSlot,
      aggregation: aggregationResult,
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
