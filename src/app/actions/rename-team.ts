'use server';

export const runtime = 'nodejs';

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { getUser } from '@/lib/models/user/repo';
import { renameTeamInputSchema, type RenameTeamInput } from '@/lib/models/team/schema';
import type { TeamDocument } from '@/types/firestore';

export interface RenameTeamResult {
  ok: boolean;
  error?: string;
  code?: string;
  status?: number;
}

/**
 * Server Action: Rename a project team (Spec F-05, FR-02.1).
 * Role: student (team leader ONLY).
 *
 * Guarantees:
 * - Only the team leader is permitted to rename the team (403 for any other member/role)
 * - Only updates the 'name' and 'updated_at' fields
 * - Emits audit log team.renamed
 */
export async function renameTeam(
  idToken: string,
  input: RenameTeamInput
): Promise<RenameTeamResult> {
  try {
    const caller = await requireUser(idToken, ['student']);
    const parsed = renameTeamInputSchema.parse(input);

    const userDoc = await getUser(caller.uid);
    const actor = {
      uid: caller.uid,
      name: userDoc?.name || caller.email,
      role: 'student' as const,
    };

    const teamRef = adminDb.collection('teams').doc(parsed.teamId);

    await adminDb.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) {
        throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
      }

      const team = teamSnap.data() as TeamDocument;

      if (team.leader_id !== caller.uid) {
        throw new HttpError(
          403,
          'FORBIDDEN_NOT_LEADER',
          'Only the designated team leader may rename the project team.'
        );
      }

      if (team.status === 'disbanded') {
        throw new HttpError(
          400,
          'TEAM_DISBANDED',
          'Cannot rename a disbanded project team.'
        );
      }

      const oldName = team.name;

      tx.update(teamRef, {
        name: parsed.name,
        updated_at: FieldValue.serverTimestamp(),
      });

      writeAuditInTx(tx, {
        actor,
        action: 'team.renamed',
        target_type: 'team',
        target_id: team.id,
        details: `Renamed team ${team.group_number} from "${oldName}" to "${parsed.name}"`,
        metadata: {
          group_number: team.group_number,
          old_name: oldName,
          new_name: parsed.name,
        },
      });
    });

    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}
