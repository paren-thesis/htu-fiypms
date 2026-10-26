'use server';

// export const runtime = 'nodejs';

import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { HttpError } from '@/lib/errors';
import { writeAudit, writeAuditInTx } from '@/lib/audit';
import { getCurrentAcademicYear } from '@/lib/models/academic-year/repo';
import type {
  RosterStudentDocument,
  StaffWhitelistDocument,
  UserDocument,
} from '@/types/firestore';

export interface CompleteSignupResult {
  ok: boolean;
  activeRole?: string;
  registered?: boolean;
  profileComplete?: boolean;
  course_id?: string;
  code?: string;
  error?: string;
}

/**
 * Server Action executing First Sign-In Roster & Whitelist linkage (Spec §5.2).
 * Enforces institutional domain gating, links UID (write-once), creates UserDocument,
 * and sets custom user claims.
 *
 * @param input Raw ID token or { idToken }
 */
export async function completeSignup(
  input: string | { idToken: string }
): Promise<CompleteSignupResult> {
  const idToken = typeof input === 'string' ? input : input?.idToken;

  if (!idToken || typeof idToken !== 'string') {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing authentication token');
  }

  // 1. Verify token
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token');
  }

  const uid = decoded.uid;
  const email = decoded.email?.toLowerCase();

  // 2. Domain Gate: Must be verified @htu.edu.gh
  if (!email || !email.endsWith('@htu.edu.gh')) {
    throw new HttpError(
      403,
      'FORBIDDEN_DOMAIN',
      'Use your official HTU institutional account (@htu.edu.gh).'
    );
  }

  // 3. Branch on email pattern: 10 digits @htu.edu.gh -> Student path
  const isStudent = /^[0-9]{10}@htu\.edu\.gh$/i.test(email);

  if (isStudent) {
    const indexNumber = email.split('@')[0]!;
    const currentYear = await getCurrentAcademicYear();

    if (!currentYear) {
      throw new HttpError(
        500,
        'NO_ACTIVE_ACADEMIC_YEAR',
        'No active academic year configured. Contact the administrator.'
      );
    }

    const rosterRef = adminDb
      .collection('rosters')
      .doc(currentYear.id)
      .collection('students')
      .doc(indexNumber);

    const userRef = adminDb.collection('users').doc(uid);

    let notFound = false;
    let studentCourseId: string | undefined;
    let studentConflictUid: string | undefined;

    await adminDb.runTransaction(async (tx) => {
      const rosterSnap = await tx.get(rosterRef);
      const userSnap = await tx.get(userRef);

      if (!rosterSnap.exists) {
        notFound = true;
        return;
      }

      const rosterData = rosterSnap.data() as RosterStudentDocument;
      studentCourseId = rosterData.course_id;

      if (rosterData.user_uid === null || rosterData.user_uid === undefined) {
        // First sign-in: Link UID (write-once)
        tx.update(rosterRef, {
          user_uid: uid,
          signup_completed_at: FieldValue.serverTimestamp(),
        });

        const userData: Record<string, unknown> = {
          uid,
          name: (decoded.name as string) || rosterData.full_name || indexNumber,
          email,
          role: 'student',
          roles: ['student'],
          active_role: 'student',
          profile: {
            index_number: indexNumber,
            course_id: rosterData.course_id,
            registered: true,
            profile_complete: true,
          },
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        };

        tx.set(userRef, userData, { merge: true });

        writeAuditInTx(tx, {
          actor: { uid, email, role: 'student' },
          action: 'student.signup_completed',
          target_type: 'user',
          target_id: uid,
          details: `Student ${indexNumber} completed signup and linked roster entry`,
          metadata: { index_number: indexNumber, course_id: rosterData.course_id },
        });
      } else if (rosterData.user_uid === uid) {
        // Idempotent re-sign in
        if (!userSnap.exists) {
          tx.set(userRef, {
            uid,
            name: (decoded.name as string) || rosterData.full_name || indexNumber,
            email,
            role: 'student',
            roles: ['student'],
            active_role: 'student',
            profile: {
              index_number: indexNumber,
              course_id: rosterData.course_id,
              registered: true,
              profile_complete: true,
            },
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
          });
        }
      } else {
        // Identity conflict: Different UID attempting to link to already claimed index
        studentConflictUid = rosterData.user_uid ?? undefined;
      }
    });

    if (studentConflictUid) {
      await writeAudit({
        actor: { uid, email, role: 'student' },
        action: 'identity_conflict',
        target_type: 'roster',
        target_id: indexNumber,
        details: `Identity conflict: Index ${indexNumber} claimed by uid ${studentConflictUid}, attempted by ${uid}`,
        metadata: {
          index_number: indexNumber,
          attempted_uid: uid,
          existing_uid: studentConflictUid,
        },
      });

      throw new HttpError(
        409,
        'IDENTITY_CONFLICT',
        'This index is already linked to another account. Contact the coordinator.'
      );
    }

    if (notFound) {
      // Set registered:false claim so client is locked to /not-registered without deleting user
      await adminAuth.setCustomUserClaims(uid, {
        roles: ['student'],
        activeRole: 'student',
        registered: false,
        profileComplete: false,
      });

      return {
        ok: false,
        code: 'NOT_REGISTERED',
        error: 'Not in current final-year cohort. Contact your coordinator.',
      };
    }

    // Set claims for verified student
    await adminAuth.setCustomUserClaims(uid, {
      roles: ['student'],
      activeRole: 'student',
      registered: true,
      profileComplete: true,
      course_id: studentCourseId,
    });

    return {
      ok: true,
      activeRole: 'student',
      registered: true,
      profileComplete: true,
      course_id: studentCourseId,
    };
  } else {
    // Faculty / Staff path
    const staffRef = adminDb.collection('staff_whitelist').doc(email);
    const userRef = adminDb.collection('users').doc(uid);

    let notFoundOrInactive = false;
    let staffDataOut: StaffWhitelistDocument | null = null;
    let isProfileCompleteOut = false;
    let staffConflictUid: string | undefined;

    await adminDb.runTransaction(async (tx) => {
      const staffSnap = await tx.get(staffRef);
      const userSnap = await tx.get(userRef);

      if (!staffSnap.exists || staffSnap.data()?.is_active === false) {
        notFoundOrInactive = true;
        return;
      }

      const staffData = staffSnap.data() as StaffWhitelistDocument;
      staffDataOut = staffData;

      if (staffData.user_uid && staffData.user_uid !== uid) {
        staffConflictUid = staffData.user_uid;
        return;
      }

      if (!staffData.user_uid) {
        tx.update(staffRef, {
          user_uid: uid,
          last_signin_at: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(staffRef, {
          last_signin_at: FieldValue.serverTimestamp(),
        });
      }

      const isProfileComplete =
        userSnap.exists &&
        (userSnap.data() as UserDocument)?.profile?.profile_complete === true;
      isProfileCompleteOut = isProfileComplete;

      const primaryRole = (staffData.roles?.[0] as UserDocument['role']) || 'supervisor';

      const staffUserData: Record<string, unknown> = {
        uid,
        name: (decoded.name as string) || staffData.full_name || 'Faculty Member',
        email,
        role: primaryRole,
        roles: staffData.roles || ['supervisor'],
        active_role: primaryRole,
        profile: {
          programmes: staffData.programmes || [],
          registered: true,
          profile_complete: isProfileComplete,
        },
        updated_at: FieldValue.serverTimestamp(),
      };

      if (!userSnap.exists) {
        staffUserData.created_at = FieldValue.serverTimestamp();
      }

      tx.set(userRef, staffUserData, { merge: true });

      writeAuditInTx(tx, {
        actor: { uid, email, role: primaryRole },
        action: 'faculty.signup_completed',
        target_type: 'user',
        target_id: uid,
        details: `Faculty ${email} linked account to staff whitelist`,
        metadata: { roles: staffData.roles },
      });
    });

    if (staffConflictUid) {
      await writeAudit({
        actor: { uid, email, role: 'supervisor' },
        action: 'identity_conflict',
        target_type: 'staff_whitelist',
        target_id: email,
        details: `Staff email ${email} claimed by ${staffConflictUid}, attempted by ${uid}`,
        metadata: {
          email,
          attempted_uid: uid,
          existing_uid: staffConflictUid,
        },
      });

      throw new HttpError(
        409,
        'IDENTITY_CONFLICT',
        'This staff email is already linked to another account.'
      );
    }

    if (notFoundOrInactive || !staffDataOut) {
      await adminAuth.setCustomUserClaims(uid, {
        roles: ['supervisor'],
        activeRole: 'supervisor',
        registered: false,
        profileComplete: false,
      });

      return {
        ok: false,
        code: 'NOT_REGISTERED',
        error:
          'Not a registered supervisor for this semester. Contact your coordinator/HoD.',
      };
    }

    const resolvedStaff = staffDataOut as StaffWhitelistDocument;
    const activeRole = resolvedStaff.roles?.[0] || 'supervisor';

    await adminAuth.setCustomUserClaims(uid, {
      roles: resolvedStaff.roles || ['supervisor'],
      activeRole,
      registered: true,
      profileComplete: isProfileCompleteOut,
    });

    return {
      ok: true,
      activeRole,
      registered: true,
      profileComplete: isProfileCompleteOut,
    };
  }
}
