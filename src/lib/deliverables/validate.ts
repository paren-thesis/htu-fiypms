import { z } from 'zod';

export interface DeliverableValidationInput {
  github_repository_url: string;
  live_demo_url?: string;
  google_drive_url?: string;
  environment_setup_notes: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates a repository URL to ensure it points to a valid GitHub or GitLab repository.
 */
export function isValidRepoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'github.com' && host !== 'gitlab.com') {
      return false;
    }
    // Must have at least /owner/repo in the pathname
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    return pathParts.length >= 2;
  } catch {
    return false;
  }
}

/**
 * Validates an optional HTTPS URL.
 */
export function isValidHttpsUrl(url?: string): boolean {
  if (!url || url.trim() === '') return true;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const deliverableSchema = z
  .object({
    github_repository_url: z
      .string()
      .trim()
      .min(1, 'Repository URL is required')
      .refine(isValidRepoUrl, {
        message: 'Must be a valid GitHub or GitLab repository URL (e.g. https://github.com/owner/repo)',
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

export type DeliverableSchemaInput = z.infer<typeof deliverableSchema>;

/**
 * Pure validation function for deliverable inputs.
 */
export function validateDeliverable(input: DeliverableValidationInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.github_repository_url || !isValidRepoUrl(input.github_repository_url)) {
    errors.github_repository_url =
      'Repository URL must be a valid GitHub or GitLab link (e.g. https://github.com/org/repo)';
  }

  if (input.live_demo_url && !isValidHttpsUrl(input.live_demo_url)) {
    errors.live_demo_url = 'Live demo URL must be a valid HTTPS URL';
  }

  if (input.google_drive_url && !isValidHttpsUrl(input.google_drive_url)) {
    errors.google_drive_url = 'Cloud storage link must be a valid HTTPS URL';
  }

  if (!input.environment_setup_notes || input.environment_setup_notes.trim() === '') {
    errors.environment_setup_notes = 'Environment setup notes are required';
  } else if (input.environment_setup_notes.length > 20000) {
    errors.environment_setup_notes = 'Environment setup notes cannot exceed 20,000 characters';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
