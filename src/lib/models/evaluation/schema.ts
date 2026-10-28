import { z } from 'zod';

export const evaluationRoleSchema = z.enum([
  'supervisor',
  'panel_chair',
  'panel_member',
]);

export type EvaluationRole = z.infer<typeof evaluationRoleSchema>;

export const createEvaluationInSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
    evaluator_role: evaluationRoleSchema,
    rubric_id: z.string().trim().min(1, 'Rubric ID is required'),
    scores: z.record(z.string(), z.number().min(0)),
    comments: z.string().default(''),
    student_id: z.null().optional(), // student_id is always null in v1
  })
  .strict();

export type CreateEvaluationIn = z.infer<typeof createEvaluationInSchema>;

export const updateEvaluationInSchema = z
  .object({
    scores: z.record(z.string(), z.number().min(0)).optional(),
    comments: z.string().optional(),
  })
  .strict();

export type UpdateEvaluationIn = z.infer<typeof updateEvaluationInSchema>;
