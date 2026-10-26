import { getApps, initializeApp, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function initClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

const app = initClientApp();
export const auth: Auth = getAuth(app);

// Connect Auth Emulator in development if specified
if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' &&
  typeof window !== 'undefined'
) {
  const authEmulatorHost =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || 'http://127.0.0.1:9099';
  try {
    if (!(auth as unknown as { _emulatorHost?: string })._emulatorHost) {
      connectAuthEmulator(auth, authEmulatorHost, { disableWarnings: true });
    }
  } catch {
    // Ignore already connected errors
  }
}

export const googleProvider = new GoogleAuthProvider();
// Set hosted domain as a UI hint only (server always enforces @htu.edu.gh domain)
googleProvider.setCustomParameters({
  hd: 'htu.edu.gh',
  prompt: 'select_account',
});
