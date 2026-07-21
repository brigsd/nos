/* Config do Vitest: cobre engine/** e tools/** — o gate npm test. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['engine/**/*.test.ts', 'tools/**/*.test.ts'],
    watch: false,
  },
});
