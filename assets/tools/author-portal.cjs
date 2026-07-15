#!/usr/bin/env node
'use strict';
/**
 * One-off (but re-runnable) authoring script for the Portal marker sprite
 * (R6 fase 1 — Portais, D-17). Kept separate from author-sprites.cjs and
 * author-nativos.cjs — same precedent as the latter being split from the
 * former: a single self-contained new landmark gets its own script. Once
 * assets/sprites/src/portal_2frames.json exists, THAT file is the source of
 * truth — re-running this blindly would clobber any hand-tweak applied
 * directly to the JSON later (same warning as the other two authoring
 * scripts' own docstrings).
 *
 * Design: an ancient stone archway (ruina-family plum/grey stone tones —
 * ties the portal to "something old that was always here, waiting", not a
 * shiny sci-fi gadget) framing a swirling indigo/blue void. Indigo/blue is a
 * colour family no other sprite currently uses: o Núcleo is violet/crimson
 * (genNucleoFrame, author-sprites.cjs), A Fábrica's oficina is a violet
 * console (oficina.json), água is teal/cyan (genAguaFrame) — so a portal
 * never reads as "another Núcleo" or "a puddle" at a glance. A single
 * lightViolet keystone pixel at the apex quietly ties it back to the HUD's
 * own accent colour (--nos-accent), the same way the oficina sprite's glow
 * slot nods at the Núcleo.
 *
 * 2 frames: the void's spiral arms rotate half a turn and its drifting
 * motes shift between frames — see PORTAL_FRAME_MS in site/src/renderer.ts
 * for the ~700ms cadence, deliberately distinct from o Núcleo's 350ms
 * heartbeat and água's 1000ms shimmer so none of the three visually sync up.
 *
 * Usage: node assets/tools/author-portal.cjs
 */

const path = require('path');
const { PAL } = require('./lib/palette-names.cjs');
const { ditherBand, lightT } = require('./lib/dither.cjs');
const { makeGrid, set, get } = require('./lib/grid.cjs');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

const SRC_DIR = path.join(__dirname, '..', 'sprites', 'src');

const CX = 7.5;
const CY = 7.8;
const OUTER_RX = 5.6;
const OUTER_RY = 6.6;
const INNER_RX = 4.0;
const INNER_RY = 5.0;

function neighbors4(x, y) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

function ellipseD(x, y, rx, ry) {
  const ex = x + 0.5 - CX;
  const ey = y + 0.5 - CY;
  return (ex / rx) * (ex / rx) + (ey / ry) * (ey / ry);
}

/**
 * One frame of the portal: stone ring (top-left-lit dithered gradient, same
 * technique as genRuina's stone fill) around a swirling void (radial glow +
 * 2 rotating spiral-arm highlights, same technique as genNucleoFrame's aura,
 * reinterpreted with an angle term for the swirl). `swirlPhase` rotates the
 * arms between the 2 frames; `motes` are a couple of free-floating spark
 * pixels placed independently per frame so they read as adrift.
 */
function genPortalFrame(w, h, { swirlPhase, motes }) {
  const g = makeGrid(w, h);
  const stoneTones = [PAL.plumDark, PAL.plumMid, PAL.greyPurple, PAL.paleBlueGrey];
  const voidTones = [PAL.darkIndigo, PAL.indigo, PAL.blue, PAL.skyBlue];

  const inOuter = (x, y) => ellipseD(x, y, OUTER_RX, OUTER_RY) <= 1;
  const inInner = (x, y) => ellipseD(x, y, INNER_RX, INNER_RY) <= 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inOuter(x, y)) continue;
      if (!inInner(x, y)) {
        const t = lightT(x, y, w, h);
        set(g, x, y, stoneTones[ditherBand(x, y, t, stoneTones.length)]);
        continue;
      }
      const ex = x + 0.5 - CX;
      const ey = y + 0.5 - CY;
      const radius = Math.sqrt(ellipseD(x, y, INNER_RX, INNER_RY)); // 0 centre .. 1 inner ring edge
      const angle = Math.atan2(ey / INNER_RY, ex / INNER_RX);
      const swirl = Math.sin(angle * 2 + radius * 5 + swirlPhase);
      let t = 1 - radius; // brighter toward the centre
      if (swirl > 0.5) t = Math.min(1, t + 0.28); // spiral-arm highlight
      set(g, x, y, voidTones[ditherBand(x, y, t, voidTones.length)]);
    }
  }

  // Outline every filled pixel that touches a transparent neighbour (same
  // silhouette treatment as floresta/no_avatar/nucleo) - the void's interior
  // never qualifies, so the hot core fleck and keystone below are safe to
  // paint before or after this pass.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(g, x, y) === -1) continue;
      const isEdge = neighbors4(x, y).some(([nx, ny]) => get(g, nx, ny) === -1);
      if (isEdge) set(g, x, y, PAL.black);
    }
  }

  // Hot core fleck: the brightest point of the swirl, dead centre.
  set(g, Math.round(CX), Math.round(CY), PAL.paleBlue);

  // Keystone rune: ties this landmark back to --nos-accent.
  set(g, Math.round(CX), 1, PAL.lightViolet);

  // Grounding shadow where the arch meets the ground.
  set(g, 5, 15, PAL.black);
  set(g, 6, 15, PAL.black);
  set(g, 9, 15, PAL.black);
  set(g, 10, 15, PAL.black);

  // Drifting motes - small sparks just outside the ring.
  for (const [x, y] of motes) set(g, x, y, PAL.paleCyan);

  return g;
}

function run() {
  const frame0 = genPortalFrame(16, 16, { swirlPhase: 0, motes: [[2, 5], [13, 10]] });
  const frame1 = genPortalFrame(16, 16, { swirlPhase: Math.PI, motes: [[2, 9], [13, 5]] });

  writeSpriteSrc(path.join(SRC_DIR, 'portal_2frames.json'), {
    name: 'portal_2frames',
    kind: 'object',
    width: 16,
    height: 16,
    notes:
      'R6 fase 1 (Portais, D-17): the map-affordance portal marker (site/src/renderer.ts), drawn at a ' +
      'fixed location in O Coração (site/src/main.ts\'s PORTAL_MARKER_POSITION). An ancient stone archway ' +
      '(ruina-family plum/grey) framing a swirling indigo/blue void - a colour family no other sprite uses ' +
      '(o Núcleo is violet/crimson, A Fábrica\'s oficina is violet, água is teal/cyan), so a portal never ' +
      'reads as "another Núcleo" or "a puddle" at a glance. A single lightViolet keystone pixel at the apex ' +
      'ties it back to --nos-accent. 2 frames: the void\'s spiral arms rotate a half-turn and its drifting ' +
      'motes shift, a slow ~700ms hum (PORTAL_FRAME_MS) distinct from o Núcleo\'s 350ms heartbeat and água\'s ' +
      '1000ms shimmer.',
    frames: [{ pixels: frame0 }, { pixels: frame1 }],
  });
  console.log('authored portal_2frames.json');
}

if (require.main === module) {
  run();
}

module.exports = { run, genPortalFrame };
