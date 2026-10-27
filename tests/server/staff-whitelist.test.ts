import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
import { fx, staffUid } from '../../fixtures';
import { resetTestEmulator } from '../helpers/reset';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9199';

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
  const coordinatorEmail = 'coordinator@htu.edu.gh';
  const coordinatorUid = staffUid(coordinatorEmail);

  const supervisorEmail = 'kappiah@htu.edu.gh';
  const supervisorUid = staffUid(supervisorEmail);

  let coordinatorToken: string;
  let supervisorToken: string;

  beforeAll(async () => {
    const coordStaff = fx.staffByEmail(coordinatorEmail);
    await adminDb.collection('staff_whitelist').doc(coordinatorEmail).set({
      email: coordinatorEmail,
      full_name: coordStaff.full_name,
      roles: coordStaff.roles,
      department: coordStaff.department,
      programmes: coordStaff.programmes,
      is_active: true,
      added_by_uid: 'fixture',
      added_at: new Date(),
      user_uid: coordinatorUid,
    });

    const supStaff = fx.staffByEmail(supervisorEmail);
    await adminDb.collection('staff_whitelist').doc(supervisorEmail).set({
      email: supervisorEmail,
      full_name: supStaff.full_name,
      roles: supStaff.roles,
      department: supStaff.department,
      programmes: supStaff.programmes,
      is_active: true,
      added_by_uid: 'fixture',
      added_at: new Date(),
      user_uid: supervisorUid,
    });

    coordinatorToken = await getEmulatorIdToken(coordinatorUid, coordinatorEmail, {
      roles: coordStaff.roles,
      activeRole: 'coordinator',
      registered: true,
    });

    supervisorToken = await getEmulatorIdToken(supervisorUid, supervisorEmail, {
      roles: supStaff.roles,
      activeRole: 'supervisor',
      registered: true,
    });
  });

  afterAll(async () => {
    await resetTestEmulator();
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
        email: '0323000101@htu.edu.gh',
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
        email: 'aowusu@htu.edu.gh',
        full_name: 'Dr. Ama Owusu',
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
    const targetStaff = fx.staffByEmail('yboateng@htu.edu.gh');
    const targetEmail = targetStaff.email;

    // Clean up first if existing
    await adminDb.collection('staff_whitelist').doc(targetEmail).delete();

    // First add succeeds
    const res1 = await addStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: targetEmail,
      full_name: targetStaff.full_name,
      roles: targetStaff.roles as ('coordinator' | 'supervisor' | 'admin' | 'panel_member')[],
      department: targetStaff.department,
      programmes: targetStaff.programmes,
    });
    expect(res1.ok).toBe(true);

    // Second add with same email must fail with 409
    let thrownError: unknown;
    try {
      await addStaffWhitelistEntry({
        idToken: coordinatorToken,
        email: targetEmail,
        full_name: targetStaff.full_name,
        roles: targetStaff.roles as ('coordinator' | 'supervisor' | 'admin' | 'panel_member')[],
        department: targetStaff.department,
        programmes: targetStaff.programmes,
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

  it('5. Full Lifecycle: add -> first sign-in -> deactivate -> reactivate', async () => {
    const faculty = fx.staffByEmail('emensah@htu.edu.gh');
    const facultyEmail = faculty.email;
    const facultyUid = staffUid(facultyEmail);

    // Clean up if existing
    await adminDb.collection('staff_whitelist').doc(facultyEmail).delete();
    try {
      await adminAuth.deleteUser(facultyUid);
    } catch {
      // Ignore
    }

    // 1. Coordinator adds faculty to whitelist
    const addRes = await addStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: facultyEmail,
      full_name: faculty.full_name,
      roles: faculty.roles as ('coordinator' | 'supervisor' | 'admin' | 'panel_member')[],
      department: faculty.department,
      programmes: faculty.programmes,
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
    expect(signupRes.activeRole).toBe(faculty.roles[0]);
    expect(signupRes.profileComplete).toBe(false);

    // Whitelist doc now linked with user_uid
    const docAfterSignup = await getStaffWhitelist(facultyEmail);
    expect(docAfterSignup?.user_uid).toBe(facultyUid);

    // 3. Coordinator updates details
    const updateRes = await updateStaffWhitelistEntry({
      idToken: coordinatorToken,
      email: facultyEmail,
      patch: {
        full_name: 'Dr. Efua Mensah Updated',
        programmes: ['btech-cs', 'btech-ict', 'hnd-cs', 'hnd-ict'],
      },
    });
    expect(updateRes.ok).toBe(true);

    const docAfterUpdate = await getStaffWhitelist(facultyEmail);
    expect(docAfterUpdate?.full_name).toBe('Dr. Efua Mensah Updated');
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
