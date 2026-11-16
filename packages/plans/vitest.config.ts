import { defineConfig } from 'vitest/config';

// Explicit per-workspace config so vitest does not pick up the web app's root config.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
