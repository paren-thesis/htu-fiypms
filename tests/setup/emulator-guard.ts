/**
 * Vitest setupFile for rules and server tests. Aborts the run unless the process is
 * pointed at the TEST emulators (Firestore 8180, Auth 9199, project demo-*-test).
 * This keeps automated tests from writing users or documents into the dev emulator.
 * Add to vitest.rules.config.ts and vitest.server.config.ts:  test.setupFiles = ['tests/setup/emulator-guard.ts']
 */
const fsHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
const project = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? '';

const problems: string[] = [];
if (!/:8180$/.test(fsHost)) problems.push(`FIRESTORE_EMULATOR_HOST must end with :8180 (got "${fsHost || 'unset'}")`);
if (authHost && !/:9199$/.test(authHost)) problems.push(`FIREBASE_AUTH_EMULATOR_HOST must end with :9199 (got "${authHost}")`);
if (project && !/^demo-.*-test$/.test(project)) problems.push(`project id must look like demo-<name>-test (got "${project}")`);

if (problems.length) {
  throw new Error(
    `Refusing to run tests against the dev emulator.\n- ${problems.join('\n- ')}\n` +
      'Run through the npm scripts (they use firebase.test.json), e.g. npm run test:rules / npm run test:server.',
  );
}
