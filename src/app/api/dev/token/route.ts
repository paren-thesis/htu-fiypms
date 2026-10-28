import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { fx, studentEmail, studentUid, staffUid } from '../../../../../fixtures';

function isDevAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  );
}

export async function POST(req: NextRequest) {
  if (!isDevAllowed()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      uid?: unknown;
      email?: unknown;
    };
    const uid = typeof body.uid === 'string' ? body.uid.trim() : undefined;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined;

    let targetUid = uid;
    let targetEmail = email;

    if (!targetUid && !targetEmail) {
      return NextResponse.json(
        { error: 'Missing uid or email in request body' },
        { status: 400 }
      );
    }

    if (!targetUid && targetEmail) {
      const student = fx.students.find((s) => studentEmail(s.index_number) === targetEmail);
      if (student) {
        targetUid = studentUid(student.index_number);
      } else {
        const staff = fx.staff.find((s) => s.email === targetEmail);
        if (staff) {
          targetUid = staffUid(staff.email);
        } else {
          try {
            const byEmail = await adminAuth.getUserByEmail(targetEmail);
            targetUid = byEmail.uid;
          } catch {
            // Fall through to 404 below
          }
        }
      }
    }

    if (!targetUid) {
      return NextResponse.json(
        { error: 'User could not be resolved from fixtures or Auth emulator' },
        { status: 404 }
      );
    }

    // Lookup user in Auth to retrieve email or verify existence
    let authUser;
    try {
      authUser = await adminAuth.getUser(targetUid);
      if (!targetEmail && authUser.email) {
        targetEmail = authUser.email.toLowerCase();
      }
    } catch {
      return NextResponse.json(
        {
          error: `Auth user ${targetUid} not found. Run npm run seed:full first.`,
        },
        { status: 404 }
      );
    }

    // Ensure customClaims exist on the user record so token refreshes reflect claim updates
    if (!authUser.customClaims || Object.keys(authUser.customClaims).length === 0) {
      const fallbackClaims = targetEmail ? fx.claimsFor(targetEmail) : {};
      if (Object.keys(fallbackClaims).length > 0) {
        await adminAuth.setCustomUserClaims(targetUid, fallbackClaims);
      }
    }

    const customToken = await adminAuth.createCustomToken(targetUid);

    return NextResponse.json({ ok: true, customToken });
  } catch (err: unknown) {
    console.error('Error in /api/dev/token:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  if (!isDevAllowed()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
