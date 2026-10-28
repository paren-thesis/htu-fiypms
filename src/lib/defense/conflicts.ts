export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Standard interval overlap test:
 * a.start < b.end && b.start < a.end
 * Strict inequalities ensure back-to-back slots (e.g. 09:00-10:00 and 10:00-11:00) do NOT conflict.
 */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export type ConflictType = 'examiner_double_booked' | 'venue_double_booked';

export interface DefenseConflict {
  type: ConflictType;
  message: string;
  panel_ids: [string, string];
  slot_ids: [string, string];
  details: {
    faculty_id?: string;
    faculty_name?: string;
    venue?: string;
    overlap_start: number;
    overlap_end: number;
  };
}

export interface PanelSlotInput {
  slot_id: string;
  team_id: string;
  start_time: { toMillis?: () => number; seconds?: number } | Date | number | string;
  end_time: { toMillis?: () => number; seconds?: number } | Date | number | string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

export interface DefensePanelInput {
  id: string;
  panel_name: string;
  venue: string;
  is_virtual: boolean;
  chair_id: string;
  examiner_ids: string[];
  time_slots: PanelSlotInput[];
}

export function toEpochMs(
  val: { toMillis?: () => number; seconds?: number } | Date | number | string | undefined | null
): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return new Date(val).getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.seconds === 'number') return val.seconds * 1000;
  return 0;
}

interface NormalizedSlot {
  panelId: string;
  panelName: string;
  venue: string;
  rawVenue: string;
  isVirtual: boolean;
  chairId: string;
  examinerIds: string[];
  allFacultyIds: Set<string>;
  slotId: string;
  teamId: string;
  start: number;
  end: number;
  status: string;
}

/**
 * Pure conflict detector across defense panels.
 * Detects:
 * (1) An examiner or chair booked in overlapping non-cancelled slots across different panels.
 * (2) The same physical venue (case-insensitive, non-virtual) in overlapping non-cancelled slots.
 */
export function detectConflicts(panels: DefensePanelInput[]): DefenseConflict[] {
  const conflicts: DefenseConflict[] = [];

  if (!Array.isArray(panels) || panels.length === 0) {
    return conflicts;
  }

  // 1. Flatten into active (non-cancelled) slots
  const activeSlots: NormalizedSlot[] = [];

  for (const panel of panels) {
    if (!panel || !Array.isArray(panel.time_slots)) continue;

    const facultySet = new Set<string>();
    if (panel.chair_id) facultySet.add(panel.chair_id);
    if (Array.isArray(panel.examiner_ids)) {
      for (const exId of panel.examiner_ids) {
        if (exId) facultySet.add(exId);
      }
    }

    for (const slot of panel.time_slots) {
      if (!slot || slot.status === 'cancelled') continue;

      const start = toEpochMs(slot.start_time);
      const end = toEpochMs(slot.end_time);

      if (start >= end) continue; // Invalid interval, skip or handle

      activeSlots.push({
        panelId: panel.id,
        panelName: panel.panel_name || 'Unnamed Panel',
        venue: (panel.venue || '').trim().toLowerCase(),
        rawVenue: (panel.venue || '').trim(),
        isVirtual: Boolean(panel.is_virtual),
        chairId: panel.chair_id,
        examinerIds: panel.examiner_ids || [],
        allFacultyIds: facultySet,
        slotId: slot.slot_id,
        teamId: slot.team_id,
        start,
        end,
        status: slot.status,
      });
    }
  }

  // 2. Pairwise comparison
  for (let i = 0; i < activeSlots.length; i++) {
    const s1 = activeSlots[i];
    if (!s1) continue;

    for (let j = i + 1; j < activeSlots.length; j++) {
      const s2 = activeSlots[j];
      if (!s2) continue;

      // Check interval overlap
      if (!overlaps({ start: s1.start, end: s1.end }, { start: s2.start, end: s2.end })) {
        continue;
      }

      const overlapStart = Math.max(s1.start, s2.start);
      const overlapEnd = Math.min(s1.end, s2.end);

      // (1) Faculty overlap (across different panels)
      if (s1.panelId !== s2.panelId) {
        for (const facultyId of s1.allFacultyIds) {
          if (s2.allFacultyIds.has(facultyId)) {
            conflicts.push({
              type: 'examiner_double_booked',
              message: `Examiner/Chair '${facultyId}' is scheduled for overlapping presentations between Panel '${s1.panelName}' (${s1.slotId}) and Panel '${s2.panelName}' (${s2.slotId}).`,
              panel_ids: [s1.panelId, s2.panelId],
              slot_ids: [s1.slotId, s2.slotId],
              details: {
                faculty_id: facultyId,
                overlap_start: overlapStart,
                overlap_end: overlapEnd,
              },
            });
          }
        }
      }

      // (2) Physical venue overlap (case-insensitive, non-virtual)
      if (
        !s1.isVirtual &&
        !s2.isVirtual &&
        s1.venue &&
        s2.venue &&
        s1.venue === s2.venue &&
        s1.slotId !== s2.slotId
      ) {
        conflicts.push({
          type: 'venue_double_booked',
          message: `Physical venue '${s1.rawVenue}' is double-booked for overlapping sessions in Panel '${s1.panelName}' (${s1.slotId}) and Panel '${s2.panelName}' (${s2.slotId}).`,
          panel_ids: [s1.panelId, s2.panelId],
          slot_ids: [s1.slotId, s2.slotId],
          details: {
            venue: s1.rawVenue,
            overlap_start: overlapStart,
            overlap_end: overlapEnd,
          },
        });
      }
    }
  }

  return conflicts;
}
