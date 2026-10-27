#!/usr/bin/env node
/**
 * Clears the LOCAL Firebase emulators (Auth accounts + Firestore documents).
 * It only sends HTTP requests to localhost, so it can never touch production.
 *
 *   node scripts/emulator-reset.mjs                 dev emulators (Auth 9099, Firestore 8080)
 *   node scripts/emulator-reset.mjs --test          test emulators (Auth 9199, Firestore 8180)
 *   node scripts/emulator-reset.mjs --only auth     or: --only firestore
 *   node scripts/emulator-reset.mjs --project demo-fypms
 *
 * The project id must match the one the emulator was started with (emulators keep
 * a separate dataset per project id). Default: EMU_PROJECT, GCLOUD_PROJECT,
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID, then .firebaserc "default".
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const isTest = flag('--test');
const only = opt('--only');
if (only && !['auth', 'firestore'].includes(only)) fail(`--only must be "auth" or "firestore", got "${only}"`);

function projectFromRc() {
  try { return JSON.parse(readFileSync('.firebaserc', 'utf8')).projects?.default; } catch { return undefined; }
}
const project =
  opt('--project') ||
  process.env.EMU_PROJECT ||
  (isTest
    ? 'demo-fypms-test'
    : (process.env.GCLOUD_PROJECT?.startsWith('demo-') ? process.env.GCLOUD_PROJECT : (projectFromRc() || 'demo-fypms')));
if (!project) fail('No project id. Pass --project <id> or set EMU_PROJECT.');

const authHost = opt('--auth-host') || (isTest ? '127.0.0.1:9199' : '127.0.0.1:9099');
const fsHost = opt('--firestore-host') || (isTest ? '127.0.0.1:8180' : '127.0.0.1:8080');

for (const h of [authHost, fsHost]) {
  const host = h.replace(/^https?:\/\//, '').split(':')[0];
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) fail(`Refusing to call non-local host "${h}".`);
}
if (!project.startsWith('demo-')) console.warn(`warning: project id "${project}" does not start with "demo-". Make sure it is the id your emulator runs with.`);

async function clear(label, url) {
  try {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    console.log(`cleared ${label}`);
    return true;
  } catch (e) {
    console.error(`FAILED ${label}: ${e.cause?.code === 'ECONNREFUSED' ? 'emulator is not running on that port' : e.message}`);
    return false;
  }
}

const results = [];
if (only !== 'firestore') results.push(await clear(`Auth accounts   (${authHost}, project ${project})`, `http://${authHost}/emulator/v1/projects/${project}/accounts`));
if (only !== 'auth') results.push(await clear(`Firestore docs   (${fsHost}, project ${project})`, `http://${fsHost}/emulator/v1/projects/${project}/databases/(default)/documents`));
if (results.includes(false)) process.exit(1);
console.log('Done. Now clear the browser (see docs/test-data.md) and run: npm run seed:base');

function fail(msg) { console.error(msg); process.exit(1); }
