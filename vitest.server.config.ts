import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/server/**/*.test.ts'],
    fileParallelism: false,
    isolate: false,
    testTimeout: 30000,
    setupFiles: ['tests/setup/emulator-guard.ts'],
    env: {
      GCLOUD_PROJECT: 'demo-fypms-test',
      FIREBASE_ADMIN_PROJECT_ID: 'demo-fypms-test',
      FIREBASE_PROJECT_ID: 'demo-fypms-test',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-fypms-test',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
