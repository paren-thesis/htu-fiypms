import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from './route';
import { adminAuth } from '@/lib/firebase/admin';

const mockCookieSet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: mockCookieSet,
  })),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
  },
}));

describe('Session API Route (/api/session)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects request with missing idToken with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/session', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it('rejects invalid or expired token with 401', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockRejectedValueOnce(
      new Error('Token expired')
    );

    const req = new NextRequest('http://localhost:3000/api/session', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'expired-token' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it('rejects non-HTU email domain with 403 and does not set cookie (F-01)', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValueOnce({
      uid: 'user-1',
      email: 'student@gmail.com',
      email_verified: true,
      auth_time: 123,
      iat: 123,
      exp: 456,
      aud: 'demo',
      iss: 'demo',
      sub: 'user-1',
      firebase: { identities: {}, sign_in_provider: 'google.com' },
    });

    const req = new NextRequest('http://localhost:3000/api/session', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'gmail-token' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/@htu\.edu\.gh/);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it('rejects unverified email with 403 and does not set cookie', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValueOnce({
      uid: 'user-2',
      email: '0323809921@htu.edu.gh',
      email_verified: false,
      auth_time: 123,
      iat: 123,
      exp: 456,
      aud: 'demo',
      iss: 'demo',
      sub: 'user-2',
      firebase: { identities: {}, sign_in_provider: 'google.com' },
    });

    const req = new NextRequest('http://localhost:3000/api/session', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'unverified-token' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it('accepts verified @htu.edu.gh account, returns 200 and sets httpOnly __session cookie', async () => {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValueOnce({
      uid: 'student-htu-1',
      email: '0323809921@htu.edu.gh',
      email_verified: true,
      auth_time: 123,
      iat: 123,
      exp: 456,
      aud: 'demo',
      iss: 'demo',
      sub: 'student-htu-1',
      firebase: { identities: {}, sign_in_provider: 'google.com' },
    });

    const req = new NextRequest('http://localhost:3000/api/session', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'valid-htu-token' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.uid).toBe('student-htu-1');

    expect(mockCookieSet).toHaveBeenCalledWith(
      '__session',
      'valid-htu-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 3600,
        path: '/',
      })
    );
  });

  it('DELETE clears the __session cookie', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);

    expect(mockCookieSet).toHaveBeenCalledWith(
      '__session',
      '',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 0,
        path: '/',
      })
    );
  });
});
