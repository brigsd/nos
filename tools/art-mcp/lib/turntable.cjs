'use strict';
/**
 * 8-direction turnaround proxies: model a character as a handful of axis-
 * aligned boxes ("boneco de caixas" — proportion and pose only), rasterize
 * it from 8 yaw angles with flat shading, and emit a small guide strip.
 *
 * The output is NOT final art. It is the consistency scaffold the studios
 * used physical models for: the pixel artist (AI) paints OVER each view,
 * with anatomy, volume and light direction already agreed across all 8
 * directions by construction.
 *
 * Rendering: orthographic side-on camera, painter's sort by depth, flat
 * face shading with a fixed key light — matches pixel-art practice of a
 * single consistent light source (art checklist).
 */

const path = require('path');
const { createCanvas, setPixel, fill, compositeOver, scaleNearest } = require(path.resolve(__dirname, '..', '..', '..', 'assets', 'tools', 'lib', 'canvas.cjs'));
const { label } = require('./font.cjs');

/** Key light: upper-left-front, the project's sprite convention. */
const LIGHT = normalize([-0.5, -0.8, -0.35]);

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * A figure is { name, boxes: [{ c:[x,y,z], s:[w,h,d], color:[r,g,b] }] }.
 * Units are arbitrary; y grows DOWN (screen-like), z grows away from camera
 * at yaw 0. Example humanoid provided by `humanoidFigure()`.
 */
function humanoidFigure(overrides = {}) {
  const skin = overrides.skin ?? [171, 148, 122];
  const cloth = overrides.cloth ?? [72, 74, 119];
  const hair = overrides.hair ?? [62, 53, 70];
  return {
    name: overrides.name ?? 'humanoide',
    boxes: [
      { c: [0, -3.1, 0], s: [1.6, 1.6, 1.6], color: skin }, // head
      { c: [0, -3.9, 0.1], s: [1.7, 0.5, 1.7], color: hair }, // hair cap
      { c: [0, -1.2, 0], s: [2.0, 2.4, 1.1], color: cloth }, // torso
      { c: [-1.35, -1.4, 0], s: [0.6, 2.0, 0.7], color: cloth }, // arm L
      { c: [1.35, -1.4, 0], s: [0.6, 2.0, 0.7], color: cloth }, // arm R
      { c: [-0.55, 1.3, 0], s: [0.8, 2.6, 0.9], color: hair }, // leg L
      { c: [0.55, 1.3, 0], s: [0.8, 2.6, 0.9], color: hair }, // leg R
    ],
  };
}

/* Unit-cube faces: normal + 4 corners (x,y,z in -0.5..0.5). */
const FACES = [
  { n: [0, 0, -1], q: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { n: [0, 0, 1], q: [[0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]] },
  { n: [-1, 0, 0], q: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5]] },
  { n: [1, 0, 0], q: [[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { n: [0, -1, 0], q: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { n: [0, 1, 0], q: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
];

function rotY(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

/** Render one view of the figure at the given yaw into a size x size canvas. */
function renderView(figure, yaw, size) {
  const canvas = createCanvas(size, size);
  const zb = new Float32Array(size * size).fill(Infinity);
  // fit: find figure extent to scale into the canvas with margin
  let maxR = 0.1;
  for (const b of figure.boxes) {
    maxR = Math.max(
      maxR,
      Math.hypot(b.c[0], b.c[2]) + Math.hypot(b.s[0], b.s[2]) / 2,
      Math.abs(b.c[1]) + b.s[1] / 2,
    );
  }
  const scale = (size * 0.46) / maxR;
  const cx = size / 2;
  const cy = size / 2;

  for (const box of figure.boxes) {
    for (const face of FACES) {
      const n = rotY(face.n, yaw);
      if (n[2] > 0.001) continue; // backface (camera looks along +z)
      const lit = Math.max(0, -(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]));
      const tone = 0.35 + 0.65 * lit;
      const col = [
        Math.min(255, box.color[0] * tone) | 0,
        Math.min(255, box.color[1] * tone) | 0,
        Math.min(255, box.color[2] * tone) | 0,
        255,
      ];
      // project the quad's corners (orthographic: x->screen x, y->screen y, z->depth)
      const pts = face.q.map((corner) => {
        const world = rotY(
          [corner[0] * box.s[0] + box.c[0], corner[1] * box.s[1] + box.c[1], corner[2] * box.s[2] + box.c[2]],
          yaw,
        );
        return { x: cx + world[0] * scale, y: cy + world[1] * scale, z: world[2] };
      });
      // rasterize quad as two triangles with a z-buffer
      fillTri(canvas, zb, pts[0], pts[1], pts[2], col);
      fillTri(canvas, zb, pts[0], pts[2], pts[3], col);
    }
  }
  return canvas;
}

function fillTri(canvas, zb, a, b, c, col) {
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x)) / area;
      const w1 = ((c.x - b.x) * (py - b.y) - (c.y - b.y) * (px - b.x)) / area;
      const w2 = ((a.x - c.x) * (py - c.y) - (a.y - c.y) * (px - c.x)) / area;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = a.z * w1 + b.z * w2 + c.z * w0;
      const zi = y * canvas.width + x;
      if (z >= zb[zi]) continue;
      zb[zi] = z;
      setPixel(canvas, x, y, col);
    }
  }
}

/** The full 8-direction strip (yaw 0, 45, ... 315), labeled, at `scale`x. */
function turnaroundStrip(figure, viewSize = 32, scale = 4) {
  const pad = 4;
  const labelH = 8;
  const cell = viewSize * scale;
  const out = createCanvas(pad + 8 * (cell + pad), pad * 2 + cell + labelH);
  fill(out, [46, 34, 47, 255]);
  const names = ['S', 'SO', 'O', 'NO', 'N', 'NE', 'L', 'SE'];
  for (let i = 0; i < 8; i++) {
    const view = scaleNearest(renderView(figure, (i * Math.PI) / 4, viewSize), scale);
    const x0 = pad + i * (cell + pad);
    compositeOver(out, view, x0, pad);
    label(out, names[i], x0, pad + cell + 2, [255, 255, 255, 220]);
  }
  return out;
}

module.exports = { humanoidFigure, renderView, turnaroundStrip };
