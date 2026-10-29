import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import { getRosterStudent } from '@/lib/models/roster/repo';
import type { RosterStudentDocument, TeamDocument } from '@/types/firestore';

export interface StudentState {
  exists: boolean;
  linked: boolean;
  uid: string | null;
  onActiveTeam: boolean;
  teamId?: string;
  active: boolean;
  student?: RosterStudentDocument;
}

/**
 * Checks if a student (by uid) belongs to an active (status !== 'disbanded') project team.
 * Returns false when there are no teams or when all matching teams are disbanded.
 */
export async function isStudentOnActiveTeam(
  uid: string,
  yearId?: string
): Promise<boolean> {
  const team = await getActiveTeamForStudent(uid, yearId);
  return Boolean(team);
}

/**
 * Retrieves the active (non-disbanded) team for a student uid, if any.
 */
export async function getActiveTeamForStudent(
  uid: string,
  yearId?: string
): Promise<TeamDocument | null> {
  if (!uid || typeof uid !== 'string' || uid.trim().length === 0) {
    return null;
  }

  let query: FirebaseFirestore.Query = adminDb
    .collection('teams')
    .where('member_ids', 'array-contains', uid.trim());

  if (yearId && yearId.trim().length > 0) {
    query = query.where('academic_year_id', '==', yearId.trim());
  }

  const snap = await query.get();
  if (snap.empty) {
    return null;
  }

  for (const doc of snap.docs) {
    const data = doc.data() as TeamDocument;
    if (data.status !== 'disbanded') {
      return {
        ...data,
        id: doc.id,
      };
    }
  }

  return null;
}

/**
 * Derives comprehensive student lifecycle state:
 * - exists: true if found in rosters/{yearId}/students/{indexNumber}
 * - linked: true if user_uid is not null
 * - uid: user UID or null
 * - onActiveTeam: true if student belongs to an active (non-disbanded) team
 * - teamId: ID of the active team if onActiveTeam is true
 * - active: true if is_active !== false (missing value counts as true)
 */
export async function getStudentState(
  indexNumber: string,
  yearId: string
): Promise<StudentState> {
  if (!indexNumber || !yearId) {
    return {
      exists: false,
      linked: false,
      uid: null,
      onActiveTeam: false,
      active: false,
    };
  }

  const student = await getRosterStudent(yearId, indexNumber);
  if (!student) {
    return {
      exists: false,
      linked: false,
      uid: null,
      onActiveTeam: false,
      active: false,
    };
  }

  const linked = Boolean(student.user_uid);
  const uid = student.user_uid ?? null;
  const active = student.is_active !== false;

  let onActiveTeam = false;
  let teamId: string | undefined;

  if (uid) {
    const activeTeam = await getActiveTeamForStudent(uid, yearId);
    if (activeTeam) {
      onActiveTeam = true;
      teamId = activeTeam.id;
    }
  }

  return {
    exists: true,
    linked,
    uid,
    onActiveTeam,
    teamId,
    active,
    student,
  };
}

/**
 * Pure state evaluation using injected fakes for unit testing.
 */
export function evaluateStudentStateWithFakes(
  student: RosterStudentDocument | null,
  activeTeam: TeamDocument | null
): StudentState {
  if (!student) {
    return {
      exists: false,
      linked: false,
      uid: null,
      onActiveTeam: false,
      active: false,
    };
  }

  const linked = Boolean(student.user_uid);
  const uid = student.user_uid ?? null;
  const active = student.is_active !== false;

  const onActiveTeam = Boolean(activeTeam && activeTeam.status !== 'disbanded');
  const teamId = onActiveTeam && activeTeam ? activeTeam.id : undefined;

  return {
    exists: true,
    linked,
    uid,
    onActiveTeam,
    teamId,
    active,
    student,
  };
}

