import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env.local')) {
  const envContent = readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}
if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = 'demo-fypms';
}
