import { spawn, type ChildProcess } from 'child_process';
import { runSeed } from '../scripts/seed';
import { resetTestEmulator } from '../tests/helpers/reset';

const AUTH_PORT = 9199;
const FIRESTORE_PORT = 8180;

async function isPortOpen(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForEmulators(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const [authUp, fsUp] = await Promise.all([
      isPortOpen(AUTH_PORT),
      isPortOpen(FIRESTORE_PORT),
    ]);
    if (authUp && fsUp) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Timed out waiting for Firebase test emulators on ports ${AUTH_PORT}/${FIRESTORE_PORT}`
  );
}

export default async function globalSetup() {
  process.env.GCLOUD_PROJECT = 'demo-fypms-test';
  process.env.FIREBASE_ADMIN_PROJECT_ID = 'demo-fypms-test';
  process.env.FIREBASE_PROJECT_ID = 'demo-fypms-test';
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-fypms-test';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`;
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${FIRESTORE_PORT}`;

  let emulatorProc: ChildProcess | null = null;
  const alreadyRunning =
    (await isPortOpen(AUTH_PORT)) && (await isPortOpen(FIRESTORE_PORT));

  if (!alreadyRunning) {
    emulatorProc = spawn(
      'npx',
      [
        'firebase',
        'emulators:start',
        '--config',
        'firebase.test.json',
        '--project',
        'demo-fypms-test',
        '--only',
        'auth,firestore',
      ],
      {
        stdio: 'ignore',
        shell: true,
        env: {
          ...process.env,
          GCLOUD_PROJECT: 'demo-fypms-test',
        },
      }
    );
    await waitForEmulators(60_000);
  }

  await resetTestEmulator();
  await runSeed({ mode: 'full' });

  return async () => {
    if (emulatorProc && emulatorProc.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(emulatorProc.pid), '/T', '/F'], {
            stdio: 'ignore',
            shell: true,
          });
        } else {
          emulatorProc.kill('SIGINT');
        }
      } catch {
        // Ignore teardown errors
      }
    }
  };
}

