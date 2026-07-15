#!/usr/bin/env node
/**
 * scripts/copy-data.mjs
 *
 * Copies the repo's canonical world state (`world/*.json`), the portal
 * registry + its local worlds (`worlds/*.json` - R6, D-17), and the sprite
 * atlas (`assets/sprites/*.png`) into `site/public/`, so Vite bundles them
 * into `dist/` verbatim and the client can fetch them at runtime by relative
 * path (works both at the site root and under /nos/ on GitHub Pages).
 *
 * The repo root's `world/`, `worlds/` and `assets/` stay the single source
 * of truth; `site/public/world/`, `site/public/worlds/` and
 * `site/public/assets/` are pure build output, regenerated here before every
 * `dev`/`build` run and never committed (see site/.gitignore).
 *
 * No dependencies - Node built-ins only, mirroring the project's existing
 * asset tooling (assets/tools/*.js).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SITE_ROOT, '..');

/** Copies every file matching `ext` from `srcDir` into `dstDir` (flat, no recursion). */
function copyByExtension(srcDir, dstDir, ext) {
  if (!existsSync(srcDir)) {
    throw new Error(`copy-data: source directory missing: ${srcDir}`);
  }
  mkdirSync(dstDir, { recursive: true });
  const files = readdirSync(srcDir).filter((name) => name.endsWith(ext));
  if (files.length === 0) {
    throw new Error(`copy-data: no "${ext}" files found in ${srcDir}`);
  }
  for (const file of files) {
    copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
  }
  return files;
}

const worldFiles = copyByExtension(
  path.join(REPO_ROOT, 'world'),
  path.join(SITE_ROOT, 'public', 'world'),
  '.json',
);

const portalFiles = copyByExtension(
  path.join(REPO_ROOT, 'worlds'),
  path.join(SITE_ROOT, 'public', 'worlds'),
  '.json',
);

const spriteFiles = copyByExtension(
  path.join(REPO_ROOT, 'assets', 'sprites'),
  path.join(SITE_ROOT, 'public', 'assets', 'sprites'),
  '.png',
);

console.log(`copy-data: ${worldFiles.length} world file(s) -> site/public/world/ (${worldFiles.join(', ')})`);
console.log(`copy-data: ${portalFiles.length} portal file(s) -> site/public/worlds/ (${portalFiles.join(', ')})`);
console.log(`copy-data: ${spriteFiles.length} sprite file(s) -> site/public/assets/sprites/`);
