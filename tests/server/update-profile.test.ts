import { describe, it, expect } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { updateProfile } from '@/app/actions/update-profile';
import {
  getSupervisorContact,
  grantContactAccess,
  hasContactGrant,
  revokeContactAccess,
} from '@/lib/models/supervisor-contact/repo';
import { HttpError } from '@/lib/errors';
import type { UserDocument } from '@/types/firestore';

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
    // Ignore
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

describe('Server Action: updateProfile & supervisor_contacts (Spec FR-01.9, F-02, F-03)', () => {
  it('1. faculty profile completion: updates users.profile, writes supervisor_contacts, and mints profileComplete:true', async () => {
    const uid = 'faculty-prof-1';
    const email = 'profile.faculty1@htu.edu.gh';
    const initialClaims = {
      roles: ['supervisor'],
      activeRole: 'supervisor',
      registered: true,
      profileComplete: false,
    };

    // Pre-seed user in users collection
    await adminDb
      .collection('users')
      .doc(uid)
      .set({
        uid,
        name: 'Dr. Profile Tester',
        email,
        role: 'supervisor',
        roles: ['supervisor'],
        active_role: 'supervisor',
        profile: {
          registered: true,
          profile_complete: false,
          programmes: ['btech-cs'],
        },
      });

    const idToken = await getEmulatorIdToken(uid, email, initialClaims);

    const res = await updateProfile({
      idToken,
      office_location: 'Room 305, CS Block',
      consultation_hours: 'Mondays 2-4 PM',
      research_interests: ['  AI/ML ', ' Cloud Computing  ', 'CYBERSECURITY'],
      max_team_capacity: 6,
      phone: '+233 24 000 1122',
    });

    expect(res.ok).toBe(true);
    expect(res.profileComplete).toBe(true);

    // 1. Verify UserDocument in users collection
    const userDocSnap = await adminDb.collection('users').doc(uid).get();
    expect(userDocSnap.exists).toBe(true);
    const userDoc = userDocSnap.data() as UserDocument & Record<string, unknown>;

    expect(userDoc.profile.profile_complete).toBe(true);
    expect(userDoc.profile.max_team_capacity).toBe(6);
    // research_interests must be trimmed and lowercased
    expect(userDoc.profile.research_interests).toEqual([
      'ai/ml',
      'cloud computing',
      'cybersecurity',
    ]);

    // Rule F-03: Gated contact data NEVER lands in users
    const rawUserDoc = userDoc as unknown as Record<string, unknown>;
    const rawProfile = userDoc.profile as unknown as Record<string, unknown>;
    expect(rawUserDoc.office_location).toBeUndefined();
    expect(rawUserDoc.consultation_hours).toBeUndefined();
    expect(rawUserDoc.phone).toBeUndefined();
    expect(rawProfile.office_location).toBeUndefined();
    expect(rawProfile.consultation_hours).toBeUndefined();
    expect(rawProfile.phone).toBeUndefined();

    // 2. Verify SupervisorContactDocument in supervisor_contacts collection
    const contact = await getSupervisorContact(uid);
    expect(contact).not.toBeNull();
    expect(contact?.supervisor_id).toBe(uid);
    expect(contact?.office_location).toBe('Room 305, CS Block');
    expect(contact?.consultation_hours).toBe('Mondays 2-4 PM');
    expect(contact?.phone).toBe('+233 24 000 1122');

    // 3. Verify custom claims updated in Auth
    const userRecord = await adminAuth.getUser(uid);
    expect(userRecord.customClaims?.profileComplete).toBe(true);

    // 4. Verify audit_logs entry
    const auditQuery = await adminDb
      .collection('audit_logs')
      .where('action', '==', 'profile.completed')
      .where('target_id', '==', uid)
      .get();

    expect(auditQuery.empty).toBe(false);
  });

  it('2. student attempt to update faculty fields returns 403', async () => {
    const uid = 'student-prof-2';
    const email = '0323888001@htu.edu.gh';
    const claims = {
      roles: ['student'],
      activeRole: 'student',
      registered: true,
      profileComplete: true,
    };

    const idToken = await getEmulatorIdToken(uid, email, claims);

    let thrownError: unknown;
    try {
      await updateProfile({
        idToken,
        office_location: 'Student Dorm',
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    const httpErr = thrownError as HttpError;
    expect(httpErr.status).toBe(403);
    expect(httpErr.code).toBe('FORBIDDEN_FACULTY_FIELDS');
  });

  it('3. student attempt to change course_id returns 403', async () => {
    const uid = 'student-prof-3';
    const email = '0323888002@htu.edu.gh';
    const claims = {
      roles: ['student'],
      activeRole: 'student',
      registered: true,
      profileComplete: true,
    };

    const idToken = await getEmulatorIdToken(uid, email, claims);

    let thrownError: unknown;
    try {
      await updateProfile({
        idToken,
        course_id: 'btech-ict',
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(HttpError);
    const httpErr = thrownError as HttpError;
    expect(httpErr.status).toBe(403);
    expect(httpErr.code).toBe('FORBIDDEN_IMMUTABLE_FIELD');
  });

  it('4. supervisor contact grants subcollection helpers work correctly', async () => {
    const supervisorId = 'sup-grant-test-1';
    const studentId = 'stud-grant-test-1';
    const teamId = 'team-123';

    expect(await hasContactGrant(supervisorId, studentId)).toBe(false);

    // Grant access
    await grantContactAccess(supervisorId, studentId, teamId);
    expect(await hasContactGrant(supervisorId, studentId)).toBe(true);

    // Revoke access
    await revokeContactAccess(supervisorId, studentId);
    expect(await hasContactGrant(supervisorId, studentId)).toBe(false);
  });
});
