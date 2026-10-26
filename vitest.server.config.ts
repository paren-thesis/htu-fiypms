import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/server/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      GCLOUD_PROJECT: 'htu-fiypms-dev',
      FIREBASE_ADMIN_PROJECT_ID: 'htu-fiypms-dev',
      FIREBASE_PROJECT_ID: 'htu-fiypms-dev',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'htu-fiypms-dev',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
});
