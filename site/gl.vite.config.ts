import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * site/gl.vite.config.ts
 *
 * Separate, standalone Vite config for the R3 "canvas vs. PixiJS" prototype
 * (site/gl/). Deliberately NOT merged into vite.config.ts: the live site's
 * `npm run build` must stay untouched by this file's existence (docs/R3
 * task rule - the prototype is a disposable window, not a change to the
 * shipped client). Run with `npm run dev:gl` / `npm run build:gl`.
 *
 * Shares site/public/ (world/heart.json + assets/sprites/*.png, both
 * regenerated from the repo's canonical world/ and assets/ by
 * scripts/copy-data.mjs) so the prototype fetches the exact same local
 * world snapshot the live site ships, per the task's "local copy fetch"
 * requirement - no live raw.githubusercontent.com fetch here.
 */
export default defineConfig({
  root: path.resolve(__dirname, 'gl'),
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, 'dist-gl'),
    emptyOutDir: true,
  },
  server: {
    port: 5199,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  preview: {
    port: 5199,
  },
});
