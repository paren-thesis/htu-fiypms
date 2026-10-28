import { z } from 'zod';
import { MAX_SEARCH_TOKENS } from '@/lib/archive/tokens';

export const createArchivedProjectSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(300),
    abstract: z.string().trim().max(5000),
    keywords: z.array(z.string().trim().min(1)).max(50),
    search_tokens: z
      .array(z.string().trim().min(1))
      .max(MAX_SEARCH_TOKENS, `At most ${MAX_SEARCH_TOKENS} search tokens allowed`),
    academic_year_id: z.string().trim().min(1, 'Academic year ID is required'),
    course_id: z.string().trim().min(1, 'Course ID is required'),
    group_number: z.string().trim().min(1, 'Group number is required'),
    github_repository_url: z.string().trim().url('Invalid GitHub repository URL').optional(),
    manuscript_url: z.string().trim().url('Invalid manuscript URL').optional(),
  })
  .strict();

export type CreateArchivedProjectIn = z.infer<typeof createArchivedProjectSchema>;

export const archiveProjectsInputSchema = z
  .object({
    academic_year_id: z.string().trim().min(1, 'Academic year is required'),
  })
  .strict();

export type ArchiveProjectsInput = z.infer<typeof archiveProjectsInputSchema>;

export const searchArchivedProjectsInputSchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    course_id: z.string().trim().optional(),
    academic_year_id: z.string().trim().optional(),
    cursor: z.string().trim().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export type SearchArchivedProjectsInput = z.infer<typeof searchArchivedProjectsInputSchema>;

