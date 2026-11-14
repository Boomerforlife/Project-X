import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', '../../supabase/tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // PGlite instances are heavy (WASM); keep file-level parallelism modest.
    maxWorkers: 4,
  },
});
