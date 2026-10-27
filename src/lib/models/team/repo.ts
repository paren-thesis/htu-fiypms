import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import type {
  TeamDocument,
  TeamMemberDocument,
  TeamInviteDocument,
  InviteCodeDocument,
} from '@/types/firestore';

const COLLECTION = 'teams';
const INVITE_CODES_COLLECTION = 'invite_codes';

/**
 * Retrieves a team document by ID.
 */
export async function getTeam(teamId: string): Promise<TeamDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(teamId).get();
  if (!snap.exists) return null;
  return snap.data() as TeamDocument;
}

/**
 * Retrieves the invite code stored in teams/{teamId}/private/invite.
 * Returns null if not found.
 */
export async function getTeamInviteCode(teamId: string): Promise<string | null> {
  const snap = await adminDb
    .collection(COLLECTION)
    .doc(teamId)
    .collection('private')
    .doc('invite')
    .get();

  if (!snap.exists) return null;
  const data = snap.data() as TeamInviteDocument;
  return data?.code ?? null;
}

/**
 * Retrieves a team along with its private invite code.
 */
export async function getTeamWithInvite(
  teamId: string
): Promise<{ team: TeamDocument; inviteCode: string | null } | null> {
  const team = await getTeam(teamId);
  if (!team) return null;
  const inviteCode = await getTeamInviteCode(teamId);
  return { team, inviteCode };
}

/**
 * Checks if a student belongs to an active (non-disbanded) team in a specific academic year.
 */
export async function findUserActiveTeam(
  userId: string,
  academicYearId: string
): Promise<TeamDocument | null> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where('academic_year_id', '==', academicYearId)
    .where('member_ids', 'array-contains', userId)
    .get();

  if (snap.empty) return null;

  for (const doc of snap.docs) {
    const team = doc.data() as TeamDocument;
    if (team.status !== 'disbanded') {
      return team;
    }
  }

  return null;
}

/**
 * Lists teams for an academic year, with optional filtering by course track or status.
 */
export async function listTeams(
  academicYearId: string,
  filter?: {
    course_id?: string;
    status?: TeamDocument['status'];
  }
): Promise<TeamDocument[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collection(COLLECTION)
    .where('academic_year_id', '==', academicYearId);

  if (filter?.course_id) {
    query = query.where('course_id', '==', filter.course_id.toLowerCase().trim());
  }

  if (filter?.status) {
    query = query.where('status', '==', filter.status);
  }

  const snap = await query.get();
  const list = snap.docs.map((doc) => doc.data() as TeamDocument);

  // Sort by group_number ascending
  list.sort((a, b) => a.group_number.localeCompare(b.group_number));
  return list;
}

/**
 * Retrieves the member documents from teams/{teamId}/members subcollection.
 */
export async function getTeamMembers(
  teamId: string
): Promise<TeamMemberDocument[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .doc(teamId)
    .collection('members')
    .get();

  const members = snap.docs.map((doc) => doc.data() as TeamMemberDocument);
  // Sort so leader comes first, then by joined_at
  members.sort((a, b) => {
    if (a.role === 'leader') return -1;
    if (b.role === 'leader') return 1;
    return 0;
  });
  return members;
}

/**
 * Looks up an invite code in the server-only invite_codes collection.
 */
export async function getInviteCodeRecord(
  code: string
): Promise<InviteCodeDocument | null> {
  const normalized = code.trim().toUpperCase();
  const snap = await adminDb.collection(INVITE_CODES_COLLECTION).doc(normalized).get();
  if (!snap.exists) return null;
  return snap.data() as InviteCodeDocument;
}
