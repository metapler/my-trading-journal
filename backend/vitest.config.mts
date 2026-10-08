import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: false,
    reporters: ['verbose'],
    // Integration suites share one Postgres test DB (truncate-per-test), so
    // files must run sequentially — never in parallel workers.
    fileParallelism: false,
  },
});
