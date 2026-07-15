#!/usr/bin/env node
'use strict';
/**
 * One-off (but re-runnable) authoring script for the 3 Nativos of O Coração
 * (issue #23, Fase B — sprites only; map rendering lands in a later branch
 * once engine/ exposes the `Native` type).
 *
 * Same technique as author-sprites.cjs: each character is a hand-authored
 * matrix of palette indices, described here as small per-row boundary/fill
 * rules instead of 256 typed numbers. Once assets/sprites/src/nativo_*.json
 * exist, THEY are the source of truth — art-reviewer fixes are applied as
 * direct edits to those JSON files, not by blindly re-running this script
 * (see author-sprites.cjs's own docstring; same rule applies here).
 *
 * Design brief (see docs/LORE.md + engine/behavior.ts on
 * origin/colaborador2/v2 for the reference dialogue/homes/factions):
 *   - gota  (wanderer, água/orvalho): a dew-drop spirit. Smooth single-point
 *     teardrop silhouette, cool cyan/blue palette, glossy top-left highlight.
 *   - raiz  (merchant, floresta/terra): a sapling/root being. Twin leaf
 *     sprouts on top, stocky bark-brown trunk, asymmetric root tendrils
 *     hanging below (organic, intentionally uneven lengths).
 *   - cinza (guardian, ruínas/fim): a small stone sentinel. Flat-capped
 *     blocky "hourglass" silhouette (wide shoulders / narrow waist / stable
 *     base), cool grey-plum stone tones, two ember-red eye pixels (a quiet
 *     nod to the Detached Head lore without being graphic about it).
 *
 * None of the three reuse the player avatar's silhouette language (smooth
 * hooded arch, violet robe, single continuous taper, tan satchel) or its
 * dominant hue (violet/purple) — see no_avatar.json / genNoAvatar above.
 * That's deliberate: in-world lore, the Nós (players) are outside travelers
 * in cloaks; the Nativos are creatures native to O Coração itself.
 *
 * Usage: node assets/tools/author-nativos.cjs
 */

const path = require('path');
const { PAL } = require('./lib/palette-names.cjs');
const { makeGrid, set } = require('./lib/grid.cjs');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

const SRC_DIR = path.join(__dirname, '..', 'sprites', 'src');

/**
 * Fill one horizontal span [l..r] on row y: outline (PAL.black) at the two
 * edge columns l and r, interior fill (l+1..r-1) via `toneFn(x)`. When
 * l+1 > r-1 (e.g. l=r-1, a 2px tip) only the two outline pixels are drawn -
 * this is how genGota's single-point tip falls out of the same helper
 * without a special case.
 */
function fillSpan(g, y, l, r, toneFn) {
  set(g, l, y, PAL.black);
  set(g, r, y, PAL.black);
  for (let x = l + 1; x <= r - 1; x++) {
    set(g, x, y, toneFn(x));
  }
}

// ---------------------------------------------------------------------
// gota - dew-drop wanderer spirit
// ---------------------------------------------------------------------

function genGota(w, h) {
  const g = makeGrid(w, h);

  // left/right outline column per row - a single smooth point-to-round taper.
  const rows = [
    [2, 7, 8],
    [3, 6, 9],
    [4, 5, 10],
    [5, 4, 11],
    [6, 3, 12],
    [7, 2, 13],
    [8, 2, 13],
    [9, 2, 13],
    [10, 2, 13],
    [11, 3, 12],
    [12, 4, 11],
    [13, 5, 10],
  ];
  const tone = (x) => (x <= 6 ? PAL.paleBlue : x <= 9 ? PAL.skyBlue : PAL.blue);
  for (const [y, l, r] of rows) fillSpan(g, y, l, r, tone);

  // closed bottom hem (drop resting on a surface)
  for (let x = 6; x <= 9; x++) set(g, x, 14, PAL.black);

  // glossy top-left specular highlight (a real droplet's shine)
  set(g, 5, 5, PAL.paleCyan);
  set(g, 6, 5, PAL.white);
  set(g, 5, 6, PAL.paleCyan);

  // eyes
  set(g, 6, 9, PAL.darkTeal);
  set(g, 9, 9, PAL.darkTeal);

  return g;
}

// ---------------------------------------------------------------------
// raiz - sapling/root merchant
// ---------------------------------------------------------------------

function genRaiz(w, h) {
  const g = makeGrid(w, h);

  // Twin flower buds (asymmetric-looking pair, unlike gota's single tip).
  // Round 1 (art-reviewer): these were PAL.moss/PAL.sage (indices 36/37) -
  // which are the *exact* indices campina_1.json itself paints its grass
  // with (verified via the sprite source), so against the real meadow tile
  // the sprouts visually vanished into the background. Pink is nowhere in
  // any ground tile's palette, so it holds contrast on every biome.
  set(g, 6, 1, PAL.black);
  set(g, 10, 1, PAL.black);
  set(g, 6, 2, PAL.pink);
  set(g, 10, 2, PAL.mauvePink);

  // head/trunk: bark bands light(left) -> mid -> dark(right), same
  // top-left-lit column-banding technique as no_avatar/gota.
  const bark = (x) => (x <= 6 ? PAL.clay : x <= 9 ? PAL.rust : PAL.darkOliveBrown);
  set(g, 5, 3, PAL.pink); // flower tucked at left temple (top-left lit: brighter)
  set(g, 10, 3, PAL.mauvePink); // flower tucked at right temple (shadow side: darker)
  fillSpan(g, 3, 6, 9, bark);
  fillSpan(g, 4, 5, 10, bark);
  fillSpan(g, 5, 4, 11, bark);
  fillSpan(g, 6, 3, 12, bark);
  fillSpan(g, 7, 3, 12, bark);
  fillSpan(g, 8, 3, 12, bark);
  fillSpan(g, 9, 4, 11, bark);
  fillSpan(g, 10, 5, 10, bark);

  // eyes (on the widest/shoulders row)
  set(g, 6, 7, PAL.black);
  set(g, 9, 7, PAL.black);

  // Closing hem before the roots. Round 1 (art-reviewer): this spanned only
  // x6-9, so the outer left/right root pixels below (x5, x10) touched the
  // body only diagonally - an orphan-pixel defect. Widened to x5-10 to match
  // row 10's span exactly, so every root lands 4-connected under a hem pixel.
  for (let x = 5; x <= 10; x++) set(g, x, 11, PAL.black);

  // 3 root tendrils, intentionally uneven lengths (organic, not a rendering
  // slip - left is a short stub, right medium, center longest).
  set(g, 5, 12, PAL.black); // left root: short stub
  set(g, 10, 12, PAL.rust); // right root: medium
  set(g, 10, 13, PAL.black);
  set(g, 7, 12, PAL.clay); // center root: longest
  set(g, 8, 12, PAL.rust);
  set(g, 7, 13, PAL.clay);
  set(g, 8, 13, PAL.rust);
  set(g, 7, 14, PAL.black);
  set(g, 8, 14, PAL.black);

  return g;
}

// ---------------------------------------------------------------------
// cinza - stone guardian sentinel
// ---------------------------------------------------------------------

function genCinza(w, h) {
  const g = makeGrid(w, h);

  // flat capped top (blocky, unlike gota's point / raiz's twin sprouts)
  for (let x = 5; x <= 10; x++) set(g, x, 2, PAL.black);

  const stone = (x) => (x <= 6 ? PAL.paleBlueGrey : x <= 9 ? PAL.greyPurple : PAL.plumMid);

  fillSpan(g, 3, 4, 11, stone);
  fillSpan(g, 4, 3, 12, stone); // shoulders widen - blocky, minimal curve
  fillSpan(g, 5, 3, 12, stone);
  fillSpan(g, 6, 3, 12, stone);
  fillSpan(g, 7, 3, 12, stone);
  fillSpan(g, 8, 3, 12, stone);
  fillSpan(g, 9, 4, 11, stone);
  // Waist pinch, 2 rows tall. Round 1 (art-reviewer): a single-row pinch
  // (only row 11) was too subtle at 16x16 to read as an intentional
  // "hourglass" guardian silhouette - it looked like edge noise instead.
  // Two rows makes the step unambiguous.
  fillSpan(g, 10, 5, 10, stone);
  fillSpan(g, 11, 5, 10, stone);
  fillSpan(g, 12, 4, 11, stone); // base flares back out - stable footing
  fillSpan(g, 13, 4, 11, stone);

  // Ember eyes - quiet nod to the Detached Head lore, not graphic about it.
  set(g, 6, 6, PAL.crimson);
  set(g, 9, 6, PAL.crimson);

  // Round 1 (art-reviewer): a single-pixel "weathering crack" (one shade
  // darker, same hue family) was dropped here - at this scale it read as a
  // stray/dirty pixel rather than a legible crack, so it was cut rather
  // than kept as ambiguous noise.

  // two-block stubby feet with a gap (vs gota's single hem / raiz's roots)
  set(g, 5, 14, PAL.black);
  set(g, 6, 14, PAL.black);
  set(g, 9, 14, PAL.black);
  set(g, 10, 14, PAL.black);

  return g;
}

// ---------------------------------------------------------------------
// Write everything out
// ---------------------------------------------------------------------

function writeNative(name, displayLabel, gridFn, notes) {
  writeSpriteSrc(path.join(SRC_DIR, `nativo_${name}.json`), {
    name: `nativo_${name}`,
    kind: 'object',
    width: 16,
    height: 16,
    notes,
    frames: [{ pixels: gridFn(16, 16) }],
  });
  console.log(`authored nativo_${name}.json (${displayLabel})`);
}

function run() {
  writeNative(
    'gota',
    'Gota',
    genGota,
    'Nativo wanderer (issue #23). Dew-drop spirit: smooth single-point ' +
      'teardrop silhouette, cool cyan/blue, glossy top-left highlight. ' +
      'Home (0,0), speaks world lore when a player is near (see NPC_HOMES / ' +
      'DIALOGUES.say_lore in engine/behavior.ts on origin/colaborador2/v2).'
  );
  writeNative(
    'raiz',
    'Raiz',
    genRaiz,
    'Nativo merchant (issue #23). Sapling/root being: twin leaf sprouts, ' +
      'stocky bark trunk, 3 asymmetric root tendrils (short/medium/long - ' +
      'intentional organic variation). Warm brown/green palette. Trades ' +
      'wood, greets players (see engine/behavior.ts merchant BT on ' +
      'origin/colaborador2/v2).'
  );
  writeNative(
    'cinza',
    'Cinza',
    genCinza,
    'Nativo guardian (issue #23). Stone sentinel: flat-capped blocky ' +
      'hourglass silhouette, cool grey/plum stone tones, ember-red eyes. ' +
      'Warns players away from the ruins and of the Detached Head (see ' +
      'engine/behavior.ts guardian BT / say_warning on ' +
      'origin/colaborador2/v2). Highest HP of the three - reads heavier/' +
      'more armored than gota or raiz.'
  );
}

if (require.main === module) {
  run();
}

module.exports = { run, genGota, genRaiz, genCinza };
