import { z } from 'zod';

export const rosterRowSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    full_name: z
      .string()
      .trim()
      .min(1, 'Full name is required'),
    contact: z
      .string()
      .trim()
      .transform((val) => val.replace(/[\s\-()]/g, ''))
      .refine(
        (val) => /^\+?[0-9]{7,15}$/.test(val),
        'Contact must be a valid phone number (7-15 digits, optional + prefix)'
      ),
  })
  .strict();

export type RosterRowIn = z.infer<typeof rosterRowSchema>;

export const importRosterInputSchema = z
  .object({
    course_id: z.string().trim().min(1, 'Course track is required'),
    academic_year_id: z.string().trim().min(1, 'Academic year is required'),
    filename: z.string().trim().min(1).default('roster.csv'),
    batch_size: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(50),
    dry_run: z.boolean().default(false),
    rows: z.array(rosterRowSchema).min(1, 'At least one student row is required'),
  })
  .strict();

export type ImportRosterInput = z.infer<typeof importRosterInputSchema>;
