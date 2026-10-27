import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/dev/token/route';
import { runSeed } from '../../scripts/seed';
import { resetTestEmulator } from '../helpers/reset';
import { fx, studentEmail, staffUid } from '../../fixtures';

describe('Dev Token API (/api/dev/token)', () => {
  beforeAll(async () => {
    // Seed full fixtures on the test emulator
    await runSeed({ mode: 'full' });
  });

  afterAll(async () => {
    await resetTestEmulator();
  });

  it('returns 404 when NODE_ENV is production', async () => {
    const env = process.env as Record<string, string | undefined>;
    const origEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'production';
      const req = new NextRequest('http://localhost:3000/api/dev/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: staffUid('coordinator@htu.edu.gh') }),
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
    } finally {
      env.NODE_ENV = origEnv;
    }
  });

  it('returns 404 when FIREBASE_AUTH_EMULATOR_HOST is unset', async () => {
    const origHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    try {
      delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
      const req = new NextRequest('http://localhost:3000/api/dev/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: staffUid('coordinator@htu.edu.gh') }),
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
    } finally {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = origHost;
    }
  });

  it('mints a custom token for fixture staff user', async () => {
    const uid = staffUid('coordinator@htu.edu.gh');
    const req = new NextRequest('http://localhost:3000/api/dev/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.customToken).toBe('string');
    expect(data.customToken.length).toBeGreaterThan(20);
  });

  it('mints a custom token by email for fixture student user', async () => {
    const student = fx.students[0]!;
    const email = studentEmail(student.index_number);
    const req = new NextRequest('http://localhost:3000/api/dev/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.customToken).toBe('string');
  });

  it('returns 404 for unknown user', async () => {
    const req = new NextRequest('http://localhost:3000/api/dev/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: 'non-existent-uid' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
