'use strict';
/**
 * Parametric, tileable FPS wall-texture generators ("program the painter").
 *
 * Every generator emits a sprite-src matrix (palette indices, same format as
 * assets/sprites/src/) at any power-of-two-ish size (32/64 recommended for
 * first-person walls). Deterministic by seed string. Colors come exclusively
 * from the project palette (assets/palette.json, Resurrect 64) as explicit
 * ramps: dark -> light with hue shift, per pixel-art discipline.
 *
 * Presets are starting points, not endpoints: the whole point is that an AI
 * iterates on `params`, re-renders and re-audits in seconds.
 */

const { hashString, hash2D, tileableFbm } = require('./noise.cjs');
const { PAL } = require('../../../assets/tools/lib/palette-names.cjs');

/** Map noise [0,1) through a ramp of palette indices with optional Bayer dithering at band edges. */
function rampAt(ramp, t, x, y, ditherStrength) {
  const pos = t * (ramp.length - 1);
  let ix = Math.floor(pos);
  const frac = pos - ix;
  if (ditherStrength > 0) {
    // Ordered 2x2 threshold keeps dither clusters chunky (readable at 1x),
    // avoiding the single-orphan-pixel noise the art checklist forbids.
    const bayer2 = [[0.25, 0.75], [1.0, 0.5]];
    if (frac > bayer2[y % 2][x % 2] * ditherStrength + (1 - ditherStrength) / 2) ix++;
  } else if (frac >= 0.5) {
    ix++;
  }
  return ramp[Math.max(0, Math.min(ramp.length - 1, ix))];
}

/**
 * Core generator: fBm base + optional mortar-grid (bricks) + edge darkening.
 * Everything tileable by construction (noise wraps; grids align to size).
 */
function generateTexture(params) {
  const {
    name,
    size = 64,
    seed = name,
    ramp, // palette indices, dark -> light
    baseFreq = 4, // noise cells across the tile
    octaves = 3,
    contrast = 1, // >1 pushes noise toward extremes
    dither = 0.5, // 0..1 band-edge dithering
    bricks = null, // { rows, cols, mortarIdx, mortarPx, offset } or null
    grain = 0, // vertical streaking 0..1 (wood)
    cracks = 0, // 0..1 density of dark crack pixels (stone/ruins)
  } = params;
  if (!ramp || ramp.length < 2) throw new Error(`${name}: ramp precisa de >=2 índices da paleta`);

  const seedNum = hashString(seed);
  const pixels = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      // grain: anisotropic lattice (denser across X, sparser along Y) makes
      // features streak vertically — plank grain — while the integer-period
      // lattice keeps the texture exactly tileable (no coordinate squashing).
      const aspectX = grain > 0 ? 1 + grain * 2 : 1;
      const aspectY = grain > 0 ? Math.max(0.25, 1 - grain * 0.7) : 1;
      let t = tileableFbm(seedNum, x, y, size, size, baseFreq, octaves, aspectX, aspectY);
      t = Math.min(0.999, Math.max(0, (t - 0.5) * contrast + 0.5));

      let idx;
      if (bricks) {
        const { rows, cols, mortarIdx, mortarPx = 1, offset = 0.5 } = bricks;
        const bh = size / rows;
        const bw = size / cols;
        const rowIx = Math.floor(y / bh);
        const shiftedX = (x + rowIx * bw * offset) % size;
        const inMortarY = y % bh < mortarPx;
        const inMortarX = shiftedX % bw < mortarPx;
        if (inMortarY || inMortarX) {
          idx = mortarIdx;
        } else {
          // per-brick tonal identity + inner noise + edge shadow
          const brickId = hash2D(seedNum ^ 0xb51c, Math.floor(shiftedX / bw), rowIx);
          const edge =
            shiftedX % bw < mortarPx + 1 || y % bh < mortarPx + 1 || shiftedX % bw >= bw - 1 || y % bh >= bh - 1;
          let bt = Math.min(0.999, t * 0.6 + brickId * 0.4 - (edge ? 0.18 : 0));
          idx = rampAt(ramp, Math.max(0, bt), x, y, dither);
        }
      } else {
        idx = rampAt(ramp, t, x, y, dither);
      }

      if (cracks > 0 && hash2D(seedNum ^ 0xc4ac, x, y) < cracks * 0.05) {
        // short vertical crack seeds; darkest ramp tone
        idx = ramp[0];
      }
      row.push(idx);
    }
    pixels.push(row);
  }
  return { name, kind: 'wall', width: size, height: size, notes: params.notes ?? '', frames: [{ pixels }] };
}

/** Presets tuned for O Coração's mood (Resurrect 64). Iterate via overrides. */
const PRESETS = {
  ruina_pedra: {
    ramp: [PAL.black, PAL.plumDark, PAL.plumMid, PAL.greyPurple, PAL.paleBlueGrey],
    baseFreq: 5, octaves: 4, contrast: 1.3, dither: 0.6, cracks: 0.5,
    notes: 'pedra de ruína, tons de ameixa/cinza do vazio',
  },
  tijolo_rubro: {
    ramp: [PAL.darkRed, PAL.maroon, PAL.rust, PAL.brickRed, PAL.clay],
    baseFreq: 6, octaves: 3, contrast: 1.1, dither: 0.4,
    bricks: { rows: 8, cols: 4, mortarIdx: PAL.plumDark, mortarPx: 1, offset: 0.5 },
    notes: 'parede de tijolos, vermelhos da paleta',
  },
  madeira_escura: {
    ramp: [PAL.darkOliveBrown, PAL.mauve, PAL.dustyRose, PAL.tan],
    baseFreq: 3, octaves: 4, contrast: 1.4, dither: 0.35, grain: 0.8,
    notes: 'tábuas verticais, veio por streaking de ruído',
  },
  metal_frio: {
    ramp: [PAL.nearBlackTeal, PAL.darkIndigo, PAL.indigo, PAL.greyPurple, PAL.paleBlueGrey],
    baseFreq: 2, octaves: 2, contrast: 0.9, dither: 0.7,
    bricks: { rows: 4, cols: 2, mortarIdx: PAL.black, mortarPx: 2, offset: 0 },
    notes: 'chapas metálicas frias com rebite implícito na junta',
  },
  musgo_vivo: {
    ramp: [PAL.darkGreenGrey, PAL.darkTealGreen, PAL.moss, PAL.sage, PAL.paleSage],
    baseFreq: 7, octaves: 4, contrast: 1.2, dither: 0.55,
    notes: 'pedra tomada de musgo, verdes do Coração',
  },
};

function generatePreset(presetName, overrides = {}) {
  const preset = Object.prototype.hasOwnProperty.call(PRESETS, presetName) ? PRESETS[presetName] : null;
  if (!preset) throw new Error(`preset desconhecido: ${presetName} (tem: ${Object.keys(PRESETS).join(', ')})`);
  return generateTexture({ name: presetName, ...preset, ...overrides });
}

module.exports = { generateTexture, generatePreset, PRESETS };
