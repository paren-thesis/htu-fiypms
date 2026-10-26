import { z } from 'zod';
import { isFirestoreTimestamp } from '@/lib/serialize';

const dateOrTimestamp = z.union([
  z.date(),
  z.string().datetime(),
  z.custom<FirebaseFirestore.Timestamp>((val) => isFirestoreTimestamp(val)),
]);

export const deadlinesSchema = z
  .object({
    roster_import_deadline: dateOrTimestamp,
    team_formation_deadline: dateOrTimestamp,
    topic_submission_deadline: dateOrTimestamp,
    chapters_deadline: dateOrTimestamp,
    defense_start_date: dateOrTimestamp,
    defense_end_date: dateOrTimestamp,
    grade_appeal_deadline: dateOrTimestamp.optional(),
  })
  .strict();

export const createAcademicYearInSchema = z
  .object({
    id: z
      .string()
      .regex(/^\d{4}-\d{4}$/, 'ID must be format YYYY-YYYY (e.g. 2026-2027)'),
    code: z
      .string()
      .regex(/^\d{4}\/\d{4}$/, 'Code must be format YYYY/YYYY (e.g. 2026/2027)'),
    semester: z.union([z.literal(1), z.literal(2)]),
    is_active: z.boolean().default(true),
    deadlines: deadlinesSchema,
  })
  .strict();

export type CreateAcademicYearIn = z.infer<typeof createAcademicYearInSchema>;

export const updateAcademicYearInSchema = z
  .object({
    semester: z.union([z.literal(1), z.literal(2)]).optional(),
    is_active: z.boolean().optional(),
    deadlines: deadlinesSchema.partial().optional(),
  })
  .strict();

export type UpdateAcademicYearIn = z.infer<typeof updateAcademicYearInSchema>;

export const counterSchema = z
  .object({
    next_sequence: z.number().int().min(1),
  })
  .strict();

export type CounterIn = z.infer<typeof counterSchema>;
