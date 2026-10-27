import { tagOverlap, capacityScore, matchScore } from './jaccard';

export interface SupervisorCandidate {
  id: string;
  name?: string;
  full_name?: string;
  email?: string;
  is_active: boolean;
  programmes: string[];
  roles?: string[];
  research_interests?: string[];
  tags?: string[];
  current_assigned_count?: number;
  max_team_capacity?: number;
}

export interface SupervisorMatchBreakdown {
  overlap: number;
  capacity: number;
  score: number;
  atCapacity: boolean;
}

export interface RankedSupervisor {
  candidate: SupervisorCandidate;
  breakdown: SupervisorMatchBreakdown;
}

export interface RankSupervisorsParams {
  teamTags: string[];
  courseId: string;
  candidates: SupervisorCandidate[];
  topN?: number; // defaults to 3
}

/**
 * Filters candidates to active supervisors eligible for the team's academic programme,
 * computes composite match scores, applies deterministic tie-breaking,
 * and returns top N recommended supervisors with score breakdowns (Spec FR-04.1, FR-04.2, FR-04.2a, §4.1).
 *
 * Deterministic Sorting:
 * 1. Score descending
 * 2. Tie-break: lower current_assigned_count
 * 3. Tie-break: alphabetical by name
 */
export function rankSupervisors({
  teamTags,
  courseId,
  candidates,
  topN = 3,
}: RankSupervisorsParams): RankedSupervisor[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const normalizedCourse = (courseId || '').trim().toLowerCase();

  // 1. Programme-Scoped Candidate Filter (Spec FR-04.2a)
  const eligibleCandidates = candidates.filter((candidate) => {
    if (!candidate.is_active) {
      return false;
    }

    if (Array.isArray(candidate.roles) && !candidate.roles.includes('supervisor')) {
      return false;
    }

    if (!Array.isArray(candidate.programmes)) {
      return false;
    }

    const hasProgramme = candidate.programmes.some(
      (prog) => typeof prog === 'string' && prog.trim().toLowerCase() === normalizedCourse
    );

    return hasProgramme;
  });

  // 2. Score calculation
  const scoredList: RankedSupervisor[] = eligibleCandidates.map((candidate) => {
    const supTags = candidate.research_interests ?? candidate.tags ?? [];
    const curr = candidate.current_assigned_count ?? 0;
    const max = candidate.max_team_capacity ?? 5;

    const overlap = tagOverlap(teamTags, supTags);
    const capacity = capacityScore(curr, max);
    const score = matchScore(teamTags, supTags, curr, max);
    const atCapacity = curr >= max;

    return {
      candidate,
      breakdown: {
        overlap,
        capacity,
        score,
        atCapacity,
      },
    };
  });

  // 3. Deterministic Sort: score desc -> curr asc -> name asc
  scoredList.sort((a, b) => {
    const diffScore = b.breakdown.score - a.breakdown.score;
    if (Math.abs(diffScore) > 1e-9) {
      return diffScore;
    }

    const currA = a.candidate.current_assigned_count ?? 0;
    const currB = b.candidate.current_assigned_count ?? 0;
    if (currA !== currB) {
      return currA - currB;
    }

    const nameA = (a.candidate.name || a.candidate.full_name || a.candidate.id || '').toLowerCase();
    const nameB = (b.candidate.name || b.candidate.full_name || b.candidate.id || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // 4. Return top recommendations
  return scoredList.slice(0, Math.max(0, topN));
}
