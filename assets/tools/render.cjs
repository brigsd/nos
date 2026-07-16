#!/usr/bin/env node
'use strict';
/**
 * Render tool for T7 art assets. Self-contained: only Node built-ins
 * (fs, path, zlib) — no npm dependencies, no package.json.
 *
 * Reads every sprite source matrix under assets/sprites/src/*.json
 * (palette-index matrices — the source of truth) and renders each to
 * assets/sprites/<name>.png (1x) and assets/sprites/<name>_8x.png
 * (nearest-neighbor preview, for human/AI review).
 *
 * Multi-frame sprites (animations) are laid out as a single horizontal
 * spritesheet, matching the project's `nome_acao_Nframes.png` convention.
 *
 * Usage: node assets/tools/render.cjs
 */

const fs = require('fs');
const path = require('path');
const { loadPalette, scaleNearest, savePNG } = require('./lib/canvas.cjs');
const { loadSpriteSrc, composeFramesHorizontal } = require('./lib/spritesrc.cjs');

const ROOT = path.resolve(__dirname, '..', '..'); // repo root (assets/tools/.. .. )
const ASSETS = path.join(ROOT, 'assets');
const SRC_DIR = path.join(ASSETS, 'sprites', 'src');
const OUT_DIR = path.join(ASSETS, 'sprites');
const PREVIEW_DIR = path.join(ASSETS, 'preview'); // artefato de build (gitignorado) — regenerado por npm run build:sprites
const PALETTE_PATH = path.join(ASSETS, 'palette.json');
const PREVIEW_SCALE = 8;

function renderAll() {
  const palette = loadPalette(PALETTE_PATH);
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    console.error(`No sprite source files found in ${SRC_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const rendered = [];
  for (const file of files) {
    const srcPath = path.join(SRC_DIR, file);
    const sprite = loadSpriteSrc(srcPath);
    const sheet = composeFramesHorizontal(sprite, palette);
    const preview = scaleNearest(sheet, PREVIEW_SCALE);

    const outPath1x = path.join(OUT_DIR, `${sprite.name}.png`);
    const outPath8x = path.join(PREVIEW_DIR, `${sprite.name}_8x.png`);
    savePNG(outPath1x, sheet);
    savePNG(outPath8x, preview);

    console.log(
      `rendered ${sprite.name}: ${sprite.frames.length} frame(s), ${sprite.width}x${sprite.height} -> ` +
        `${path.relative(ROOT, outPath1x)} (+ _8x preview)`
    );
    rendered.push({ sprite, sheet, preview, outPath1x, outPath8x });
  }
  return rendered;
}

if (require.main === module) {
  renderAll();
}

module.exports = { renderAll, ROOT, ASSETS, SRC_DIR, OUT_DIR, PREVIEW_DIR, PALETTE_PATH, PREVIEW_SCALE };
