import { z } from 'zod';

export const createPeerEvaluationInSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
    evaluatee_id: z.string().trim().min(1, 'Evaluatee ID is required'),
    punctuality_score: z
      .number()
      .int('Punctuality score must be an integer')
      .min(1, 'Punctuality score must be at least 1')
      .max(10, 'Punctuality score must not exceed 10'),
    technical_contribution_score: z
      .number()
      .int('Technical contribution score must be an integer')
      .min(1, 'Technical contribution score must be at least 1')
      .max(10, 'Technical contribution score must not exceed 10'),
    teamwork_score: z
      .number()
      .int('Teamwork score must be an integer')
      .min(1, 'Teamwork score must be at least 1')
      .max(10, 'Teamwork score must not exceed 10'),
    comments: z.string().optional().default(''),
  })
  .strict();

export type CreatePeerEvaluationIn = z.input<typeof createPeerEvaluationInSchema>;
export type PeerEvaluationIn = z.output<typeof createPeerEvaluationInSchema>;
