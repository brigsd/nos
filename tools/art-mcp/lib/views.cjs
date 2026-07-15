'use strict';
/**
 * Audit views: renders meant for a multimodal reviewer's eyes.
 * All output is PNG via the project's zero-dep encoder.
 *
 *  - magnified: sprite at Nx with pixel grid + palette swatch legend
 *  - sheet: contact sheet of many sprites on one canvas (style consistency)
 *  - diff: before/after side by side + changed-pixel heatmap
 *  - tiled: 3x3 wrap of a tileable texture (seams jump out visually)
 */

const path = require('path');
const LIB2D = path.resolve(__dirname, '..', '..', '..', 'assets', 'tools', 'lib');
const { createCanvas, setPixel, getPixel, fill, fillRect, compositeOver, matrixToCanvas, scaleNearest, savePNG } = require(path.join(LIB2D, 'canvas.cjs'));
const { label } = require('./font.cjs');

const BG_DARK = [16, 12, 21, 255]; // the FPS fog void (#100c15)
const BG_LIGHT = [199, 220, 208, 255]; // paleMint
const GRID = [255, 255, 255, 40];

function frameCanvas(sprite, frameIx, palette) {
  return matrixToCanvas(sprite.frames[frameIx].pixels, palette);
}

/** Magnified view: every frame at `scale`x over dark AND light ground, grid overlay, palette legend of used colors. */
function magnifiedView(sprite, palette, scale = 8) {
  const fw = sprite.width * scale;
  const fh = sprite.height * scale;
  const cols = sprite.frames.length;
  const pad = 8;
  const legendH = 18;
  const out = createCanvas(pad + cols * (fw + pad), pad + fh * 2 + pad * 2 + legendH);
  fill(out, [46, 34, 47, 255]);

  const used = new Set();
  sprite.frames.forEach((f) => f.pixels.forEach((row) => row.forEach((v) => v !== -1 && used.add(v))));

  sprite.frames.forEach((frame, i) => {
    const big = scaleNearest(frameCanvas(sprite, i, palette), scale);
    const x0 = pad + i * (fw + pad);
    // dark ground then light ground: silhouette must survive both
    fillRect(out, x0, pad, x0 + fw - 1, pad + fh - 1, BG_DARK);
    compositeOver(out, big, x0, pad);
    fillRect(out, x0, pad * 2 + fh, x0 + fw - 1, pad * 2 + fh * 2 - 1, BG_LIGHT);
    compositeOver(out, big, x0, pad * 2 + fh);
    for (let g = 0; g <= sprite.width; g++) {
      for (let y = 0; y < fh; y++) {
        setPixel(out, x0 + g * scale, pad + y, GRID);
        setPixel(out, x0 + g * scale, pad * 2 + fh + y, GRID);
      }
    }
    for (let g = 0; g <= sprite.height; g++) {
      for (let x = 0; x < fw; x++) {
        setPixel(out, x0 + x, pad + g * scale, GRID);
        setPixel(out, x0 + x, pad * 2 + fh + g * scale, GRID);
      }
    }
  });

  // palette legend: used swatches in index order
  let lx = pad;
  const ly = pad * 3 + fh * 2;
  [...used].sort((a, b) => a - b).forEach((idx) => {
    fillRect(out, lx, ly, lx + 9, ly + 9, [...palette[idx], 255]);
    label(out, String(idx), lx, ly + 11, [255, 255, 255, 200]);
    lx += 14 + 4 * String(idx).length;
  });
  return out;
}

/** 3x3 wrap view of a tileable texture, at 2x — seams reveal themselves as grid lines. */
function tiledView(sprite, palette, frameIx = 0) {
  const one = frameCanvas(sprite, frameIx, palette);
  const out = createCanvas(sprite.width * 3, sprite.height * 3);
  for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) compositeOver(out, one, tx * sprite.width, ty * sprite.height);
  return scaleNearest(out, 2);
}

/** Contact sheet: many sprites (first frames), same scale, labeled — judge style coherence at a glance. */
function contactSheet(sprites, palette, scale = 4) {
  const cell = Math.max(...sprites.map((s) => Math.max(s.width, s.height))) * scale;
  const labelH = 8;
  const cols = Math.ceil(Math.sqrt(sprites.length));
  const rows = Math.ceil(sprites.length / cols);
  const pad = 6;
  const out = createCanvas(pad + cols * (cell + pad), pad + rows * (cell + labelH + pad));
  fill(out, [46, 34, 47, 255]);
  sprites.forEach((s, i) => {
    const cx = pad + (i % cols) * (cell + pad);
    const cy = pad + Math.floor(i / cols) * (cell + labelH + pad);
    fillRect(out, cx, cy, cx + cell - 1, cy + cell - 1, BG_DARK);
    const big = scaleNearest(frameCanvas(s, 0, palette), scale);
    compositeOver(out, big, cx + ((cell - big.width) >> 1), cy + ((cell - big.height) >> 1));
    label(out, s.name.slice(0, Math.floor(cell / 4)), cx, cy + cell + 2, [255, 255, 255, 220]);
  });
  return out;
}

/** Before/after at `scale`x plus a heatmap column marking every changed pixel in red. */
function diffView(before, after, palette, scale = 6) {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('diff exige sprites do mesmo tamanho');
  }
  const a = scaleNearest(frameCanvas(before, 0, palette), scale);
  const b = scaleNearest(frameCanvas(after, 0, palette), scale);
  const w = before.width;
  const h = before.height;
  const heat = createCanvas(w, h);
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const same = before.frames[0].pixels[y][x] === after.frames[0].pixels[y][x];
      setPixel(heat, x, y, same ? [40, 40, 48, 255] : [232, 59, 59, 255]);
      if (!same) changed++;
    }
  }
  const heatBig = scaleNearest(heat, scale);
  const pad = 8;
  const out = createCanvas(pad * 4 + a.width * 3, pad * 2 + a.height + 10);
  fill(out, [46, 34, 47, 255]);
  compositeOver(out, a, pad, pad);
  compositeOver(out, b, pad * 2 + a.width, pad);
  compositeOver(out, heatBig, pad * 3 + a.width * 2, pad);
  label(out, 'ANTES', pad, pad + a.height + 2, [255, 255, 255, 220]);
  label(out, 'DEPOIS', pad * 2 + a.width, pad + a.height + 2, [255, 255, 255, 220]);
  label(out, `DIFF ${changed}PX`, pad * 3 + a.width * 2, pad + a.height + 2, [232, 59, 59, 255]);
  return out;
}

module.exports = { magnifiedView, tiledView, contactSheet, diffView, savePNG };
