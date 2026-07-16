'use strict';
/**
 * 3D procedural trees rendered to pixel-art sprites.
 *
 * A tree is grown once as a true 3D skeleton (recursive branching — the
 * L-system idea with per-node RNG jitter) plus foliage as blob clusters at
 * branch tips. The SAME tree is then rasterized from any camera:
 *
 *   - 'side'    → eye-level billboard (the FPS prototype's sprites)
 *   - 'topdown' → Zelda-style 3/4 view (O Coração's object sprites)
 *
 * One generator, both art directions — variation is free (seed), species
 * are presets, size is a parameter. Output is a sprite-src matrix
 * (palette indices, -1 transparent) that flows through the toolkit's
 * existing audit/view/preview pipeline unchanged.
 *
 * Rendering: orthographic, painter-corrected by z-buffer. Branches are
 * 4-sided prisms (flat-shaded quads), foliage blobs are sphere impostors
 * (per-pixel normal → lit tone). Lit tones land on a palette ramp with
 * ordered dithering at band edges (rampAt, shared with texgen) — banded
 * pixel-art shading, single key light (same convention as turntable.cjs).
 */

const { hashString, hash2D } = require('./noise.cjs');
const { rampAt } = require('./texgen.cjs');

/**
 * Key light as the direction light TRAVELS: from upper-left-front toward
 * lower-right-back (screen y grows down, so +y = downward travel). A surface
 * is lit by max(0, -dot(normal, LIGHT)) — top/left/front faces catch it.
 */
const LIGHT = normalize([0.5, 0.8, 0.35]);

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Deterministic per-tree RNG stream (counter-hashed — stable across engines). */
function makeRng(seedNum) {
  let n = 0;
  return () => hash2D(seedNum, n++, 0x7ee5);
}

/* ------------------------------------------------------------------ */
/* Growth: species presets define the skeleton grammar's parameters.   */
/* ------------------------------------------------------------------ */

/**
 * Grow a tree. Returns { segments: [{a,b,r0,r1}], blobs: [{c,r}] } in tree
 * space: y grows DOWN (screen-like), origin at the trunk base, so a trunk
 * goes from [0,0,0] toward negative y.
 */
function growTree(species, seedNum, sizeScale = 1) {
  const rng = makeRng(seedNum);
  const segments = [];
  const blobs = [];
  const jitter = (amount) => (rng() - 0.5) * 2 * amount;

  function branch(base, dir, length, radius, depth) {
    const tip = add(base, mul(dir, length));
    segments.push({ a: base, b: tip, r0: radius, r1: radius * species.taper });
    if (depth >= species.maxDepth) {
      if (species.leafy) blobs.push({ c: tip, r: species.blobR * sizeScale * (0.8 + rng() * 0.5) });
      return;
    }
    const kids = species.children[Math.min(depth, species.children.length - 1)];
    for (let k = 0; k < kids; k++) {
      // child direction: tilt away from parent by spread, spin around it
      const az = (k / kids) * Math.PI * 2 + jitter(species.azJitter);
      const tilt = species.spread + jitter(species.spreadJitter);
      // build orthonormal frame around dir
      const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, -1, 0];
      const side = normalize(cross(dir, up));
      const side2 = cross(dir, side);
      const nd = normalize(
        add(mul(dir, Math.cos(tilt)), add(mul(side, Math.sin(tilt) * Math.cos(az)), mul(side2, Math.sin(tilt) * Math.sin(az)))),
      );
      // upward bias pulls branches toward the sky (negative y)
      const biased = normalize(add(nd, [0, -species.upBias, 0]));
      branch(tip, biased, length * species.lengthDecay * (0.85 + rng() * 0.3), radius * species.taper, depth + 1);
    }
    if (species.leafy && depth >= species.blobFromDepth) {
      blobs.push({ c: tip, r: species.blobR * sizeScale * (0.9 + rng() * 0.6) });
    }
  }

  if (species.conical) {
    // pine: one straight trunk with whorls of short horizontal branches,
    // shorter toward the top — the classic cone
    const h = species.trunkLen * sizeScale;
    const r = species.trunkR * sizeScale;
    segments.push({ a: [0, 0, 0], b: [0, -h, 0], r0: r, r1: r * 0.35 });
    const whorls = species.whorls;
    for (let w = 0; w < whorls; w++) {
      const t = (w + 1) / (whorls + 1); // 0=base 1=top
      const y = -h * (0.25 + 0.72 * t);
      const reach = species.whorlReach * sizeScale * (1 - t * 0.82);
      const per = species.whorlBranches;
      for (let k = 0; k < per; k++) {
        const az = (k / per) * Math.PI * 2 + jitter(0.5) + w * 0.7;
        const dir = normalize([Math.cos(az), species.droop, Math.sin(az)]);
        const tip = add([0, y, 0], mul(dir, reach));
        segments.push({ a: [0, y, 0], b: tip, r0: r * 0.3 * (1 - t * 0.5), r1: r * 0.12 });
        blobs.push({ c: tip, r: species.blobR * sizeScale * (1 - t * 0.55) * (0.8 + rng() * 0.4) });
      }
    }
    blobs.push({ c: [0, -h * 1.02, 0], r: species.blobR * sizeScale * 0.7 }); // crown tip
  } else {
    branch([0, 0, 0], normalize([jitter(0.06), -1, jitter(0.06)]), species.trunkLen * sizeScale, species.trunkR * sizeScale, 0);
  }
  return { segments, blobs };
}

const SPECIES = {
  carvalho: {
    // broadleaf: short thick trunk, wide spreading crown of blobs
    leafy: true, conical: false,
    trunkLen: 3.0, trunkR: 0.42, maxDepth: 3, children: [3, 3, 2],
    spread: 0.72, spreadJitter: 0.25, azJitter: 0.9, upBias: 0.35,
    lengthDecay: 0.62, taper: 0.62, blobR: 1.5, blobFromDepth: 2,
    trunkRamp: [0, 24, 20, 4], leafRamp: [29, 30, 31, 32],
    notes: 'copa larga de folhosa — a árvore genérica bonita',
  },
  pinheiro: {
    // conifer: straight trunk, whorled cone of dark foliage
    leafy: true, conical: true,
    trunkLen: 5.2, trunkR: 0.3, whorls: 5, whorlBranches: 5, whorlReach: 1.6,
    droop: 0.22, blobR: 1.0,
    trunkRamp: [0, 24, 19, 20], leafRamp: [35, 29, 36, 37],
    notes: 'cone de conífera, verdes frios e escuros',
  },
  arbusto: {
    // shrub: no visible trunk, low blob cluster
    leafy: true, conical: false,
    trunkLen: 0.7, trunkR: 0.18, maxDepth: 1, children: [5],
    spread: 1.15, spreadJitter: 0.3, azJitter: 1.2, upBias: 0.25,
    lengthDecay: 0.7, taper: 0.6, blobR: 1.15, blobFromDepth: 0,
    trunkRamp: [0, 24, 20, 4], leafRamp: [29, 30, 31, 33],
    notes: 'moita baixa e cheia',
  },
  seca: {
    // dead tree: gnarly bare branches, no foliage — ruins/void mood
    leafy: false, conical: false,
    trunkLen: 3.2, trunkR: 0.34, maxDepth: 4, children: [2, 2, 2, 1],
    spread: 0.85, spreadJitter: 0.45, azJitter: 1.4, upBias: 0.18,
    lengthDecay: 0.68, taper: 0.66, blobR: 0, blobFromDepth: 99,
    trunkRamp: [0, 1, 2, 6], leafRamp: [29, 30, 31, 32],
    notes: 'árvore morta e retorcida — ruínas, o vazio',
  },
};

/* ------------------------------------------------------------------ */
/* Rasterizer: orthographic camera with pitch, z-buffer, banded shade. */
/* ------------------------------------------------------------------ */

/**
 * Render a grown tree to a sprite-src matrix of palette indices.
 * view: 'side' (billboard, pitch 0) | 'topdown' (Zelda 3/4, pitch ~62°).
 */
function renderTree(tree, species, { size = 48, view = 'side', pitch = view === 'topdown' ? 62 : 0, yaw = 0 } = {}) {
  const pr = (pitch * Math.PI) / 180;
  const yr = yaw;
  const cosP = Math.cos(pr), sinP = Math.sin(pr);
  const cosY = Math.cos(yr), sinY = Math.sin(yr);
  // camera transform: yaw around Y, then pitch around X (tilting the top
  // of the tree toward the camera — the 3/4 look)
  const xform = (p) => {
    const x = p[0] * cosY + p[2] * sinY;
    const z0 = -p[0] * sinY + p[2] * cosY;
    const y = p[1] * cosP - z0 * sinP;
    const z = p[1] * sinP + z0 * cosP;
    return [x, y, z];
  };

  // fit: transform all extremes to find bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const consider = (p, r) => {
    const t = xform(p);
    minX = Math.min(minX, t[0] - r); maxX = Math.max(maxX, t[0] + r);
    minY = Math.min(minY, t[1] - r); maxY = Math.max(maxY, t[1] + r);
  };
  for (const s of tree.segments) { consider(s.a, s.r0); consider(s.b, s.r1); }
  for (const b of tree.blobs) consider(b.c, b.r);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = (size * 0.92) / Math.max(spanX, spanY);
  const ox = (size - spanX * scale) / 2 - minX * scale;
  const oy = (size - spanY * scale) / 2 - minY * scale;
  const project = (p) => {
    const t = xform(p);
    return { x: t[0] * scale + ox, y: t[1] * scale + oy, z: t[2] };
  };

  const px = Array.from({ length: size }, () => new Array(size).fill(-1));
  const zb = Array.from({ length: size }, () => new Array(size).fill(Infinity));

  // --- branches: 4-sided prisms, flat-shaded per face ---
  for (const seg of tree.segments) {
    const axis = normalize(sub(seg.b, seg.a));
    const up = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, -1, 0];
    const u = normalize(cross(axis, up));
    const v = cross(axis, u);
    const corners = (p, r) => [add(p, mul(u, r)), add(p, mul(v, r)), add(p, mul(u, -r)), add(p, mul(v, -r))];
    const ca = corners(seg.a, Math.max(seg.r0, 0.05));
    const cb = corners(seg.b, Math.max(seg.r1, 0.04));
    for (let f = 0; f < 4; f++) {
      const g = (f + 1) % 4;
      const n = normalize(add(mul(u, f === 0 ? 1 : f === 2 ? -1 : 0), mul(v, f === 1 ? 1 : f === 3 ? -1 : 0)));
      const lit = Math.max(0, -dot(n, LIGHT));
      const tone = 0.18 + 0.8 * lit;
      const quad = [project(ca[f]), project(ca[g]), project(cb[g]), project(cb[f])];
      fillQuad(px, zb, quad, (x, y) => rampAt(species.trunkRamp, Math.min(0.999, tone), x, y, 0.35));
    }
  }

  // --- foliage: sphere impostors, per-pixel normal shading + dither ---
  const seedNum = hashString(`blob-${tree.segments.length}-${tree.blobs.length}`);
  for (const blob of tree.blobs) {
    const c = project(blob.c);
    const r = blob.r * scale;
    if (r < 0.6) continue;
    const x0 = Math.max(0, Math.floor(c.x - r)), x1 = Math.min(size - 1, Math.ceil(c.x + r));
    const y0 = Math.max(0, Math.floor(c.y - r)), y1 = Math.min(size - 1, Math.ceil(c.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - c.x) / r;
        const dy = (y + 0.5 - c.y) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        // ragged edge: nibble the rim pseudo-randomly so blobs read as
        // foliage clumps, not perfect circles
        if (d2 > 0.72 && hash2D(seedNum, x * 7 + 1, y * 13 + 3) < 0.45) continue;
        const nz = Math.sqrt(1 - d2);
        const n = [dx, dy, -nz];
        const lit = Math.max(0, -dot(n, LIGHT));
        // per-blob tonal identity: each clump sits a step apart on the ramp,
        // so the crown reads as clustered tufts instead of one smooth ball
        const blobId = hash2D(seedNum, (blob.c[0] * 37) | 0, (blob.c[1] * 53) | 0);
        const tone = 0.08 + 0.84 * lit * (0.78 + 0.44 * blobId);
        const z = c.z - nz * (blob.r * 0.8); // front of sphere is nearer
        if (z >= zb[y][x]) continue;
        zb[y][x] = z;
        px[y][x] = rampAt(species.leafRamp, Math.min(0.999, tone), x, y, 0.55);
      }
    }
  }

  return px;
}

function fillQuad(px, zb, q, colorAt) {
  fillTriIdx(px, zb, q[0], q[1], q[2], colorAt);
  fillTriIdx(px, zb, q[0], q[2], q[3], colorAt);
}

function fillTriIdx(px, zb, a, b, c, colorAt) {
  const size = px.length;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const pxc = x + 0.5, pyc = y + 0.5;
      const w0 = ((b.x - a.x) * (pyc - a.y) - (b.y - a.y) * (pxc - a.x)) / area;
      const w1 = ((c.x - b.x) * (pyc - b.y) - (c.y - b.y) * (pxc - b.x)) / area;
      const w2 = ((a.x - c.x) * (pyc - c.y) - (a.y - c.y) * (pxc - c.x)) / area;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = a.z * w1 + b.z * w2 + c.z * w0;
      if (z >= zb[y][x]) continue;
      zb[y][x] = z;
      px[y][x] = colorAt(x, y);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Generate one tree sprite. Returns a sprite-src object (kind 'object').
 * options: species (carvalho|pinheiro|arbusto|seca), seed, size (sprite px),
 * sizeScale (tree within: 0.6 shrubby .. 1.4 towering), view (side|topdown),
 * pitch (override), leafRamp/trunkRamp (palette-index overrides).
 */
function generateTree({ species = 'carvalho', seed = 'tree-1', size = 48, sizeScale = 1, view = 'side', pitch, leafRamp, trunkRamp } = {}) {
  const base = Object.prototype.hasOwnProperty.call(SPECIES, species) ? SPECIES[species] : null;
  if (!base) throw new Error(`espécie desconhecida: ${species} (tem: ${Object.keys(SPECIES).join(', ')})`);
  const sp = { ...base, ...(leafRamp ? { leafRamp } : {}), ...(trunkRamp ? { trunkRamp } : {}) };
  const tree = growTree(sp, hashString(`${species}-${seed}`), sizeScale);
  const pixels = renderTree(tree, sp, { size, view, ...(pitch !== undefined ? { pitch } : {}) });
  return {
    name: `${species}_${view}_${seed}`,
    kind: 'object',
    width: size,
    height: size,
    notes: `árvore 3D procedural: ${species}, seed ${seed}, view ${view}, escala ${sizeScale}`,
    frames: [{ pixels }],
  };
}

module.exports = { generateTree, SPECIES };
