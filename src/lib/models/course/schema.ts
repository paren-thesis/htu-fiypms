import { z } from 'zod';

export const courseIdSchema = z.enum([
  'btech-cs',
  'btech-ict',
  'hnd-cs',
  'hnd-ict',
]);

export type CourseId = z.infer<typeof courseIdSchema>;

export const createCourseInSchema = z
  .object({
    id: courseIdSchema,
    code: z.string().min(1, 'Course code is required'),
    name: z.string().min(1, 'Course name is required'),
    department: z.string().min(1, 'Department is required'),
  })
  .strict();

export type CreateCourseIn = z.infer<typeof createCourseInSchema>;

export const updateCourseInSchema = z
  .object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
  })
  .strict();

export type UpdateCourseIn = z.infer<typeof updateCourseInSchema>;
