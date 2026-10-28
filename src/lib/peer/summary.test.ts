import { describe, it, expect } from 'vitest';
import { summarise } from './summary';

describe('Peer summary calculation (pure)', () => {
  it('returns zeroes and empty lists when ratings are empty', () => {
    const result = summarise([]);
    expect(result.team_mean).toBe(0);
    expect(result.total_ratings).toBe(0);
    expect(result.student_list).toEqual([]);
    expect(result.students).toEqual({});
  });

  it('populates expected student IDs with zeroes when ratings are empty', () => {
    const result = summarise([], ['student-1', 'student-2']);
    expect(result.team_mean).toBe(0);
    expect(result.total_ratings).toBe(0);
    expect(result.students['student-1']).toBeDefined();
    expect(result.students['student-1']!.ratings_count).toBe(0);
    expect(result.students['student-1']!.is_free_rider).toBe(false);
  });

  it('computes correct student means and team mean from ratings', () => {
    const ratings = [
      {
        evaluatee_id: 'alice',
        punctuality_score: 8,
        technical_contribution_score: 9,
        teamwork_score: 7,
        average_score: 8.0,
      },
      {
        evaluatee_id: 'alice',
        punctuality_score: 10,
        technical_contribution_score: 8,
        teamwork_score: 9,
        average_score: 9.0,
      },
      {
        evaluatee_id: 'bob',
        punctuality_score: 7,
        technical_contribution_score: 8,
        teamwork_score: 9,
        average_score: 8.0,
      },
    ];

    const result = summarise(ratings);
    expect(result.total_ratings).toBe(3);
    // Team mean: (8.0 + 9.0 + 8.0) / 3 = 8.333 -> 8.3
    expect(result.team_mean).toBe(8.3);

    const alice = result.students['alice']!;
    expect(alice.ratings_count).toBe(2);
    expect(alice.punctuality_mean).toBe(9.0); // (8 + 10) / 2
    expect(alice.technical_contribution_mean).toBe(8.5); // (9 + 8) / 2
    expect(alice.teamwork_mean).toBe(8.0); // (7 + 9) / 2
    expect(alice.mean_score).toBe(8.5); // (8.0 + 9.0) / 2
    expect(alice.is_free_rider).toBe(false);

    const bob = result.students['bob']!;
    expect(bob.ratings_count).toBe(1);
    expect(bob.mean_score).toBe(8.0);
    expect(bob.is_free_rider).toBe(false);
  });

  it('flags free-rider when mean is below 5.0', () => {
    const ratings = [
      {
        evaluatee_id: 'charlie',
        punctuality_score: 4,
        technical_contribution_score: 3,
        teamwork_score: 4,
        average_score: 3.7,
      },
      {
        evaluatee_id: 'dave',
        punctuality_score: 5,
        technical_contribution_score: 6,
        teamwork_score: 5,
        average_score: 5.3,
      },
    ];

    const result = summarise(ratings);
    const charlie = result.students['charlie']!;
    expect(charlie.mean_score).toBe(3.7);
    expect(charlie.is_free_rider).toBe(true);

    const dave = result.students['dave']!;
    expect(dave.mean_score).toBe(5.3);
    // Team mean: (3.7 + 5.3) / 2 = 4.5. 75% of 4.5 is 3.375.
    // Dave has 5.3, which is >= 5.0 and >= 3.375, so false.
    expect(dave.is_free_rider).toBe(false);
  });

  it('flags free-rider when mean is below 75% of team mean, even if >= 5.0', () => {
    // Team mean around 9.0. 75% of 9.0 = 6.75.
    // Student with 6.0 is above 5.0, but below 6.75!
    const ratings = [
      {
        evaluatee_id: 'alice',
        punctuality_score: 10,
        technical_contribution_score: 10,
        teamwork_score: 10,
        average_score: 10.0,
      },
      {
        evaluatee_id: 'bob',
        punctuality_score: 10,
        technical_contribution_score: 10,
        teamwork_score: 10,
        average_score: 10.0,
      },
      {
        evaluatee_id: 'charlie',
        punctuality_score: 6,
        technical_contribution_score: 6,
        teamwork_score: 6,
        average_score: 6.0,
      },
    ];

    const result = summarise(ratings);
    // Team mean: (10 + 10 + 6) / 3 = 8.667 -> 8.7.
    // 0.75 * 8.7 = 6.525.
    // Charlie has 6.0 < 6.525 -> free rider!
    const charlie = result.students['charlie']!;
    expect(charlie.is_free_rider).toBe(true);
  });

  it('never outputs rater IDs (evaluator_id)', () => {
    const rawRatingsWithRater = [
      {
        evaluator_id: 'secret-rater-1',
        evaluatee_id: 'alice',
        punctuality_score: 9,
        technical_contribution_score: 9,
        teamwork_score: 9,
        average_score: 9.0,
      },
    ];

    const result = summarise(rawRatingsWithRater);
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).not.toContain('secret-rater-1');
    expect(jsonStr).not.toContain('evaluator_id');
  });
});
