import { z } from 'zod';
import { isValidInviteCode } from '@/lib/teams/invite-code';

export const teamStatusSchema = z.enum([
  'formation',
  'topic_pending',
  'topic_approved',
  'defense_ready',
  'completed',
  'disbanded',
]);

export type TeamStatus = z.infer<typeof teamStatusSchema>;

/**
 * Schema for creating a project team (caller: student).
 * Name is provided; leaderUid, courseId, academicYearId, groupNumber are derived server-side.
 */
export const createTeamInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, 'Team name must be at least 3 characters')
      .max(50, 'Team name cannot exceed 50 characters'),
  })
  .strict();

export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

/**
 * Schema for joining a project team using an invite code.
 */
export const joinTeamInputSchema = z
  .object({
    inviteCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(6, 'Invite code must be exactly 6 characters')
      .refine(
        (code) => isValidInviteCode(code),
        'Invite code can only contain uppercase letters and digits (excluding 0, O, 1, I)'
      ),
  })
  .strict();

export type JoinTeamInput = z.infer<typeof joinTeamInputSchema>;

/**
 * Schema for renaming a team (caller: leader only).
 */
export const renameTeamInputSchema = z
  .object({
    teamId: z.string().trim().min(1, 'Team ID is required'),
    name: z
      .string()
      .trim()
      .min(3, 'Team name must be at least 3 characters')
      .max(50, 'Team name cannot exceed 50 characters'),
  })
  .strict();

export type RenameTeamInput = z.infer<typeof renameTeamInputSchema>;
