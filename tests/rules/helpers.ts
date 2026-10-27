import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";

export const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  "demo-fypms-test";

let testEnvPromise: Promise<RulesTestEnvironment> | null = null;

export function getTestEnv(): Promise<RulesTestEnvironment> {
  if (!testEnvPromise) {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf8");

    let host = "127.0.0.1";
    let port = 8180;
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      const [h, p] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
      if (h) host = h;
      if (p) port = parseInt(p, 10);
    }

    testEnvPromise = initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host,
        port,
      },
    });
  }
  return testEnvPromise;
}

export interface CtxOptions {
  uid?: string;
  email?: string;
  registered?: boolean;
  email_verified?: boolean;
  roles?: string[];
  activeRole?: string;
}

/**
 * Returns an authenticated Firestore client context with custom claims.
 * Defaults to a registered, verified HTU student.
 */
export async function ctx(options: CtxOptions = {}) {
  const env = await getTestEnv();
  const uid = options.uid ?? "user-1";
  const email = options.email ?? `${uid}@htu.edu.gh`;
  const registered = options.registered ?? true;
  const email_verified = options.email_verified ?? true;
  const roles = options.roles ?? ["student"];
  const activeRole = options.activeRole ?? (roles[0] || "student");

  const authContext = env.authenticatedContext(uid, {
    email,
    email_verified,
    registered,
    roles,
    activeRole,
  });

  return authContext.firestore();
}

/**
 * Returns an unauthenticated Firestore client context (no token).
 */
export async function unauthCtx() {
  const env = await getTestEnv();
  return env.unauthenticatedContext().firestore();
}

export type TestFirestore = ReturnType<
  ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]
>;

/**
 * Executes a function with security rules disabled for seeding test state.
 */
export async function seed(fn: (db: TestFirestore) => Promise<void>) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (context) => {
    await fn(context.firestore());
  });
}

/**
 * Resets Firestore data between test suites.
 */
export async function clearFirestoreData() {
  const env = await getTestEnv();
  await env.clearFirestore();
}

/**
 * Cleans up the test environment.
 */
export async function cleanupTestEnv() {
  if (testEnvPromise) {
    const env = await testEnvPromise;
    await env.cleanup();
    testEnvPromise = null;
  }
}
