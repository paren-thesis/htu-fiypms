import { z } from "zod";
import { isValidChapterUrl } from "@/lib/chapters/url";

export const chapterNumberSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export type ChapterNumber = z.infer<typeof chapterNumberSchema>;

export const chapterStatusSchema = z.enum(["pending", "approved", "revision_needed"]);
export type ChapterStatus = z.infer<typeof chapterStatusSchema>;

export const chapterFeedbackSchema = z.object({
  id: z.string().min(1),
  author_id: z.string().min(1),
  content: z.string().trim().min(1),
  created_at: z.any(),
});

export type ChapterFeedbackIn = z.infer<typeof chapterFeedbackSchema>;

export const chapterHistoryEntrySchema = z.object({
  version: z.number().int().positive(),
  document_url: z.string().url().refine(isValidChapterUrl, {
    message: "Invalid cloud document URL (must be Google Drive, OneDrive, or SharePoint HTTPS link)",
  }),
  submitted_at: z.any(),
  reviewed_at: z.any().optional(),
  status: z.string(),
});

export type ChapterHistoryEntryIn = z.infer<typeof chapterHistoryEntrySchema>;

export const createChapterSchema = z
  .object({
    team_id: z.string().min(1),
    chapter_number: chapterNumberSchema,
    title: z.string().trim().min(1),
    document_url: z.string().url().refine(isValidChapterUrl, {
      message: "Invalid cloud document URL (must be Google Drive, OneDrive, or SharePoint HTTPS link)",
    }),
  })
  .strict();

export type CreateChapterIn = z.infer<typeof createChapterSchema>;

export const updateChapterReviewSchema = z
  .object({
    status: z.enum(["approved", "revision_needed"]),
    feedback: z.array(chapterFeedbackSchema).optional(),
    review_notes: z.string().trim().optional(),
  })
  .strict();

export type UpdateChapterReviewIn = z.infer<typeof updateChapterReviewSchema>;
