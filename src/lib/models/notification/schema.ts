import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'topic_status',
  'chapter_review',
  'defense_schedule',
  'grade_published',
  'supervision_assignment',
  'team_update',
  'team_invite',
  'system',
]);

export type NotificationTypeEnum = z.infer<typeof notificationTypeSchema>;

export const createNotificationInSchema = z
  .object({
    user_id: z.string().min(1, 'Recipient user_id is required'),
    title: z.string().min(1, 'Title is required'),
    body: z.string().min(1, 'Body is required'),
    type: notificationTypeSchema,
    target_url: z.string().url().or(z.string().startsWith('/')).optional(),
  })
  .strict();

export type CreateNotificationIn = z.infer<typeof createNotificationInSchema>;

export const updateNotificationInSchema = z
  .object({
    is_read: z.boolean(),
  })
  .strict();

export type UpdateNotificationIn = z.infer<typeof updateNotificationInSchema>;
