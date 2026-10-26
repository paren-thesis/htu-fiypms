import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';

export interface EdgeUserClaims {
  uid: string;
  email?: string;
  email_verified?: boolean;
  roles: string[];
  activeRole: string;
  registered: boolean;
  profileComplete: boolean;
}

const GOOGLE_SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let remoteJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!remoteJWKS) {
    remoteJWKS = createRemoteJWKSet(new URL(GOOGLE_SECURETOKEN_JWKS_URL));
  }
  return remoteJWKS;
}

/**
 * Verifies a Firebase ID token on the Edge runtime using jose.
 * Inspects Google's securetoken JWKS or handles local emulator test tokens.
 *
 * @param token Raw Firebase ID token string from __session cookie
 * @returns EdgeUserClaims or null if invalid/expired
 */
export async function verifyTokenEdge(
  token: string | undefined | null
): Promise<EdgeUserClaims | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    'demo-fypms';

  const isEmulator =
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

  try {
    let payload: Record<string, unknown>;

    if (isEmulator) {
      // In local emulator mode, tokens are signed locally without live Google certificates
      payload = decodeJwt(token) as Record<string, unknown>;
    } else {
      const jwks = getJWKS();
      const verified = await jwtVerify(token, jwks, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      });
      payload = verified.payload as Record<string, unknown>;
    }

    const uid = (payload.user_id as string) || (payload.sub as string);
    if (!uid) return null;

    const roles: string[] = Array.isArray(payload.roles)
      ? (payload.roles as string[])
      : typeof payload.role === 'string'
      ? [payload.role]
      : [];

    const activeRole =
      (payload.activeRole as string) ||
      (payload.active_role as string) ||
      roles[0] ||
      'student';

    return {
      uid,
      email: payload.email as string | undefined,
      email_verified: Boolean(payload.email_verified),
      roles,
      activeRole,
      registered: Boolean(payload.registered),
      profileComplete: Boolean(payload.profileComplete),
    };
  } catch {
    return null;
  }
}
