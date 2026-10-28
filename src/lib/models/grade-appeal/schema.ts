import { z } from 'zod';

export const gradeAppealStatusSchema = z.enum([
  'submitted',
  'under_review',
  'resolved',
  'rejected',
]);

export type GradeAppealStatusEnum = z.infer<typeof gradeAppealStatusSchema>;

export const submitGradeAppealInSchema = z
  .object({
    team_id: z.string().trim().min(1, 'Team ID is required'),
    reason: z
      .string()
      .trim()
      .min(20, 'Reason must be at least 20 characters in length')
      .max(2000, 'Reason cannot exceed 2,000 characters in length'),
  })
  .strict();

export type SubmitGradeAppealIn = z.infer<typeof submitGradeAppealInSchema>;

export const resolveGradeAppealInSchema = z
  .object({
    appeal_id: z.string().trim().min(1, 'Appeal ID is required'),
    status: z.enum(['under_review', 'resolved', 'rejected'], {
      message: "Status must be 'under_review', 'resolved', or 'rejected'",
    }),
    resolution_notes: z
      .string()
      .trim()
      .min(1, 'Resolution notes are required')
      .max(2000, 'Resolution notes cannot exceed 2,000 characters in length'),
  })
  .strict();

export type ResolveGradeAppealIn = z.infer<typeof resolveGradeAppealInSchema>;
