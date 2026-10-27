import { getApps, initializeApp, cert, getApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function formatPrivateKey(key?: string): string | undefined {
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n');
}

function initAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const isEmulator = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST
  );

  const projectId = isEmulator
    ? (process.env.GCLOUD_PROJECT || process.env.EMU_PROJECT || 'demo-fypms')
    : (process.env.FIREBASE_ADMIN_PROJECT_ID ||
       process.env.FIREBASE_PROJECT_ID ||
       process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
       process.env.GCLOUD_PROJECT ||
       'demo-fypms');

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = formatPrivateKey(
    process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY
  );

  if (!isEmulator && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  // Fallback for emulator or ambient Google Cloud environment credentials
  return initializeApp({
    projectId,
  });
}

const app = initAdminApp();

export const adminAuth: Auth = getAuth(app);
export const adminDb: Firestore = getFirestore(app);
