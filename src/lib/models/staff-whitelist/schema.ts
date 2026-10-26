import { z } from 'zod';

export const staffRoleEnum = z.enum([
  'supervisor',
  'coordinator',
  'admin',
  'panel_member',
]);

export type StaffRole = z.infer<typeof staffRoleEnum>;

export const addStaffWhitelistInSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Valid institutional email is required')
      .refine((e) => e.endsWith('@htu.edu.gh'), {
        message: 'Email must end with @htu.edu.gh',
      })
      .refine((e) => !/^[0-9]{10}@htu\.edu\.gh$/i.test(e), {
        message: 'Student index number emails cannot be added to staff whitelist',
      }),
    full_name: z.string().trim().min(1, 'Full name is required'),
    roles: z.array(staffRoleEnum).min(1, 'At least one staff role is required'),
    department: z
      .string()
      .trim()
      .min(1, 'Department is required')
      .default('Computer Science'),
    programmes: z
      .array(z.string().trim().min(1))
      .min(1, 'At least one programme is required'),
    phone: z.string().trim().optional(),
  })
  .strict();

export type AddStaffWhitelistIn = z.infer<typeof addStaffWhitelistInSchema>;

export const updateStaffWhitelistInSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Full name is required').optional(),
    roles: z.array(staffRoleEnum).min(1, 'At least one staff role is required').optional(),
    department: z.string().trim().min(1, 'Department is required').optional(),
    programmes: z
      .array(z.string().trim().min(1))
      .min(1, 'At least one programme is required')
      .optional(),
    phone: z.string().trim().optional(),
  })
  .strict();

export type UpdateStaffWhitelistIn = z.infer<typeof updateStaffWhitelistInSchema>;
