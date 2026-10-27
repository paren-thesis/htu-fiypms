import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { TeamDocument } from '@/types/firestore';

export interface EnsureContactGrantsResult {
  granted: boolean;
  memberCount: number;
}

function isTransaction(obj: unknown): obj is Transaction {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'get' in obj &&
    'set' in obj &&
    'create' in obj
  );
}

/**
 * Creates supervisor_contacts/{supervisorId}/grants/{memberUid} for every member
 * ONLY when all three criteria are met (Spec FR-04.4, §8.1, F-03):
 * 1. assigned_supervisor_id is set
 * 2. supervisor_assignment.status is 'accepted' (tolerate field not existing yet)
 * 3. approved_topic_id is set
 *
 * @param txOrDbOrTeamId Firestore Transaction, Firestore instance, or teamId string
 * @param maybeTeamId teamId string if first arg was tx or db
 */
export async function ensureContactGrants(
  txOrDbOrTeamId: Transaction | FirebaseFirestore.Firestore | string,
  maybeTeamId?: string
): Promise<EnsureContactGrantsResult> {
  let teamId: string;
  let tx: Transaction | undefined;

  if (typeof txOrDbOrTeamId === 'string') {
    teamId = txOrDbOrTeamId;
  } else {
    teamId = maybeTeamId!;
    if (isTransaction(txOrDbOrTeamId)) {
      tx = txOrDbOrTeamId;
    }
  }

  if (!teamId) {
    return { granted: false, memberCount: 0 };
  }

  const teamRef = adminDb.collection('teams').doc(teamId);
  const teamSnap = tx ? await tx.get(teamRef) : await teamRef.get();

  if (!teamSnap.exists) {
    return { granted: false, memberCount: 0 };
  }

  const team = teamSnap.data() as TeamDocument & {
    supervisor_assignment?: { status?: string };
  };

  const hasAssignedSupervisor = Boolean(team.assigned_supervisor_id);
  const isAssignmentAccepted = team.supervisor_assignment?.status === 'accepted';
  const hasApprovedTopic = Boolean(team.approved_topic_id);

  // Criteria gate: all three MUST be true
  if (!hasAssignedSupervisor || !isAssignmentAccepted || !hasApprovedTopic) {
    return { granted: false, memberCount: 0 };
  }

  const supervisorId = team.assigned_supervisor_id!;
  const memberIds = Array.isArray(team.member_ids) ? team.member_ids : [];

  for (const memberUid of memberIds) {
    const grantRef = adminDb
      .collection('supervisor_contacts')
      .doc(supervisorId)
      .collection('grants')
      .doc(memberUid);

    const grantData = {
      student_id: memberUid,
      team_id: teamId,
      granted_at: FieldValue.serverTimestamp(),
    };

    if (tx) {
      tx.set(grantRef, grantData, { merge: true });
    } else {
      await grantRef.set(grantData, { merge: true });
    }
  }

  return { granted: true, memberCount: memberIds.length };
}

/**
 * Revokes contact grants for a given team across all supervisor contact records.
 */
export async function revokeContactGrants(
  txOrDbOrTeamId: Transaction | FirebaseFirestore.Firestore | string,
  maybeTeamId?: string
): Promise<{ revokedCount: number }> {
  let teamId: string;
  let tx: Transaction | undefined;

  if (typeof txOrDbOrTeamId === 'string') {
    teamId = txOrDbOrTeamId;
  } else {
    teamId = maybeTeamId!;
    if (isTransaction(txOrDbOrTeamId)) {
      tx = txOrDbOrTeamId;
    }
  }

  if (!teamId) {
    return { revokedCount: 0 };
  }

  // Find all grants matching team_id across subcollections
  const grantsSnap = await adminDb
    .collectionGroup('grants')
    .where('team_id', '==', teamId)
    .get();

  if (grantsSnap.empty) {
    return { revokedCount: 0 };
  }

  for (const doc of grantsSnap.docs) {
    if (tx) {
      tx.delete(doc.ref);
    } else {
      await doc.ref.delete();
    }
  }

  return { revokedCount: grantsSnap.size };
}
