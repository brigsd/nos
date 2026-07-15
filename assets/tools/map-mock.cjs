#!/usr/bin/env node
'use strict';
/**
 * Composes an 8x8-tile mock of O Coração's meadow — campina, a small
 * copse, a river hugging the east edge, a mossy ruin, a dirt path leading
 * to the Núcleo (placed dead-center, as GDD.md describes) — so scene
 * cohesion ("do these all belong to the same game?") can actually be judged,
 * not just individual tiles in isolation.
 *
 * Also layers margem_agua_4dir over every meadow cell that borders an
 * 'agua' cell (issue #12), the same adjacency rule site/src/renderer.ts
 * uses, so the grass->water transition can be judged here first without
 * needing a browser.
 *
 * Usage: node assets/tools/map-mock.cjs
 */

const path = require('path');
const { loadPalette, matrixToCanvas, scaleNearest, createCanvas, compositeOver, savePNG } = require('./lib/canvas.cjs');
const { loadSpriteSrc } = require('./lib/spritesrc.cjs');
const { ASSETS, SRC_DIR, PREVIEW_SCALE } = require('./render.cjs');

const TILE = 16;
const GRID_W = 8;
const GRID_H = 8;
const NUCLEO_COL = 3; // top-left column of the 2x2 footprint the nucleo sits on
const NUCLEO_ROW = 3;

// 8x8 layout. 'nucleo' marks the 2x2 footprint the 32x32 sprite is centered
// over (those 4 cells still get a campina base underneath it). A few cells
// use campina3 (issue #12's optional 3rd variant) scattered among 1/2 so
// all three can be judged side by side in the same scene.
const GRID = [
  ['campina3', 'campina2', 'campina1', 'campina2', 'campina1', 'campina2', 'agua', 'agua'],
  ['floresta', 'floresta', 'campina1', 'campina2', 'campina1', 'campina2', 'agua', 'agua'],
  ['floresta', 'floresta', 'campina2', 'campina3', 'camflores', 'campina1', 'campina2', 'agua'],
  ['floresta', 'campina1', 'campina2', 'nucleo', 'nucleo', 'campina2', 'campina1', 'agua'],
  ['caminho', 'caminho', 'caminho', 'nucleo', 'nucleo', 'campina3', 'campina2', 'agua'],
  ['campina2', 'camflores', 'campina3', 'campina2', 'campina1', 'campina2', 'agua', 'agua'],
  ['campina1', 'ruina', 'ruina', 'campina1', 'camflores', 'campina2', 'agua', 'agua'],
  ['ruina', 'ruina', 'campina2', 'campina1', 'campina3', 'campina1', 'agua', 'agua'],
];

// Meadow-family cells only (matches the 'meadow' biome case in the real
// renderer) - 'nucleo' cells keep their campina base but don't get a rim,
// same scoping choice as site/src/renderer.ts.
const MEADOW_KEYS = new Set(['campina1', 'campina2', 'campina3', 'camflores']);

function isAgua(row, col) {
  return row >= 0 && row < GRID_H && col >= 0 && col < GRID_W && GRID[row][col] === 'agua';
}

const OUT_PATH_1X = path.join(ASSETS, 'sprites', 'mapa_mock_8x8.png');
const OUT_PATH_8X = path.join(ASSETS, 'sprites', 'mapa_mock_8x8_8x.png');

function build() {
  const palette = loadPalette(path.join(ASSETS, 'palette.json'));

  const load = (name) => loadSpriteSrc(path.join(SRC_DIR, `${name}.json`));
  const campina1 = load('campina_1');
  const campina2 = load('campina_2');
  const campina3 = load('campina_3');
  const camflores = load('campina_flores');
  const floresta = load('floresta');
  const ruina = load('ruina');
  const caminho = load('caminho_terra');
  const agua = load('agua_ondula_2frames');
  const nucleo = load('nucleo_pulse_4frames');
  const margem = load('margem_agua_4dir');

  const tileCanvas = {
    campina1: matrixToCanvas(campina1.frames[0].pixels, palette),
    campina2: matrixToCanvas(campina2.frames[0].pixels, palette),
    campina3: matrixToCanvas(campina3.frames[0].pixels, palette),
    camflores: matrixToCanvas(camflores.frames[0].pixels, palette),
    floresta: matrixToCanvas(floresta.frames[0].pixels, palette),
    ruina: matrixToCanvas(ruina.frames[0].pixels, palette),
    caminho: matrixToCanvas(caminho.frames[0].pixels, palette),
    agua: matrixToCanvas(agua.frames[0].pixels, palette),
    // nucleo footprint cells still need a campina base under the glow
    nucleo: matrixToCanvas(campina1.frames[0].pixels, palette),
  };
  // Peak frame (index 2) — the mock is a hero shot of O Coração alive and glowing.
  const nucleoCanvas = matrixToCanvas(nucleo.frames[2].pixels, palette);
  // Frame order 0=S,1=W,2=N,3=E (water-side) - see author-sprites.cjs.
  const margemCanvas = margem.frames.map((f) => matrixToCanvas(f.pixels, palette));

  const map = createCanvas(GRID_W * TILE, GRID_H * TILE);
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const key = GRID[row][col];
      compositeOver(map, tileCanvas[key], col * TILE, row * TILE);
      if (MEADOW_KEYS.has(key)) {
        if (isAgua(row + 1, col)) compositeOver(map, margemCanvas[0], col * TILE, row * TILE); // water S
        if (isAgua(row, col - 1)) compositeOver(map, margemCanvas[1], col * TILE, row * TILE); // water W
        if (isAgua(row - 1, col)) compositeOver(map, margemCanvas[2], col * TILE, row * TILE); // water N
        if (isAgua(row, col + 1)) compositeOver(map, margemCanvas[3], col * TILE, row * TILE); // water E
      }
    }
  }
  compositeOver(map, nucleoCanvas, NUCLEO_COL * TILE, NUCLEO_ROW * TILE);

  savePNG(OUT_PATH_1X, map);
  const preview = scaleNearest(map, PREVIEW_SCALE);
  savePNG(OUT_PATH_8X, preview);

  console.log(`map mock -> ${path.relative(path.join(ASSETS, '..'), OUT_PATH_1X)} (${map.width}x${map.height})`);
  console.log(`map mock preview -> ${path.relative(path.join(ASSETS, '..'), OUT_PATH_8X)} (${preview.width}x${preview.height})`);
  return { OUT_PATH_1X, OUT_PATH_8X };
}

if (require.main === module) {
  build();
}

module.exports = { build, OUT_PATH_1X, OUT_PATH_8X, GRID };
