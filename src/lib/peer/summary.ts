import type { PeerEvaluationDocument } from '@/types/firestore';

export interface PeerStudentSummary {
  student_id: string;
  ratings_count: number;
  punctuality_mean: number;
  technical_contribution_mean: number;
  teamwork_mean: number;
  mean_score: number;
  is_free_rider: boolean;
}

export interface PeerSummary {
  team_mean: number;
  total_ratings: number;
  students: Record<string, PeerStudentSummary>;
  student_list: PeerStudentSummary[];
}

/**
 * Summarises peer evaluation ratings for a team.
 * Pure function: takes raw ratings, computes student means, team mean,
 * and flags potential free-riders (mean < 75% of team mean OR mean < 5.0).
 *
 * Confidentiality guarantee:
 * The returned summary NEVER includes rater IDs (`evaluator_id`) or raw rows.
 */
export function summarise(
  ratings: Array<
    Pick<
      PeerEvaluationDocument,
      | 'evaluatee_id'
      | 'punctuality_score'
      | 'technical_contribution_score'
      | 'teamwork_score'
      | 'average_score'
    >
  >,
  expectedStudentIds?: string[]
): PeerSummary {
  if (!ratings || ratings.length === 0) {
    const emptyStudents: Record<string, PeerStudentSummary> = {};
    if (expectedStudentIds) {
      for (const sid of expectedStudentIds) {
        emptyStudents[sid] = {
          student_id: sid,
          ratings_count: 0,
          punctuality_mean: 0,
          technical_contribution_mean: 0,
          teamwork_mean: 0,
          mean_score: 0,
          is_free_rider: false,
        };
      }
    }
    return {
      team_mean: 0,
      total_ratings: 0,
      students: emptyStudents,
      student_list: Object.values(emptyStudents),
    };
  }

  // Group ratings by evaluatee
  const byEvaluatee = new Map<
    string,
    Array<Pick<PeerEvaluationDocument, 'punctuality_score' | 'technical_contribution_score' | 'teamwork_score' | 'average_score'>>
  >();

  let totalScoreSum = 0;

  for (const r of ratings) {
    const list = byEvaluatee.get(r.evaluatee_id) || [];
    list.push(r);
    byEvaluatee.set(r.evaluatee_id, list);
    totalScoreSum += r.average_score;
  }

  const teamMean = Math.round((totalScoreSum / ratings.length) * 10) / 10;
  const freeRiderThreshold = 0.75 * teamMean;

  const allStudentIds = new Set<string>([
    ...(expectedStudentIds || []),
    ...byEvaluatee.keys(),
  ]);

  const students: Record<string, PeerStudentSummary> = {};
  const studentList: PeerStudentSummary[] = [];

  for (const studentId of allStudentIds) {
    const studentRatings = byEvaluatee.get(studentId) || [];
    const count = studentRatings.length;

    if (count === 0) {
      const summary: PeerStudentSummary = {
        student_id: studentId,
        ratings_count: 0,
        punctuality_mean: 0,
        technical_contribution_mean: 0,
        teamwork_mean: 0,
        mean_score: 0,
        is_free_rider: false,
      };
      students[studentId] = summary;
      studentList.push(summary);
      continue;
    }

    let pSum = 0;
    let tSum = 0;
    let wSum = 0;
    let avgSum = 0;

    for (const item of studentRatings) {
      pSum += item.punctuality_score;
      tSum += item.technical_contribution_score;
      wSum += item.teamwork_score;
      avgSum += item.average_score;
    }

    const punctualityMean = Math.round((pSum / count) * 10) / 10;
    const technicalMean = Math.round((tSum / count) * 10) / 10;
    const teamworkMean = Math.round((wSum / count) * 10) / 10;
    const meanScore = Math.round((avgSum / count) * 10) / 10;

    // Free-rider flag: when the mean is below 75% of the team mean OR below 5.0
    const isFreeRider = meanScore < freeRiderThreshold || meanScore < 5.0;

    const summary: PeerStudentSummary = {
      student_id: studentId,
      ratings_count: count,
      punctuality_mean: punctualityMean,
      technical_contribution_mean: technicalMean,
      teamwork_mean: teamworkMean,
      mean_score: meanScore,
      is_free_rider: isFreeRider,
    };

    students[studentId] = summary;
    studentList.push(summary);
  }

  return {
    team_mean: teamMean,
    total_ratings: ratings.length,
    students,
    student_list: studentList,
  };
}
