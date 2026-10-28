import type { RubricCriterion, RubricDocument } from '@/types/firestore';

export interface ScoreInput {
  scores: Record<string, number>;
  total_score?: number;
}

export interface CompositeScoreResult {
  is_complete: boolean;
  incomplete: boolean;
  isComplete: boolean;
  composite_final_score: number | null;
  compositeFinalScore: number | null;
  supervisor_score: number | null;
  supervisorScore: number | null;
  panel_average_score: number | null;
  panelAverageScore: number | null;
}

/**
 * Clamps criterion scores against the rubric definitions.
 * - Score is constrained between 0 and criterion.max_points.
 * - Unknown criterion keys are ignored.
 * - Missing criterion keys are omitted.
 * - Non-number or NaN values are normalized to 0.
 * Idempotent: clampScores(rubric, clampScores(rubric, scores)) === clampScores(rubric, scores).
 */
export function clampScores(
  rubric: { criteria: Array<Pick<RubricCriterion, 'id' | 'max_points'>> },
  scores: Record<string, number>
): Record<string, number> {
  const clamped: Record<string, number> = {};
  if (!scores || typeof scores !== 'object') return clamped;

  for (const criterion of rubric.criteria) {
    if (Object.prototype.hasOwnProperty.call(scores, criterion.id)) {
      const raw = scores[criterion.id];
      const num = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0;
      clamped[criterion.id] = Math.min(criterion.max_points, Math.max(0, num));
    }
  }

  return clamped;
}

/**
 * Computes the total sum of clamped scores for all rubric criteria.
 * Ignores unknown criterion keys and clamps scores outside [0, max_points].
 */
export function computeTotal(
  rubric: { criteria: Array<Pick<RubricCriterion, 'id' | 'max_points'>> },
  scores: Record<string, number>
): number {
  const clamped = clampScores(rubric, scores);
  return Object.values(clamped).reduce((sum, val) => sum + val, 0);
}

/**
 * Normalises a raw total score to a 0..100 scale based on the rubric's max score.
 */
export function normalise(total: number, maxScore: number): number {
  if (maxScore <= 0 || !Number.isFinite(maxScore)) return 0;
  const num = typeof total === 'number' && !Number.isNaN(total) ? total : 0;
  const pct = (num / maxScore) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Calculates the composite final defense score.
 * Formula: supervisorNorm * (supervisor_weight_pct / 100) + panelAvgNorm * (panel_weight_pct / 100)
 *
 * All scores are normalized to 0..100 and rounded to 2 decimal places.
 * Returns incomplete when the supervisor or all panel evaluations are missing.
 */
export function compositeScore(
  rubric: Pick<RubricDocument, 'max_score' | 'supervisor_weight_pct' | 'panel_weight_pct' | 'criteria'>,
  supervisorEval: ScoreInput | null | undefined,
  panelEvals: ScoreInput[]
): CompositeScoreResult {
  // Returns incomplete when the supervisor or all panel evaluations are missing
  if (!supervisorEval || !panelEvals || panelEvals.length === 0) {
    return {
      is_complete: false,
      incomplete: true,
      isComplete: false,
      composite_final_score: null,
      compositeFinalScore: null,
      supervisor_score: null,
      supervisorScore: null,
      panel_average_score: null,
      panelAverageScore: null,
    };
  }

  // Supervisor score recomputed and normalized
  const supTotal = computeTotal(rubric, supervisorEval.scores);
  const supNorm = normalise(supTotal, rubric.max_score);
  const roundedSup = Math.round((supNorm + Number.EPSILON) * 100) / 100;

  // Panel evaluations recomputed and averaged
  const panelNorms = panelEvals.map((pe) => {
    const pTotal = computeTotal(rubric, pe.scores);
    return normalise(pTotal, rubric.max_score);
  });

  const panelAvgNorm =
    panelNorms.reduce((acc, val) => acc + val, 0) / panelNorms.length;
  const roundedPanel = Math.round((panelAvgNorm + Number.EPSILON) * 100) / 100;

  // Composite calculation using rubric weights
  const composite =
    supNorm * (rubric.supervisor_weight_pct / 100) +
    panelAvgNorm * (rubric.panel_weight_pct / 100);
  const roundedComposite = Math.round((composite + Number.EPSILON) * 100) / 100;

  return {
    is_complete: true,
    incomplete: false,
    isComplete: true,
    composite_final_score: roundedComposite,
    compositeFinalScore: roundedComposite,
    supervisor_score: roundedSup,
    supervisorScore: roundedSup,
    panel_average_score: roundedPanel,
    panelAverageScore: roundedPanel,
  };
}
