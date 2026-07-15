#!/usr/bin/env node
/**
 * site/gl/qa/bundle-pixi-isolated.mjs
 *
 * Answers one specific question the full site/gl/ build (see
 * bench-and-screens.mjs's bundleSizeReport()) cannot: "how much does
 * pixi.js ITSELF cost, tree-shaken to only the symbols this prototype
 * actually imports?" The full build (~178 kB gzip) also contains the
 * Canvas2D-side code, the stress-test harness, and the window.glProto
 * automation hooks - none of which a real migration (see "Esboço do plano
 * de migração" in docs/R3_COMPARATIVO_RENDER.md) would ship. This isolates
 * just the library tax.
 *
 * Builds a throwaway entry file (a temp dir, never written into the repo)
 * that imports exactly the pixi.js exports used across gl/pixi-world.ts,
 * gl/pixi-stress.ts and gl/pixi-filters.ts, bundles it with Vite (the same
 * bundler/minifier the real build uses, in library mode) as a single
 * minified ES module chunk, and reports raw + gzip size.
 *
 * Usage: node gl/qa/bundle-pixi-isolated.mjs
 */
import { build } from 'vite';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Exact symbol list actually imported by gl/pixi-world.ts, gl/pixi-stress.ts
// and gl/pixi-filters.ts (grep `from 'pixi.js'` across those three files) -
// keep this in sync by hand if those imports change, so the number stays
// honest about what THIS prototype uses, not pixi.js's full surface.
const PIXI_ENTRY = `
import { Application, Assets, BlurFilter, Container, Filter, GlProgram, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
const used = [Application, Assets, BlurFilter, Container, Filter, GlProgram, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Text, TextStyle, Texture];
// Reference every import from an exported function so esbuild's tree-shaker
// cannot drop them as unused (which would silently under-report the size).
export function touch() {
  return used.length;
}
(globalThis).__pixiIsolatedTouch = touch();
`;

async function main() {
  const siteDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  // Scratch dir must live INSIDE site/ (not the OS tmpdir) so plain Node
  // module resolution, walking up from the entry file, finds site/node_modules
  // and resolves the bare `pixi.js` import - removed again in `finally` below,
  // so nothing here is ever meant to be committed.
  const scratchRoot = path.join(siteDir, '.scratch-bundle-check');
  mkdirSync(scratchRoot, { recursive: true });
  const tmpDir = mkdtempSync(path.join(scratchRoot, 'run-'));
  const entryFile = path.join(tmpDir, 'pixi-isolated-entry.ts');
  const outDir = path.join(tmpDir, 'out');
  writeFileSync(entryFile, PIXI_ENTRY);

  try {
    await build({
      root: siteDir, // resolve pixi.js from site/node_modules
      configFile: false,
      logLevel: 'warn',
      build: {
        outDir,
        emptyOutDir: true,
        minify: 'esbuild',
        write: true,
        // Library mode (vs. a raw rollupOptions.input hack): built for
        // exactly this "bundle one entry into one file" case, so it skips
        // the app-shell/modulepreload-polyfill injection a normal page
        // build does - that polyfill uses import.meta.url, which is not
        // valid in the 'iife' format and was producing spurious warnings.
        lib: {
          entry: entryFile,
          formats: ['es'],
          fileName: () => 'bundle.js',
        },
      },
    });

    const bundlePath = path.join(outDir, 'bundle.js');
    const raw = readFileSync(bundlePath);
    const gzip = zlib.gzipSync(raw, { level: 9 });

    console.log(`pixi.js isolated (tree-shaken to this prototype's imports), minified ES module:`);
    console.log(`  raw:  ${raw.length} bytes (${(raw.length / 1000).toFixed(1)} kB)`);
    console.log(`  gzip: ${gzip.length} bytes (${(gzip.length / 1000).toFixed(1)} kB)`);
    console.log(`\nSymbols: Application, Assets, BlurFilter, Container, Filter, GlProgram, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Text, TextStyle, Texture`);
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('bundle-pixi-isolated failed:', err);
  process.exit(1);
});
