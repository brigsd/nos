#!/usr/bin/env node
'use strict';
/**
 * Builds a small contact-sheet PNG with the 3 Nativos (issue #23) plus the
 * player avatar, laid out side by side at 8x on a neutral background - the
 * art-reviewer artifact used to judge "are the 3 Nativos distinct from each
 * other AND from no_avatar?" at a glance, without opening 4 separate files.
 *
 * Kept separate from contact-sheet.cjs (the T7 tile/kit contact sheet) so
 * this issue doesn't disturb that unrelated artifact's layout/legend.
 *
 * Legend (cell number -> sprite):
 *   1 nativo_gota   2 nativo_raiz   3 nativo_cinza   4 no_avatar (player, for contrast)
 *
 * Usage: node assets/tools/contact-sheet-nativos.cjs
 */

const fs = require('node:fs');
const path = require('path');
const { loadPalette, matrixToCanvas, scaleNearest, createCanvas, fill, compositeOver, setPixel, savePNG } = require('./lib/canvas.cjs');
const { loadSpriteSrc } = require('./lib/spritesrc.cjs');
const { drawText } = require('./lib/font3x5.cjs');
const { PAL } = require('./lib/palette-names.cjs');
const { ASSETS, SRC_DIR, PREVIEW_SCALE } = require('./render.cjs');

const OUT_PATH = path.join(ASSETS, 'preview', 'nativos_contact_sheet_8x.png');

function loadFrameCanvas(name, frameIndex, palette) {
  const sprite = loadSpriteSrc(path.join(SRC_DIR, `${name}.json`));
  return matrixToCanvas(sprite.frames[frameIndex].pixels, palette);
}

function buildEntries(palette) {
  return [
    { label: '1', canvas: loadFrameCanvas('nativo_gota', 0, palette) },
    { label: '2', canvas: loadFrameCanvas('nativo_raiz', 0, palette) },
    { label: '3', canvas: loadFrameCanvas('nativo_cinza', 0, palette) },
    { label: '4', canvas: loadFrameCanvas('no_avatar', 0, palette) },
  ];
}

function build() {
  const palette = loadPalette(path.join(ASSETS, 'palette.json'));
  const entries = buildEntries(palette);

  const cols = 4;
  const rows = 1;
  const cellArt = 16 * PREVIEW_SCALE; // all 4 sprites are 16x16
  const labelH = 20;
  const cell = cellArt + labelH;
  const pad = 24;

  const sheetW = pad + cols * (cell + pad);
  const sheetH = pad + rows * (cell + pad);
  const sheet = createCanvas(sheetW, sheetH);
  const bg = palette[PAL.plumMid];
  fill(sheet, [bg[0], bg[1], bg[2], 255]);

  entries.forEach((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = pad + col * (cell + pad);
    const cellY = pad + row * (cell + pad);

    const preview = scaleNearest(entry.canvas, PREVIEW_SCALE);
    const offX = cellX + Math.floor((cellArt - preview.width) / 2);
    const offY = cellY + Math.floor((cellArt - preview.height) / 2);
    compositeOver(sheet, preview, offX, offY);

    const white = [...palette[PAL.white], 255];
    drawText(sheet, setPixel, entry.label, cellX, cellY + cellArt + 4, white, 2);
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  savePNG(OUT_PATH, sheet);
  console.log(`nativos contact sheet -> ${path.relative(path.join(ASSETS, '..'), OUT_PATH)} (${sheetW}x${sheetH})`);
  return OUT_PATH;
}

if (require.main === module) {
  build();
}

module.exports = { build, OUT_PATH };
