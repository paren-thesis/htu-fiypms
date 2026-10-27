/**
 * Test emulator reset helper.
 * Clears Firestore documents and Auth accounts from the test emulator.
 * Refuses to run if pointed at dev emulator ports (8080 or 9099).
 */
export async function resetTestEmulator(): Promise<void> {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8180';
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9199';
  const project =
    process.env.GCLOUD_PROJECT ??
    process.env.FIREBASE_PROJECT_ID ??
    'demo-fypms-test';

  if (/:8080$/.test(fsHost) || /:9099$/.test(authHost)) {
    throw new Error(
      `resetTestEmulator refused: targeted dev emulator ports (fs: ${fsHost}, auth: ${authHost})`
    );
  }

  try {
    await fetch(
      `http://${authHost}/emulator/v1/projects/${project}/accounts`,
      { method: 'DELETE' }
    );
  } catch {
    // ignore if auth emulator not running or already reset
  }

  try {
    await fetch(
      `http://${fsHost}/emulator/v1/projects/${project}/databases/(default)/documents`,
      { method: 'DELETE' }
    );
  } catch {
    // ignore if firestore emulator not running or already reset
  }
}
