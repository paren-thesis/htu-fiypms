'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import {
  DEFENSE_PANELS_COLLECTION,
  getDefensePanel,
  normalizeSlotToFirestore,
} from '@/lib/models/defense-panel/repo';
import {
  createDefensePanelInSchema,
  defenseTimeSlotInputSchema,
  type CreateDefensePanelIn,
} from '@/lib/models/defense-panel/schema';
import { toEpochMs } from '@/lib/defense/conflicts';
import type { DefensePanelDocument, TeamDocument, StaffWhitelistDocument } from '@/types/firestore';

export interface ManageDefensePanelResult {
  ok: boolean;
  panelId?: string;
  panel?: DefensePanelDocument;
  error?: string;
  code?: string;
}

const updatePanelActionInputSchema = z
  .object({
    panel_id: z.string().trim().min(1, 'Panel ID is required'),
    panel_name: z.string().trim().min(1).optional(),
    venue: z.string().trim().min(1).optional(),
    is_virtual: z.boolean().optional(),
    virtual_meeting_url: z.string().trim().url().optional().or(z.literal('')),
    chair_id: z.string().trim().min(1).optional(),
    examiner_ids: z.array(z.string().trim().min(1)).min(1).optional(),
    time_slots: z.array(defenseTimeSlotInputSchema).optional(),
    cross_programme_justification: z.string().trim().optional(),
  })
  .strict();

/**
 * Helper to fetch staff whitelist entry by user UID.
 */
async function getStaffWhitelistForUser(uid: string): Promise<StaffWhitelistDocument | null> {
  // 1. Try querying staff_whitelist where user_uid == uid
  const querySnap = await adminDb
    .collection('staff_whitelist')
    .where('user_uid', '==', uid)
    .limit(1)
    .get();

  if (!querySnap.empty && querySnap.docs[0]) {
    return querySnap.docs[0].data() as StaffWhitelistDocument;
  }

  // 2. Fall back to user document -> email lookup
  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (userSnap.exists) {
    const email = userSnap.data()?.email?.toLowerCase();
    if (email) {
      const directSnap = await adminDb.collection('staff_whitelist').doc(email).get();
      if (directSnap.exists) {
        return directSnap.data() as StaffWhitelistDocument;
      }
    }
  }

  return null;
}

/**
 * Validates cross-programme assignments for chair and examiners (FR-07.2a).
 * Returns array of faculty UIDs that are cross-programme.
 */
async function validateFacultyProgrammes(
  chairId: string,
  examinerIds: string[],
  courseId: string
): Promise<string[]> {
  const facultyUids = Array.from(new Set([chairId, ...examinerIds]));
  const crossProgrammeUids: string[] = [];

  for (const uid of facultyUids) {
    const whitelist = await getStaffWhitelistForUser(uid);
    if (!whitelist || !Array.isArray(whitelist.programmes) || !whitelist.programmes.includes(courseId)) {
      crossProgrammeUids.push(uid);
    }
  }

  return crossProgrammeUids;
}

/**
 * Validates team assignments in defense time slots:
 * 1. Team exists
 * 2. Team belongs to same course_id as panel
 * 3. Team status is 'defense_ready'
 * 4. Team is not assigned to more than one active slot in this panel or across the academic year.
 */
async function validateSlottedTeams(
  slots: Array<z.infer<typeof defenseTimeSlotInputSchema>>,
  panelCourseId: string,
  academicYearId: string,
  currentPanelId?: string
): Promise<void> {
  const seenTeamsInPanel = new Set<string>();

  for (const slot of slots) {
    if (slot.status === 'cancelled') continue;

    const start = toEpochMs(slot.start_time);
    const end = toEpochMs(slot.end_time);
    if (start >= end) {
      throw new HttpError(400, 'INVALID_SLOT_INTERVAL', `Slot '${slot.slot_id}': Start time must be strictly before end time.`);
    }

    if (!slot.team_id || slot.team_id.trim().length === 0) {
      continue;
    }

    if (seenTeamsInPanel.has(slot.team_id)) {
      throw new HttpError(
        400,
        'TEAM_DUPLICATE_SLOT',
        `Team '${slot.team_id}' is scheduled in multiple active slots in the same panel.`
      );
    }
    seenTeamsInPanel.add(slot.team_id);

    // Fetch team
    const teamSnap = await adminDb.collection('teams').doc(slot.team_id).get();
    if (!teamSnap.exists) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', `Team '${slot.team_id}' not found.`);
    }

    const team = teamSnap.data() as TeamDocument;

    // Check course match
    if (team.course_id !== panelCourseId) {
      throw new HttpError(
        400,
        'TEAM_COURSE_MISMATCH',
        `Team '${team.name}' belongs to course '${team.course_id}', which does not match panel course '${panelCourseId}'.`
      );
    }

    // Check status: defense_ready
    if (team.status !== 'defense_ready') {
      throw new HttpError(
        400,
        'TEAM_NOT_DEFENSE_READY',
        `Team '${team.name}' has status '${team.status}'. Only teams with status 'defense_ready' can be scheduled for defense.`
      );
    }
  }

  // Check across other panels in academic year
  if (seenTeamsInPanel.size > 0 && academicYearId) {
    const yearPanelsSnap = await adminDb
      .collection(DEFENSE_PANELS_COLLECTION)
      .where('academic_year_id', '==', academicYearId)
      .get();

    for (const doc of yearPanelsSnap.docs) {
      if (currentPanelId && doc.id === currentPanelId) continue;

      const otherPanel = doc.data() as DefensePanelDocument;
      if (!Array.isArray(otherPanel.time_slots)) continue;

      for (const otherSlot of otherPanel.time_slots) {
        if (otherSlot.status !== 'cancelled' && seenTeamsInPanel.has(otherSlot.team_id)) {
          throw new HttpError(
            400,
            'TEAM_ALREADY_SLOTTED',
            `Team '${otherSlot.team_id}' is already scheduled in an active defense slot on Panel '${otherPanel.panel_name}'.`
          );
        }
      }
    }
  }
}

/**
 * Server Action: Create a defense panel and schedule presentation time slots.
 * Gated to coordinator and admin roles (FR-07.1, FR-07.2, FR-07.2a).
 */
export async function createDefensePanel(
  idTokenOrInput: string | (CreateDefensePanelIn & { idToken: string }),
  maybeInput?: CreateDefensePanelIn
): Promise<ManageDefensePanelResult> {
  try {
    let idToken: string;
    let rawInput: CreateDefensePanelIn;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as CreateDefensePanelIn;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = createDefensePanelInSchema.parse(rawInput);

    // 1. Programme-Scoped Panel Assignment rule (FR-07.2a)
    const crossProgrammeFaculty = await validateFacultyProgrammes(
      input.chair_id,
      input.examiner_ids,
      input.course_id
    );

    if (crossProgrammeFaculty.length > 0) {
      if (!input.cross_programme_justification || input.cross_programme_justification.trim().length === 0) {
        throw new HttpError(
          400,
          'CROSS_PROGRAMME_JUSTIFICATION_REQUIRED',
          `Faculty members [${crossProgrammeFaculty.join(', ')}] are not registered for course '${input.course_id}'. A cross-programme justification is required.`
        );
      }
    }

    // 2. Slotted teams validation
    await validateSlottedTeams(
      input.time_slots,
      input.course_id,
      input.academic_year_id
    );

    // 3. Save panel document
    const ref = adminDb.collection(DEFENSE_PANELS_COLLECTION).doc();
    const normalizedSlots = input.time_slots.map(normalizeSlotToFirestore);

    const panelData = {
      id: ref.id,
      academic_year_id: input.academic_year_id,
      course_id: input.course_id,
      panel_name: input.panel_name,
      venue: input.venue,
      is_virtual: input.is_virtual,
      virtual_meeting_url: input.virtual_meeting_url || '',
      chair_id: input.chair_id,
      examiner_ids: input.examiner_ids,
      time_slots: normalizedSlots,
      is_published: false,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await ref.set(panelData);

    // 4. Audit logging
    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'defense.scheduled',
      target_type: 'defense_panel',
      target_id: ref.id,
      description: `Created defense panel '${input.panel_name}' with ${normalizedSlots.length} presentation slots`,
      metadata: {
        academic_year_id: input.academic_year_id,
        course_id: input.course_id,
        venue: input.venue,
        chair_id: input.chair_id,
        examiner_ids: input.examiner_ids,
        slot_count: normalizedSlots.length,
      },
    });

    if (crossProgrammeFaculty.length > 0) {
      await writeAudit({
        actor: {
          uid: user.uid,
          email: user.email,
          name: (user.claims.name as string) || user.email,
          role: user.activeRole,
        },
        action: 'defense.cross_programme',
        target_type: 'defense_panel',
        target_id: ref.id,
        description: `Cross-programme panel assignment justification: ${input.cross_programme_justification}`,
        metadata: {
          course_id: input.course_id,
          cross_programme_faculty: crossProgrammeFaculty,
          justification: input.cross_programme_justification,
        },
      });
    }

    const snap = await ref.get();
    const createdPanel = { id: ref.id, ...(snap.data() as Omit<DefensePanelDocument, 'id'>) };

    return {
      ok: true,
      panelId: ref.id,
      panel: createdPanel,
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

/**
 * Server Action: Update a defense panel and its slots.
 * Gated to coordinator and admin roles.
 */
export async function updateDefensePanel(
  idTokenOrInput: string | (z.infer<typeof updatePanelActionInputSchema> & { idToken: string }),
  maybeInput?: z.infer<typeof updatePanelActionInputSchema>
): Promise<ManageDefensePanelResult> {
  try {
    let idToken: string;
    let rawInput: z.infer<typeof updatePanelActionInputSchema>;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as z.infer<typeof updatePanelActionInputSchema>;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = updatePanelActionInputSchema.parse(rawInput);

    const existing = await getDefensePanel(input.panel_id);
    if (!existing) {
      throw new HttpError(404, 'NOT_FOUND', 'Defense panel not found.');
    }

    const targetCourseId = existing.course_id;
    const targetChairId = input.chair_id ?? existing.chair_id;
    const targetExaminerIds = input.examiner_ids ?? existing.examiner_ids;

    // 1. Cross-programme validation if faculty updated
    let crossProgrammeFaculty: string[] = [];
    if (input.chair_id || input.examiner_ids) {
      crossProgrammeFaculty = await validateFacultyProgrammes(
        targetChairId,
        targetExaminerIds,
        targetCourseId
      );

      if (crossProgrammeFaculty.length > 0) {
        if (!input.cross_programme_justification || input.cross_programme_justification.trim().length === 0) {
          throw new HttpError(
            400,
            'CROSS_PROGRAMME_JUSTIFICATION_REQUIRED',
            `Faculty members [${crossProgrammeFaculty.join(', ')}] are not registered for course '${targetCourseId}'. A cross-programme justification is required.`
          );
        }
      }
    }

    // 2. Slotted teams validation if time_slots updated
    if (input.time_slots) {
      await validateSlottedTeams(
        input.time_slots,
        targetCourseId,
        existing.academic_year_id,
        input.panel_id
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: FieldValue.serverTimestamp(),
    };

    if (input.panel_name !== undefined) updates.panel_name = input.panel_name;
    if (input.venue !== undefined) updates.venue = input.venue;
    if (input.is_virtual !== undefined) updates.is_virtual = input.is_virtual;
    if (input.virtual_meeting_url !== undefined) updates.virtual_meeting_url = input.virtual_meeting_url;
    if (input.chair_id !== undefined) updates.chair_id = input.chair_id;
    if (input.examiner_ids !== undefined) updates.examiner_ids = input.examiner_ids;
    if (input.time_slots !== undefined) {
      updates.time_slots = input.time_slots.map(normalizeSlotToFirestore);
    }

    const ref = adminDb.collection(DEFENSE_PANELS_COLLECTION).doc(input.panel_id);
    await ref.update(updates);

    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'defense.scheduled',
      target_type: 'defense_panel',
      target_id: input.panel_id,
      description: `Updated defense panel '${input.panel_name ?? existing.panel_name}'`,
      metadata: {
        panel_id: input.panel_id,
        updated_fields: Object.keys(updates).filter((k) => k !== 'updated_at'),
      },
    });

    if (crossProgrammeFaculty.length > 0) {
      await writeAudit({
        actor: {
          uid: user.uid,
          email: user.email,
          name: (user.claims.name as string) || user.email,
          role: user.activeRole,
        },
        action: 'defense.cross_programme',
        target_type: 'defense_panel',
        target_id: input.panel_id,
        description: `Cross-programme panel assignment justification: ${input.cross_programme_justification}`,
        metadata: {
          course_id: targetCourseId,
          cross_programme_faculty: crossProgrammeFaculty,
          justification: input.cross_programme_justification,
        },
      });
    }

    const updatedSnap = await ref.get();
    const updatedPanel = { id: ref.id, ...(updatedSnap.data() as Omit<DefensePanelDocument, 'id'>) };

    return {
      ok: true,
      panelId: input.panel_id,
      panel: updatedPanel,
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
