import { z } from 'zod';

export const userRoleEnum = z.enum([
  'student',
  'supervisor',
  'coordinator',
  'panel_member',
  'admin',
]);

export type UserRole = z.infer<typeof userRoleEnum>;

export const userProfileSchema = z
  .object({
    index_number: z.string().regex(/^\d{10}$/, 'Must be a 10-digit index number').optional(),
    staff_id: z.string().optional(),
    course_id: z.string().optional(),
    programmes: z.array(z.string()).optional(),
    registered: z.boolean(),
    profile_complete: z.boolean(),
    research_interests: z.array(z.string()).optional(),
    max_team_capacity: z.number().int().min(0).optional(),
    current_team_count: z.number().int().min(0).optional(),
  })
  .strict();

export const createUserInSchema = z
  .object({
    uid: z.string().min(1, 'User UID is required'),
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid institutional email is required'),
    role: userRoleEnum,
    roles: z.array(userRoleEnum).min(1, 'At least one role is required'),
    active_role: z.string().min(1, 'Active role is required'),
    profile: userProfileSchema,
  })
  .strict();

export type CreateUserIn = z.infer<typeof createUserInSchema>;

export const updateUserProfileInSchema = z
  .object({
    research_interests: z.array(z.string()).optional(),
    max_team_capacity: z.number().int().min(0).optional(),
  })
  .strict();

export type UpdateUserProfileIn = z.infer<typeof updateUserProfileInSchema>;
