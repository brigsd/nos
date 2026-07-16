#!/usr/bin/env node
'use strict';
/**
 * Builds a single contact-sheet PNG with every rendered sprite (and every
 * frame of the animated ones) laid out at 8x, numbered, on a neutral
 * background — for the art-reviewer pass (silhouette / palette / outline
 * weight / cross-sprite cohesion).
 *
 * Legend (cell number -> sprite / frame):
 *   1 campina_1        6 agua f1                     11 nucleo_pulse f3 (receding) 16 margem_agua N
 *   2 campina_2        7 ruina                        12 nucleo_pulse f1 (growing)  17 margem_agua E
 *   3 campina_3        8 caminho_terra                13 margem_agua S
 *   4 campina_flores   9 nucleo_pulse f0 (dim)        14 margem_agua W
 *   5 agua f0         10 nucleo_pulse f2 (peak)       15 (spare)
 *
 * Usage: node assets/tools/contact-sheet.cjs
 */

const fs = require('node:fs');
const path = require('path');
const { loadPalette, matrixToCanvas, scaleNearest, createCanvas, fill, compositeOver, setPixel, savePNG } = require('./lib/canvas.cjs');
const { loadSpriteSrc } = require('./lib/spritesrc.cjs');
const { drawText } = require('./lib/font3x5.cjs');
const { PAL } = require('./lib/palette-names.cjs');
const { ASSETS, SRC_DIR, PREVIEW_SCALE } = require('./render.cjs');

const OUT_PATH = path.join(ASSETS, 'preview', 'contact_sheet_8x.png');

function loadFrameCanvas(name, frameIndex, palette) {
  const sprite = loadSpriteSrc(path.join(SRC_DIR, `${name}.json`));
  return matrixToCanvas(sprite.frames[frameIndex].pixels, palette);
}

function buildEntries(palette) {
  return [
    { label: '1', canvas: loadFrameCanvas('campina_1', 0, palette) },
    { label: '2', canvas: loadFrameCanvas('campina_2', 0, palette) },
    { label: '3', canvas: loadFrameCanvas('campina_3', 0, palette) },
    { label: '4', canvas: loadFrameCanvas('campina_flores', 0, palette) },
    { label: '5', canvas: loadFrameCanvas('agua_ondula_2frames', 0, palette) },
    { label: '6', canvas: loadFrameCanvas('agua_ondula_2frames', 1, palette) },
    { label: '7', canvas: loadFrameCanvas('ruina', 0, palette) },
    { label: '8', canvas: loadFrameCanvas('caminho_terra', 0, palette) },
    { label: '9', canvas: loadFrameCanvas('nucleo_pulse_4frames', 0, palette) },
    { label: '10', canvas: loadFrameCanvas('nucleo_pulse_4frames', 2, palette) },
    { label: '11', canvas: loadFrameCanvas('nucleo_pulse_4frames', 3, palette) },
    { label: '12', canvas: loadFrameCanvas('nucleo_pulse_4frames', 1, palette) },
    { label: '13', canvas: loadFrameCanvas('margem_agua_4dir', 0, palette) },
    { label: '14', canvas: loadFrameCanvas('margem_agua_4dir', 1, palette) },
    { label: '16', canvas: loadFrameCanvas('margem_agua_4dir', 2, palette) },
    { label: '17', canvas: loadFrameCanvas('margem_agua_4dir', 3, palette) },
  ];
}

function build() {
  const palette = loadPalette(path.join(ASSETS, 'palette.json'));
  const entries = buildEntries(palette);

  const cols = 4;
  const rows = 4;
  const cellArt = 32 * PREVIEW_SCALE; // biggest sprite (nucleo, 32x32) at 8x
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
    // Center the (possibly smaller than 32x32) preview inside the cell art area.
    const offX = cellX + Math.floor((cellArt - preview.width) / 2);
    const offY = cellY + Math.floor((cellArt - preview.height) / 2);
    compositeOver(sheet, preview, offX, offY);

    const white = [...palette[PAL.white], 255];
    drawText(sheet, setPixel, entry.label, cellX, cellY + cellArt + 4, white, 2);
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  savePNG(OUT_PATH, sheet);
  console.log(`contact sheet -> ${path.relative(path.join(ASSETS, '..'), OUT_PATH)} (${sheetW}x${sheetH})`);
  return OUT_PATH;
}

if (require.main === module) {
  build();
}

module.exports = { build, OUT_PATH };
