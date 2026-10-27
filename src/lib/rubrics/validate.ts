export const ALLOWED_CRITERIA_CATEGORIES = [
  'oral_defense',
  'system_demo',
  'technical_architecture',
] as const;

export type CriteriaCategory = (typeof ALLOWED_CRITERIA_CATEGORIES)[number];

export interface RubricValidationInput {
  title?: string;
  max_score: number;
  supervisor_weight_pct: number;
  panel_weight_pct: number;
  criteria: Array<{
    id: string;
    title: string;
    description?: string;
    max_points: number;
    category: string;
  }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const DEFAULT_RUBRIC_TEMPLATE = {
  title: 'Standard Capstone Defense Rubric',
  max_score: 100,
  supervisor_weight_pct: 40,
  panel_weight_pct: 60,
  criteria: [
    {
      id: 'oral_defense',
      title: 'Oral Defense & Presentation',
      description:
        'Clarity of presentation, slide organization, professional demeanor, and ability to defend research methodology during Q&A.',
      max_points: 30,
      category: 'oral_defense' as CriteriaCategory,
    },
    {
      id: 'system_demo',
      title: 'System Demonstration',
      description:
        'Functional verification of system features, live demo robustness, UI responsiveness, and real-time execution.',
      max_points: 40,
      category: 'system_demo' as CriteriaCategory,
    },
    {
      id: 'technical_architecture',
      title: 'Technical Architecture & Code Quality',
      description:
        'System architecture, design patterns, database normalization, schema integrity, and engineering quality.',
      max_points: 30,
      category: 'technical_architecture' as CriteriaCategory,
    },
  ],
};

/**
 * Pure validator for Rubric input.
 * Rules:
 * 1. At least one criterion.
 * 2. Criteria IDs must be unique and non-empty.
 * 3. Criterion category must be one of 'oral_defense' | 'system_demo' | 'technical_architecture'.
 * 4. Sum of criteria max_points must strictly equal max_score.
 * 5. supervisor_weight_pct + panel_weight_pct must strictly equal 100.
 * 6. Weights and max_score must be positive / non-negative numbers.
 */
export function validateRubric(input: RubricValidationInput): ValidationResult {
  const errors: string[] = [];

  if (!input) {
    return { valid: false, errors: ['Rubric input is required'] };
  }

  // 1. Title
  if (input.title !== undefined && (!input.title || input.title.trim().length === 0)) {
    errors.push('Rubric title cannot be empty');
  }

  // 2. Weights: supervisor_weight_pct + panel_weight_pct === 100
  const supWeight = Number(input.supervisor_weight_pct);
  const panelWeight = Number(input.panel_weight_pct);

  if (isNaN(supWeight) || supWeight < 0 || supWeight > 100) {
    errors.push('Supervisor weight percentage must be between 0 and 100');
  }
  if (isNaN(panelWeight) || panelWeight < 0 || panelWeight > 100) {
    errors.push('Panel weight percentage must be between 0 and 100');
  }
  if (supWeight + panelWeight !== 100) {
    errors.push(
      `Supervisor weight (${supWeight}%) and panel weight (${panelWeight}%) must sum to exactly 100% (currently ${supWeight + panelWeight}%)`
    );
  }

  // 3. Max score
  const maxScore = Number(input.max_score);
  if (isNaN(maxScore) || maxScore <= 0) {
    errors.push('Max score must be greater than 0');
  }

  // 4. Criteria array: at least one criterion
  if (!Array.isArray(input.criteria) || input.criteria.length === 0) {
    errors.push('Rubric must contain at least one criterion');
    return { valid: false, errors };
  }

  // 5. Criteria checks
  const seenIds = new Set<string>();
  let pointsSum = 0;

  for (let i = 0; i < input.criteria.length; i++) {
    const criterion = input.criteria[i];
    if (!criterion) continue;
    const indexLabel = `Criterion #${i + 1}`;

    // Unique ID
    const critId = criterion.id ? criterion.id.trim() : '';
    if (!critId) {
      errors.push(`${indexLabel}: ID is required`);
    } else if (seenIds.has(critId)) {
      errors.push(`${indexLabel}: Duplicate criterion ID '${critId}'`);
    } else {
      seenIds.add(critId);
    }

    // Title
    if (!criterion.title || criterion.title.trim().length === 0) {
      errors.push(`${indexLabel}: Title is required`);
    }

    // Category
    if (!ALLOWED_CRITERIA_CATEGORIES.includes(criterion.category as CriteriaCategory)) {
      errors.push(
        `${indexLabel}: Category '${criterion.category}' is invalid. Allowed: ${ALLOWED_CRITERIA_CATEGORIES.join(', ')}`
      );
    }

    // Max points
    const pts = Number(criterion.max_points);
    if (isNaN(pts) || pts <= 0) {
      errors.push(`${indexLabel}: Max points must be greater than 0`);
    } else {
      pointsSum += pts;
    }
  }

  // 6. Sum of max_points equals max_score
  if (pointsSum !== maxScore) {
    errors.push(
      `Sum of criterion max points (${pointsSum}) must equal the rubric max score (${maxScore})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
