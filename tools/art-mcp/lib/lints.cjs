'use strict';
/**
 * Algorithmic pixel-art critic: the formalizable rules of the discipline,
 * run against sprite-src matrices (palette indices). Each check returns
 * findings {level: 'error'|'warn', check, msg}. What the multimodal eye
 * misses (1px slips, seams under tiling), these catch deterministically.
 *
 * Checks:
 *  - palette: every index within palette bounds (or -1 transparent)
 *  - seams: tileable art must wrap without visible discontinuity
 *  - orphans: single pixels with no same-color neighbor (noise, not detail)
 *  - banding: parallel same-width bands of adjacent ramp tones (staircasing)
 *  - silhouette: object sprites must read against light AND dark grounds
 */

function forEachPixel(frame, fn) {
  for (let y = 0; y < frame.pixels.length; y++) {
    const row = frame.pixels[y];
    for (let x = 0; x < row.length; x++) fn(x, y, row[x]);
  }
}

function checkPalette(sprite, paletteSize) {
  const findings = [];
  const seen = new Set();
  for (const frame of sprite.frames) {
    forEachPixel(frame, (x, y, v) => {
      if (v === -1) return;
      if (!Number.isInteger(v) || v < 0 || v >= paletteSize) {
        if (!seen.has(v)) {
          findings.push({ level: 'error', check: 'palette', msg: `índice ${v} fora da paleta (0..${paletteSize - 1}) — primeiro em (${x},${y})` });
          seen.add(v);
        }
      }
    });
  }
  return findings;
}

/**
 * Seam check for tileable art (walls/floors): compare luminance jumps across
 * the wrap edge vs. the average interior jump. A wrap edge much rougher than
 * the interior will read as a visible vertical/horizontal line in-game.
 */
function checkSeams(sprite, palette) {
  const findings = [];
  const lum = (idx) => {
    if (idx === -1) return 0;
    const [r, g, b] = palette[idx];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  for (const frame of sprite.frames) {
    const w = sprite.width;
    const h = sprite.height;
    const at = (x, y) => lum(frame.pixels[((y % h) + h) % h][((x % w) + w) % w]);
    // Compare each wrap edge against interior jumps IN THE SAME AXIS: a
    // brick texture is smooth along x but has hard mortar jumps along y —
    // judging the y-wrap by x-interior smoothness would flag a false seam.
    let interiorX = 0;
    let interiorY = 0;
    let seamX = 0;
    let seamY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) interiorX += Math.abs(at(x + 1, y) - at(x, y));
      seamX += Math.abs(at(0, y) - at(w - 1, y));
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h - 1; y++) interiorY += Math.abs(at(x, y + 1) - at(x, y));
      seamY += Math.abs(at(x, 0) - at(x, h - 1));
    }
    const avgInteriorX = interiorX / (h * (w - 1)) || 1;
    const avgInteriorY = interiorY / (w * (h - 1)) || 1;
    const avgSeamX = seamX / h;
    const avgSeamY = seamY / w;
    // Threshold 2.2x: measured against the shipped tileable tiles (campina,
    // floresta), interior-vs-seam ratio stays under ~1.8 when seamless.
    if (avgSeamX > avgInteriorX * 2.2) {
      findings.push({ level: 'error', check: 'seams', msg: `costura vertical no wrap X (${avgSeamX.toFixed(1)} vs interior ${avgInteriorX.toFixed(1)}) — vai listrar a parede in-game` });
    }
    if (avgSeamY > avgInteriorY * 2.2) {
      findings.push({ level: 'error', check: 'seams', msg: `costura horizontal no wrap Y (${avgSeamY.toFixed(1)} vs interior ${avgInteriorY.toFixed(1)})` });
    }
  }
  return findings;
}

/**
 * Orphan pixels: a colored pixel none of whose 8 neighbors shares its color.
 * OBJECT/BILLBOARD sprites only — on terrain (tile/wall) speckle is material
 * by design: the shipped, art-reviewed tiles carry 8-18% lone pixels
 * (campina 40/256, floresta 26/256), so flagging them is pure noise there.
 * Reviewed objects run 2-6 deliberate sparkles per 16x16 — that calibrates
 * the budget below.
 */
function checkOrphans(sprite) {
  if (sprite.kind !== 'object' && sprite.kind !== 'billboard') return [];
  const findings = [];
  sprite.frames.forEach((frame, fi) => {
    const h = sprite.height;
    const w = sprite.width;
    const orphanCoords = [];
    forEachPixel(frame, (x, y, v) => {
      if (v === -1) return;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= h || nx >= w) continue;
          if (frame.pixels[ny][nx] === v) return;
        }
      }
      orphanCoords.push([x, y]);
    });
    const spots = orphanCoords.slice(0, 5).map(([x, y]) => `(${x},${y})`);
    const budget = Math.max(4, Math.round((w * h) / 32));
    if (orphanCoords.length > budget) {
      findings.push({ level: 'warn', check: 'orphans', msg: `frame ${fi}: ${orphanCoords.length} pixels órfãos (orçamento ${budget}) — ex: ${spots.join(' ')} — lê como ruído, não detalhe` });
    }
  });
  return findings;
}

/**
 * Banding: long runs where two adjacent columns/rows are pixel-for-pixel
 * identical shifted copies — the classic "staircase of parallel bands".
 * Heuristic: fraction of adjacent column pairs that are identical.
 */
function checkBanding(sprite) {
  const findings = [];
  sprite.frames.forEach((frame, fi) => {
    const w = sprite.width;
    const h = sprite.height;
    let identicalCols = 0;
    for (let x = 0; x < w - 1; x++) {
      let same = true;
      for (let y = 0; y < h; y++) {
        if (frame.pixels[y][x] !== frame.pixels[y][x + 1]) {
          same = false;
          break;
        }
      }
      if (same) identicalCols++;
    }
    // Flat color fields (e.g. mortar walls) legitimately repeat columns;
    // flag only when MOST of the texture is duplicated columns.
    if (identicalCols > w * 0.45) {
      findings.push({ level: 'warn', check: 'banding', msg: `frame ${fi}: ${identicalCols}/${w - 1} colunas duplicadas — textura lê como listrado/banding` });
    }
  });
  return findings;
}

/**
 * Silhouette contrast for object/billboard sprites: the opaque outline must
 * remain readable over both a light and a dark ground. Measures mean
 * luminance of border pixels (pixels adjacent to transparency).
 */
function checkSilhouette(sprite, palette) {
  if (sprite.kind !== 'object' && sprite.kind !== 'billboard') return [];
  const findings = [];
  const lum = (idx) => {
    const [r, g, b] = palette[idx];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  sprite.frames.forEach((frame, fi) => {
    const h = sprite.height;
    const w = sprite.width;
    const border = [];
    forEachPixel(frame, (x, y, v) => {
      if (v === -1) return;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        const outside = nx < 0 || ny < 0 || nx >= w || ny >= h;
        if (outside || frame.pixels[ny][nx] === -1) {
          border.push(lum(v));
          return;
        }
      }
    });
    if (border.length === 0) return; // fully opaque: wall/floor, no silhouette
    const mean = border.reduce((a, b) => a + b, 0) / border.length;
    // Mid-luminance borders (~90..170) vanish against mid grounds; the fog
    // floor of the FPS view (#100c15, lum ~14) wants borders under ~200 to
    // avoid halo, over ~35 to not melt into the dark.
    if (mean < 35) findings.push({ level: 'warn', check: 'silhouette', msg: `frame ${fi}: contorno escuro demais (lum média ${mean.toFixed(0)}) — some no fog escuro do FPS` });
    if (mean > 200) findings.push({ level: 'warn', check: 'silhouette', msg: `frame ${fi}: contorno claro demais (lum média ${mean.toFixed(0)}) — halo contra o chão escuro` });
  });
  return findings;
}

/** Run every applicable check. `opts.tileable` turns on seam checking. */
function audit(sprite, palette, opts = {}) {
  const findings = [
    ...checkPalette(sprite, palette.length),
    ...checkOrphans(sprite),
    ...checkBanding(sprite),
    ...checkSilhouette(sprite, palette),
  ];
  if (opts.tileable ?? (sprite.kind === 'wall' || sprite.kind === 'tile')) {
    findings.push(...checkSeams(sprite, palette));
  }
  return findings;
}

module.exports = { audit, checkPalette, checkSeams, checkOrphans, checkBanding, checkSilhouette };
