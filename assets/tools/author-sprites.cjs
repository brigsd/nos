#!/usr/bin/env node
'use strict';
/**
 * One-off (but re-runnable) authoring script that generates the initial
 * pixel-index matrices for every T7 sprite and writes them as the "source
 * of truth" JSON files under assets/sprites/src/.
 *
 * This is deliberately separate from render.cjs: render.cjs only ever reads
 * static JSON matrices and turns them into PNGs. This script is how those
 * matrices get *drawn* — via small geometric rules (circles, gradients,
 * ordered dithering) instead of typing 256+ numbers by hand per tile.
 * After running it, the JSON files are the real source of truth; targeted
 * fixes from the art-reviewer pass are applied as direct edits to those
 * JSON files (see git history / PR notes), not by re-running this script
 * blindly.
 *
 * Usage: node assets/tools/author-sprites.cjs
 */

const path = require('path');
const { PAL } = require('./lib/palette-names.cjs');
const { ditherBand, lightT, bayerThreshold } = require('./lib/dither.cjs');
const { makeGrid, set, get } = require('./lib/grid.cjs');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

const SRC_DIR = path.join(__dirname, '..', 'sprites', 'src');

// ---------------------------------------------------------------------
// Shared ground helpers
// ---------------------------------------------------------------------

/**
 * Paint a smooth dithered gradient (dark -> light, top-left lit) across the
 * whole grid.
 *
 * Art-reviewer round 1 finding: a full-amplitude corner-to-corner gradient
 * measured ~50/255 luma difference between a tile's darkest and lightest
 * edge columns. Ground tiles repeat edge-to-edge across the map, so that
 * shows up as a visible grid — every tile boundary flashes dark-meets-light.
 * Compressing the gradient around the midpoint keeps the top-left-lit cue
 * (readable when judging one tile in isolation) while keeping the seam
 * between repeated tiles subtle instead of a hard brightness cliff.
 */
function paintGroundGradient(g, w, h, tones) {
  const AMPLITUDE = 0.4; // 1.0 = original full-range sweep; lower = softer tile seams
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const raw = lightT(x, y, w, h);
      const t = 0.5 + (raw - 0.5) * AMPLITUDE;
      set(g, x, y, tones[ditherBand(x, y, t, tones.length)]);
    }
  }
}

function neighbors4(x, y) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

// ---------------------------------------------------------------------
// campina_1 / campina_2 / campina_3 (grassland base, 3 subtle variations)
// ---------------------------------------------------------------------
//
// Issue #12 art-reviewer finding: campina_1 and campina_2 used to sit on
// DIFFERENT dominant gradient tones (moss vs sage - a full step apart on
// the ramp, ~46/255 luma). paintGroundGradient's AMPLITUDE=0.4 compression
// means the MIDDLE tone of the 3-tone array covers ~80% of the tile, so
// that one-step difference was really "80% of tile A is moss" next to
// "80% of tile B is sage" - two visibly different color blocks. Spread
// across the map by hashTile(), that read as a checkerboard/mosaic
// instead of one meadow with texture.
//
// Fix: all three variants below share the SAME dominant middle tone
// (moss). They differ only in the minority shadow/highlight tones (still
// drawn from the immediately-adjacent steps of the same green ramp) and
// in tuft color/placement - "textura, não bloco de cor diferente", per
// the issue.

function genCampina1(w, h) {
  const g = makeGrid(w, h);
  paintGroundGradient(g, w, h, [PAL.darkGreenGrey, PAL.moss, PAL.sage]);
  // Hand-placed blade tufts: bright tip (catches top-left light) + dark
  // base immediately below (grounding shadow) — a tiny 2px blade, not noise.
  const tufts = [
    [2, 3], [5, 9], [9, 2], [12, 6], [7, 13], [13, 12], [3, 11], [11, 9],
  ];
  for (const [x, y] of tufts) {
    set(g, x, y, PAL.lightGreen);
    set(g, x, y + 1, PAL.darkTealGreen);
  }
  return g;
}

function genCampina2(w, h) {
  const g = makeGrid(w, h);
  // Same dominant tone as campina_1 (moss); only the highlight speck tone
  // shifts a half-step lighter (paleSage instead of sage), plus its own
  // tuft palette/placement - close enough to read as the same meadow.
  paintGroundGradient(g, w, h, [PAL.darkGreenGrey, PAL.moss, PAL.paleSage]);
  const tufts = [
    [4, 4], [10, 3], [1, 8], [8, 7], [13, 4], [6, 12], [11, 13], [3, 14],
  ];
  for (const [x, y] of tufts) {
    set(g, x, y, PAL.paleYellowGreen);
    set(g, x, y + 1, PAL.forestGreen);
  }
  return g;
}

function genCampina3(w, h) {
  const g = makeGrid(w, h);
  // Third subtle variant (issue #12, optional callout): still dominant
  // moss, with a slightly wider dark/light spread (nearBlackTeal to
  // paleSage) and its own tuft placement, so the hash's 3-way pick never
  // settles into an obvious 2-tile repeat without ever reintroducing a
  // checkerboard-strength color jump.
  paintGroundGradient(g, w, h, [PAL.nearBlackTeal, PAL.moss, PAL.paleSage]);
  const tufts = [
    [6, 2], [1, 5], [14, 4], [9, 9], [4, 12], [12, 14], [2, 14], [15, 8],
  ];
  for (const [x, y] of tufts) {
    set(g, x, y, PAL.lightGreen);
    set(g, x, y + 1, PAL.forestGreen);
  }
  return g;
}

// ---------------------------------------------------------------------
// campina_flores (campina_1 base + small flowers)
// ---------------------------------------------------------------------

function genCampinaFlores(w, h) {
  const g = genCampina1(w, h);
  function flower(cx, cy, center, petal) {
    set(g, cx, cy, center);
    set(g, cx - 1, cy, petal);
    set(g, cx + 1, cy, petal);
    set(g, cx, cy - 1, petal);
    set(g, cx, cy + 1, petal);
    // Grounding shadow opposite the light (down-right) — doubles as a
    // minimal "contour" cue at the scale a full 1px outline would blur.
    set(g, cx + 1, cy + 1, PAL.darkTealGreen);
  }
  flower(4, 7, PAL.gold, PAL.paleYellow);
  flower(13, 9, PAL.crimsonPink, PAL.lightPink);
  flower(5, 4, PAL.gold, PAL.paleYellow);
  flower(9, 12, PAL.crimsonPink, PAL.lightPink);
  set(g, 8, 8, PAL.paleYellow); // small unopened bud
  return g;
}

// ---------------------------------------------------------------------
// floresta (single stylised tree, grass showing at the tile corners)
// ---------------------------------------------------------------------

function genFloresta(w, h) {
  const g = makeGrid(w, h);
  paintGroundGradient(g, w, h, [PAL.darkGreenGrey, PAL.moss, PAL.sage]);

  const circles = [
    [6, 7, 4.3],
    [10, 6.6, 4.0],
    [8, 4.6, 3.9],
    [8, 8.3, 3.6],
  ];
  const inCanopy = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return circles.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r);
  };
  const trunkX0 = 7, trunkX1 = 8, trunkY0 = 11, trunkY1 = 13;
  const inTrunk = (x, y) => x >= trunkX0 && x <= trunkX1 && y >= trunkY0 && y <= trunkY1;

  const canopyTones = [PAL.darkTealGreen, PAL.forestGreen, PAL.green, PAL.lightGreen];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inCanopy(x, y)) continue;
      const t = lightT(x, y, w, h);
      set(g, x, y, canopyTones[ditherBand(x, y, t, canopyTones.length)]);
    }
  }
  // 1px dark outline around the canopy silhouette (living element).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inCanopy(x, y) || inTrunk(x, y)) continue;
      const isEdge = neighbors4(x, y).some(([nx, ny]) => !inCanopy(nx, ny) && !inTrunk(nx, ny));
      if (isEdge) set(g, x, y, PAL.black);
    }
  }
  // Art-reviewer round 1 finding: the trunk had no outline while the canopy
  // did, breaking "same contour weight across one sprite". The trunk's top
  // merges into the canopy (no exposed edge there, no outline needed) but
  // its left/right/bottom edges are exposed against the grass, so those get
  // the same 1px black treatment as the canopy.
  for (let y = trunkY0; y <= trunkY1; y++) {
    set(g, trunkX0 - 1, y, PAL.black);
    set(g, trunkX1 + 1, y, PAL.black);
  }
  for (let x = trunkX0 - 1; x <= trunkX1 + 1; x++) {
    set(g, x, trunkY1 + 1, PAL.black);
  }
  // Trunk: small 2-wide bark fill, left column lit (top-left light), right in shadow.
  for (let y = trunkY0; y <= trunkY1; y++) {
    set(g, trunkX0, y, PAL.tan);
    set(g, trunkX1, y, PAL.darkOliveBrown);
  }
  return g;
}

// ---------------------------------------------------------------------
// ruina (broken stone slab, mossy, sitting on packed earth)
// ---------------------------------------------------------------------

function genRuina(w, h) {
  const g = makeGrid(w, h);

  const inRectA = (x, y) => x >= 2 && x <= 12 && y >= 3 && y <= 9;
  const inRectB = (x, y) => x >= 5 && x <= 14 && y >= 9 && y <= 14;
  const chips = new Set([
    '2,3', '3,3', '2,4', // top-left corner chipped off
    '12,9', '12,10', '11,10', // junction between the two slabs chipped
    '14,14', '13,14', '14,13', // bottom-right corner chipped off
  ]);
  const inStone = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (chips.has(`${x},${y}`)) return false;
    return inRectA(x, y) || inRectB(x, y);
  };

  // Ground background (packed earth), dithered 2-tone, same light rule.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = lightT(x, y, w, h);
      set(g, x, y, [PAL.darkOliveBrown, PAL.tan][ditherBand(x, y, t, 2)]);
    }
  }
  // Stone fill.
  const stoneTones = [PAL.plumDark, PAL.plumMid, PAL.greyPurple, PAL.paleBlueGrey];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inStone(x, y)) continue;
      const t = lightT(x, y, w, h);
      set(g, x, y, stoneTones[ditherBand(x, y, t, stoneTones.length)]);
    }
  }
  // Cracks / mortar lines.
  const cracks = [
    [6, 5], [7, 6], [8, 7], [9, 8],
    [11, 11], [12, 12],
  ];
  for (const [x, y] of cracks) if (inStone(x, y)) set(g, x, y, PAL.black);

  // Moss/lichen accents (melancholic "ruins sinking a little further" detail).
  const moss = [[4, 9], [4, 10], [9, 13], [10, 13], [6, 4]];
  for (const [x, y] of moss) if (inStone(x, y)) set(g, x, y, PAL.moss);

  return g;
}

// ---------------------------------------------------------------------
// caminho_terra (worn dirt path)
// ---------------------------------------------------------------------

function genCaminhoTerra(w, h) {
  const g = makeGrid(w, h);
  paintGroundGradient(g, w, h, [PAL.darkOliveBrown, PAL.clay, PAL.tan]);

  const pebblePairs = [
    [[3, 3], [4, 3]],
    [[12, 5], [13, 5]],
    [[6, 11], [7, 11]],
  ];
  for (const pair of pebblePairs) for (const [x, y] of pair) set(g, x, y, PAL.plumMid);

  const cracks = [[9, 3], [2, 9], [13, 12]];
  for (const [x, y] of cracks) set(g, x, y, PAL.black);

  const sunFlecks = [[5, 2], [10, 7]];
  for (const [x, y] of sunFlecks) set(g, x, y, PAL.lightGold);

  return g;
}

// ---------------------------------------------------------------------
// agua_ondula_2frames (water, 2-frame shimmer)
// ---------------------------------------------------------------------

function genAguaFrame(w, h, shift) {
  const g = makeGrid(w, h);
  paintGroundGradient(g, w, h, [PAL.darkTeal, PAL.teal, PAL.tealGreen]);

  const waveRows = [
    { y: 3, dashes: [{ x: 1, len: 2, tone: 'bright' }, { x: 9, len: 2, tone: 'bright' }] },
    { y: 7, dashes: [{ x: 5, len: 3, tone: 'pale' }, { x: 13, len: 2, tone: 'bright' }] },
    { y: 11, dashes: [{ x: 2, len: 2, tone: 'bright' }, { x: 10, len: 3, tone: 'pale' }] },
  ];
  // Art-reviewer round 1 finding: the shadow pixel sat one column past the
  // dash and one row down (a diagonal offset), reading as a stray dark
  // speck instead of a wave's shadowed underside. Now the shadow runs the
  // same columns directly beneath the highlight, so crest+trough read as
  // one wave shape.
  for (const row of waveRows) {
    for (const dash of row.dashes) {
      const color = dash.tone === 'bright' ? PAL.brightCyan : PAL.paleCyan;
      for (let i = 0; i < dash.len; i++) {
        const x = (dash.x + i + shift + w) % w;
        set(g, x, row.y, color);
        set(g, x, row.y + 1, PAL.darkIndigo);
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------
// margem_agua_4dir (issue #12: soften the grass->water hard cut)
// ---------------------------------------------------------------------
//
// A sandy/wet rim the client draws OVER a campina tile wherever that tile
// borders a water tile (site/src/renderer.ts). Deliberately not full
// autotiling (16 variants for every neighbor combination) - just one
// edge, hand-authored for "water is to the south", plus its three
// 90-degree rotations so the same strip works on any side a tile touches
// water. Corners (two adjacent sides touching water) fall out for free:
// the renderer draws one rotated copy per touching side and they overlap.
//
// Frame order: 0=S, 1=W, 2=N, 3=E (water-side). Mostly transparent (-1)
// so the campina tile underneath still carries almost the whole tile;
// only ~1/3 of the height (from the touching edge inward) gets sand.

/** Rotate a square palette-index grid 90 degrees clockwise. */
function rotateGridCW(g, size) {
  const out = makeGrid(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      set(out, size - 1 - y, x, get(g, x, y));
    }
  }
  return out;
}

/** Hand-authored edge: sand band grows in from the SOUTH (bottom) side. */
function genMargemAguaSouth(w, h) {
  const g = makeGrid(w, h);
  // Per-column start row of the sand band: one gentle rise + one gentle
  // dip, never more than 1px step between neighbouring columns. Art-
  // reviewer round 1 finding: an every-column up/down wave plus a full
  // dithered gradient inside such a short band both read as sharp
  // sawtooth "teeth" instead of a shoreline. Flat colour zones (below)
  // fixed the second half of that; this slower wave fixes the first.
  const edgeY = [10, 10, 10, 9, 9, 9, 10, 10, 10, 10, 11, 11, 11, 10, 10, 10];
  // A few dry-sand shadow flecks and waterline foam dashes - sparse
  // hand placement, same spirit as caminho_terra's pebbles/sunFlecks.
  const pebbles = new Set(['3,11', '9,12', '13,13']);
  const foamX = new Set([2, 7, 11]);

  for (let x = 0; x < w; x++) {
    const start = edgeY[x];
    for (let y = start; y < h; y++) {
      if (y === start) {
        // Feather row: grass crumbling into sand, not a hard edge.
        if (bayerThreshold(x, y) < 0.45) set(g, x, y, PAL.tan);
        continue;
      }
      // Flat zones instead of a dithered gradient: dw = rows from the
      // waterline (0 = touches water). A dry sand strip (tan) that grows
      // with the band, then a constant-width damp/wet strip right at the
      // edge - reads as clean shore, not noise.
      const dw = h - 1 - y;
      if (dw === 0) set(g, x, y, PAL.darkTeal);
      else if (dw <= 2) set(g, x, y, PAL.darkOliveBrown);
      else set(g, x, y, PAL.tan);
      if (pebbles.has(`${x},${y}`)) set(g, x, y, PAL.darkOliveBrown);
    }
    if (foamX.has(x)) set(g, x, h - 1, PAL.paleMint);
  }
  return g;
}

function genMargemAgua4Dir(w, h) {
  const south = genMargemAguaSouth(w, h);
  const west = rotateGridCW(south, w);
  const north = rotateGridCW(west, w);
  const east = rotateGridCW(north, w);
  return [south, west, north, east];
}

// ---------------------------------------------------------------------
// margem_agua_4dir_b (art-reviewer follow-up, PR #12: the single hand-
// authored edge above repeats bit-for-bit every 16px along a straight
// coastline - obvious at close zoom. Fix lives mostly in the renderer
// (site/src/renderer.ts, drawMeadowRim: per-tile hash picks this variant
// vs the original, plus an independent per-tile horizontal flip), but two
// near-identical edges hashed between each other would still look like an
// obvious A/B tile-swap. This is a second hand-authored edge: same
// technique and tone palette as genMargemAguaSouth (still reads as the
// same shoreline), different wave phase/amplitude and fleck placement, so
// the two variants don't line up with each other either.
// ---------------------------------------------------------------------

/** Second hand-authored edge: same technique as genMargemAguaSouth, different wave/flecks. */
function genMargemAguaSouthB(w, h) {
  const g = makeGrid(w, h);
  // Different phase and a touch wider swing than genMargemAguaSouth's
  // wave, still capped at a 1px step between neighbouring columns (same
  // art-reviewer rule: bigger steps read as sawtooth "teeth").
  const edgeY = [10, 9, 9, 9, 10, 10, 10, 11, 11, 11, 10, 10, 9, 9, 10, 10];
  const pebbles = new Set(['1,10', '6,11', '12,12']);
  const foamX = new Set([4, 9, 14]);

  for (let x = 0; x < w; x++) {
    const start = edgeY[x];
    for (let y = start; y < h; y++) {
      if (y === start) {
        if (bayerThreshold(x, y) < 0.45) set(g, x, y, PAL.tan);
        continue;
      }
      const dw = h - 1 - y;
      if (dw === 0) set(g, x, y, PAL.darkTeal);
      else if (dw <= 2) set(g, x, y, PAL.darkOliveBrown);
      else set(g, x, y, PAL.tan);
      if (pebbles.has(`${x},${y}`)) set(g, x, y, PAL.darkOliveBrown);
    }
    if (foamX.has(x)) set(g, x, h - 1, PAL.paleMint);
  }
  return g;
}

function genMargemAgua4DirB(w, h) {
  const south = genMargemAguaSouthB(w, h);
  const west = rotateGridCW(south, w);
  const north = rotateGridCW(west, w);
  const east = rotateGridCW(north, w);
  return [south, west, north, east];
}

// ---------------------------------------------------------------------
// nucleo_pulse_4frames (32x32, the heart of the world)
// ---------------------------------------------------------------------

function genNucleoFrame(w, h, { coreR, glowR, warm }) {
  const g = makeGrid(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const lightX = cx - 4;
  const lightY = cy - 4;

  const inCore = (x, y) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= coreR;
  const coreTones = [PAL.darkIndigo, PAL.violet, PAL.lightViolet, PAL.paleLavender];
  const auraTones = [PAL.indigo, PAL.violet, PAL.lightViolet];

  // Fissure offset from true center — a small scar, present at every frame,
  // always inside the core (min coreR is comfortably larger than this offset).
  const crackPixels = [
    [Math.round(cx), Math.round(cy) - 4],
    [Math.round(cx), Math.round(cy) - 3],
    [Math.round(cx) - 1, Math.round(cy) - 2],
  ];
  const crackSet = new Set(crackPixels.map(([x, y]) => `${x},${y}`));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= coreR) {
        const isEdge = neighbors4(x, y).some(([nx, ny]) => Math.hypot(nx + 0.5 - cx, ny + 0.5 - cy) > coreR);
        if (isEdge) {
          set(g, x, y, PAL.black);
          continue;
        }
        const dl = Math.hypot(x + 0.5 - lightX, y + 0.5 - lightY);
        const t = 1 - dl / (coreR * 1.7);
        let color = coreTones[ditherBand(x, y, t, coreTones.length)];

        // Warm "heartbeat" flush near the very center, strongest at peak frames.
        if (warm > 0) {
          const dc = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const innerR = coreR * 0.35;
          const outerR = coreR * 0.72 * warm;
          if (dc <= innerR) color = PAL.crimsonPink;
          else if (dc <= outerR) color = PAL.deepMagenta;
        }

        if (crackSet.has(`${x},${y}`)) color = PAL.black;
        set(g, x, y, color);
        continue;
      }
      if (d <= glowR) {
        const tGlow = 1 - d / glowR;
        if (tGlow < 0.18 && bayerThreshold(x, y) > tGlow / 0.18) continue; // dissolve into transparency
        set(g, x, y, auraTones[ditherBand(x, y, tGlow, auraTones.length)]);
      }
    }
  }

  // Cracked earth/stone socket the core rests in — only fills pixels still
  // transparent, so it never eats into the glow or the core itself.
  const socketRows = [
    { y: 26, x0: 13, x1: 18 },
    { y: 27, x0: 12, x1: 19 },
    { y: 28, x0: 12, x1: 19 },
    { y: 29, x0: 13, x1: 19 },
    { y: 30, x0: 14, x1: 18 },
  ];
  const socketAccent = new Set(['14,27', '17,28', '15,29']);
  for (const row of socketRows) {
    for (let x = row.x0; x <= row.x1; x++) {
      if (get(g, x, row.y) !== -1) continue;
      set(g, x, row.y, socketAccent.has(`${x},${row.y}`) ? PAL.plumDark : PAL.darkOliveBrown);
    }
  }

  return g;
}

// ---------------------------------------------------------------------
// no_avatar (16x16 player character, hooded traveler)
// ---------------------------------------------------------------------

function genNoAvatar(w, h) {
  const g = makeGrid(w, h);
  const outline = [
    [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2],
    [4, 3], [11, 3],
    [3, 4], [12, 4],
    [2, 5], [13, 5],
    [2, 6], [13, 6],
    [2, 7], [13, 7],
    [3, 8], [12, 8],
    [3, 9], [12, 9],
    [2, 10], [13, 10],
    [2, 11], [13, 11],
    [2, 12], [13, 12],
    [3, 13], [12, 13],
    [4, 14], [5, 14], [6, 14], [7, 14], [8, 14], [9, 14], [10, 14], [11, 14]
  ];
  for (const [x, y] of outline) {
    set(g, x, y, PAL.black);
  }
  for (let y = 3; y <= 7; y++) {
    for (let x = 3; x <= 12; x++) {
      if (get(g, x, y) !== -1) continue;
      if (x < 6) set(g, x, y, PAL.lightViolet);
      else if (x < 10) set(g, x, y, PAL.violet);
      else set(g, x, y, PAL.purple);
    }
  }
  for (let y = 8; y <= 13; y++) {
    for (let x = 3; x <= 12; x++) {
      if (get(g, x, y) !== -1) continue;
      if (x < 6) set(g, x, y, PAL.lightViolet);
      else if (x < 9) set(g, x, y, PAL.violet);
      else set(g, x, y, PAL.purple);
    }
  }
  const face = [
    [5, 5], [6, 5], [7, 5], [8, 5],
    [5, 6], [6, 6], [7, 6], [8, 6],
    [5, 7], [6, 7], [7, 7], [8, 7]
  ];
  for (const [x, y] of face) {
    set(g, x, y, PAL.paleYellow);
  }
  set(g, 5, 6, PAL.white);
  set(g, 6, 6, PAL.lightGold);
  set(g, 8, 6, PAL.lightGold);
  set(g, 11, 8, PAL.darkOliveBrown);
  set(g, 12, 8, PAL.tan);
  set(g, 12, 9, PAL.darkOliveBrown);
  set(g, 5, 13, PAL.darkIndigo);
  set(g, 9, 13, PAL.darkIndigo);
  return g;
}

// ---------------------------------------------------------------------
// Write everything out
// ---------------------------------------------------------------------

function writeTile(name, gridFn) {
  const w = 16, h = 16;
  writeSpriteSrc(path.join(SRC_DIR, `${name}.json`), {
    name,
    kind: 'tile',
    width: w,
    height: h,
    frames: [{ pixels: gridFn(w, h) }],
  });
  console.log(`authored ${name}.json`);
}

function run() {
  writeTile('campina_1', genCampina1);
  writeTile('campina_2', genCampina2);
  writeTile('campina_3', genCampina3);
  writeTile('campina_flores', genCampinaFlores);
  writeTile('floresta', genFloresta);
  writeTile('ruina', genRuina);
  writeTile('caminho_terra', genCaminhoTerra);

  writeSpriteSrc(path.join(SRC_DIR, 'agua_ondula_2frames.json'), {
    name: 'agua_ondula_2frames',
    kind: 'tile',
    width: 16,
    height: 16,
    notes: '2-frame water shimmer loop; frame1 shifts the wave dashes +3px.',
    frames: [{ pixels: genAguaFrame(16, 16, 0) }, { pixels: genAguaFrame(16, 16, 3) }],
  });
  console.log('authored agua_ondula_2frames.json');

  {
    const [south, west, north, east] = genMargemAgua4Dir(16, 16);
    writeSpriteSrc(path.join(SRC_DIR, 'margem_agua_4dir.json'), {
      name: 'margem_agua_4dir',
      kind: 'tile',
      width: 16,
      height: 16,
      notes:
        'Sandy/wet rim the client layers over a campina tile wherever it borders water (issue #12). ' +
        'Not an animation: 4 static orientation frames, water-side S,W,N,E - each a 90deg clockwise ' +
        'rotation of the hand-authored "south" edge (see rotateGridCW).',
      frames: [{ pixels: south }, { pixels: west }, { pixels: north }, { pixels: east }],
    });
    console.log('authored margem_agua_4dir.json');
  }

  {
    const [south, west, north, east] = genMargemAgua4DirB(16, 16);
    writeSpriteSrc(path.join(SRC_DIR, 'margem_agua_4dir_b.json'), {
      name: 'margem_agua_4dir_b',
      kind: 'tile',
      width: 16,
      height: 16,
      notes:
        'Second sandy/wet rim variant, same technique/palette as margem_agua_4dir but a different ' +
        'wave phase and fleck placement (art-reviewer follow-up, PR #12: a straight coastline repeated ' +
        'the exact same relief every 16px). The renderer (drawMeadowRim in site/src/renderer.ts) picks ' +
        'between this and margem_agua_4dir per-tile via a positional hash, plus an independent per-tile ' +
        'horizontal flip, so long coasts stop reading as an obviously tiled identical rim.',
      frames: [{ pixels: south }, { pixels: west }, { pixels: north }, { pixels: east }],
    });
    console.log('authored margem_agua_4dir_b.json');
  }

  writeSpriteSrc(path.join(SRC_DIR, 'nucleo_pulse_4frames.json'), {
    name: 'nucleo_pulse_4frames',
    kind: 'object',
    width: 32,
    height: 32,
    notes:
      'Breathing loop: f0 small/dim -> f1 growing -> f2 peak bright -> f3 receding -> loops to f0. ' +
      'Warm crimson/magenta flush near center scales with `warm` to read as a heartbeat rather than a flat glow.',
    frames: [
      { pixels: genNucleoFrame(32, 32, { coreR: 5.0, glowR: 10.0, warm: 0.15 }) },
      { pixels: genNucleoFrame(32, 32, { coreR: 6.2, glowR: 12.0, warm: 0.55 }) },
      { pixels: genNucleoFrame(32, 32, { coreR: 7.0, glowR: 13.5, warm: 1.0 }) },
      { pixels: genNucleoFrame(32, 32, { coreR: 6.0, glowR: 11.5, warm: 0.4 }) },
    ],
  });
  console.log('authored nucleo_pulse_4frames.json');

  writeSpriteSrc(path.join(SRC_DIR, 'no_avatar.json'), {
    name: 'no_avatar',
    kind: 'object',
    width: 16,
    height: 16,
    notes: 'The player avatar: a small hooded traveler.',
    frames: [{ pixels: genNoAvatar(16, 16) }],
  });
  console.log('authored no_avatar.json');
}

if (require.main === module) {
  run();
}

module.exports = { run };
