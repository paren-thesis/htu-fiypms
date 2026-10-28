process.env.GCLOUD_PROJECT = 'demo-fypms-test';
process.env.FIREBASE_ADMIN_PROJECT_ID = 'demo-fypms-test';
process.env.FIREBASE_PROJECT_ID = 'demo-fypms-test';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-fypms-test';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';

import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx next dev -p 3000',
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      GCLOUD_PROJECT: 'demo-fypms-test',
      FIREBASE_ADMIN_PROJECT_ID: 'demo-fypms-test',
      FIREBASE_PROJECT_ID: 'demo-fypms-test',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-fypms-test',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-fypms-test.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
      NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: 'http://127.0.0.1:9199',
      NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
