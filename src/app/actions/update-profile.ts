'use server';

//export const runtime = 'nodejs';

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { HttpError } from '@/lib/errors';
import { writeAuditInTx } from '@/lib/audit';
import { getCurrentAcademicYear } from '@/lib/models/academic-year/repo';
import { ensureSupervisionDoc } from '@/lib/models/supervision';

const updateProfileInputSchema = z
  .object({
    idToken: z.string().min(1, 'Token is required'),
    office_location: z.string().trim().optional(),
    consultation_hours: z.string().trim().optional(),
    research_interests: z.array(z.string()).optional(),
    max_team_capacity: z.number().int().min(1).default(5).optional(),
    phone: z.string().trim().optional(),
    course_id: z.string().optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export interface UpdateProfileResult {
  ok: boolean;
  profileComplete: boolean;
}

/**
 * Server Action executing profile updates with strict field allow-listing (Spec §5.2, FR-01.9, F-02, F-03).
 *
 * Rules:
 * - Students cannot set faculty fields and cannot change course_id (returns 403).
 * - Faculty: research_interests (sanitized lower/trimmed) and max_team_capacity go to users.profile.
 * - Gated contact details (office_location, consultation_hours, phone) go ONLY to supervisor_contacts/{uid}.
 * - Sets profile_complete: true in users doc and sets custom claim profileComplete: true.
 */
export async function updateProfile(
  input: UpdateProfileInput
): Promise<UpdateProfileResult> {
  const parsed = updateProfileInputSchema.parse(input);

  // 1. Authenticate & verify identity
  const authUser = await requireUser(parsed.idToken);

  // 2. Reject any attempt to modify course_id
  if (parsed.course_id !== undefined) {
    throw new HttpError(
      403,
      'FORBIDDEN_IMMUTABLE_FIELD',
      'Course track is determined by the official cohort roster and cannot be changed.'
    );
  }

  // 3. Student role authorization check
  const isStudent =
    authUser.activeRole === 'student' ||
    (authUser.roles.includes('student') &&
      !authUser.roles.some((r) =>
        ['supervisor', 'coordinator', 'admin', 'panel_member'].includes(r)
      ));

  if (isStudent) {
    if (
      parsed.office_location !== undefined ||
      parsed.consultation_hours !== undefined ||
      parsed.research_interests !== undefined ||
      parsed.max_team_capacity !== undefined ||
      parsed.phone !== undefined
    ) {
      throw new HttpError(
        403,
        'FORBIDDEN_FACULTY_FIELDS',
        'Students are not authorized to update faculty profile fields.'
      );
    }

    return {
      ok: true,
      profileComplete: true,
    };
  }

  // 4. Faculty Profile Completion: require mandatory fields
  if (!parsed.office_location || !parsed.office_location.trim()) {
    throw new HttpError(
      400,
      'MISSING_OFFICE_LOCATION',
      'Office location is required for faculty profile completion.'
    );
  }

  if (!parsed.consultation_hours || !parsed.consultation_hours.trim()) {
    throw new HttpError(
      400,
      'MISSING_CONSULTATION_HOURS',
      'Consultation hours are required for faculty profile completion.'
    );
  }

  const capacity = parsed.max_team_capacity ?? 5;
  if (capacity < 1) {
    throw new HttpError(
      400,
      'INVALID_CAPACITY',
      'Maximum team capacity must be at least 1.'
    );
  }

  // Sanitize research interests: trimmed and lowercased
  const sanitizedInterests = (parsed.research_interests || [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  const userRef = adminDb.collection('users').doc(authUser.uid);
  const contactRef = adminDb.collection('supervisor_contacts').doc(authUser.uid);

  // 5. Transactional update: users.profile + supervisor_contacts
  await adminDb.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'User record not found.');
    }

    // Update users.profile (NEVER write office_location, consultation_hours, or phone here)
    tx.update(userRef, {
      'profile.research_interests': sanitizedInterests,
      'profile.max_team_capacity': capacity,
      'profile.profile_complete': true,
      updated_at: FieldValue.serverTimestamp(),
    });

    // Write gated contact details exclusively to supervisor_contacts/{uid}
    tx.set(
      contactRef,
      {
        supervisor_id: authUser.uid,
        office_location: parsed.office_location!.trim(),
        consultation_hours: parsed.consultation_hours!.trim(),
        phone: parsed.phone ? parsed.phone.trim() : null,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Audit log
    writeAuditInTx(tx, {
      actor: {
        uid: authUser.uid,
        email: authUser.email,
        role: authUser.activeRole,
        activeRole: authUser.activeRole,
      },
      action: 'profile.completed',
      target_type: 'user',
      target_id: authUser.uid,
      details: `Faculty profile completed for ${authUser.email}`,
      metadata: {
        research_interests: sanitizedInterests,
        max_team_capacity: capacity,
      },
    });
  });

  // 6. Update Firebase Auth custom claims: set profileComplete: true
  const userRecord = await adminAuth.getUser(authUser.uid);
  const currentClaims = userRecord.customClaims || {};

  await adminAuth.setCustomUserClaims(authUser.uid, {
    ...currentClaims,
    profileComplete: true,
  });

  // 7. If user is a supervisor, ensure supervision document for current academic year
  if (authUser.roles.includes('supervisor') || authUser.activeRole === 'supervisor') {
    const activeYear = await getCurrentAcademicYear();
    if (activeYear) {
      await ensureSupervisionDoc(authUser.uid, activeYear.id, capacity);
    }
  }

  return {
    ok: true,
    profileComplete: true,
  };
}
