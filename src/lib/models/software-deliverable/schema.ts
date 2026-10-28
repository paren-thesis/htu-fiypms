import { z } from 'zod';
import { isValidRepoUrl, isValidHttpsUrl } from '@/lib/deliverables/validate';

export const submitDeliverableInSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
    github_repository_url: z
      .string()
      .trim()
      .min(1, 'Repository URL is required')
      .refine(isValidRepoUrl, {
        message: 'Must be a valid GitHub or GitLab repository URL (e.g. https://github.com/org/repo)',
      }),
    live_demo_url: z
      .string()
      .trim()
      .optional()
      .refine(isValidHttpsUrl, {
        message: 'Live demo URL must be a valid secure HTTPS link',
      }),
    google_drive_url: z
      .string()
      .trim()
      .optional()
      .refine(isValidHttpsUrl, {
        message: 'Cloud storage URL must be a valid secure HTTPS link',
      }),
    environment_setup_notes: z
      .string()
      .min(1, 'Environment setup notes are required')
      .max(20000, 'Environment setup notes cannot exceed 20,000 characters'),
  })
  .strict();

export type SubmitDeliverableIn = z.infer<typeof submitDeliverableInSchema>;

export const signoffDeliverableInSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
    supervisor_signoff_notes: z.string().optional().default(''),
  })
  .strict();

export type SignoffDeliverableIn = z.infer<typeof signoffDeliverableInSchema>;
