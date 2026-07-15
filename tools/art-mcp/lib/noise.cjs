'use strict';
/**
 * Deterministic, dependency-free noise primitives for the parametric
 * texture generators. Everything is seeded by string — same seed, same
 * texture, forever (the project's determinism rule extends to art).
 */

/** FNV-1a 32-bit string hash — stable seed derivation from human-readable seeds. */
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 2D integer-lattice hash → [0,1). Mix of Weyl sequence + xorshift finisher. */
function hash2D(seedNum, x, y) {
  let h = seedNum ^ Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Tileable 2D value noise: the lattice wraps at `periodX`/`periodY`, so the
 * output tiles seamlessly at those periods. Frequency = lattice cells across
 * the period. Returns [0,1).
 */
function tileableValueNoise(seedNum, u, v, periodX, periodY) {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const wrap = (n, p) => ((n % p) + p) % p;
  const n00 = hash2D(seedNum, wrap(x0, periodX), wrap(y0, periodY));
  const n10 = hash2D(seedNum, wrap(x0 + 1, periodX), wrap(y0, periodY));
  const n01 = hash2D(seedNum, wrap(x0, periodX), wrap(y0 + 1, periodY));
  const n11 = hash2D(seedNum, wrap(x0 + 1, periodX), wrap(y0 + 1, periodY));
  const sx = smoothstep(fx);
  const sy = smoothstep(fy);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

/**
 * Tileable fractal (fBm) noise: `octaves` layers of tileable value noise,
 * each at double frequency and half amplitude. Normalized to [0,1).
 *
 * `aspectX`/`aspectY` stretch features anisotropically (e.g. wood grain)
 * WITHOUT breaking tileability: they scale the integer lattice period per
 * axis, never the coordinate — the wrap stays exact by construction.
 */
function tileableFbm(seedNum, x, y, width, height, baseFreq, octaves, aspectX = 1, aspectY = 1) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    const px = Math.max(1, Math.round(freq * aspectX));
    const py = Math.max(1, Math.round(((freq * height) / width) * aspectY));
    sum += amp * tileableValueNoise(seedNum + o * 1013, (x / width) * px, (y / height) * py, px, py);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

module.exports = { hashString, hash2D, tileableValueNoise, tileableFbm, smoothstep, lerp };
