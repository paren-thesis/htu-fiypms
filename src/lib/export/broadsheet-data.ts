import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import type { TeamDocument, RosterStudentDocument, UserDocument } from '@/types/firestore';

export interface BroadsheetStudentRow {
  index_number: string;
  full_name: string;
  contact: string; // from roster doc only
  group_number: string;
  course_id: string;
  supervisor_score: number | null;
  panel_average_score: number | null;
  composite_final_score: number | null;
  is_locked: boolean;
  is_incomplete: boolean;
}

export interface BroadsheetProgrammeSection {
  course_id: string;
  course_code: string;
  course_name: string;
  rows: BroadsheetStudentRow[];
}

export interface BroadsheetDataset {
  academic_year_id: string;
  course_id: string;
  generated_at: string;
  is_all_locked: boolean;
  has_incomplete: boolean;
  total_students: number;
  rows: BroadsheetStudentRow[];
  programmes: BroadsheetProgrammeSection[];
}

export const PROGRAMMES_ORDER: { id: string; code: string; name: string }[] = [
  {
    id: 'btech-cs',
    code: 'BTECH-CS',
    name: 'Bachelor of Technology in Computer Science',
  },
  {
    id: 'btech-ict',
    code: 'BTECH-ICT',
    name: 'Bachelor of Technology in Information Communication Technology',
  },
  {
    id: 'hnd-cs',
    code: 'HND-CS',
    name: 'Higher National Diploma in Computer Science',
  },
  {
    id: 'hnd-ict',
    code: 'HND-ICT',
    name: 'Higher National Diploma in Information Communication Technology',
  },
];

export const PROGRAMMES: Record<string, { code: string; name: string }> = Object.fromEntries(
  PROGRAMMES_ORDER.map((p) => [p.id, { code: p.code, name: p.name }])
);

/**
 * Pure data transformation: compiles rows from teams, roster, and users.
 * Sorted strictly by course_id, group_number, index_number.
 */
export function assembleStudentRows(params: {
  teams: TeamDocument[];
  rosterStudents: RosterStudentDocument[];
  users?: UserDocument[];
  courseId?: string;
}): BroadsheetStudentRow[] {
  const { teams, rosterStudents, users = [], courseId } = params;
  const targetCourseId = courseId && courseId !== 'all' ? courseId.toLowerCase().trim() : null;

  // Build index lookups for roster
  const rosterByIndex = new Map<string, RosterStudentDocument>();
  const rosterByUid = new Map<string, RosterStudentDocument>();

  for (const s of rosterStudents) {
    if (s.index_number) {
      rosterByIndex.set(s.index_number.trim().toLowerCase(), s);
    }
    if (s.user_uid) {
      rosterByUid.set(s.user_uid.trim(), s);
    }
  }

  // Build index lookup for users
  const usersByUid = new Map<string, UserDocument>();
  for (const u of users) {
    if (u.uid) {
      usersByUid.set(u.uid.trim(), u);
    }
  }

  const rows: BroadsheetStudentRow[] = [];

  for (const team of teams) {
    const teamCourseId = (team.course_id || '').toLowerCase().trim();
    if (targetCourseId && teamCourseId !== targetCourseId) {
      continue;
    }

    const scoresSummary = team.scores_summary;
    const hasScores =
      scoresSummary &&
      typeof scoresSummary.composite_final_score === 'number' &&
      !isNaN(scoresSummary.composite_final_score);

    const supervisorScore =
      scoresSummary && typeof scoresSummary.supervisor_score === 'number'
        ? scoresSummary.supervisor_score
        : null;

    const panelAverageScore =
      scoresSummary && typeof scoresSummary.panel_average_score === 'number'
        ? scoresSummary.panel_average_score
        : null;

    const compositeScore = hasScores ? scoresSummary.composite_final_score : null;
    const isLocked = Boolean(scoresSummary?.is_locked);
    const isIncomplete = !hasScores;

    const memberIds = Array.isArray(team.member_ids) ? team.member_ids : [];

    for (const memberUid of memberIds) {
      const userDoc = usersByUid.get(memberUid);
      const userIndexNumber = userDoc?.profile?.index_number?.trim();

      const rosterDoc =
        (userIndexNumber ? rosterByIndex.get(userIndexNumber.toLowerCase()) : null) ||
        rosterByUid.get(memberUid);

      const indexNumber = userIndexNumber || rosterDoc?.index_number || '';
      const fullName = rosterDoc?.full_name || userDoc?.name || 'Unknown Student';
      const contact = rosterDoc?.contact || '';

      rows.push({
        index_number: indexNumber,
        full_name: fullName,
        contact: contact,
        group_number: team.group_number || '',
        course_id: teamCourseId,
        supervisor_score: supervisorScore,
        panel_average_score: panelAverageScore,
        composite_final_score: compositeScore,
        is_locked: isLocked,
        is_incomplete: isIncomplete,
      });
    }
  }

  // Sort strictly by course_id, group_number, index_number
  rows.sort((a, b) => {
    const courseCmp = a.course_id.localeCompare(b.course_id);
    if (courseCmp !== 0) return courseCmp;
    const groupCmp = a.group_number.localeCompare(b.group_number);
    if (groupCmp !== 0) return groupCmp;
    return a.index_number.localeCompare(b.index_number);
  });

  return rows;
}

/**
 * Organizes a flat list of rows into programme sections according to PROGRAMMES_ORDER.
 */
export function groupRowsByProgramme(
  rows: BroadsheetStudentRow[],
  targetCourseId?: string
): BroadsheetProgrammeSection[] {
  const effectiveCourseId =
    targetCourseId && targetCourseId !== 'all' ? targetCourseId.toLowerCase().trim() : null;

  const relevantProgrammes = effectiveCourseId
    ? PROGRAMMES_ORDER.filter((p) => p.id === effectiveCourseId)
    : PROGRAMMES_ORDER;

  return relevantProgrammes.map((p) => {
    const programmeRows = rows.filter((r) => r.course_id === p.id);
    return {
      course_id: p.id,
      course_code: p.code,
      course_name: p.name,
      rows: programmeRows,
    };
  });
}

/**
 * Fetches all necessary data from Firestore and constructs the broadsheet dataset.
 */
export async function fetchBroadsheetData(
  academicYearId: string,
  courseId: string = 'all'
): Promise<BroadsheetDataset> {
  const cleanYearId = academicYearId.trim();
  const cleanCourseId = courseId.trim().toLowerCase();

  // 1. Fetch teams for academic year
  let teamsQuery = adminDb
    .collection('teams')
    .where('academic_year_id', '==', cleanYearId);

  if (cleanCourseId !== 'all') {
    teamsQuery = teamsQuery.where('course_id', '==', cleanCourseId);
  }

  const teamsSnap = await teamsQuery.get();
  const teams: TeamDocument[] = teamsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<TeamDocument, 'id'>) })
  );

  // 2. Collect all unique member UIDs across teams
  const memberUidSet = new Set<string>();
  for (const t of teams) {
    if (Array.isArray(t.member_ids)) {
      for (const uid of t.member_ids) {
        if (uid) memberUidSet.add(uid);
      }
    }
  }

  // 3. Batch fetch users for all member UIDs
  const users: UserDocument[] = [];
  const memberUids = Array.from(memberUidSet);
  const chunkSize = 100;
  for (let i = 0; i < memberUids.length; i += chunkSize) {
    const chunk = memberUids.slice(i, i + chunkSize);
    const refs = chunk.map((uid) => adminDb.collection('users').doc(uid));
    const snaps = await adminDb.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) {
        users.push({ uid: snap.id, ...(snap.data() as Omit<UserDocument, 'uid'>) });
      }
    }
  }

  // 4. Fetch roster students for this academic year
  const rosterCollectionRef = adminDb
    .collection('rosters')
    .doc(cleanYearId)
    .collection('students');

  let rosterQuery: FirebaseFirestore.Query = rosterCollectionRef;
  if (cleanCourseId !== 'all') {
    rosterQuery = rosterQuery.where('course_id', '==', cleanCourseId);
  }

  const rosterSnap = await rosterQuery.get();
  const rosterStudents: RosterStudentDocument[] = rosterSnap.docs.map(
    (d) => d.data() as RosterStudentDocument
  );

  // 5. Assemble and group rows
  const rows = assembleStudentRows({
    teams,
    rosterStudents,
    users,
    courseId: cleanCourseId,
  });

  const isAllLocked = rows.length > 0 && rows.every((r) => r.is_locked);
  const hasIncomplete = rows.some((r) => r.is_incomplete);
  const programmes = groupRowsByProgramme(rows, cleanCourseId);

  return {
    academic_year_id: cleanYearId,
    course_id: cleanCourseId,
    generated_at: new Date().toISOString(),
    is_all_locked: isAllLocked,
    has_incomplete: hasIncomplete,
    total_students: rows.length,
    rows,
    programmes,
  };
}
