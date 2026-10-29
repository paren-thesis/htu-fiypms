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

export const rosterStudentDocumentSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    full_name: z.string().trim().min(1, 'Full name is required'),
    contact: z
      .string()
      .trim()
      .transform((val) => val.replace(/[\s\-()]/g, ''))
      .refine(
        (val) => /^\+?[0-9]{7,15}$/.test(val),
        'Contact must be a valid phone number (7-15 digits, optional + prefix)'
      ),
    email: z.string().email(),
    course_id: z.string().trim().min(1),
    imported_by_uid: z.string(),
    imported_at: z.any(),
    import_batch_id: z.string(),
    user_uid: z.string().nullable(),
    signup_completed_at: z.any().nullable(),
    is_active: z.boolean().default(true),
    updated_at: z.any().optional(),
    updated_by: z.string().optional(),
    deactivated_at: z.any().optional(),
    deactivated_by: z.string().optional(),
    deactivation_reason: z.string().optional(),
  })
  .strict();

export type RosterStudentDocumentModel = z.infer<typeof rosterStudentDocumentSchema>;

export const createStudentSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    full_name: z.string().trim().min(1, 'Full name is required'),
    contact: z
      .string()
      .trim()
      .transform((val) => val.replace(/[\s\-()]/g, ''))
      .refine(
        (val) => /^\+?[0-9]{7,15}$/.test(val),
        'Contact must be a valid phone number (7-15 digits, optional + prefix)'
      ),
    course_id: z.string().trim().min(1, 'Course track is required'),
    academic_year_id: z.string().trim().optional(),
  })
  .strict();

export type CreateStudentInput = z.infer<typeof createStudentSchema>;

export const updateStudentSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    full_name: z.string().trim().min(1, 'Full name is required'),
    contact: z
      .string()
      .trim()
      .transform((val) => val.replace(/[\s\-()]/g, ''))
      .refine(
        (val) => /^\+?[0-9]{7,15}$/.test(val),
        'Contact must be a valid phone number (7-15 digits, optional + prefix)'
      ),
    academic_year_id: z.string().trim().optional(),
  })
  .strict();

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const deactivateStudentSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    reason: z
      .string()
      .trim()
      .min(10, 'Deactivation reason must be at least 10 characters'),
    academic_year_id: z.string().trim().optional(),
  })
  .strict();

export type DeactivateStudentInput = z.infer<typeof deactivateStudentSchema>;

export const reactivateStudentSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    academic_year_id: z.string().trim().optional(),
  })
  .strict();

export type ReactivateStudentInput = z.infer<typeof reactivateStudentSchema>;

export const deleteStudentSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    academic_year_id: z.string().trim().optional(),
  })
  .strict();

export type DeleteStudentInput = z.infer<typeof deleteStudentSchema>;

export const changeStudentCourseSchema = z
  .object({
    index_number: z
      .string()
      .trim()
      .regex(/^[0-9]{10}$/, 'Index number must be exactly 10 digits'),
    course_id: z.string().trim().min(1, 'New course track is required'),
    justification: z
      .string()
      .trim()
      .min(20, 'Justification must be at least 20 characters'),
    academic_year_id: z.string().trim().optional(),
  })
  .strict();

export type ChangeStudentCourseInput = z.infer<typeof changeStudentCourseSchema>;
