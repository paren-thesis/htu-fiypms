'use server';

// export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { toActionError, HttpError } from '@/lib/errors';
import { writeAudit } from '@/lib/audit';
import {
  RUBRICS_COLLECTION,
  getRubric,
  hasEvaluationsForRubric,
} from '@/lib/models/rubric/repo';
import {
  createRubricInSchema,
  rubricCriterionSchema,
  type CreateRubricIn,
} from '@/lib/models/rubric/schema';
import { validateRubric } from '@/lib/rubrics/validate';
import type { RubricDocument } from '@/types/firestore';

export interface ManageRubricResult {
  ok: boolean;
  rubricId?: string;
  rubric?: RubricDocument;
  error?: string;
  code?: string;
  errors?: string[];
}

const rubricIdInputSchema = z
  .object({
    rubric_id: z.string().trim().min(1, 'Rubric ID is required'),
  })
  .strict();

const duplicateRubricInputSchema = z
  .object({
    rubric_id: z.string().trim().min(1, 'Rubric ID is required'),
    new_title: z.string().trim().optional(),
  })
  .strict();

const updateRubricActionInputSchema = z
  .object({
    rubric_id: z.string().trim().min(1, 'Rubric ID is required'),
    title: z.string().trim().min(1).optional(),
    max_score: z.number().int().positive().optional(),
    supervisor_weight_pct: z.number().min(0).max(100).optional(),
    panel_weight_pct: z.number().min(0).max(100).optional(),
    criteria: z.array(rubricCriterionSchema).min(1).optional(),
  })
  .strict();

/**
 * Server Action: Create a new rubric.
 * Gated to coordinator and admin roles.
 */
export async function createRubric(
  idTokenOrInput: string | (CreateRubricIn & { idToken: string }),
  maybeInput?: CreateRubricIn
): Promise<ManageRubricResult> {
  try {
    let idToken: string;
    let rawInput: CreateRubricIn;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as CreateRubricIn;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = createRubricInSchema.parse(rawInput);

    // Validation (pure)
    const valResult = validateRubric(input);
    if (!valResult.valid) {
      return {
        ok: false,
        error: valResult.errors.join('; '),
        errors: valResult.errors,
        code: 'VALIDATION_ERROR',
      };
    }

    const ref = adminDb.collection(RUBRICS_COLLECTION).doc();
    const rubricData = {
      title: input.title,
      max_score: input.max_score,
      supervisor_weight_pct: input.supervisor_weight_pct,
      panel_weight_pct: input.panel_weight_pct,
      is_active: false,
      is_archived: false,
      criteria: input.criteria,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await ref.set(rubricData);

    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'rubric.created',
      target_type: 'rubric',
      target_id: ref.id,
      description: `Created rubric '${input.title}' (${input.max_score} pts, ${input.supervisor_weight_pct}/${input.panel_weight_pct} split)`,
      metadata: {
        max_score: input.max_score,
        supervisor_weight_pct: input.supervisor_weight_pct,
        panel_weight_pct: input.panel_weight_pct,
        criteria_count: input.criteria.length,
      },
    });

    const snap = await ref.get();
    const createdRubric = { id: ref.id, ...(snap.data() as Omit<RubricDocument, 'id'>) };

    return {
      ok: true,
      rubricId: ref.id,
      rubric: createdRubric,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

/**
 * Server Action: Update an existing rubric.
 * Gated to coordinator and admin roles.
 * Blocked (409) if any evaluation references this rubric.
 */
export async function updateRubric(
  idTokenOrInput:
    | string
    | (z.infer<typeof updateRubricActionInputSchema> & { idToken: string }),
  maybeInput?: z.infer<typeof updateRubricActionInputSchema>
): Promise<ManageRubricResult> {
  try {
    let idToken: string;
    let rawInput: z.infer<typeof updateRubricActionInputSchema>;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as z.infer<typeof updateRubricActionInputSchema>;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = updateRubricActionInputSchema.parse(rawInput);

    // 1. Guard against updating a rubric with existing evaluations (Spec: return 409)
    const inUse = await hasEvaluationsForRubric(input.rubric_id);
    if (inUse) {
      throw new HttpError(
        409,
        'RUBRIC_IN_USE',
        'Cannot update rubric: existing student evaluations reference this rubric.'
      );
    }

    // 2. Fetch existing rubric
    const existing = await getRubric(input.rubric_id);
    if (!existing) {
      throw new HttpError(404, 'NOT_FOUND', 'Rubric not found.');
    }
    if (existing.is_archived) {
      throw new HttpError(400, 'BAD_REQUEST', 'Cannot modify an archived rubric.');
    }

    // 3. Merge fields and validate
    const merged = {
      title: input.title ?? existing.title,
      max_score: input.max_score ?? existing.max_score,
      supervisor_weight_pct: input.supervisor_weight_pct ?? existing.supervisor_weight_pct,
      panel_weight_pct: input.panel_weight_pct ?? existing.panel_weight_pct,
      criteria: input.criteria ?? existing.criteria,
    };

    const valResult = validateRubric(merged);
    if (!valResult.valid) {
      return {
        ok: false,
        error: valResult.errors.join('; '),
        errors: valResult.errors,
        code: 'VALIDATION_ERROR',
      };
    }

    const ref = adminDb.collection(RUBRICS_COLLECTION).doc(input.rubric_id);
    await ref.update({
      ...merged,
      updated_at: FieldValue.serverTimestamp(),
    });

    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'rubric.updated',
      target_type: 'rubric',
      target_id: input.rubric_id,
      description: `Updated rubric '${merged.title}'`,
      metadata: {
        rubric_id: input.rubric_id,
        updated_fields: Object.keys(input).filter((k) => k !== 'rubric_id'),
      },
    });

    const updatedSnap = await ref.get();
    const updatedRubric = {
      id: ref.id,
      ...(updatedSnap.data() as Omit<RubricDocument, 'id'>),
    };

    return {
      ok: true,
      rubricId: input.rubric_id,
      rubric: updatedRubric,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

/**
 * Server Action: Duplicate an existing rubric.
 * Gated to coordinator and admin roles.
 */
export async function duplicateRubric(
  idTokenOrInput:
    | string
    | (z.infer<typeof duplicateRubricInputSchema> & { idToken: string }),
  maybeInput?: z.infer<typeof duplicateRubricInputSchema>
): Promise<ManageRubricResult> {
  try {
    let idToken: string;
    let rawInput: z.infer<typeof duplicateRubricInputSchema>;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as z.infer<typeof duplicateRubricInputSchema>;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = duplicateRubricInputSchema.parse(rawInput);

    const source = await getRubric(input.rubric_id);
    if (!source) {
      throw new HttpError(404, 'NOT_FOUND', 'Source rubric not found.');
    }

    const newTitle = input.new_title || `${source.title} (Copy)`;

    const ref = adminDb.collection(RUBRICS_COLLECTION).doc();
    const duplicateData = {
      title: newTitle,
      max_score: source.max_score,
      supervisor_weight_pct: source.supervisor_weight_pct,
      panel_weight_pct: source.panel_weight_pct,
      is_active: false,
      is_archived: false,
      criteria: source.criteria.map((c) => ({ ...c })),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    };

    await ref.set(duplicateData);

    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'rubric.duplicated',
      target_type: 'rubric',
      target_id: ref.id,
      description: `Duplicated rubric '${source.title}' to '${newTitle}'`,
      metadata: {
        source_rubric_id: input.rubric_id,
        new_rubric_id: ref.id,
      },
    });

    const snap = await ref.get();
    const createdRubric = { id: ref.id, ...(snap.data() as Omit<RubricDocument, 'id'>) };

    return {
      ok: true,
      rubricId: ref.id,
      rubric: createdRubric,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

/**
 * Server Action: Activate a rubric.
 * Gated to coordinator and admin roles.
 * Transactional: Ensures strictly ONE active rubric exists in the collection.
 */
export async function activateRubric(
  idTokenOrInput: string | (z.infer<typeof rubricIdInputSchema> & { idToken: string }),
  maybeInput?: z.infer<typeof rubricIdInputSchema>
): Promise<ManageRubricResult> {
  try {
    let idToken: string;
    let rawInput: z.infer<typeof rubricIdInputSchema>;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as z.infer<typeof rubricIdInputSchema>;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = rubricIdInputSchema.parse(rawInput);

    let activatedTitle = '';

    await adminDb.runTransaction(async (tx) => {
      const targetRef = adminDb.collection(RUBRICS_COLLECTION).doc(input.rubric_id);
      const targetSnap = await tx.get(targetRef);

      if (!targetSnap.exists) {
        throw new HttpError(404, 'NOT_FOUND', 'Rubric not found.');
      }

      const targetData = targetSnap.data() as RubricDocument;
      if (targetData.is_archived) {
        throw new HttpError(400, 'BAD_REQUEST', 'Cannot activate an archived rubric.');
      }

      activatedTitle = targetData.title;

      // Query all currently active rubrics
      const activeQuery = adminDb
        .collection(RUBRICS_COLLECTION)
        .where('is_active', '==', true);
      const activeSnaps = await tx.get(activeQuery);

      // 1. Deactivate any existing active rubric
      for (const doc of activeSnaps.docs) {
        if (doc.id !== input.rubric_id) {
          tx.update(doc.ref, {
            is_active: false,
            updated_at: FieldValue.serverTimestamp(),
          });
        }
      }

      // 2. Set target rubric active
      tx.update(targetRef, {
        is_active: true,
        updated_at: FieldValue.serverTimestamp(),
      });
    });

    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'rubric.activated',
      target_type: 'rubric',
      target_id: input.rubric_id,
      description: `Activated defense grading rubric '${activatedTitle}'`,
      metadata: {
        rubric_id: input.rubric_id,
        title: activatedTitle,
      },
    });

    return {
      ok: true,
      rubricId: input.rubric_id,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

/**
 * Server Action: Archive a rubric.
 * Gated to coordinator and admin roles.
 * Blocked (409) if any evaluation references this rubric.
 */
export async function archiveRubric(
  idTokenOrInput: string | (z.infer<typeof rubricIdInputSchema> & { idToken: string }),
  maybeInput?: z.infer<typeof rubricIdInputSchema>
): Promise<ManageRubricResult> {
  try {
    let idToken: string;
    let rawInput: z.infer<typeof rubricIdInputSchema>;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as z.infer<typeof rubricIdInputSchema>;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = rubricIdInputSchema.parse(rawInput);

    // 1. Guard against archiving a rubric that has evaluations (Spec: return 409)
    const inUse = await hasEvaluationsForRubric(input.rubric_id);
    if (inUse) {
      throw new HttpError(
        409,
        'RUBRIC_IN_USE',
        'Cannot archive rubric: existing student evaluations reference this rubric.'
      );
    }

    const ref = adminDb.collection(RUBRICS_COLLECTION).doc(input.rubric_id);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpError(404, 'NOT_FOUND', 'Rubric not found.');
    }

    const data = snap.data() as RubricDocument;

    await ref.update({
      is_archived: true,
      is_active: false,
      updated_at: FieldValue.serverTimestamp(),
    });

    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'rubric.archived',
      target_type: 'rubric',
      target_id: input.rubric_id,
      description: `Archived rubric '${data.title}'`,
      metadata: {
        rubric_id: input.rubric_id,
      },
    });

    return {
      ok: true,
      rubricId: input.rubric_id,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}

/**
 * Server Action: Delete a rubric.
 * Gated to coordinator and admin roles.
 * Blocked (409) if any evaluation references this rubric.
 */
export async function deleteRubric(
  idTokenOrInput: string | (z.infer<typeof rubricIdInputSchema> & { idToken: string }),
  maybeInput?: z.infer<typeof rubricIdInputSchema>
): Promise<ManageRubricResult> {
  try {
    let idToken: string;
    let rawInput: z.infer<typeof rubricIdInputSchema>;

    if (typeof idTokenOrInput === 'string') {
      idToken = idTokenOrInput;
      rawInput = maybeInput!;
    } else {
      const { idToken: token, ...rest } = idTokenOrInput;
      idToken = token;
      rawInput = rest as z.infer<typeof rubricIdInputSchema>;
    }

    if (!idToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication token is required.');
    }

    const user = await requireUser(idToken, ['coordinator', 'admin']);
    const input = rubricIdInputSchema.parse(rawInput);

    // 1. Guard against deleting a rubric that has evaluations (Spec: return 409)
    const inUse = await hasEvaluationsForRubric(input.rubric_id);
    if (inUse) {
      throw new HttpError(
        409,
        'RUBRIC_IN_USE',
        'Cannot delete rubric: existing student evaluations reference this rubric.'
      );
    }

    const ref = adminDb.collection(RUBRICS_COLLECTION).doc(input.rubric_id);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpError(404, 'NOT_FOUND', 'Rubric not found.');
    }

    const data = snap.data() as RubricDocument;
    await ref.delete();

    await writeAudit({
      actor: {
        uid: user.uid,
        email: user.email,
        name: (user.claims.name as string) || user.email,
        role: user.activeRole,
      },
      action: 'rubric.archived',
      target_type: 'rubric',
      target_id: input.rubric_id,
      description: `Deleted rubric '${data.title}'`,
      metadata: {
        rubric_id: input.rubric_id,
      },
    });

    return {
      ok: true,
      rubricId: input.rubric_id,
    };
  } catch (error) {
    const actionErr = toActionError(error);
    return {
      ok: false,
      error: actionErr.error,
      code: actionErr.code,
    };
  }
}
