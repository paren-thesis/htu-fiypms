import { z } from 'zod';

export const supervisorContactDocumentSchema = z
  .object({
    supervisor_id: z.string().min(1, 'Supervisor ID is required'),
    phone: z.string().optional(),
    office_location: z.string().min(1, 'Office location is required'),
    consultation_hours: z.string().min(1, 'Consultation hours are required'),
  })
  .strict();

export type SupervisorContactDocumentData = z.infer<
  typeof supervisorContactDocumentSchema
>;

export const upsertSupervisorContactInSchema = z
  .object({
    office_location: z.string().min(1, 'Office location is required').trim(),
    consultation_hours: z.string().min(1, 'Consultation hours are required').trim(),
    phone: z.string().trim().optional(),
  })
  .strict();

export type UpsertSupervisorContactIn = z.infer<
  typeof upsertSupervisorContactInSchema
>;

export const supervisorContactGrantSchema = z
  .object({
    student_id: z.string().min(1, 'Student ID is required'),
    team_id: z.string().min(1, 'Team ID is required'),
  })
  .strict();

export type SupervisorContactGrantIn = z.infer<
  typeof supervisorContactGrantSchema
>;
