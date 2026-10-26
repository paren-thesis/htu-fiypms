import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth/verify-token-edge';
import { decideRoute } from '@/lib/auth/route-gate';

export async function middleware(req: NextRequest) {
  const sessionToken = req.cookies.get('__session')?.value;
  const claims = await verifyTokenEdge(sessionToken);
  const decision = decideRoute(claims, req.nextUrl.pathname);

  if (decision === 'allow') {
    return NextResponse.next();
  }

  const redirectUrl = new URL(decision.redirect, req.url);
  // If redirecting to /not-registered and we have an attempted email, pass it via query
  if (decision.redirect === '/not-registered' && claims?.email) {
    redirectUrl.searchParams.set('email', claims.email);
  }

  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static asset extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
