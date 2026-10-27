import { describe, it, expect } from 'vitest';
import {
  validateRubric,
  DEFAULT_RUBRIC_TEMPLATE,
} from './validate';

describe('Rubric Validation (validateRubric)', () => {
  it('accepts the default template with 100 max score and 40/60 weights', () => {
    const result = validateRubric(DEFAULT_RUBRIC_TEMPLATE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects rubrics where criteria IDs are duplicated', () => {
    const rubric = {
      title: 'Duplicate Criteria Rubric',
      max_score: 100,
      supervisor_weight_pct: 50,
      panel_weight_pct: 50,
      criteria: [
        {
          id: 'demo',
          title: 'System Demo Part 1',
          max_points: 50,
          category: 'system_demo',
        },
        {
          id: 'demo', // Duplicate ID
          title: 'System Demo Part 2',
          max_points: 50,
          category: 'system_demo',
        },
      ],
    };

    const result = validateRubric(rubric);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate criterion ID 'demo'"))).toBe(true);
  });

  it('rejects when sum of criterion max_points does not equal max_score', () => {
    const rubric = {
      title: 'Points Mismatch',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'c1',
          title: 'Part 1',
          max_points: 30,
          category: 'oral_defense',
        },
        {
          id: 'c2',
          title: 'Part 2',
          max_points: 40,
          category: 'system_demo',
        },
        // Total points = 70, expected 100
      ],
    };

    const result = validateRubric(rubric);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes('Sum of criterion max points (70) must equal the rubric max score (100)')
      )
    ).toBe(true);
  });

  it('rejects when supervisor and panel weights do not sum to 100', () => {
    const rubric = {
      title: 'Weight Mismatch',
      max_score: 50,
      supervisor_weight_pct: 30,
      panel_weight_pct: 50, // 30 + 50 = 80 !== 100
      criteria: [
        {
          id: 'c1',
          title: 'Part 1',
          max_points: 50,
          category: 'technical_architecture',
        },
      ],
    };

    const result = validateRubric(rubric);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must sum to exactly 100%'))).toBe(true);
  });

  it('rejects when criteria array is empty', () => {
    const rubric = {
      title: 'Empty Criteria',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [],
    };

    const result = validateRubric(rubric);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least one criterion'))).toBe(true);
  });

  it('rejects invalid category values', () => {
    const rubric = {
      title: 'Invalid Category',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'c1',
          title: 'Something',
          max_points: 100,
          category: 'non_existent_category',
        },
      ],
    };

    const result = validateRubric(rubric);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Category 'non_existent_category' is invalid"))).toBe(
      true
    );
  });

  it('accepts custom weights summing to 100 and arbitrary max_score matching criteria sum', () => {
    const rubric = {
      title: 'Custom Weights & Scores',
      max_score: 80,
      supervisor_weight_pct: 35,
      panel_weight_pct: 65,
      criteria: [
        {
          id: 'oral',
          title: 'Oral',
          max_points: 20,
          category: 'oral_defense',
        },
        {
          id: 'sys',
          title: 'Demo',
          max_points: 40,
          category: 'system_demo',
        },
        {
          id: 'arch',
          title: 'Arch',
          max_points: 20,
          category: 'technical_architecture',
        },
      ],
    };

    const result = validateRubric(rubric);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects negative or zero points', () => {
    const rubric = {
      title: 'Negative Points',
      max_score: 100,
      supervisor_weight_pct: 40,
      panel_weight_pct: 60,
      criteria: [
        {
          id: 'c1',
          title: 'Zero Points',
          max_points: 0,
          category: 'oral_defense',
        },
        {
          id: 'c2',
          title: 'Remaining Points',
          max_points: 100,
          category: 'system_demo',
        },
      ],
    };

    const result = validateRubric(rubric);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Max points must be greater than 0'))).toBe(true);
  });
});
