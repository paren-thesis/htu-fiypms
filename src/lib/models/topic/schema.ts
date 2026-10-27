import { z } from 'zod';
import { normaliseTags } from '@/lib/matching/jaccard';

export const topicInputSchema = z
  .object({
    teamId: z.string().min(1, 'Team ID is required'),
    title: z
      .string()
      .trim()
      .min(5, 'Title must be at least 5 characters')
      .max(150, 'Title cannot exceed 150 characters'),
    abstract: z
      .string()
      .trim()
      .min(20, 'Abstract must be at least 20 characters')
      .max(2000, 'Abstract cannot exceed 2000 characters'),
    problem_statement: z
      .string()
      .trim()
      .min(20, 'Problem statement must be at least 20 characters')
      .max(1500, 'Problem statement cannot exceed 1500 characters'),
    proposed_solution: z
      .string()
      .trim()
      .min(20, 'Proposed solution must be at least 20 characters')
      .max(1500, 'Proposed solution cannot exceed 1500 characters'),
    tech_stack: z
      .array(z.string().trim().min(1))
      .min(1, 'At least one technical keyword is required')
      .max(12, 'Maximum 12 technologies allowed')
      .transform(normaliseTags),
    preference_rank: z.union([z.literal(1), z.literal(2), z.literal(3)], {
      error: 'Preference rank must be 1, 2, or 3',
    }),
  })
  .strict();

export type TopicInput = z.infer<typeof topicInputSchema>;

export const topicUpdateInputSchema = z
  .object({
    topicId: z.string().min(1, 'Topic ID is required'),
    title: z.string().trim().min(5).max(150).optional(),
    abstract: z.string().trim().min(20).max(2000).optional(),
    problem_statement: z.string().trim().min(20).max(1500).optional(),
    proposed_solution: z.string().trim().min(20).max(1500).optional(),
    tech_stack: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(12)
      .transform(normaliseTags)
      .optional(),
    preference_rank: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  })
  .strict();

export type TopicUpdateInput = z.infer<typeof topicUpdateInputSchema>;

export const topicSubmitActionSchema = z
  .object({
    topicId: z.string().min(1, 'Topic ID is required'),
  })
  .strict();

export type TopicSubmitActionInput = z.infer<typeof topicSubmitActionSchema>;

export const topicResubmitActionSchema = z
  .object({
    topicId: z.string().min(1, 'Topic ID is required'),
    title: z.string().trim().min(5).max(150).optional(),
    abstract: z.string().trim().min(20).max(2000).optional(),
    problem_statement: z.string().trim().min(20).max(1500).optional(),
    proposed_solution: z.string().trim().min(20).max(1500).optional(),
    tech_stack: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(12)
      .transform(normaliseTags)
      .optional(),
  })
  .strict();

export type TopicResubmitActionInput = z.infer<typeof topicResubmitActionSchema>;
