import type { AuditLogDocument } from '@/types/firestore';
import {
  createAuditLog,
  createAuditLogInTx,
} from '@/lib/models/audit-log/repo';
import type { AuditLogAction, CreateAuditLogIn } from '@/lib/models/audit-log/schema';

export interface AuditActor {
  id?: string;
  uid?: string;
  name?: string;
  email?: string;
  role?: string;
  activeRole?: string;
}

export interface WriteAuditParams {
  actor: AuditActor;
  action: AuditLogAction;
  target_type: string;
  target_id: string;
  details?: string | Record<string, unknown>;
  description?: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
}

function normalizeAuditInput(params: WriteAuditParams): CreateAuditLogIn {
  const actorId = params.actor.uid || params.actor.id || 'system';
  const actorEmail = params.actor.email || `${actorId}@htu.edu.gh`;
  const actorName = params.actor.name || params.actor.email || actorId;
  const actorRole = params.actor.role || params.actor.activeRole || 'system';

  let description = params.description;
  let metadata = params.metadata;

  if (typeof params.details === 'string') {
    description = description || params.details;
  } else if (params.details && typeof params.details === 'object') {
    metadata = { ...(params.details as Record<string, unknown>), ...metadata };
  }

  if (!description) {
    description = `${params.action} on ${params.target_type}:${params.target_id}`;
  }

  return {
    actor_id: actorId,
    actor_name: actorName,
    actor_email: actorEmail,
    actor_role: actorRole,
    action: params.action,
    target_type: params.target_type,
    target_id: params.target_id,
    description,
    metadata,
    ip_address: params.ip_address,
  };
}

/**
 * Appends a record to the audit_logs collection.
 */
export async function writeAudit(
  params: WriteAuditParams
): Promise<AuditLogDocument> {
  const input = normalizeAuditInput(params);
  return createAuditLog(input);
}

/**
 * Appends a record to the audit_logs collection inside an existing Firestore transaction.
 */
export function writeAuditInTx(
  tx: FirebaseFirestore.Transaction,
  params: WriteAuditParams
): { id: string; ref: FirebaseFirestore.DocumentReference } {
  const input = normalizeAuditInput(params);
  return createAuditLogInTx(tx, input);
}
