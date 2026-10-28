import { z } from 'zod';

export const defenseSlotStatusSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

export type DefenseSlotStatus = z.infer<typeof defenseSlotStatusSchema>;

export const defenseTimeSlotInputSchema = z
  .object({
    slot_id: z.string().trim().optional(),
    id: z.string().trim().optional(),
    team_id: z.string().trim().optional().or(z.literal('')),
    start_time: z.union([
      z.number(),
      z.string(),
      z.date(),
      z.object({ seconds: z.number(), nanoseconds: z.number().optional() }),
    ]),
    end_time: z.union([
      z.number(),
      z.string(),
      z.date(),
      z.object({ seconds: z.number(), nanoseconds: z.number().optional() }),
    ]),
    status: defenseSlotStatusSchema.default('scheduled'),
  })
  .transform((val) => ({
    slot_id: val.slot_id || val.id || `slot_${Math.random().toString(36).substring(2, 9)}`,
    team_id: val.team_id || '',
    start_time: val.start_time,
    end_time: val.end_time,
    status: val.status,
  }));

export type DefenseTimeSlotIn = z.input<typeof defenseTimeSlotInputSchema>;
export type DefenseTimeSlotOut = z.output<typeof defenseTimeSlotInputSchema>;

export const createDefensePanelInSchema = z
  .object({
    academic_year_id: z.string().trim().min(1, 'Academic year ID is required'),
    course_id: z.string().trim().min(1, 'Course ID is required'),
    panel_name: z.string().trim().min(1, 'Panel name is required'),
    venue: z.string().trim().min(1, 'Venue is required'),
    is_virtual: z.boolean().default(false),
    virtual_meeting_url: z
      .string()
      .trim()
      .url('Valid virtual meeting URL required')
      .optional()
      .or(z.literal('')),
    chair_id: z.string().trim().min(1, 'Chair ID is required'),
    examiner_ids: z
      .array(z.string().trim().min(1))
      .min(1, 'At least one examiner is required'),
    time_slots: z.array(defenseTimeSlotInputSchema).default([]),
    cross_programme_justification: z.string().trim().optional(),
  })
  .strict();

export type CreateDefensePanelIn = z.input<typeof createDefensePanelInSchema>;
export type CreateDefensePanelOut = z.output<typeof createDefensePanelInSchema>;

export const updateDefensePanelInSchema = z
  .object({
    panel_name: z.string().trim().min(1).optional(),
    venue: z.string().trim().min(1).optional(),
    is_virtual: z.boolean().optional(),
    virtual_meeting_url: z.string().trim().url().optional().or(z.literal('')),
    chair_id: z.string().trim().min(1).optional(),
    examiner_ids: z.array(z.string().trim().min(1)).min(1).optional(),
    time_slots: z.array(defenseTimeSlotInputSchema).optional(),
    cross_programme_justification: z.string().trim().optional(),
  })
  .strict();

export type UpdateDefensePanelIn = z.input<typeof updateDefensePanelInSchema>;
export type UpdateDefensePanelOut = z.output<typeof updateDefensePanelInSchema>;
