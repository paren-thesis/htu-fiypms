import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { DefensePanelDocument, DefenseTimeSlot } from '@/types/firestore';
import { toEpochMs } from '@/lib/defense/conflicts';
import type { DefenseTimeSlotIn } from './schema';

export const DEFENSE_PANELS_COLLECTION = 'defense_panels';

export function normalizeSlotToFirestore(slot: DefenseTimeSlotIn): DefenseTimeSlot {
  const startMs = toEpochMs(slot.start_time);
  const endMs = toEpochMs(slot.end_time);

  return {
    slot_id: slot.slot_id || (slot as { id?: string }).id || `slot_${Math.random().toString(36).substring(2, 9)}`,
    team_id: slot.team_id || '',
    start_time: Timestamp.fromMillis(startMs) as unknown as FirebaseFirestore.Timestamp,
    end_time: Timestamp.fromMillis(endMs) as unknown as FirebaseFirestore.Timestamp,
    status: (slot.status as DefenseTimeSlot['status']) || 'scheduled',
  };
}

/**
 * Fetch a defense panel by ID.
 */
export async function getDefensePanel(panelId: string): Promise<DefensePanelDocument | null> {
  const doc = await adminDb.collection(DEFENSE_PANELS_COLLECTION).doc(panelId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...(doc.data() as Omit<DefensePanelDocument, 'id'>) };
}

/**
 * List defense panels, optionally filtered by academic year or course.
 */
export async function listDefensePanels(
  academicYearId?: string,
  courseId?: string
): Promise<DefensePanelDocument[]> {
  let query: FirebaseFirestore.Query = adminDb.collection(DEFENSE_PANELS_COLLECTION);

  if (academicYearId) {
    query = query.where('academic_year_id', '==', academicYearId);
  }
  if (courseId) {
    query = query.where('course_id', '==', courseId);
  }

  const snap = await query.get();
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<DefensePanelDocument, 'id'>) } as DefensePanelDocument)
  );
}

/**
 * Create a new defense panel document.
 */
export async function createDefensePanelDoc(
  panelData: {
    academic_year_id: string;
    course_id: string;
    panel_name: string;
    venue: string;
    is_virtual: boolean;
    virtual_meeting_url?: string;
    chair_id: string;
    examiner_ids: string[];
    time_slots: DefenseTimeSlot[];
  },
  customId?: string
): Promise<DefensePanelDocument> {
  const ref = customId
    ? adminDb.collection(DEFENSE_PANELS_COLLECTION).doc(customId)
    : adminDb.collection(DEFENSE_PANELS_COLLECTION).doc();

  const data = {
    ...panelData,
    is_published: false,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(data);
  const snap = await ref.get();
  return { id: ref.id, ...(snap.data() as Omit<DefensePanelDocument, 'id'>) };
}
