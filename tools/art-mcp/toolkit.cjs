'use strict';
/**
 * The toolkit facade: every capability as a plain function taking/returning
 * JSON-able values + file paths. Both the CLI and the MCP server are thin
 * wrappers over this — one behavior, two interfaces.
 *
 * Sprite-src files are the exchange format (same as assets/sprites/src/):
 * palette-index matrices. PNGs land wherever `out` points (default
 * tools/art-mcp/qa/, gitignored except curated befores/afters).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { loadPalette, savePNG } = require(path.join(ROOT, 'assets', 'tools', 'lib', 'canvas.cjs'));
const { loadSpriteSrc, writeSpriteSrc } = require(path.join(ROOT, 'assets', 'tools', 'lib', 'spritesrc.cjs'));
const { generateTexture, generatePreset, PRESETS } = require('./lib/texgen.cjs');
const { audit } = require('./lib/lints.cjs');
const { magnifiedView, tiledView, contactSheet, diffView } = require('./lib/views.cjs');
const { renderPreview } = require('./lib/preview3d.cjs');
const { humanoidFigure, turnaroundStrip } = require('./lib/turntable.cjs');

const PALETTE = loadPalette(path.join(ROOT, 'assets', 'palette.json'));
const DEFAULT_OUT = path.join(__dirname, 'qa');

function resolveOut(out, fallbackName) {
  const p = out ?? path.join(DEFAULT_OUT, fallbackName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

/** Generate a texture (preset name + overrides, or full params) and write sprite-src + audit views. */
function genTexture({ preset, params = {}, srcOut, viewOut }) {
  const sprite = preset ? generatePreset(preset, params) : generateTexture(params);
  const srcPath = resolveOut(srcOut, `${sprite.name}.json`);
  writeSpriteSrc(srcPath, sprite);
  const viewPath = resolveOut(viewOut, `${sprite.name}_tiled.png`);
  savePNG(viewPath, tiledView(sprite, PALETTE));
  const findings = audit(sprite, PALETTE, { tileable: true });
  return { src: srcPath, view: viewPath, findings, presets: undefined };
}

/** Audit any sprite-src file. */
function auditSprite({ src, tileable }) {
  const sprite = loadSpriteSrc(src);
  return { name: sprite.name, findings: audit(sprite, PALETTE, tileable === undefined ? {} : { tileable }) };
}

/** Magnified audit view (dark+light grounds, grid, palette legend). */
function viewSprite({ src, scale = 8, out }) {
  const sprite = loadSpriteSrc(src);
  const p = resolveOut(out, `${sprite.name}_x${scale}.png`);
  savePNG(p, magnifiedView(sprite, PALETTE, scale));
  return { view: p };
}

/** 3x3 tiled wrap view (seams jump out). */
function viewTiled({ src, out }) {
  const sprite = loadSpriteSrc(src);
  const p = resolveOut(out, `${sprite.name}_tiled.png`);
  savePNG(p, tiledView(sprite, PALETTE));
  return { view: p };
}

/** In-engine corridor preview (prototype's raycaster math). */
function previewScene({ wall, floor, billboard, out }) {
  const w = loadSpriteSrc(wall);
  const scene = {
    wall: w,
    floor: floor ? loadSpriteSrc(floor) : null,
    billboard: billboard ? loadSpriteSrc(billboard) : null,
    palette: PALETTE,
  };
  const p = resolveOut(out, `preview_${w.name}.png`);
  savePNG(p, renderPreview(scene));
  return { view: p };
}

/** Contact sheet from a directory of sprite-src files. */
function sheet({ dir, out, scale = 4 }) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new Error(`nenhum sprite-src em ${dir}`);
  const sprites = files.map((f) => loadSpriteSrc(path.join(dir, f)));
  const p = resolveOut(out, 'contact_sheet.png');
  savePNG(p, contactSheet(sprites, PALETTE, scale));
  return { view: p, count: sprites.length };
}

/** Before/after diff with changed-pixel heatmap. */
function diff({ before, after, out }) {
  const a = loadSpriteSrc(before);
  const b = loadSpriteSrc(after);
  const p = resolveOut(out, `diff_${b.name}.png`);
  savePNG(p, diffView(a, b, PALETTE));
  return { view: p };
}

/** 8-direction turnaround scaffold from a box-figure JSON (or the default humanoid). */
function turnaround({ figure, viewSize = 32, scale = 4, out }) {
  const fig = figure ? JSON.parse(fs.readFileSync(figure, 'utf8')) : humanoidFigure();
  const p = resolveOut(out, `${fig.name ?? 'figura'}_turnaround.png`);
  savePNG(p, turnaroundStrip(fig, viewSize, scale));
  return { view: p };
}

function listPresets() {
  return Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.notes ?? '']));
}

module.exports = { genTexture, auditSprite, viewSprite, viewTiled, previewScene, sheet, diff, turnaround, listPresets, PALETTE };
