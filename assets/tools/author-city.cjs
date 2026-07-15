#!/usr/bin/env node
'use strict';
/**
 * Authoring script for A Cidade's sprite kit (R7, docs/CITY_PLAN.md):
 *
 *   ground tiles   laje_praca / laje_praca_b   (plaza flagstones, 2 variants)
 *                  calcada_veia / calcada_veia_b (avenue pavement, plain / light-vein node)
 *   objects        pilar_pulso_4frames         (light pylon breathing with o Núcleo)
 *                  arco_desperto               (awake portal-hall arch)
 *                  arco_semente                (dormant arch socket - room to grow)
 *                  pedra_mural                 (the mural stone at o Largo)
 *
 * Same contract as author-sprites.cjs: this generates the initial matrices
 * under assets/sprites/src/ via small geometric rules; after that, the JSON
 * files are the source of truth and targeted art-review fixes are applied
 * as direct edits there (or by refining a rule here and re-running - noted
 * per finding in comments below).
 *
 * THEME (CITY_PLAN "atemporal mítico-tecnológico"): every stone below uses
 * the SAME plum/grey family as ruina.json - the city and the ruins are one
 * architecture, one civilization - and every light accent uses the Núcleo's
 * violet family, because the city runs on the same Pulse the Core breathes.
 * Light from the top-left, 1px black outline on standing objects, Resurrect
 * 64 only - the T7 conventions throughout.
 *
 * Usage: node assets/tools/author-city.cjs
 */

const path = require('path');
const { PAL } = require('./lib/palette-names.cjs');
const { ditherBand, lightT, bayerThreshold } = require('./lib/dither.cjs');
const { makeGrid, set, get } = require('./lib/grid.cjs');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

const SRC_DIR = path.join(__dirname, '..', 'sprites', 'src');

/** Stone ramp shared with ruina.json - the city IS the ruins' architecture. */
const STONE_TONES = [PAL.plumDark, PAL.plumMid, PAL.greyPurple, PAL.paleBlueGrey];

function neighbors4(x, y) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

/**
 * Compressed-amplitude stone gradient (the campina AMPLITUDE=0.4 lesson from
 * author-sprites.cjs: ground tiles repeat edge to edge, so a full-range
 * corner-to-corner sweep turns every tile boundary into a brightness cliff).
 */
function paintStoneGradient(g, w, h, tones) {
  const AMPLITUDE = 0.35;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const raw = lightT(x, y, w, h);
      const t = 0.5 + (raw - 0.5) * AMPLITUDE;
      set(g, x, y, tones[ditherBand(x, y, t, tones.length)]);
    }
  }
}

// ---------------------------------------------------------------------
// laje_praca / laje_praca_b (plaza flagstones)
// ---------------------------------------------------------------------
//
// Big irregular slabs with recessed joints, moss reclaiming a couple of
// seams and (variant a only) one corner slab missing, showing packed
// earth - "a praça foi encontrada, não construída". Deliberately NO joint
// along the tile border: adjacent tiles merge into organic ancient paving
// instead of a hard 16px grid, the same reasoning that keeps the campina
// variants border-free.

/**
 * Region map -> flagstones. Each character names a slab; a pixel whose RIGHT
 * or BOTTOM neighbour belongs to a different slab becomes a recessed joint.
 * Scene self-audit round 2 finding (R2-2): the first version used
 * full-width horizontal joint rows, which nearly aligned from tile to tile
 * and made the whole plaza read as a BRICK WALL laid on the ground. True
 * crazy paving needs joints that stop and stagger - hence explicit slab
 * regions instead of joint lines.
 */
function slabsFromRegionMap(g, w, h, rows, tones) {
  if (rows.length !== h || rows.some((r) => r.length !== w)) {
    throw new Error(`region map must be ${w}x${h}; got rows of lengths [${rows.map((r) => r.length).join(',')}]`);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = rows[y][x];
      const rightDiff = x + 1 < w && rows[y][x + 1] !== id;
      const downDiff = y + 1 < h && rows[y + 1][x] !== id;
      if (rightDiff || downDiff) {
        set(g, x, y, PAL.plumDark);
        continue;
      }
      const t = lightT(x, y, w, h);
      set(g, x, y, tones[ditherBand(x, y, 0.5 + (t - 0.5) * 0.35, tones.length)]);
    }
  }
}

function genLajePraca(w, h, variant) {
  const g = makeGrid(w, h);
  // Irregular slab layout, no joint on the tile border (adjacent tiles merge
  // into organic ancient paving, the campina-variant reasoning). Variant b
  // re-cuts every slab so the hash mix never settles into an A-B rhythm.
  // Site self-audit round 3 (R3-8): the smallest 3-4px slabs read as grey
  // noise at whole-map zoom - both maps had their tiniest slab merged into
  // a neighbour (fewer joints far away, same crazy paving up close).
  const rowsA = [
    'aaaaabbbbbbccccc',
    'aaaaabbbbbbccccc',
    'aaaaabbbbbbccccc',
    'dddaabbbbeeecccc',
    'dddddbbbbeeeeccc',
    'dddddffffeeeeccc',
    'dddddffffeeeeggg',
    'hhhddffffeeeeggg',
    'hhhhhffffiiiiggg',
    'hhhhhhffiiiiiggg',
    'hhhhhjjjjiiiiggg',
    'kkhhhjjjjiiiiggg',
    'kkkkkjjjjiiillll',
    'kkkkkjjjjjilllll',
    'kkkkkjjjjjllllll',
    'kkkkkjjjjjllllll',
  ];
  const rowsB = [
    'nnnnoooooopppppp',
    'nnnnoooooopppppp',
    'nnnnnooooopppppp',
    'qqnnnooorrrrpppp',
    'qqqqqooorrrrrppp',
    'qqqqqsssrrrrrttt',
    'qqqqssssrrrrrttt',
    'uuuqssssrrrttttt',
    'uuuusssssvvvvttt',
    'uuuuusssvvvvvttt',
    'uuuuwwwwvvvvvttt',
    'xxuuwwwwwvvvyyyy',
    'xxxxwwwwwvvvyyyy',
    'xxxxxwwwwvyyyyyy',
    'xxxxxwwwwyyyyyyy',
    'xxxxwwwwyyyyyyyy',
  ];
  // Plaza floor: one half-step LIGHTER than the avenue (greyPurple twice in
  // the ramp) - scene round 2 (R2-3): the public room reads pale, the road
  // reads mid, so the two floors never blur into one grey mass.
  slabsFromRegionMap(g, w, h, variant === 'a' ? rowsA : rowsB, [
    PAL.plumMid,
    PAL.greyPurple,
    PAL.greyPurple,
    PAL.paleBlueGrey,
  ]);

  // Weathering: black pits at a few joint meetings, moss reclaiming seams,
  // one pale lit corner. All hand-placed, all different between variants.
  const pits = variant === 'a' ? [[10, 4], [4, 11], [13, 8]] : [[5, 3], [11, 10], [3, 13]];
  for (const [x, y] of pits) set(g, x, y, PAL.black);
  const moss = variant === 'a' ? [[4, 3], [9, 12], [14, 6], [1, 14]] : [[7, 5], [12, 2], [2, 9], [10, 15]];
  for (const [x, y] of moss) set(g, x, y, PAL.moss);
  const glints = variant === 'a' ? [[1, 1], [11, 6]] : [[6, 1], [1, 10]];
  for (const [x, y] of glints) set(g, x, y, PAL.paleBlueGrey);

  // Variant a: a chipped slab corner showing packed earth (bottom-right,
  // away from the light) - the plaza's age in a single quiet detail. Site
  // self-audit round 3 finding (R3-15): the first take was a 5px hole, and
  // at ~50% tile frequency the repeated notch became an obvious motif at
  // close zoom - now a 3px chip that reads as wear, not as a pattern.
  if (variant === 'a') {
    const chip = [
      [15, 14], [14, 15], [15, 15],
    ];
    for (const [x, y] of chip) set(g, x, y, PAL.darkOliveBrown);
  }
  return g;
}

// ---------------------------------------------------------------------
// calcada_veia / calcada_veia_b (avenue pavement)
// ---------------------------------------------------------------------
//
// Rectangular courses in running bond (reads as a BUILT road, vs the
// plaza's organic slabs) - and, on variant b only, the light-vein node:
// a small violet seam glowing between the stones. The renderer scatters b
// along the avenue by positional hash, so the vein surfaces every few
// tiles - "sob as lajes corre uma veia que ninguém cavou" (CITY_PLAN).

function genCalcadaVeia(w, h, variant) {
  const g = makeGrid(w, h);
  paintStoneGradient(g, w, h, [PAL.plumDark, PAL.plumMid, PAL.plumMid, PAL.greyPurple]);

  // Course joints every 5-6 rows; header joints staggered per course.
  const courseY = [4, 9, 14];
  for (const y of courseY) {
    for (let x = 0; x < w; x++) set(g, x, y, PAL.plumDark);
  }
  const headers = variant === 'a' ? [[5, 0, 3], [11, 5, 8], [3, 10, 13], [13, 15, 15]] : [[8, 0, 3], [2, 5, 8], [12, 5, 8], [6, 10, 13]];
  for (const [x, y0, y1] of headers) {
    for (let y = y0; y <= y1; y++) set(g, x, y, PAL.plumDark);
  }

  // Weathering: pits + one moss seam + one pale glint (kept sparser than
  // the plaza - a road is walked, the plaza is lived on).
  const pits = variant === 'a' ? [[11, 9], [3, 14]] : [[8, 4], [6, 14]];
  for (const [x, y] of pits) set(g, x, y, PAL.black);
  set(g, variant === 'a' ? 1 : 14, variant === 'a' ? 4 : 9, PAL.moss);
  set(g, variant === 'a' ? 12 : 4, variant === 'a' ? 1 : 6, PAL.paleBlueGrey);

  if (variant === 'b') {
    // The vein node: light pooling in the joints around the tile's heart -
    // an X of violet seams with a lavender core, dimming outward through
    // the Núcleo's own ramp (indigo -> violet -> lightViolet -> lavender).
    set(g, 7, 6, PAL.violet);
    set(g, 8, 6, PAL.lightViolet);
    set(g, 7, 7, PAL.lightViolet);
    set(g, 8, 7, PAL.paleLavender);
    set(g, 6, 7, PAL.violet);
    set(g, 9, 6, PAL.violet);
    set(g, 7, 8, PAL.violet);
    set(g, 8, 5, PAL.violet);
    set(g, 6, 5, PAL.darkIndigo);
    set(g, 9, 8, PAL.darkIndigo);
    set(g, 5, 6, PAL.darkIndigo);
    set(g, 10, 7, PAL.darkIndigo);
  }
  return g;
}

// ---------------------------------------------------------------------
// pilar_pulso_4frames (light pylon)
// ---------------------------------------------------------------------
//
// A tapering stone stele with a carved light-vein that breathes on the SAME
// 4-frame clock as nucleo_pulse_4frames (site/src/renderer.ts reuses
// CORE_FRAME_MS for it): f0 dim -> f1 waking -> f2 peak -> f3 receding.
// The peak flushes crimson at the heart of the vein, exactly like the
// Núcleo's own heartbeat - one Pulse, one city.

function genPilarFrame(w, h, phase) {
  // phase: 0 dim, 1 waking, 2 peak, 3 receding
  const g = makeGrid(w, h);

  // Silhouette: cap (rows 1-2), shaft (rows 3-12, 4 wide), plinth (rows 13-14, 8 wide).
  const shaftX0 = 6;
  const shaftX1 = 9;
  const inShaft = (x, y) => x >= shaftX0 && x <= shaftX1 && y >= 3 && y <= 12;
  const inCap = (x, y) => x >= shaftX0 - 1 && x <= shaftX1 + 1 && y >= 1 && y <= 2;
  const inPlinth = (x, y) => x >= shaftX0 - 2 && x <= shaftX1 + 2 && y >= 13 && y <= 14;
  const inBody = (x, y) => inShaft(x, y) || inCap(x, y) || inPlinth(x, y);

  // Outline first (1px black, same weight as nativos/avatar).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBody(x, y)) continue;
      const isEdge = neighbors4(x, y).some(([nx, ny]) => nx < 0 || ny < 0 || nx >= w || ny >= h || !inBody(nx, ny));
      set(g, x, y, isEdge ? PAL.black : PAL.plumMid);
    }
  }
  // Top-left light on the interior stone.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(g, x, y) !== PAL.plumMid) continue;
      const t = lightT(x, y, w, h);
      set(g, x, y, STONE_TONES[ditherBand(x, y, 0.25 + t * 0.5, STONE_TONES.length)]);
    }
  }

  // The carved vein: 1px channel down the shaft's shadow side of center.
  const veinX = 8;
  const veinTones = [
    { line: PAL.darkIndigo, heart: PAL.indigo, halo: null }, // f0 dim
    { line: PAL.violet, heart: PAL.lightViolet, halo: null }, // f1 waking
    { line: PAL.lightViolet, heart: PAL.crimsonPink, halo: PAL.paleLavender }, // f2 peak - the Núcleo's flush
    { line: PAL.violet, heart: PAL.deepMagenta, halo: null }, // f3 receding
  ][phase];
  for (let y = 4; y <= 11; y++) set(g, veinX, y, veinTones.line);
  set(g, veinX, 7, veinTones.heart);
  set(g, veinX, 8, veinTones.heart);
  // Capstone gem wakes with the vein.
  set(g, 7, 1, phase === 2 ? PAL.paleLavender : veinTones.line);
  if (veinTones.halo !== null) {
    // Peak only: light spills one pixel out of the channel and off the
    // capstone - kept to 3 stray pixels so the pylon glows, never strobes.
    set(g, veinX - 1, 7, PAL.violet);
    set(g, veinX + 1, 9, PAL.violet);
    set(g, 7, 0, PAL.violet);
  }
  return g;
}

// ---------------------------------------------------------------------
// arco_desperto (awake portal-hall arch)
// ---------------------------------------------------------------------
//
// A complete stone arch, awake but NOT open: a few indigo/blue motes drift
// inside the opening (the void's family from portal_2frames, far dimmer),
// while the living portal tile itself keeps the animated client marker.
// One quiet violet keystone - the same accent the portal marker and the
// oficina console carry (the HUD-accent rhyme noted in assets/CREDITS.md).

function genArcoDesperto(w, h) {
  const g = makeGrid(w, h);
  const inColL = (x, y) => x >= 2 && x <= 4 && y >= 4 && y <= 13;
  const inColR = (x, y) => x >= 11 && x <= 13 && y >= 4 && y <= 13;
  // Lintel: an ARC, not a square beam - art self-audit round 1 finding
  // (R1-1): the living portal marker (portal_2frames) is a rounded oval, so
  // a square-shouldered neighbor made the gate rank read as two different
  // architectures. The top rows step inward (row 3 full span, row 2 inset,
  // row 1 inset again) and the opening's own corners fill at row 4, giving
  // both faces of the lintel a curve.
  const inLintel = (x, y) =>
    (y === 3 && x >= 2 && x <= 13) ||
    (y === 2 && x >= 3 && x <= 12) ||
    (y === 1 && x >= 5 && x <= 10) ||
    (y === 4 && (x === 5 || x === 10));
  const inFeet = (x, y) => y === 14 && ((x >= 1 && x <= 5) || (x >= 10 && x <= 14));
  const inBody = (x, y) => inColL(x, y) || inColR(x, y) || inLintel(x, y) || inFeet(x, y);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBody(x, y)) continue;
      const isEdge = neighbors4(x, y).some(([nx, ny]) => nx < 0 || ny < 0 || nx >= w || ny >= h || !inBody(nx, ny));
      set(g, x, y, isEdge ? PAL.black : PAL.plumMid);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(g, x, y) !== PAL.plumMid) continue;
      const t = lightT(x, y, w, h);
      set(g, x, y, STONE_TONES[ditherBand(x, y, 0.25 + t * 0.5, STONE_TONES.length)]);
    }
  }
  // Keystone (violet, the accent rhyme) + mortar hints on the columns.
  set(g, 7, 2, PAL.violet);
  set(g, 8, 2, PAL.violet);
  set(g, 3, 7, PAL.plumDark);
  set(g, 12, 9, PAL.plumDark);
  set(g, 3, 11, PAL.plumDark);
  // The awake hum - scene self-audit round 2 finding (R2-9): 4 loose motes
  // vanished against the flagstone showing through the opening, leaving
  // "awake" and "dormant" too close at a glance. Now a dim indigo veil
  // (ordered dither, ~half coverage, denser toward the bottom of the
  // opening) fills the void, with two blue glints - still far quieter than
  // the living portal's saturated spinning void, but unmistakably awake.
  for (let y = 5; y <= 13; y++) {
    for (let x = 5; x <= 10; x++) {
      if (get(g, x, y) !== -1) continue;
      const depth = (y - 5) / 8; // veil thickens downward
      if (bayerThreshold(x, y) < 0.35 + depth * 0.4) {
        set(g, x, y, depth > 0.55 ? PAL.darkIndigo : PAL.indigo);
      }
    }
  }
  set(g, 7, 7, PAL.blue);
  set(g, 9, 11, PAL.blue);
  return g;
}

// ---------------------------------------------------------------------
// arco_semente (dormant arch socket)
// ---------------------------------------------------------------------
//
// What an arch is before a world arrives: two broken column stumps, the
// would-be lintel stones still lying between them, moss already trying.
// Zero light pixels ON PURPOSE - dormant means dormant; the day a
// federated world lands, a one-line future migration flips this tile's
// deco to 'arch' and it wakes (CITY_PLAN "Plano de crescimento").

function genArcoSemente(w, h) {
  const g = makeGrid(w, h);
  // Art self-audit round 1 finding (R1-2): a full-width base row merged the
  // stumps and the fallen stones into one illegible dark wall. Now the two
  // stumps stand on the SAME columns as arco_desperto's (x 2-4 / 11-13, so
  // the before/after relationship is architectural, not implied), the feet
  // exist only under each stump, and the fallen lintel is two separate cut
  // blocks with a visible seam, lying between them on bare floor.
  const inStumpL = (x, y) => x >= 2 && x <= 4 && y >= 7 && y <= 13;
  const inStumpR = (x, y) => x >= 11 && x <= 13 && y >= 9 && y <= 13;
  const inFallenA = (x, y) => y >= 12 && y <= 13 && x >= 6 && x <= 7;
  const inFallenB = (x, y) => y >= 12 && y <= 13 && x >= 8 && x <= 9;
  const inFeet = (x, y) => y === 14 && ((x >= 1 && x <= 5) || (x >= 10 && x <= 14));
  const inBody = (x, y) => inStumpL(x, y) || inStumpR(x, y) || inFallenA(x, y) || inFallenB(x, y) || inFeet(x, y);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBody(x, y)) continue;
      const isEdge = neighbors4(x, y).some(([nx, ny]) => nx < 0 || ny < 0 || nx >= w || ny >= h || !inBody(nx, ny));
      set(g, x, y, isEdge ? PAL.black : PAL.plumMid);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(g, x, y) !== PAL.plumMid) continue;
      const t = lightT(x, y, w, h);
      // Slightly brighter ramp than round 1 (0.3 base instead of 0.2) so the
      // stumps read as cut stone, not shadow-blobs (R1-2).
      set(g, x, y, STONE_TONES[ditherBand(x, y, 0.3 + t * 0.5, STONE_TONES.length)]);
    }
  }
  // Jagged break line on each stump top + the seam between the fallen blocks.
  set(g, 3, 7, PAL.black);
  set(g, 12, 9, PAL.black);
  set(g, 7, 12, PAL.black);
  set(g, 8, 13, PAL.black);
  // Moss reclaiming the left stump and one fallen stone.
  set(g, 2, 12, PAL.moss);
  set(g, 3, 13, PAL.moss);
  set(g, 9, 12, PAL.moss);
  return g;
}

// ---------------------------------------------------------------------
// pedra_mural (the mural stone at o Largo)
// ---------------------------------------------------------------------
//
// A rounded-top stele carved with rows of small colored marks - the voices
// of the Nós, in the same colors the HUD's Mural panel could never have:
// cyan, gold, pink, pale yellow. Irregular line lengths on purpose, like
// lines of speech, not a pattern. "A pedra guarda o que os Nós disseram."

function genPedraMural(w, h) {
  const g = makeGrid(w, h);
  const inSlab = (x, y) => {
    if (y >= 3 && y <= 13 && x >= 3 && x <= 12) return true;
    if (y === 2 && x >= 4 && x <= 11) return true; // rounded shoulder
    return false;
  };
  const inFeet = (x, y) => y === 14 && x >= 2 && x <= 13;
  const inBody = (x, y) => inSlab(x, y) || inFeet(x, y);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inBody(x, y)) continue;
      const isEdge = neighbors4(x, y).some(([nx, ny]) => nx < 0 || ny < 0 || nx >= w || ny >= h || !inBody(nx, ny));
      set(g, x, y, isEdge ? PAL.black : PAL.plumMid);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(g, x, y) !== PAL.plumMid) continue;
      const t = lightT(x, y, w, h);
      set(g, x, y, STONE_TONES[ditherBand(x, y, 0.3 + t * 0.5, STONE_TONES.length)]);
    }
  }
  // The carved voices: one message per row, dash lengths deliberately uneven.
  const lines = [
    { y: 4, x0: 5, len: 5, tone: PAL.paleCyan },
    { y: 6, x0: 5, len: 3, tone: PAL.gold },
    { y: 8, x0: 5, len: 6, tone: PAL.lightPink },
    { y: 10, x0: 5, len: 4, tone: PAL.paleYellow },
    { y: 12, x0: 5, len: 2, tone: PAL.paleCyan },
  ];
  for (const { y, x0, len, tone } of lines) {
    for (let i = 0; i < len; i++) {
      // 1px gap mid-line on the longer rows - words, not bars.
      if (len >= 5 && i === 2) continue;
      set(g, x0 + i, y, tone);
    }
  }
  // Moss at the foot, shadow side.
  set(g, 11, 13, PAL.moss);
  set(g, 12, 14, PAL.moss);
  return g;
}

// ---------------------------------------------------------------------
// Write everything out
// ---------------------------------------------------------------------

function writeTile(name, grid, notes) {
  writeSpriteSrc(path.join(SRC_DIR, `${name}.json`), {
    name,
    kind: 'tile',
    width: 16,
    height: 16,
    notes,
    frames: [{ pixels: grid }],
  });
  console.log(`authored ${name}.json`);
}

function writeObject(name, frames, notes) {
  writeSpriteSrc(path.join(SRC_DIR, `${name}.json`), {
    name,
    kind: 'object',
    width: 16,
    height: 16,
    notes,
    frames: frames.map((pixels) => ({ pixels })),
  });
  console.log(`authored ${name}.json`);
}

function run() {
  writeTile(
    'laje_praca',
    genLajePraca(16, 16, 'a'),
    'Plaza flagstone ground (deco "plaza", R7 CITY_PLAN). Border-free irregular slabs in the ruina.json stone family; variant pair with laje_praca_b, picked per-tile by positional hash in site/src/renderer.ts.',
  );
  writeTile(
    'laje_praca_b',
    genLajePraca(16, 16, 'b'),
    'Second plaza flagstone variant: same technique/tones as laje_praca, every joint/accent shifted so the hash mix never reads as an A-B checkerboard.',
  );
  writeTile(
    'calcada_veia',
    genCalcadaVeia(16, 16, 'a'),
    'Avenue pavement (deco "pavement"), running-bond stone courses, no vein - the common tile of the pair (renderer shows the veined variant on a hashed minority of tiles).',
  );
  writeTile(
    'calcada_veia_b',
    genCalcadaVeia(16, 16, 'b'),
    'Veined pavement variant: a violet light-node pooling in the joints (Núcleo ramp indigo->violet->lightViolet->paleLavender) - "sob as lajes corre uma veia que ninguém cavou".',
  );
  writeObject(
    'pilar_pulso_4frames',
    [0, 1, 2, 3].map((phase) => genPilarFrame(16, 16, phase)),
    'Light pylon (deco "pylon"): stone stele whose carved vein breathes on the SAME 4-frame clock as nucleo_pulse_4frames (renderer reuses CORE_FRAME_MS) - f2 peak flushes crimson like the Núcleo heartbeat. Drawn over a hashed laje_praca base by the renderer.',
  );
  writeObject(
    'arco_desperto',
    [genArcoDesperto(16, 16)],
    'Awake portal-hall arch (deco "arch"): complete stone arch, transparent opening with 4 drifting indigo/blue motes (the portal void family, far dimmer), violet keystone rhyme. Static on purpose - only the living portal marker animates.',
  );
  writeObject(
    'arco_semente',
    [genArcoSemente(16, 16)],
    'Dormant arch socket (deco "arch_dormant"): broken stumps + fallen lintel + moss, ZERO light pixels - the visible room for the next federated world (D-17: one more world, one more arch).',
  );
  writeObject(
    'pedra_mural',
    [genPedraMural(16, 16)],
    'The mural stone at o Largo do Mural (deco "mural_stone"): rounded stele carved with uneven colored dash-rows - the voices of the Nós (/dizer) made stone.',
  );
}

if (require.main === module) {
  run();
}

module.exports = { run };
