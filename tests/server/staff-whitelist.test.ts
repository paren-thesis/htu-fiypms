import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import {
  addStaffWhitelistEntry,
  updateStaffWhitelistEntry,
  deactivateStaffWhitelistEntry,
  reactivateStaffWhitelistEntry,
  fetchStaffWhitelistEntries,
} from '@/app/actions/manage-staff-whitelist';
import { completeSignup } from '@/app/actions/complete-signup';
import { getStaffWhitelist } from '@/lib/models/staff-whitelist/repo';
import { HttpError } from '@/lib/errors';
import { ZodError } from 'zod';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

async function getEmulatorIdToken(
  uid: string,
  email: string,
  claims?: { roles: string[]; activeRole: string; registered?: boolean }
): Promise<string> {
  try {
    const existing = await adminAuth.getUserByEmail(email);
    await adminAuth.deleteUser(existing.uid);
  } catch {
    // Ignore
  }

  try {
    await adminAuth.deleteUser(uid);
  } catch {
    // Ignore
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: email.split('@')[0],
    emailVerified: true,
  });

  if (claims) {
    await adminAuth.setCustomUserClaims(uid, {
      roles: claims.roles,
      activeRole: claims.activeRole,
      registered: claims.registered ?? true,
      profileComplete: true,
    });
  }

  const customToken = await adminAuth.createCustomToken(uid);

  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = (await response.json()) as { idToken: string };
  return data.idToken;
}

describe('Server Action: manage-staff-whitelist (Spec FR-01.7, FR-01.11, D-05)', () => {
  const coordinatorUid = 'coord-user-whitelist-test';
  const coordinatorEmail = 'coord.whitelist@htu.edu.gh';

  const supervisorUid = 'sup-user-whitelist-test';
  const supervisorEmail = 'sup.whitelist@htu.edu.gh';

  let coordinatorToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    // Seed coordinator whitelist doc so requireUser succeeds
    await adminDb.collection('staff_whitelist').doc(coordinatorEmail).set({
      email: coordinatorEmail,
      full_name: 'Lead Coordinator',
      roles: ['coordinator', 'supervisor'],
      department: 'Computer Science',
      programmes: ['btech-cs', 'btech-ict'],
      is_active: true,
      added_by_uid: 'system',
      added_at: new Date(),
      user_uid: coordinatorUid,
    });

    coordinatorToken = await getEmulatorIdToken(coordinatorUid, coordinatorEmail, {
      roles: ['coordinator', 'supervisor'],
      activeRole: 'coordinator',
      registered: true,
    });

    supervisorToken = await getEmulatorIdToken(supervisorUid, supervisorEmail, {
      roles: ['supervisor'],
      activeRole: 'supervisor',
      registered: true,
    });
  });

  it('1. Email validation: rejects non-HTU domains and student index numbers', async () => {
    // Non-HTU domain
    await expect(
      addStaffWhitelistEntry({
        idToken: coordinatorToken,
        email: 'lecturer@gmail.com',
        full_name: 'Dr. External',
        roles: ['supervisor'],
        department: 'Computer Science',
        programmes: ['btech-cs'],
      })
    ).rejects.toThrow(ZodError);

    // Student index number email
    await expect(
      addStaffWhitelistEntry({
        idToken: coordinatorToken,
        email: '0323080281@htu.edu.gh',
        full_name: 'Student Index',
        roles: ['supervisor'],
        department: 'Computer Science',
        programmes: ['btech-cs'],
      })
    ).rejects.toThrow(ZodError);
  });

  it('2. Non-coordinator/admin role is rejected with 403 (D-05)', async () => {
    // Supervisor attempts to add a colleague
    let thrownError: unknown;
    try {
      await addStaffWhitelistEntry({
        idToken: supervisorToken,
        email: 'newsupervisor@htu.edu.gh',
        full_name: 'New Colleague',
        roles: ['supervisor'],
        department: 'Computer Science',
        programmes: ['btech-cs'],
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    expect((thrownError as HttpError).status).toBe(403);
    expect((thrownError as HttpError).code).toBe('FORBIDDEN_ROLE');

    // Supervisor attempts to deactivate
    try {
      await deactivateStaffWhitelistEntry({
        idToken: supervisorToken,
        email: coordinatorEmail,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    expect((thrownError as HttpError).status).toBe(403);
  });

  it('3. Duplicate add returns 409 conflict', async () => {
    const targetEmail = `duplicate.${Date.now()}@htu.edu.gh`;

    // First add succeeds
    const res1 = await addStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: targetEmail,
      full_name: 'Prof. Unique',
      roles: ['supervisor'],
      department: 'Computer Science',
      programmes: ['btech-cs'],
    });
    expect(res1.ok).toBe(true);

    // Second add with same email must fail with 409
    let thrownError: unknown;
    try {
      await addStaffWhitelistEntry({
        idToken: coordinatorToken,
        email: targetEmail,
        full_name: 'Prof. Duplicate',
        roles: ['supervisor'],
        department: 'Computer Science',
        programmes: ['btech-cs'],
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    expect((thrownError as HttpError).status).toBe(409);
    expect((thrownError as HttpError).code).toBe('STAFF_ALREADY_EXISTS');
  });

  it('4. Self-deactivation and self-demotion are blocked with 403', async () => {
    // Coordinator cannot deactivate themselves
    let thrownError: unknown;
    try {
      await deactivateStaffWhitelistEntry({
        idToken: coordinatorToken,
        email: coordinatorEmail,
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    expect((thrownError as HttpError).status).toBe(403);
    expect((thrownError as HttpError).code).toBe('SELF_DEACTIVATION_FORBIDDEN');

    // Coordinator cannot remove their own coordinator role
    try {
      await updateStaffWhitelistEntry({
        idToken: coordinatorToken,
        email: coordinatorEmail,
        patch: {
          roles: ['supervisor'], // coordinator omitted
        },
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    expect((thrownError as HttpError).status).toBe(403);
    expect((thrownError as HttpError).code).toBe('SELF_DEMOTION_FORBIDDEN');
  });

  it('5. Full Lifecycle: add -> first sign-in (02-03) -> deactivate (revokes session) -> reactivate', async () => {
    const facultyEmail = `lifecycle.${Date.now()}@htu.edu.gh`;
    const facultyUid = `faculty-lifecycle-${Date.now()}`;

    // 1. Coordinator adds faculty to whitelist
    const addRes = await addStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: facultyEmail,
      full_name: 'Dr. Lifecycle Faculty',
      roles: ['supervisor', 'panel_member'],
      department: 'Computer Science',
      programmes: ['btech-cs', 'hnd-cs'],
      phone: '+233241234567',
    });
    expect(addRes.ok).toBe(true);

    const docBefore = await getStaffWhitelist(facultyEmail);
    expect(docBefore).not.toBeNull();
    expect(docBefore?.is_active).toBe(true);
    expect(docBefore?.user_uid).toBeNull();

    // 2. Faculty signs in for the first time via completeSignup
    const facultyToken = await getEmulatorIdToken(facultyUid, facultyEmail);
    const signupRes = await completeSignup(facultyToken);
    expect(signupRes.ok).toBe(true);
    expect(signupRes.activeRole).toBe('supervisor');
    expect(signupRes.profileComplete).toBe(false);

    // Whitelist doc now linked with user_uid
    const docAfterSignup = await getStaffWhitelist(facultyEmail);
    expect(docAfterSignup?.user_uid).toBe(facultyUid);

    // 3. Coordinator updates details
    const updateRes = await updateStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: facultyEmail,
      patch: {
        full_name: 'Prof. Lifecycle Faculty Updated',
        programmes: ['btech-cs', 'btech-ict', 'hnd-cs'],
      },
    });
    expect(updateRes.ok).toBe(true);

    const docAfterUpdate = await getStaffWhitelist(facultyEmail);
    expect(docAfterUpdate?.full_name).toBe('Prof. Lifecycle Faculty Updated');
    expect(docAfterUpdate?.programmes).toContain('btech-ict');

    // 4. Coordinator deactivates faculty -> sets is_active false and revokes tokens
    const deactivateRes = await deactivateStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: facultyEmail,
    });
    expect(deactivateRes.ok).toBe(true);

    const docDeactivated = await getStaffWhitelist(facultyEmail);
    expect(docDeactivated?.is_active).toBe(false);

    // Verify custom claims reflect registered: false
    const userRecord = await adminAuth.getUser(facultyUid);
    expect(userRecord.customClaims?.registered).toBe(false);

    // 5. Coordinator reactivates faculty
    const reactivateRes = await reactivateStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: facultyEmail,
    });
    expect(reactivateRes.ok).toBe(true);

    const docReactivated = await getStaffWhitelist(facultyEmail);
    expect(docReactivated?.is_active).toBe(true);

    const userRecordReactivated = await adminAuth.getUser(facultyUid);
    expect(userRecordReactivated.customClaims?.registered).toBe(true);

    // 6. Coordinator can list entries
    const listRes = await fetchStaffWhitelistEntries({
      idToken: coordinatorToken,
      filters: { programme: 'btech-cs' },
    });
    expect(listRes.ok).toBe(true);
    expect(listRes.data?.some((d) => d.email === facultyEmail)).toBe(true);
  });
});
