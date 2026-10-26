import { describe, it, expect } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { switchRole } from '@/app/actions/switch-role';
import { HttpError } from '@/lib/errors';
import type { AuditLogDocument } from '@/types/firestore';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

async function getEmulatorIdToken(
  uid: string,
  email: string,
  claims: Record<string, unknown>
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
    // Ignore if user does not exist
  }

  await adminAuth.createUser({
    uid,
    email,
    displayName: 'Faculty Member',
    emailVerified: true,
  });

  await adminAuth.setCustomUserClaims(uid, claims);
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

describe('Server Action: switchRole (Spec FR-01.3)', () => {
  it('1. allowed role switch: updates activeRole custom claim and logs to audit_logs', async () => {
    const uid = 'faculty-multi-role-1';
    const email = 'switch.multi@htu.edu.gh';
    const initialClaims = {
      roles: ['supervisor', 'coordinator'],
      activeRole: 'supervisor',
      registered: true,
      profileComplete: true,
    };

    const idToken = await getEmulatorIdToken(uid, email, initialClaims);

    // Switch from supervisor to coordinator
    const res = await switchRole({ idToken, role: 'coordinator' });

    expect(res.ok).toBe(true);
    expect(res.activeRole).toBe('coordinator');

    // Verify custom user claims updated in Firebase Auth
    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.customClaims?.activeRole).toBe('coordinator');
    expect(userRecord.customClaims?.roles).toEqual(['supervisor', 'coordinator']);
    expect(userRecord.customClaims?.registered).toBe(true);
    expect(userRecord.customClaims?.profileComplete).toBe(true);

    // Verify audit log entry
    const auditQuery = await adminDb
      .collection('audit_logs')
      .where('action', '==', 'user.role_switched')
      .where('target_id', '==', uid)
      .get();

    expect(auditQuery.empty).toBe(false);
    const auditDoc = auditQuery.docs[auditQuery.docs.length - 1]!.data() as AuditLogDocument;
    expect(auditDoc.action).toBe('user.role_switched');
    expect(auditDoc.actor_id).toBe(uid);
    expect(auditDoc.metadata?.previous_role).toBe('supervisor');
    expect(auditDoc.metadata?.new_role).toBe('coordinator');
  });

  it('2. forbidden role: returns 403 when requesting a role the user does not hold', async () => {
    const uid = 'faculty-single-role-2';
    const email = 'lecturer@htu.edu.gh';
    const initialClaims = {
      roles: ['supervisor'],
      activeRole: 'supervisor',
      registered: true,
      profileComplete: true,
    };

    const idToken = await getEmulatorIdToken(uid, email, initialClaims);

    let thrownError: unknown;
    try {
      await switchRole({ idToken, role: 'admin' });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    const httpErr = thrownError as HttpError;
    expect(httpErr.status).toBe(403);
    expect(httpErr.code).toBe('FORBIDDEN_ROLE');

    // Claims must not have changed
    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.customClaims?.activeRole).toBe('supervisor');
  });

  it('3. rejects switch request if account is not registered', async () => {
    const uid = 'unregistered-user-3';
    const email = 'unregistered@htu.edu.gh';
    const initialClaims = {
      roles: ['supervisor', 'coordinator'],
      activeRole: 'supervisor',
      registered: false,
      profileComplete: false,
    };

    const idToken = await getEmulatorIdToken(uid, email, initialClaims);

    let thrownError: unknown;
    try {
      await switchRole({ idToken, role: 'coordinator' });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    const httpErr = thrownError as HttpError;
    expect(httpErr.status).toBe(403);
    expect(httpErr.code).toBe('NOT_REGISTERED');
  });

  it('4. supports string overload switchRole(idToken, role)', async () => {
    const uid = 'faculty-overload-4';
    const email = 'examiner@htu.edu.gh';
    const initialClaims = {
      roles: ['supervisor', 'panel_member'],
      activeRole: 'supervisor',
      registered: true,
      profileComplete: true,
    };

    const idToken = await getEmulatorIdToken(uid, email, initialClaims);

    const res = await switchRole(idToken, 'panel_member');
    expect(res.ok).toBe(true);
    expect(res.activeRole).toBe('panel_member');

    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.customClaims?.activeRole).toBe('panel_member');
  });
});
