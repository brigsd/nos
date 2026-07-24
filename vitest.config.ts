/* Config do Vitest: cobre tools/** (núcleo do Atelier: som + oficina) — o gate npm test. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tools/**/*.test.ts'],
    watch: false,
  },
});
