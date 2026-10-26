import { describe, it, expect, beforeAll } from 'vitest';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireUser } from '@/lib/auth/require-user';
import { HttpError, toActionError } from '@/lib/errors';
import { notify, notifyInTx } from '@/lib/notify';
import { writeAudit, writeAuditInTx } from '@/lib/audit';
import { listAuditLogs } from '@/lib/models/audit-log/repo';
import {
  timestampToMillis,
  timestampToIso,
  serializeTimestamps,
} from '@/lib/serialize';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

// Helper to create a user in Auth Emulator and exchange custom token for a real ID token
async function getEmulatorIdToken(
  uid: string,
  email: string,
  emailVerified: boolean,
  claims: Record<string, unknown>
): Promise<string> {
  try {
    await adminAuth.deleteUser(uid);
  } catch {
    // Ignore if user does not exist
  }

  await adminAuth.createUser({
    uid,
    email,
    emailVerified,
  });

  await adminAuth.setCustomUserClaims(uid, claims);
  const customToken = await adminAuth.createCustomToken(uid);

  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = (await response.json()) as { idToken: string };
  return data.idToken;
}

describe('Server Infrastructure: Errors & Serialization', () => {
  it('HttpError initializes with status, code, and message', () => {
    const err = new HttpError(403, 'FORBIDDEN_TEST', 'Access forbidden');
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN_TEST');
    expect(err.message).toBe('Access forbidden');
  });

  it('toActionError normalizes HttpError, ZodError, and general Errors', () => {
    const httpRes = toActionError(new HttpError(404, 'NOT_FOUND', 'Item not found'));
    expect(httpRes).toEqual({
      ok: false,
      error: 'Item not found',
      code: 'NOT_FOUND',
      status: 404,
    });

    const testSchema = z.object({ name: z.string().min(3) });
    const zodParseResult = testSchema.safeParse({ name: 'a' });
    if (!zodParseResult.success) {
      const zodRes = toActionError(zodParseResult.error);
      expect(zodRes.status).toBe(400);
      expect(zodRes.code).toBe('VALIDATION_ERROR');
      expect(zodRes.details).toBeDefined();
    }

    const genRes = toActionError(new Error('Boom'));
    expect(genRes).toEqual({
      ok: false,
      error: 'Boom',
      code: 'INTERNAL_ERROR',
      status: 500,
    });
  });

  it('serializeTimestamps converts Firestore Timestamps to ISO strings recursively', () => {
    const now = Timestamp.now();
    const isoString = now.toDate().toISOString();

    expect(timestampToMillis(now)).toBe(now.toMillis());
    expect(timestampToIso(now)).toBe(isoString);

    const complex = {
      id: 'doc-1',
      created_at: now,
      nested: {
        updated_at: now,
        count: 5,
      },
      list: [now, 'string-val'],
    };

    const serialized = serializeTimestamps(complex) as typeof complex;
    expect(serialized.created_at).toBe(isoString);
    expect((serialized.nested.updated_at as unknown) as string).toBe(isoString);
    expect((serialized.list[0] as unknown) as string).toBe(isoString);
    expect(serialized.list[1]).toBe('string-val');
  });
});

describe('Server Infrastructure: requireUser Auth Gate', () => {
  let validStudentToken: string;
  let unverifiedEmailToken: string;
  let wrongDomainToken: string;
  let unregisteredToken: string;
  let coordinatorToken: string;

  beforeAll(async () => {
    validStudentToken = await getEmulatorIdToken(
      'student-valid-1',
      '0323809921@htu.edu.gh',
      true,
      { registered: true, roles: ['student'], activeRole: 'student' }
    );

    unverifiedEmailToken = await getEmulatorIdToken(
      'student-unverified-1',
      '0323809922@htu.edu.gh',
      false,
      { registered: true, roles: ['student'], activeRole: 'student' }
    );

    wrongDomainToken = await getEmulatorIdToken(
      'user-gmail-1',
      'outsider@gmail.com',
      true,
      { registered: true, roles: ['student'], activeRole: 'student' }
    );

    unregisteredToken = await getEmulatorIdToken(
      'student-unreg-1',
      '0323809923@htu.edu.gh',
      true,
      { registered: false, roles: ['student'], activeRole: 'student' }
    );

    coordinatorToken = await getEmulatorIdToken(
      'coord-valid-1',
      'coord@htu.edu.gh',
      true,
      { registered: true, roles: ['coordinator'], activeRole: 'coordinator' }
    );
  });

  it('rejects missing or empty token with 401', async () => {
    await expect(requireUser('')).rejects.toThrowError(HttpError);
    await expect(requireUser('')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects invalid token string with 401', async () => {
    await expect(requireUser('invalid.jwt.token')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_TOKEN',
    });
  });

  it('rejects unverified email with 403 FORBIDDEN_DOMAIN', async () => {
    await expect(requireUser(unverifiedEmailToken)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN_DOMAIN',
    });
  });

  it('rejects non-HTU email domain with 403 FORBIDDEN_DOMAIN', async () => {
    await expect(requireUser(wrongDomainToken)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN_DOMAIN',
    });
  });

  it('rejects missing registered claim with 403 NOT_REGISTERED', async () => {
    await expect(requireUser(unregisteredToken)).rejects.toMatchObject({
      status: 403,
      code: 'NOT_REGISTERED',
    });
  });

  it('rejects unauthorized role with 403 FORBIDDEN_ROLE', async () => {
    await expect(
      requireUser(validStudentToken, ['coordinator', 'admin'])
    ).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN_ROLE',
    });
  });

  it('accepts valid token and returns AuthenticatedUser payload', async () => {
    const user = await requireUser(coordinatorToken, ['coordinator']);
    expect(user.uid).toBe('coord-valid-1');
    expect(user.email).toBe('coord@htu.edu.gh');
    expect(user.activeRole).toBe('coordinator');
    expect(user.roles).toContain('coordinator');
  });
});

describe('Server Infrastructure: Notifications Model', () => {
  it('creates notifications in batch for multiple recipients', async () => {
    const userIds = ['notif-user-1', 'notif-user-2', 'notif-user-1']; // tests de-duplication
    const ids = await notify(userIds, {
      title: 'Topic Approved',
      body: 'Your final year project topic has been approved by the coordinator.',
      type: 'topic_status',
      target_url: '/proposals',
    });

    expect(ids.length).toBe(2);

    const firstId = ids[0];
    expect(firstId).toBeDefined();
    const snap1 = await adminDb.collection('notifications').doc(firstId!).get();
    expect(snap1.exists).toBe(true);
    const data1 = snap1.data()!;
    expect(data1.title).toBe('Topic Approved');
    expect(data1.type).toBe('topic_status');
    expect(data1.target_url).toBe('/proposals');
    expect(data1.is_read).toBe(false);
  });

  it('handles notifyInTx inside a Firestore transaction', async () => {
    let notifId = '';
    await adminDb.runTransaction(async (tx) => {
      const ids = notifyInTx(tx, ['notif-tx-user'], {
        title: 'Defense Scheduled',
        body: 'Your defense date is set for Friday.',
        type: 'defense_schedule',
        target_url: '/defense',
      });
      notifId = ids[0] ?? '';
    });

    expect(notifId).toBeTruthy();
    const snap = await adminDb.collection('notifications').doc(notifId).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.type).toBe('defense_schedule');
  });

  it('returns empty array when userIds is empty', async () => {
    const ids = await notify([], {
      title: 'Test',
      body: 'Test body',
      type: 'system',
    });
    expect(ids).toEqual([]);
  });
});

describe('Server Infrastructure: Audit Logs Model', () => {
  it('records audit logs with writeAudit', async () => {
    const entry = await writeAudit({
      actor: {
        uid: 'actor-coord-1',
        name: 'Dr. Coordinator',
        email: 'coordinator@htu.edu.gh',
        role: 'coordinator',
      },
      action: 'roster.imported',
      target_type: 'roster',
      target_id: 'btech-cs-2026',
      details: 'Imported 45 students from roster CSV',
      metadata: { count: 45, course: 'btech-cs' },
    });

    expect(entry.id).toBeTruthy();
    expect(entry.action).toBe('roster.imported');
    expect(entry.actor_name).toBe('Dr. Coordinator');
    expect(entry.description).toBe('Imported 45 students from roster CSV');

    const snap = await adminDb.collection('audit_logs').doc(entry.id).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.target_id).toBe('btech-cs-2026');
  });

  it('records audit logs inside transaction with writeAuditInTx', async () => {
    let logId = '';
    await adminDb.runTransaction(async (tx) => {
      const res = writeAuditInTx(tx, {
        actor: {
          uid: 'actor-admin-1',
          name: 'Super Admin',
          role: 'admin',
        },
        action: 'grade.submitted',
        target_type: 'evaluation',
        target_id: 'eval-123',
        details: 'Submitted marksheet for team alpha',
      });
      logId = res.id;
    });

    expect(logId).toBeTruthy();
    const snap = await adminDb.collection('audit_logs').doc(logId).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.action).toBe('grade.submitted');
  });

  it('paginates audit logs with listAuditLogs', async () => {
    const result = await listAuditLogs({ limit: 1 });
    expect(result.items.length).toBeLessThanOrEqual(1);
    if (result.hasMore) {
      expect(result.nextCursor).toBeTruthy();
      const nextPage = await listAuditLogs({
        limit: 1,
        startAfterId: result.nextCursor,
      });
      expect(nextPage.items.length).toBeLessThanOrEqual(1);
    }
  });
});
