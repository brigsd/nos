import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['engine/**/*.test.ts', 'tools/**/*.test.ts', 'prototipos/**/*.test.ts'],
    watch: false,
  },
});
