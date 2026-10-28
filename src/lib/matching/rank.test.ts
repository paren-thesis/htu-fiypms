import { describe, it, expect } from 'vitest';
import { rankSupervisors, type SupervisorCandidate } from './rank';

describe('Supervisor Matching Engine: rankSupervisors (FR-04.1, FR-04.2, FR-04.2a, §4.1)', () => {
  const sampleCandidates: SupervisorCandidate[] = [
    {
      id: 'sup-1',
      name: 'Prof. Kwame Appiah',
      is_active: true,
      programmes: ['btech-cs', 'hnd-cs'],
      roles: ['supervisor'],
      research_interests: ['Cloud Computing', 'eBPF', 'Kubernetes'],
      current_assigned_count: 2,
      max_team_capacity: 5,
    },
    {
      id: 'sup-2',
      name: 'Dr. Ama Owusu',
      is_active: true,
      programmes: ['btech-ict', 'hnd-ict'], // Mismatched for btech-cs
      roles: ['supervisor'],
      research_interests: ['Cloud Computing', 'Kubernetes', 'Microservices'],
      current_assigned_count: 1,
      max_team_capacity: 5,
    },
    {
      id: 'sup-3',
      name: 'Dr. Yaw Boateng',
      is_active: true,
      programmes: ['btech-cs', 'btech-ict'],
      roles: ['supervisor'],
      research_interests: ['Machine Learning', 'Data Science', 'Python'],
      current_assigned_count: 0,
      max_team_capacity: 5,
    },
    {
      id: 'sup-4',
      name: 'Dr. Efua Mensah',
      is_active: true,
      programmes: ['btech-cs'],
      roles: ['supervisor'],
      research_interests: ['Distributed Systems', 'Cloud Computing', 'Docker'],
      current_assigned_count: 5,
      max_team_capacity: 5, // At capacity
    },
    {
      id: 'sup-5',
      name: 'Inactive Lecturer',
      is_active: false,
      programmes: ['btech-cs'],
      roles: ['supervisor'],
      research_interests: ['Cloud Computing'],
      current_assigned_count: 0,
      max_team_capacity: 5,
    },
  ];

  it('filters candidates strictly to active supervisors in the specified programme (FR-04.2a, F-04)', () => {
    const results = rankSupervisors({
      teamTags: ['Cloud Computing', 'Kubernetes'],
      courseId: 'btech-cs',
      candidates: sampleCandidates,
    });

    // sup-2 (btech-ict only) and sup-5 (inactive) must be excluded
    const candidateIds = results.map((r) => r.candidate.id);
    expect(candidateIds).not.toContain('sup-2');
    expect(candidateIds).not.toContain('sup-5');
    expect(candidateIds).toContain('sup-1');
  });

  it('handles case-insensitive and trimmed courseId matching', () => {
    const results = rankSupervisors({
      teamTags: ['cloud computing'],
      courseId: '  BTECH-CS  ',
      candidates: sampleCandidates,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.candidate.programmes.includes('btech-cs'))).toBe(true);
  });

  it('returns at most the top 3 supervisors by default with complete score breakdown', () => {
    const results = rankSupervisors({
      teamTags: ['Cloud Computing', 'Kubernetes'],
      courseId: 'btech-cs',
      candidates: sampleCandidates,
    });

    expect(results.length).toBeLessThanOrEqual(3);

    for (const r of results) {
      expect(r.breakdown).toBeDefined();
      expect(typeof r.breakdown.overlap).toBe('number');
      expect(typeof r.breakdown.capacity).toBe('number');
      expect(typeof r.breakdown.score).toBe('number');
      expect(typeof r.breakdown.atCapacity).toBe('boolean');

      // Verify bounds
      expect(r.breakdown.overlap).toBeGreaterThanOrEqual(0);
      expect(r.breakdown.overlap).toBeLessThanOrEqual(1);
      expect(r.breakdown.capacity).toBeGreaterThanOrEqual(0);
      expect(r.breakdown.capacity).toBeLessThanOrEqual(1);
      expect(r.breakdown.score).toBeGreaterThanOrEqual(0);
      expect(r.breakdown.score).toBeLessThanOrEqual(1);
    }
  });

  it('marks atCapacity true when current_assigned_count >= max_team_capacity', () => {
    const results = rankSupervisors({
      teamTags: ['Distributed Systems'],
      courseId: 'btech-cs',
      candidates: sampleCandidates,
    });

    const sup4 = results.find((r) => r.candidate.id === 'sup-4');
    expect(sup4).toBeDefined();
    expect(sup4?.breakdown.atCapacity).toBe(true);
    expect(sup4?.breakdown.capacity).toBe(0.0);
  });

  describe('Deterministic Tie-Breaking', () => {
    it('tie-break 1: prefers candidate with lower workload when match score is tied', () => {
      const tiedCandidates: SupervisorCandidate[] = [
        {
          id: 'sup-heavy',
          name: 'Supervisor Heavy',
          is_active: true,
          programmes: ['btech-cs'],
          research_interests: ['Security'],
          current_assigned_count: 3,
          max_team_capacity: 5,
        },
        {
          id: 'sup-light',
          name: 'Supervisor Light',
          is_active: true,
          programmes: ['btech-cs'],
          research_interests: ['Security'],
          current_assigned_count: 1, // Lower workload
          max_team_capacity: 5,
        },
      ];

      // Both have identical overlap with ['Security'] (1.0)
      // sup-light has capacity 1 - 1/5 = 0.8 -> score = 0.7*1 + 0.3*0.8 = 0.94
      // sup-heavy has capacity 1 - 3/5 = 0.4 -> score = 0.7*1 + 0.3*0.4 = 0.82
      const res = rankSupervisors({
        teamTags: ['Security'],
        courseId: 'btech-cs',
        candidates: tiedCandidates,
      });

      expect(res[0]!.candidate.id).toBe('sup-light');
      expect(res[1]!.candidate.id).toBe('sup-heavy');
    });

    it('tie-break 1 & 2: when scores are identical, lower count wins; if counts tied, alphabetical by name wins', () => {
      const candidates: SupervisorCandidate[] = [
        {
          id: 'sup-z',
          name: 'Zoe Mensah',
          is_active: true,
          programmes: ['btech-cs'],
          research_interests: ['AI'],
          current_assigned_count: 2,
          max_team_capacity: 5,
        },
        {
          id: 'sup-a',
          name: 'Albert Mensah',
          is_active: true,
          programmes: ['btech-cs'],
          research_interests: ['AI'],
          current_assigned_count: 2,
          max_team_capacity: 5,
        },
      ];

      // Exact same tags, count, and max -> exact same score (0.88)
      // Albert should rank before Zoe alphabetically
      const res = rankSupervisors({
        teamTags: ['AI'],
        courseId: 'btech-cs',
        candidates,
      });

      expect(res[0]!.candidate.name).toBe('Albert Mensah');
      expect(res[1]!.candidate.name).toBe('Zoe Mensah');
    });
  });

  describe('Edge cases', () => {
    it('returns empty array when candidate list is empty or no candidates match programme', () => {
      expect(
        rankSupervisors({
          teamTags: ['AI'],
          courseId: 'btech-cs',
          candidates: [],
        })
      ).toEqual([]);

      expect(
        rankSupervisors({
          teamTags: ['AI'],
          courseId: 'unsupported-course',
          candidates: sampleCandidates,
        })
      ).toEqual([]);
    });

    it('handles candidates with max_team_capacity = 0 without error or NaN', () => {
      const zeroCapCandidate: SupervisorCandidate[] = [
        {
          id: 'sup-zero',
          name: 'Zero Cap Supervisor',
          is_active: true,
          programmes: ['btech-cs'],
          research_interests: ['AI'],
          current_assigned_count: 0,
          max_team_capacity: 0,
        },
      ];

      const res = rankSupervisors({
        teamTags: ['AI'],
        courseId: 'btech-cs',
        candidates: zeroCapCandidate,
      });

      expect(res.length).toBe(1);
      expect(Number.isNaN(res[0]!.breakdown.score)).toBe(false);
      expect(res[0]!.breakdown.atCapacity).toBe(true); // 0 >= 0
    });
  });
});
