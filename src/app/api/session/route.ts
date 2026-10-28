import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';

// export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { idToken?: unknown };
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid authentication token' },
        { status: 401 }
      );
    }

    // Verify token with Firebase Admin
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Gate: email_verified and @htu.edu.gh domain check BEFORE any Firestore access
    const email = decoded.email?.toLowerCase();
    if (!email || !email.endsWith('@htu.edu.gh') || !decoded.email_verified) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Access requires a verified @htu.edu.gh university account',
        },
        { status: 403 }
      );
    }

    // Set the httpOnly __session cookie
    const cookieStore = await cookies();
    cookieStore.set('__session', idToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60, // 1 hour
      path: '/',
    });

    return NextResponse.json({
      ok: true,
      uid: decoded.uid,
      email: decoded.email,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to establish session' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set('__session', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}
