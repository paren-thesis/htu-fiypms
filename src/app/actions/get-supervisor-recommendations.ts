'use server';

// export const runtime = 'nodejs';

import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError, type ActionErrorResponse } from '@/lib/errors';
import { getTeam } from '@/lib/models/team/repo';
import { listTeamTopics, getTopic } from '@/lib/models/topic/repo';
import { listStaffWhitelist } from '@/lib/models/staff-whitelist/repo';
import { listSupervisionsByYear } from '@/lib/models/supervision';
import { getUser } from '@/lib/models/user/repo';
import { rankSupervisors, type RankedSupervisor, type SupervisorCandidate } from '@/lib/matching/rank';
import type { UserDocument } from '@/types/firestore';

export interface GetSupervisorRecommendationsResult {
  ok: boolean;
  teamTags?: string[];
  recommendations?: RankedSupervisor[];
  error?: string;
  code?: string;
  status?: number;
}

export interface GetSupervisorRecommendationsInput {
  idToken: string;
  teamId: string;
  topN?: number;
}

/**
 * Server Action: Get ranked supervisor recommendations for a team (Spec FR-04.1, FR-04.2, FR-04.2a, §4.1).
 * Role: coordinator or admin ONLY.
 *
 * Rules:
 * - team tags = union of tech_stack of the team's current topics (and approved topic if present)
 * - candidates from staff_whitelist + supervisions
 * - filters by team's programme course_id
 * - returns rankSupervisors output (top 3 by default)
 */
export async function getSupervisorRecommendations(
  idTokenOrInput: string | GetSupervisorRecommendationsInput,
  maybeTeamId?: string,
  maybeTopN?: number
): Promise<GetSupervisorRecommendationsResult> {
  try {
    const idToken = typeof idTokenOrInput === 'string' ? idTokenOrInput : idTokenOrInput.idToken;
    const teamId = typeof idTokenOrInput === 'string' ? maybeTeamId! : idTokenOrInput.teamId;
    const topN = typeof idTokenOrInput === 'string' ? maybeTopN ?? 3 : idTokenOrInput.topN ?? 3;

    if (!idToken || !teamId) {
      throw new HttpError(400, 'BAD_REQUEST', 'Missing required idToken or teamId parameter.');
    }

    // 1. Authorize coordinator or admin
    await requireUser(idToken, ['coordinator', 'admin']);

    // 2. Load team
    const team = await getTeam(teamId);
    if (!team) {
      throw new HttpError(404, 'TEAM_NOT_FOUND', 'Team not found.');
    }

    // 3. Collect team tags (union of tech_stack of current topics + approved topic)
    const currentTopics = await listTeamTopics(team.id, true);
    if (team.approved_topic_id && !currentTopics.some((t) => t.id === team.approved_topic_id)) {
      const approvedTopic = await getTopic(team.approved_topic_id);
      if (approvedTopic) {
        currentTopics.push(approvedTopic);
      }
    }

    const tagSet = new Set<string>();
    for (const topic of currentTopics) {
      if (Array.isArray(topic.tech_stack)) {
        for (const tag of topic.tech_stack) {
          const clean = tag.trim().toLowerCase();
          if (clean) tagSet.add(clean);
        }
      }
    }
    const teamTags = Array.from(tagSet);

    // 4. Load staff whitelist and supervisions for this academic year
    const staffList = await listStaffWhitelist();
    const supervisions = await listSupervisionsByYear(team.academic_year_id);
    const supervisionMap = new Map(supervisions.map((s) => [s.supervisor_id, s]));

    const activeSupervisors = staffList.filter(
      (s) => s.is_active && Array.isArray(s.roles) && s.roles.includes('supervisor')
    );

    const candidates: SupervisorCandidate[] = await Promise.all(
      activeSupervisors.map(async (staff) => {
        let uid = staff.user_uid;
        let userDoc: UserDocument | null = null;

        if (uid) {
          userDoc = await getUser(uid);
        } else {
          const userQuery = await adminDb
            .collection('users')
            .where('email', '==', staff.email.toLowerCase())
            .limit(1)
            .get();
          if (!userQuery.empty && userQuery.docs[0]) {
            uid = userQuery.docs[0].id;
            userDoc = userQuery.docs[0].data() as UserDocument;
          }
        }

        const supervision = uid ? supervisionMap.get(uid) : undefined;
        const currCount = supervision?.current_assigned_count ?? 0;
        const maxCap = supervision?.max_capacity ?? userDoc?.profile?.max_team_capacity ?? 5;
        const interests = userDoc?.profile?.research_interests ?? [];

        return {
          id: uid || staff.email,
          name: userDoc?.name || staff.full_name,
          full_name: userDoc?.name || staff.full_name,
          email: staff.email,
          is_active: staff.is_active,
          programmes: staff.programmes,
          roles: staff.roles,
          research_interests: interests,
          tags: interests,
          current_assigned_count: currCount,
          max_team_capacity: maxCap,
        };
      })
    );

    // 5. Rank supervisors using matching engine
    const recommendations = rankSupervisors({
      teamTags,
      courseId: team.course_id,
      candidates,
      topN,
    });

    return {
      ok: true,
      teamTags,
      recommendations,
    };
  } catch (error) {
    return toActionError(error) as ActionErrorResponse & GetSupervisorRecommendationsResult;
  }
}
