import { z } from 'zod';

export const auditLogActionSchema = z.enum([
  'roster.imported',
  'staff.whitelist_added',
  'staff.whitelist_updated',
  'staff.whitelist_deactivated',
  'staff.whitelist_reactivated',
  'student.signup_completed',
  'faculty.signup_completed',
  'identity_conflict',
  'profile.completed',
  'user.role_switched',
  'topic.created_draft',
  'topic.updated_draft',
  'topic.submitted',
  'topic.resubmitted',
  'topic.approved',
  'topic.revision_requested',
  'topic.rejected',
  'grade.submitted',
  'grade.amended',
  'team.created',
  'team.joined',
  'team.renamed',
  'team.auto_grouped',
  'defense.scheduled',
]);

export type AuditLogAction = z.infer<typeof auditLogActionSchema>;

export const createAuditLogInSchema = z
  .object({
    actor_id: z.string().min(1, 'Actor ID is required'),
    actor_name: z.string().min(1, 'Actor name is required'),
    actor_email: z.string().email('Valid actor email is required'),
    actor_role: z.string().min(1, 'Actor role is required'),
    action: auditLogActionSchema,
    target_type: z.string().min(1, 'Target type is required'),
    target_id: z.string().min(1, 'Target ID is required'),
    description: z.string().min(1, 'Description is required'),
    metadata: z.record(z.string(), z.unknown()).optional(),
    ip_address: z.string().optional(),
  })
  .strict();

export type CreateAuditLogIn = z.infer<typeof createAuditLogInSchema>;
