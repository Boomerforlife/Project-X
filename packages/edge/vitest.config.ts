import { defineConfig } from 'vitest/config';

// Explicit per-workspace config: without it vitest walks up and picks the web app's root vitest.config.mts
// (which only includes src/**), silently running zero backend tests.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
