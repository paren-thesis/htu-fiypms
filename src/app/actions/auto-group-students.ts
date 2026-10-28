'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { getCurrentAcademicYear, getAcademicYear } from '@/lib/models/academic-year/repo';
import { listTeams } from '@/lib/models/team/repo';
import { listRosterStudents } from '@/lib/models/roster/repo';
import { createTeamInTx } from '@/lib/teams/create-team-tx';
import {
  autoGroup,
  type AutoGroupStudent,
  type GeneratedGroup,
} from '@/lib/teams/auto-group';
import { Timestamp } from 'firebase-admin/firestore';

const autoGroupInputSchema = z
  .object({
    mode: z.enum(['preview', 'commit']),
    yearId: z.string().optional(),
    allowCrossCategory: z.boolean().optional(),
  })
  .strict();

export type AutoGroupInput = z.infer<typeof autoGroupInputSchema>;

export interface AutoGroupActionResult {
  ok: boolean;
  mode: 'preview' | 'commit';
  academicYearId: string;
  groups: GeneratedGroup[];
  leftovers: AutoGroupStudent[];
  groupsByCourse: Record<string, GeneratedGroup[]>;
  leftoversByCourse: Record<string, AutoGroupStudent[]>;
  summary: {
    totalStudents: number;
    totalAssigned: number;
    totalLeftovers: number;
    totalGroups: number;
  };
  notYetSignedInCount: number;
  notYetSignedIn: {
    index_number: string;
    full_name: string;
    course_id: string;
    contact?: string;
  }[];
  isDeadlinePassed: boolean;
  createdTeams?: {
    teamId: string;
    groupNumber: string;
    courseId: string;
    name: string;
  }[];
  error?: string;
  code?: string;
  status?: number;
}

/**
 * Server Action: Auto-group unassigned students into project teams (FR-02.6, FR-01.10).
 * Roles allowed: coordinator, admin.
 *
 * Rules:
 * - Cross-category merging is strictly disallowed in v1.
 * - Button & commit blocked before formation deadline unless caller is admin.
 * - Commit is idempotent: subsequent runs find an empty pool.
 * - Leftovers are reported, never force-assigned into invalid group sizes.
 */
export async function autoGroupStudents(
  idToken: string,
  input: AutoGroupInput
): Promise<AutoGroupActionResult> {
  try {
    const caller = await requireUser(idToken, ['coordinator', 'admin']);
    const parsed = autoGroupInputSchema.parse(input);

    // Cross-category merging rejected per specification
    if (parsed.allowCrossCategory === true) {
      throw new HttpError(
        400,
        'CROSS_CATEGORY_NOT_ALLOWED',
        'Cross-category merging is not implemented in v1. Teams must cluster strictly by course track.'
      );
    }

    const currentYear = parsed.yearId
      ? await getAcademicYear(parsed.yearId)
      : await getCurrentAcademicYear();

    if (!currentYear) {
      throw new HttpError(
        400,
        'NO_ACTIVE_ACADEMIC_YEAR',
        'No active academic year found for student auto-grouping.'
      );
    }

    // 1. Check Formation Deadline (FR-02.6)
    // If deadline is present and has not passed, only admins can commit
    const formationDeadline = currentYear.deadlines?.team_formation_deadline;
    let isDeadlinePassed = true;

    if (formationDeadline) {
      const deadlineMillis =
        formationDeadline instanceof Timestamp
          ? formationDeadline.toMillis()
          : new Date(formationDeadline as unknown as string).getTime();

      isDeadlinePassed = Date.now() >= deadlineMillis;
    }

    if (parsed.mode === 'commit' && !isDeadlinePassed && caller.activeRole !== 'admin') {
      throw new HttpError(
        403,
        'DEADLINE_NOT_PASSED',
        'Student auto-grouping cannot be committed before the team formation deadline has passed. Only Administrators may override this constraint.'
      );
    }

    // 2. Fetch existing active teams to exclude assigned students
    const existingTeams = await listTeams(currentYear.id);
    const assignedStudentUids = new Set<string>();

    for (const team of existingTeams) {
      if (team.status !== 'disbanded') {
        for (const uid of team.member_ids) {
          assignedStudentUids.add(uid);
        }
      }
    }

    // 3. Fetch cohort roster students
    const rosterStudents = await listRosterStudents(currentYear.id);
    const notYetSignedIn = rosterStudents.filter((r) => !r.user_uid);
    const linkedRosterStudents = rosterStudents.filter((r) => Boolean(r.user_uid));

    // 4. Assemble the unassigned pool
    const pooledStudents: AutoGroupStudent[] = [];

    for (const r of linkedRosterStudents) {
      if (!assignedStudentUids.has(r.user_uid!)) {
        pooledStudents.push({
          uid: r.user_uid!,
          index_number: r.index_number,
          full_name: r.full_name,
          course_id: r.course_id.toLowerCase().trim(),
        });
      }
    }

    // 5. Execute pure clustering algorithm
    const autoGroupResult = autoGroup(pooledStudents, { min: 4, max: 5 });

    // In preview mode: return clustering summary immediately without database mutations
    if (parsed.mode === 'preview') {
      return {
        ok: true,
        mode: 'preview',
        academicYearId: currentYear.id,
        groups: autoGroupResult.groups,
        leftovers: autoGroupResult.leftovers,
        groupsByCourse: autoGroupResult.groupsByCourse,
        leftoversByCourse: autoGroupResult.leftoversByCourse,
        summary: autoGroupResult.summary,
        notYetSignedInCount: notYetSignedIn.length,
        notYetSignedIn: notYetSignedIn.map((s) => ({
          index_number: s.index_number,
          full_name: s.full_name,
          course_id: s.course_id,
          contact: s.contact,
        })),
        isDeadlinePassed,
      };
    }

    // 6. In commit mode: execute transactional team creation for each candidate group
    const createdTeams: {
      teamId: string;
      groupNumber: string;
      courseId: string;
      name: string;
    }[] = [];

    const actor = {
      uid: caller.uid,
      name: caller.email,
      role: caller.activeRole as 'coordinator' | 'admin',
    };

    for (const candidate of autoGroupResult.groups) {
      const txResult = await adminDb.runTransaction(async (tx) => {
        const res = await createTeamInTx(tx, {
          leaderUid: candidate.leader_uid,
          memberUids: candidate.member_uids,
          courseId: candidate.course_id,
          yearId: currentYear.id,
          name: candidate.name,
        });

        // Write audit log
        writeAuditInTx(tx, {
          actor,
          action: 'team.auto_grouped',
          target_type: 'team',
          target_id: res.teamId,
          details: `Auto-grouped team "${candidate.name}" (${res.groupNumber}) with ${candidate.member_uids.length} members`,
          metadata: {
            course_id: candidate.course_id,
            group_number: res.groupNumber,
            academic_year_id: currentYear.id,
            member_count: candidate.member_uids.length,
          },
        });

        return res;
      });

      createdTeams.push({
        teamId: txResult.teamId,
        groupNumber: txResult.groupNumber,
        courseId: candidate.course_id,
        name: candidate.name,
      });

      // Notify members of group allocation (fire-and-forget safe)
      await notify(candidate.member_uids, {
        type: 'team_update',
        title: 'Assigned to Project Team',
        body: `You have been allocated to ${txResult.groupNumber} (${candidate.name}) via cohort auto-grouping.`,
        target_url: '/my-team',
      }).catch((err) => {
        console.error('Failed to notify auto-grouped members:', err);
      });
    }

    return {
      ok: true,
      mode: 'commit',
      academicYearId: currentYear.id,
      groups: autoGroupResult.groups,
      leftovers: autoGroupResult.leftovers,
      groupsByCourse: autoGroupResult.groupsByCourse,
      leftoversByCourse: autoGroupResult.leftoversByCourse,
      summary: autoGroupResult.summary,
      notYetSignedInCount: notYetSignedIn.length,
      notYetSignedIn: notYetSignedIn.map((s) => ({
        index_number: s.index_number,
        full_name: s.full_name,
        course_id: s.course_id,
        contact: s.contact,
      })),
      isDeadlinePassed,
      createdTeams,
    };
  } catch (error) {
    return toActionError(error) as unknown as AutoGroupActionResult;
  }
}
