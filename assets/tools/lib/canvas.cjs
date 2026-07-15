'use strict';
/**
 * Tiny in-memory RGBA canvas used by the render pipeline. No dependencies.
 */

const fs = require('fs');
const { encodePNG } = require('./png.cjs');

/** @returns {{width:number,height:number,data:Uint8ClampedArray}} fully transparent canvas */
function createCanvas(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function inBounds(canvas, x, y) {
  return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height;
}

function setPixel(canvas, x, y, [r, g, b, a = 255]) {
  if (!inBounds(canvas, x, y)) return;
  const i = (y * canvas.width + x) * 4;
  canvas.data[i] = r;
  canvas.data[i + 1] = g;
  canvas.data[i + 2] = b;
  canvas.data[i + 3] = a;
}

function getPixel(canvas, x, y) {
  if (!inBounds(canvas, x, y)) return [0, 0, 0, 0];
  const i = (y * canvas.width + x) * 4;
  return [canvas.data[i], canvas.data[i + 1], canvas.data[i + 2], canvas.data[i + 3]];
}

/** Fill the whole canvas with a flat RGBA color. */
function fill(canvas, [r, g, b, a = 255]) {
  for (let p = 0; p < canvas.width * canvas.height; p++) {
    canvas.data[p * 4] = r;
    canvas.data[p * 4 + 1] = g;
    canvas.data[p * 4 + 2] = b;
    canvas.data[p * 4 + 3] = a;
  }
}

/** Axis-aligned filled rectangle, inclusive coords. */
function fillRect(canvas, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      setPixel(canvas, x, y, color);
    }
  }
}

/** Paint `src` onto `dst` at (dx,dy) using standard "source over" alpha compositing. */
function compositeOver(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [sr, sg, sb, sa] = getPixel(src, x, y);
      if (sa === 0) continue;
      const tx = dx + x;
      const ty = dy + y;
      if (!inBounds(dst, tx, ty)) continue;
      if (sa === 255) {
        setPixel(dst, tx, ty, [sr, sg, sb, 255]);
        continue;
      }
      const [dr, dg, db, da] = getPixel(dst, tx, ty);
      const aOut = sa + (da * (255 - sa)) / 255;
      if (aOut <= 0) {
        setPixel(dst, tx, ty, [0, 0, 0, 0]);
        continue;
      }
      const r = (sr * sa + dr * da * (255 - sa) / 255) / aOut;
      const g = (sg * sa + dg * da * (255 - sa) / 255) / aOut;
      const b = (sb * sa + db * da * (255 - sa) / 255) / aOut;
      setPixel(dst, tx, ty, [r, g, b, aOut]);
    }
  }
}

/** Nearest-neighbor upscale by an integer factor — keeps pixel-art crisp. */
function scaleNearest(src, factor) {
  const out = createCanvas(src.width * factor, src.height * factor);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const px = getPixel(src, x, y);
      for (let fy = 0; fy < factor; fy++) {
        for (let fx = 0; fx < factor; fx++) {
          setPixel(out, x * factor + fx, y * factor + fy, px);
        }
      }
    }
  }
  return out;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function loadPalette(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  return raw.colors.map(hexToRgb);
}

/**
 * Convert a matrix of palette indices (-1 = transparent) into a canvas.
 * @param {number[][]} matrix - rows of palette indices
 * @param {[number,number,number][]} palette
 */
function matrixToCanvas(matrix, palette) {
  const height = matrix.length;
  const width = matrix[0].length;
  const canvas = createCanvas(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = matrix[y][x];
      if (idx === -1 || idx === null || idx === undefined) continue;
      const rgb = palette[idx];
      if (!rgb) throw new Error(`palette index out of range: ${idx} at (${x},${y})`);
      setPixel(canvas, x, y, [rgb[0], rgb[1], rgb[2], 255]);
    }
  }
  return canvas;
}

function savePNG(path, canvas) {
  const buf = encodePNG(canvas.width, canvas.height, Buffer.from(canvas.data.buffer, canvas.data.byteOffset, canvas.data.byteLength));
  fs.writeFileSync(path, buf);
}

module.exports = {
  createCanvas,
  setPixel,
  getPixel,
  fill,
  fillRect,
  compositeOver,
  scaleNearest,
  hexToRgb,
  loadPalette,
  matrixToCanvas,
  savePNG,
};
