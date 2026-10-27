import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { TeamDocument } from '@/types/firestore';
import { incrementCounterInTx } from '@/lib/models/academic-year/repo';
import { formatGroupNumber, generateInviteCode } from './invite-code';

export interface CreateTeamInTxParams {
  leaderUid: string;
  memberUids: string[];
  courseId: string;
  yearId: string;
  name: string;
  rng?: () => number;
}

export interface CreateTeamInTxResult {
  teamId: string;
  groupNumber: string;
  inviteCode: string;
  team: TeamDocument;
}

/**
 * Creates a project team inside an active Firestore transaction (Spec FR-02.1 - FR-02.5a, F-06, F-14).
 * Reusable by both student self-service team creation and coordinator auto-grouping (04-03).
 *
 * Sequence of operations inside the transaction:
 * 1. Increments academic_years/{yearId}/counters/{courseId}.next_sequence
 * 2. Formats unique group_number: {Prefix}{YY}_{Sequence:02d}
 * 3. Generates unique 6-character invite code (retrying up to 5 times on collision)
 * 4. Writes invite_codes/{code} via tx.create (enforcing global uniqueness)
 * 5. Writes teams/{teamId}/private/invite display copy (readable by team & coordinators)
 * 6. Writes teams/{teamId}/members/{uid} for each assigned member
 * 7. Writes teams/{teamId} document (initial status: formation, max_members: 5)
 */
export async function createTeamInTx(
  tx: FirebaseFirestore.Transaction,
  params: CreateTeamInTxParams
): Promise<CreateTeamInTxResult> {
  const normalizedCourseId = params.courseId.toLowerCase().trim();

  // 1. READ: Sequence counter
  const counterRef = adminDb
    .collection('academic_years')
    .doc(params.yearId)
    .collection('counters')
    .doc(normalizedCourseId);

  const counterSnap = await tx.get(counterRef);
  let assignedSeq = 1;
  if (counterSnap.exists) {
    const data = counterSnap.data() as { next_sequence?: number };
    assignedSeq = data.next_sequence || 1;
  }

  // 2. READ: Invite code candidate (read before any writes, with retry up to 5 attempts)
  let inviteCode = '';
  let candidateFound = false;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateInviteCode(params.rng);
    const candidateRef = adminDb.collection('invite_codes').doc(candidate);
    const snap = await tx.get(candidateRef);
    if (!snap.exists) {
      inviteCode = candidate;
      candidateFound = true;
      break;
    }
  }

  if (!candidateFound) {
    throw new Error('Failed to generate a unique invite code after 5 attempts.');
  }

  // Derive unique group number
  const groupNumber = formatGroupNumber(normalizedCourseId, params.yearId, assignedSeq);

  // New team reference
  const teamRef = adminDb.collection('teams').doc();
  const teamId = teamRef.id;

  // 3. ALL WRITES BEGIN HERE (all reads are strictly completed above)

  // A. Advance counter
  tx.set(counterRef, { next_sequence: assignedSeq + 1 }, { merge: true });

  // B. Create server-only invite_codes/{code}
  const inviteCodeRef = adminDb.collection('invite_codes').doc(inviteCode);
  tx.create(inviteCodeRef, {
    code: inviteCode,
    team_id: teamId,
    created_at: FieldValue.serverTimestamp(),
  });

  // C. Write private invite copy for team members and coordinators
  const privateInviteRef = teamRef.collection('private').doc('invite');
  tx.set(privateInviteRef, {
    code: inviteCode,
  });

  // D. Write member documents in subcollection
  for (const uid of params.memberUids) {
    const memberDocRef = teamRef.collection('members').doc(uid);
    tx.set(memberDocRef, {
      uid,
      role: uid === params.leaderUid ? 'leader' : 'member',
      joined_at: FieldValue.serverTimestamp(),
    });
  }

  // E. Write primary team document (invite code is NEVER stored here per F-06)
  const teamData: Omit<TeamDocument, 'created_at' | 'updated_at'> & {
    created_at: FieldValue;
    updated_at: FieldValue;
  } = {
    id: teamId,
    name: params.name.trim(),
    group_number: groupNumber,
    course_id: normalizedCourseId,
    academic_year_id: params.yearId,
    leader_id: params.leaderUid,
    member_ids: params.memberUids,
    member_count: params.memberUids.length,
    max_members: 5,
    status: 'formation',
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  tx.set(teamRef, teamData);

  return {
    teamId,
    groupNumber,
    inviteCode,
    team: teamData as unknown as TeamDocument,
  };
}
