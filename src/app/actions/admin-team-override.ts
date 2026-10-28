'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit, writeAuditInTx } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { revokeContactGrants } from '@/lib/contacts/grants';
import type {
  TeamDocument,
  UserDocument,
  TeamInviteDocument,
  SupervisionDocument,
} from '@/types/firestore';

const changeMaxMembersSchema = z.object({
  team_id: z.string().trim().min(1, 'Team ID is required'),
  max_members: z
    .number()
    .int('Max members must be an integer')
    .min(1, 'Max members must be at least 1')
    .max(15, 'Max members cannot exceed 15'),
  reason: z.string().trim().max(500).optional(),
});

const transferMemberSchema = z.object({
  student_uid: z.string().trim().min(1, 'Student UID is required'),
  from_team_id: z.string().trim().min(1, 'Source team ID is required'),
  to_team_id: z.string().trim().min(1, 'Destination team ID is required'),
  reason: z.string().trim().max(500).optional(),
});

const disbandTeamSchema = z.object({
  team_id: z.string().trim().min(1, 'Team ID is required'),
  reason: z.string().trim().max(500).optional(),
});

function extractTokenAndPayload<T>(
  idTokenOrInput?: string | (T & { idToken?: string }),
  maybeInput?: T | string
): { idToken: string; rawInput: Record<string, unknown> } {
  let idToken: string | undefined;
  let rawInput: Record<string, unknown> = {};

  if (typeof idTokenOrInput === 'string') {
    idToken = idTokenOrInput;
    if (maybeInput && typeof maybeInput === 'object') {
      rawInput = { ...(maybeInput as Record<string, unknown>) };
    }
  } else if (idTokenOrInput && typeof idTokenOrInput === 'object') {
    const copy = { ...(idTokenOrInput as Record<string, unknown>) };
    if (typeof copy.idToken === 'string') {
      idToken = copy.idToken;
    }
    delete copy.idToken;
    rawInput = copy;
    if (!idToken && typeof maybeInput === 'string') {
      idToken = maybeInput;
    }
  }

  if (!idToken) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
  }

  return { idToken, rawInput };
}

export interface ChangeMaxMembersInput {
  team_id?: string;
  teamId?: string;
  max_members?: number;
  maxMembers?: number;
  reason?: string;
}

export interface ChangeMaxMembersResult {
  ok: boolean;
  team_id?: string;
  old_max_members?: number;
  max_members?: number;
  error?: string;
  code?: string;
}

/**
 * Admin-only Server Action: Override a team's max_members limit (Spec FR-02.7).
 */
export async function changeMaxMembers(
  idTokenOrInput?: string | (ChangeMaxMembersInput & { idToken?: string }),
  maybeInput?: ChangeMaxMembersInput | string
): Promise<ChangeMaxMembersResult> {
  try {
    const { idToken, rawInput } = extractTokenAndPayload(idTokenOrInput, maybeInput);
    const caller = await requireUser(idToken, ['admin']);

    const normalizedInput = {
      team_id: String(rawInput.team_id ?? rawInput.teamId ?? '').trim(),
      max_members: Number(rawInput.max_members ?? rawInput.maxMembers),
      reason:
        typeof rawInput.reason === 'string' && rawInput.reason.trim().length > 0
          ? rawInput.reason.trim()
          : undefined,
    };

    const parsed = changeMaxMembersSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid max_members input'
      );
    }

    const { team_id, max_members, reason } = parsed.data;
    const teamRef = adminDb.collection('teams').doc(team_id);

    let oldMax = 5;

    await adminDb.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', `Team ${team_id} not found`);
      }

      const team = teamSnap.data() as TeamDocument;
      oldMax = team.max_members ?? 5;
      const currentCount = team.member_count ?? (team.member_ids?.length || 0);

      if (max_members < currentCount) {
        throw new HttpError(
          400,
          'MAX_BELOW_CURRENT_COUNT',
          `Cannot set max_members (${max_members}) below current member count (${currentCount}).`
        );
      }

      tx.update(teamRef, {
        max_members,
        updated_at: FieldValue.serverTimestamp(),
      });

      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: 'admin',
        },
        action: 'team.max_members_changed',
        target_type: 'team',
        target_id: team_id,
        description: `Overrode max_members for ${team.group_number || team_id}: ${oldMax} -> ${max_members}`,
        metadata: {
          group_number: team.group_number,
          old: { max_members: oldMax },
          new: { max_members },
          reason: reason || 'Administrative capacity override',
        },
      });
    });

    return {
      ok: true,
      team_id,
      old_max_members: oldMax,
      max_members,
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

export interface TransferMemberInput {
  student_uid?: string;
  user_id?: string;
  uid?: string;
  member_uid?: string;
  from_team_id?: string;
  source_team_id?: string;
  fromTeamId?: string;
  to_team_id?: string;
  target_team_id?: string;
  toTeamId?: string;
  reason?: string;
}

export interface TransferMemberResult {
  ok: boolean;
  student_uid?: string;
  from_team_id?: string;
  to_team_id?: string;
  error?: string;
  code?: string;
}

/**
 * Admin-only Server Action: Transfer a student between two teams of the SAME course (Spec FR-02.7, FR-01.10).
 * Keeps member_ids, member_count, members subcollection, leader role, and supervisor contact grants consistent.
 */
export async function transferMember(
  idTokenOrInput?: string | (TransferMemberInput & { idToken?: string }),
  maybeInput?: TransferMemberInput | string
): Promise<TransferMemberResult> {
  try {
    const { idToken, rawInput } = extractTokenAndPayload(idTokenOrInput, maybeInput);
    const caller = await requireUser(idToken, ['admin']);

    const normalizedInput = {
      student_uid: String(
        rawInput.student_uid ??
          rawInput.user_id ??
          rawInput.uid ??
          rawInput.member_uid ??
          ''
      ).trim(),
      from_team_id: String(
        rawInput.from_team_id ?? rawInput.source_team_id ?? rawInput.fromTeamId ?? ''
      ).trim(),
      to_team_id: String(
        rawInput.to_team_id ?? rawInput.target_team_id ?? rawInput.toTeamId ?? ''
      ).trim(),
      reason:
        typeof rawInput.reason === 'string' && rawInput.reason.trim().length > 0
          ? rawInput.reason.trim()
          : undefined,
    };

    const parsed = transferMemberSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid member transfer input'
      );
    }

    const { student_uid, from_team_id, to_team_id, reason } = parsed.data;

    if (from_team_id === to_team_id) {
      throw new HttpError(
        400,
        'SAME_TEAM',
        'Source and destination teams must be different.'
      );
    }

    const fromRef = adminDb.collection('teams').doc(from_team_id);
    const toRef = adminDb.collection('teams').doc(to_team_id);
    const studentRef = adminDb.collection('users').doc(student_uid);

    let fromGroupNumber = from_team_id;
    let toGroupNumber = to_team_id;

    await adminDb.runTransaction(async (tx) => {
      const [fromSnap, toSnap, studentSnap] = await Promise.all([
        tx.get(fromRef),
        tx.get(toRef),
        tx.get(studentRef),
      ]);

      if (!fromSnap.exists) {
        throw new HttpError(404, 'SOURCE_TEAM_NOT_FOUND', `Source team ${from_team_id} not found`);
      }
      if (!toSnap.exists) {
        throw new HttpError(404, 'TARGET_TEAM_NOT_FOUND', `Target team ${to_team_id} not found`);
      }

      const fromTeam = fromSnap.data() as TeamDocument;
      const toTeam = toSnap.data() as TeamDocument;
      const studentDoc = studentSnap.exists ? (studentSnap.data() as UserDocument) : null;

      fromGroupNumber = fromTeam.group_number || from_team_id;
      toGroupNumber = toTeam.group_number || to_team_id;

      if (fromTeam.status === 'disbanded') {
        throw new HttpError(400, 'SOURCE_TEAM_DISBANDED', 'Source team is already disbanded.');
      }
      if (toTeam.status === 'disbanded') {
        throw new HttpError(400, 'TARGET_TEAM_DISBANDED', 'Cannot transfer member into a disbanded team.');
      }

      // Enforce Category Integrity (FR-01.10, FR-02.7): teams and student must share the same course_id
      const fromCourse = (fromTeam.course_id || '').toLowerCase().trim();
      const toCourse = (toTeam.course_id || '').toLowerCase().trim();
      const studentCourse = (studentDoc?.profile?.course_id || fromCourse).toLowerCase().trim();

      if (fromCourse !== toCourse || studentCourse !== toCourse) {
        throw new HttpError(
          409,
          'COURSE_MISMATCH',
          'Cross-programme transfers are prohibited. Source and destination teams must belong to the same course track.'
        );
      }

      const fromMembers = Array.isArray(fromTeam.member_ids) ? fromTeam.member_ids : [];
      const toMembers = Array.isArray(toTeam.member_ids) ? toTeam.member_ids : [];

      if (!fromMembers.includes(student_uid)) {
        throw new HttpError(
          400,
          'NOT_IN_SOURCE_TEAM',
          `Student ${student_uid} is not a member of team ${fromGroupNumber}.`
        );
      }

      if (toMembers.includes(student_uid)) {
        throw new HttpError(
          400,
          'ALREADY_IN_TARGET_TEAM',
          `Student ${student_uid} is already a member of team ${toGroupNumber}.`
        );
      }

      const maxTo = toTeam.max_members ?? 5;
      if (toMembers.length >= maxTo) {
        throw new HttpError(
          400,
          'TEAM_FULL',
          `Destination team ${toGroupNumber} is at maximum capacity (${maxTo}).`
        );
      }

      const nextFromMembers = fromMembers.filter((id) => id !== student_uid);
      const nextToMembers = [...toMembers, student_uid];

      // Determine leader of source team if leader was transferred
      let nextFromLeader = fromTeam.leader_id;
      if (fromTeam.leader_id === student_uid && nextFromMembers.length > 0) {
        nextFromLeader = nextFromMembers[0]!;
        const promotedRef = fromRef.collection('members').doc(nextFromLeader);
        tx.set(
          promotedRef,
          {
            uid: nextFromLeader,
            role: 'leader',
          },
          { merge: true }
        );
      }

      // Update source team
      tx.update(fromRef, {
        member_ids: nextFromMembers,
        member_count: nextFromMembers.length,
        leader_id: nextFromLeader,
        updated_at: FieldValue.serverTimestamp(),
      });
      tx.delete(fromRef.collection('members').doc(student_uid));

      // Update destination team
      tx.update(toRef, {
        member_ids: nextToMembers,
        member_count: nextToMembers.length,
        updated_at: FieldValue.serverTimestamp(),
      });
      tx.set(toRef.collection('members').doc(student_uid), {
        uid: student_uid,
        role: 'member',
        joined_at: FieldValue.serverTimestamp(),
      });

      // Keep supervisor contact grants consistent:
      // 1. Revoke grant from source team's supervisor if present
      if (fromTeam.assigned_supervisor_id) {
        const oldGrantRef = adminDb
          .collection('supervisor_contacts')
          .doc(fromTeam.assigned_supervisor_id)
          .collection('grants')
          .doc(student_uid);
        tx.delete(oldGrantRef);
      }

      // 2. Grant contact access for destination team's supervisor if destination team meets grant criteria
      if (
        toTeam.assigned_supervisor_id &&
        toTeam.supervisor_assignment?.status === 'accepted' &&
        toTeam.approved_topic_id
      ) {
        const newGrantRef = adminDb
          .collection('supervisor_contacts')
          .doc(toTeam.assigned_supervisor_id)
          .collection('grants')
          .doc(student_uid);
        tx.set(
          newGrantRef,
          {
            student_id: student_uid,
            team_id: to_team_id,
            granted_at: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      writeAuditInTx(tx, {
        actor: {
          uid: caller.uid,
          email: caller.email,
          role: 'admin',
        },
        action: 'team.member_transferred',
        target_type: 'team',
        target_id: to_team_id,
        description: `Transferred student ${student_uid} from ${fromGroupNumber} to ${toGroupNumber}`,
        metadata: {
          student_uid,
          old: {
            team_id: from_team_id,
            group_number: fromGroupNumber,
            member_count: fromMembers.length,
          },
          new: {
            team_id: to_team_id,
            group_number: toGroupNumber,
            member_count: nextToMembers.length,
          },
          reason: reason || 'Administrative member transfer',
        },
      });
    });

    await notify([student_uid], {
      type: 'team_update',
      title: 'Project Team Transfer',
      body: `An administrator has transferred you from ${fromGroupNumber} to ${toGroupNumber}.`,
      target_url: '/my-team',
    }).catch(() => {});

    return {
      ok: true,
      student_uid,
      from_team_id,
      to_team_id,
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

export interface DisbandTeamInput {
  team_id?: string;
  teamId?: string;
  reason?: string;
  justification?: string;
}

export interface DisbandTeamResult {
  ok: boolean;
  team_id?: string;
  freed_members?: string[];
  error?: string;
  code?: string;
}

/**
 * Admin-only Server Action: Disband a project team (Spec FR-02.7).
 * Sets status = 'disbanded', revokes supervisor contact grants, removes active invite code,
 * clears team members so students are free to join/form new teams, and notifies all former members.
 */
export async function disbandTeam(
  idTokenOrInput?: string | (DisbandTeamInput & { idToken?: string }),
  maybeInput?: DisbandTeamInput | string
): Promise<DisbandTeamResult> {
  try {
    const { idToken, rawInput } = extractTokenAndPayload(idTokenOrInput, maybeInput);
    const caller = await requireUser(idToken, ['admin']);

    const normalizedInput = {
      team_id: String(rawInput.team_id ?? rawInput.teamId ?? '').trim(),
      reason:
        typeof (rawInput.reason ?? rawInput.justification) === 'string' &&
        String(rawInput.reason ?? rawInput.justification).trim().length > 0
          ? String(rawInput.reason ?? rawInput.justification).trim()
          : undefined,
    };

    const parsed = disbandTeamSchema.safeParse(normalizedInput);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Invalid team disband input'
      );
    }

    const { team_id, reason } = parsed.data;
    const teamRef = adminDb.collection('teams').doc(team_id);
    const teamSnap = await teamRef.get();

    if (!teamSnap.exists) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', `Team ${team_id} not found`);
    }

    const team = teamSnap.data() as TeamDocument;
    const formerMemberIds = Array.isArray(team.member_ids) ? [...team.member_ids] : [];
    const groupNumber = team.group_number || team_id;
    const previousStatus = team.status;

    // 1. Revoke contact grants for all former members
    if (team.assigned_supervisor_id) {
      for (const memberUid of formerMemberIds) {
        const grantRef = adminDb
          .collection('supervisor_contacts')
          .doc(team.assigned_supervisor_id)
          .collection('grants')
          .doc(memberUid);
        await grantRef.delete().catch(() => {});
      }
    }
    await revokeContactGrants(team_id).catch(() => {});

    // 2. Clean up invite code documents
    const privateInviteRef = teamRef.collection('private').doc('invite');
    const privateInviteSnap = await privateInviteRef.get();
    if (privateInviteSnap.exists) {
      const inviteData = privateInviteSnap.data() as TeamInviteDocument;
      if (inviteData?.code) {
        await adminDb
          .collection('invite_codes')
          .doc(inviteData.code.toUpperCase().trim())
          .delete()
          .catch(() => {});
      }
      await privateInviteRef.delete().catch(() => {});
    }

    // 3. Delete member subcollection docs and update team document
    const membersSubSnap = await teamRef.collection('members').get();
    const batch = adminDb.batch();
    for (const mDoc of membersSubSnap.docs) {
      batch.delete(mDoc.ref);
    }

    batch.update(teamRef, {
      status: 'disbanded',
      member_ids: [],
      member_count: 0,
      updated_at: FieldValue.serverTimestamp(),
    });

    // 4. Release supervisor capacity if an accepted supervisor was assigned
    if (team.assigned_supervisor_id && team.academic_year_id) {
      const supDocId = `${team.assigned_supervisor_id}__${team.academic_year_id}`;
      const supRef = adminDb.collection('supervisions').doc(supDocId);
      const supSnap = await supRef.get();
      if (supSnap.exists) {
        const supData = supSnap.data() as SupervisionDocument;
        const nextAssigned = (supData.assigned_team_ids || []).filter(
          (id) => id !== team_id
        );
        const nextCount = nextAssigned.length;
        batch.update(supRef, {
          assigned_team_ids: nextAssigned,
          current_assigned_count: nextCount,
          status: nextCount >= (supData.max_capacity ?? 5) ? 'at_capacity' : 'available',
          updated_at: FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();

    // 5. Write audit log
    await writeAudit({
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: 'admin',
      },
      action: 'team.disbanded',
      target_type: 'team',
      target_id: team_id,
      description: `Disbanded team "${team.name}" (${groupNumber}) and freed ${formerMemberIds.length} member(s)`,
      metadata: {
        group_number: groupNumber,
        old: {
          status: previousStatus,
          member_ids: formerMemberIds,
          member_count: formerMemberIds.length,
        },
        new: {
          status: 'disbanded',
          member_ids: [],
          member_count: 0,
        },
        reason: reason || 'Administrative team disbandment',
      },
    });

    // 6. Notify all former members with team_update
    if (formerMemberIds.length > 0) {
      await notify(formerMemberIds, {
        type: 'team_update',
        title: 'Project Team Disbanded',
        body: `Your project team "${team.name}" (${groupNumber}) has been disbanded by an administrator. You are now free to join or form another team.`,
        target_url: '/my-team',
      }).catch(() => {});
    }

    return {
      ok: true,
      team_id,
      freed_members: formerMemberIds,
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

