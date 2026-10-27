import { z } from 'zod';
import { ALLOWED_CRITERIA_CATEGORIES, validateRubric } from '@/lib/rubrics/validate';

export const rubricCriterionSchema = z
  .object({
    id: z.string().trim().min(1, 'Criterion ID is required'),
    title: z.string().trim().min(1, 'Criterion title is required'),
    description: z.string().trim().optional(),
    max_points: z.number().int().positive('Max points must be greater than 0'),
    category: z.enum(ALLOWED_CRITERIA_CATEGORIES),
  })
  .strict();

export type RubricCriterionIn = z.infer<typeof rubricCriterionSchema>;

export const createRubricInSchema = z
  .object({
    title: z.string().trim().min(1, 'Rubric title is required'),
    max_score: z.number().int().positive('Max score must be greater than 0'),
    supervisor_weight_pct: z.number().min(0).max(100),
    panel_weight_pct: z.number().min(0).max(100),
    criteria: z.array(rubricCriterionSchema).min(1, 'At least one criterion is required'),
  })
  .strict()
  .superRefine((data, ctx) => {
    const res = validateRubric(data);
    if (!res.valid) {
      for (const err of res.errors) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err,
        });
      }
    }
  });

export type CreateRubricIn = z.infer<typeof createRubricInSchema>;

export const updateRubricInSchema = z
  .object({
    title: z.string().trim().min(1, 'Rubric title is required').optional(),
    max_score: z.number().int().positive('Max score must be greater than 0').optional(),
    supervisor_weight_pct: z.number().min(0).max(100).optional(),
    panel_weight_pct: z.number().min(0).max(100).optional(),
    criteria: z.array(rubricCriterionSchema).min(1).optional(),
  })
  .strict();

export type UpdateRubricIn = z.infer<typeof updateRubricInSchema>;
