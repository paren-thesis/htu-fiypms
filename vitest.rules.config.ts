import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.rules.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    setupFiles: ['tests/setup/emulator-guard.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
