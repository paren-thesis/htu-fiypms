import { z } from 'zod';

export const supervisionStatusSchema = z.enum(['available', 'at_capacity']);

export const createSupervisionInSchema = z
  .object({
    supervisor_id: z.string().min(1, 'Supervisor ID is required'),
    academic_year_id: z.string().min(1, 'Academic year ID is required'),
    max_capacity: z.number().int().min(1).default(5),
    current_assigned_count: z.number().int().min(0).default(0),
    assigned_team_ids: z.array(z.string()).default([]),
    status: supervisionStatusSchema.default('available'),
  })
  .strict();

export type CreateSupervisionIn = z.infer<typeof createSupervisionInSchema>;

export const updateSupervisionInSchema = z
  .object({
    max_capacity: z.number().int().min(1).optional(),
    current_assigned_count: z.number().int().min(0).optional(),
    assigned_team_ids: z.array(z.string()).optional(),
    status: supervisionStatusSchema.optional(),
  })
  .strict();

export type UpdateSupervisionIn = z.infer<typeof updateSupervisionInSchema>;
