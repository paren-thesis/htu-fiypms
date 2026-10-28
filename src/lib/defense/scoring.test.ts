import { describe, it, expect } from 'vitest';
import {
  clampScores,
  computeTotal,
  normalise,
  compositeScore,
} from './scoring';
import { evaluationId, parseEvaluationId } from './eval-id';
import type { RubricDocument } from '@/types/firestore';

describe('Defense Scoring and Evaluation ID Logic', () => {
  const sampleRubric: Pick<
    RubricDocument,
    'max_score' | 'supervisor_weight_pct' | 'panel_weight_pct' | 'criteria'
  > = {
    max_score: 100,
    supervisor_weight_pct: 40,
    panel_weight_pct: 60,
    criteria: [
      { id: 'crit-pres', title: 'Presentation', max_points: 20, category: 'oral_defense' },
      { id: 'crit-tech', title: 'Technical Quality', max_points: 50, category: 'technical_architecture' },
      { id: 'crit-qa', title: 'Q&A Response', max_points: 30, category: 'oral_defense' },
    ],
  };

  describe('evaluationId', () => {
    it('creates deterministic ID formatted as ${teamId}__${evaluatorUid}__team', () => {
      const id = evaluationId('team-xyz', 'user-123');
      expect(id).toBe('team-xyz__user-123__team');
    });

    it('parses valid evaluation IDs and rejects malformed IDs', () => {
      expect(parseEvaluationId('team-1__eval-2__team')).toEqual({
        teamId: 'team-1',
        evaluatorUid: 'eval-2',
      });
      expect(parseEvaluationId('random-id')).toBeNull();
      expect(parseEvaluationId('team-1__eval-2__wrong')).toBeNull();
      expect(parseEvaluationId('')).toBeNull();
    });
  });

  describe('clampScores', () => {
    it('clamps scores between 0 and max_points for each criterion', () => {
      const input = {
        'crit-pres': 25, // max 20 -> 20
        'crit-tech': -10, // min 0 -> 0
        'crit-qa': 15, // within 0..30 -> 15
      };

      const clamped = clampScores(sampleRubric, input);
      expect(clamped).toEqual({
        'crit-pres': 20,
        'crit-tech': 0,
        'crit-qa': 15,
      });
    });

    it('ignores unknown criterion keys', () => {
      const input = {
        'crit-pres': 10,
        'unknown-key': 999,
        'bogus-field': -5,
      };

      const clamped = clampScores(sampleRubric, input);
      expect(clamped).toEqual({
        'crit-pres': 10,
      });
      expect(clamped).not.toHaveProperty('unknown-key');
      expect(clamped).not.toHaveProperty('bogus-field');
    });

    it('handles non-numeric or NaN scores by falling back to 0', () => {
      const input = {
        'crit-pres': NaN,
        'crit-tech': undefined as unknown as number,
      };

      const clamped = clampScores(sampleRubric, input);
      expect(clamped['crit-pres']).toBe(0);
      expect(clamped['crit-tech']).toBe(0);
    });

    it('is strictly idempotent', () => {
      const input = {
        'crit-pres': 50,
        'crit-tech': -20,
        'crit-qa': 22,
        'outsider-key': 100,
      };

      const once = clampScores(sampleRubric, input);
      const twice = clampScores(sampleRubric, once);
      const thrice = clampScores(sampleRubric, twice);

      expect(twice).toEqual(once);
      expect(thrice).toEqual(once);
    });
  });

  describe('computeTotal', () => {
    it('computes sum of clamped valid criteria', () => {
      const input = {
        'crit-pres': 18,
        'crit-tech': 42,
        'crit-qa': 25,
      };

      expect(computeTotal(sampleRubric, input)).toBe(85);
    });

    it('ignores unknown criterion keys and excessive values', () => {
      const input = {
        'crit-pres': 999, // clamped to 20
        'crit-tech': 50, // clamped to 50
        'crit-qa': -10, // clamped to 0
        'fake-criterion': 1000, // ignored
      };

      // 20 + 50 + 0 = 70
      expect(computeTotal(sampleRubric, input)).toBe(70);
    });

    it('returns 0 for empty or invalid scores object', () => {
      expect(computeTotal(sampleRubric, {})).toBe(0);
      expect(computeTotal(sampleRubric, null as unknown as Record<string, number>)).toBe(0);
    });
  });

  describe('normalise', () => {
    it('normalises total score to 0..100 based on max_score', () => {
      expect(normalise(80, 100)).toBe(80);
      expect(normalise(40, 50)).toBe(80);
      expect(normalise(150, 200)).toBe(75);
    });

    it('handles edge cases: zero max_score, negative total, and overflow', () => {
      expect(normalise(50, 0)).toBe(0);
      expect(normalise(50, -10)).toBe(0);
      expect(normalise(-10, 100)).toBe(0);
      expect(normalise(120, 100)).toBe(100);
    });
  });

  describe('compositeScore', () => {
    it('returns incomplete when supervisor evaluation is missing', () => {
      const res = compositeScore(sampleRubric, null, [
        { scores: { 'crit-pres': 20, 'crit-tech': 50, 'crit-qa': 30 } },
      ]);

      expect(res.is_complete).toBe(false);
      expect(res.incomplete).toBe(true);
      expect(res.composite_final_score).toBeNull();
      expect(res.supervisor_score).toBeNull();
      expect(res.panel_average_score).toBeNull();
    });

    it('returns incomplete when all panel evaluations are missing', () => {
      const res = compositeScore(
        sampleRubric,
        { scores: { 'crit-pres': 20, 'crit-tech': 50, 'crit-qa': 30 } },
        []
      );

      expect(res.is_complete).toBe(false);
      expect(res.incomplete).toBe(true);
      expect(res.composite_final_score).toBeNull();
      expect(res.supervisor_score).toBeNull();
      expect(res.panel_average_score).toBeNull();
    });

    it('calculates weighted composite score with 1 supervisor and 3 panelists', () => {
      // Supervisor: 20 + 40 + 20 = 80 / 100 -> 80%
      const supervisorEval = {
        scores: { 'crit-pres': 20, 'crit-tech': 40, 'crit-qa': 20 },
        total_score: 999, // tampered total_score should be ignored
      };

      // Panel 1: 15 + 45 + 20 = 80 / 100 -> 80%
      // Panel 2: 20 + 30 + 20 = 70 / 100 -> 70%
      // Panel 3: 20 + 45 + 25 = 90 / 100 -> 90%
      // Panel average = (80 + 70 + 90) / 3 = 80%
      const panelEvals = [
        { scores: { 'crit-pres': 15, 'crit-tech': 45, 'crit-qa': 20 } },
        { scores: { 'crit-pres': 20, 'crit-tech': 30, 'crit-qa': 20 } },
        { scores: { 'crit-pres': 20, 'crit-tech': 45, 'crit-qa': 25 } },
      ];

      const res = compositeScore(sampleRubric, supervisorEval, panelEvals);

      expect(res.is_complete).toBe(true);
      expect(res.incomplete).toBe(false);
      expect(res.supervisor_score).toBe(80);
      expect(res.panel_average_score).toBe(80);
      // 80 * 0.40 + 80 * 0.60 = 32 + 48 = 80
      expect(res.composite_final_score).toBe(80);
    });

    it('handles different max_score and weights correctly', () => {
      const rubric50: Pick<
        RubricDocument,
        'max_score' | 'supervisor_weight_pct' | 'panel_weight_pct' | 'criteria'
      > = {
        max_score: 50,
        supervisor_weight_pct: 50,
        panel_weight_pct: 50,
        criteria: [
          { id: 'c1', title: 'C1', max_points: 25, category: 'technical_architecture' },
          { id: 'c2', title: 'C2', max_points: 25, category: 'oral_defense' },
        ],
      };

      // Supervisor: 25 + 0 = 25 -> 25 / 50 * 100 = 50%
      const sup = { scores: { c1: 25, c2: 0 } };
      // Panel 1: 25 + 25 = 50 -> 100%
      // Panel 2: 25 + 12.5 = 37.5 -> 75%
      // Panel average = (100 + 75) / 2 = 87.5%
      const panel = [
        { scores: { c1: 25, c2: 25 } },
        { scores: { c1: 25, c2: 12.5 } },
      ];

      const res = compositeScore(rubric50, sup, panel);

      expect(res.is_complete).toBe(true);
      expect(res.supervisor_score).toBe(50);
      expect(res.panel_average_score).toBe(87.5);
      // 50 * 0.5 + 87.5 * 0.5 = 25 + 43.75 = 68.75
      expect(res.composite_final_score).toBe(68.75);
    });

    it('rounds scores to 2 decimal places properly', () => {
      // Tests rounding for non-terminating decimals (e.g. 1/3, 2/3)
      const sup = { scores: { 'crit-pres': 20, 'crit-tech': 45, 'crit-qa': 18 } }; // 83 / 100 = 83%
      const panel = [
        { scores: { 'crit-pres': 18, 'crit-tech': 42, 'crit-qa': 21 } }, // 81 / 100 = 81%
        { scores: { 'crit-pres': 19, 'crit-tech': 43, 'crit-qa': 22 } }, // 84 / 100 = 84%
        { scores: { 'crit-pres': 20, 'crit-tech': 45, 'crit-qa': 20 } }, // 85 / 100 = 85%
      ];
      // Panel average = (81 + 84 + 85) / 3 = 250 / 3 = 83.333333... -> 83.33
      // Composite = 83 * 0.4 + 83.333333... * 0.6 = 33.2 + 50 = 83.20

      const res = compositeScore(sampleRubric, sup, panel);
      expect(res.panel_average_score).toBe(83.33);
      expect(res.composite_final_score).toBe(83.2);
    });

    it('is strictly idempotent', () => {
      const sup = { scores: { 'crit-pres': 20, 'crit-tech': 40, 'crit-qa': 20 } };
      const panel = [{ scores: { 'crit-pres': 15, 'crit-tech': 45, 'crit-qa': 20 } }];

      const res1 = compositeScore(sampleRubric, sup, panel);
      const res2 = compositeScore(sampleRubric, sup, panel);
      expect(res1).toEqual(res2);
    });
  });
});
