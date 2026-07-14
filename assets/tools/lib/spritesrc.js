'use strict';
/**
 * Load/save sprite "source of truth" files: JSON matrices of palette
 * indices under assets/sprites/src/. -1 = transparent pixel.
 *
 * Shape on disk:
 * {
 *   "name": "campina_1",
 *   "kind": "tile" | "object",
 *   "width": 16, "height": 16,
 *   "frames": [ { "pixels": [[...], [...], ...] }, ... ],  // 1 frame = static
 *   "notes": "free text for humans"
 * }
 */

const fs = require('fs');
const path = require('path');
const { matrixToCanvas, compositeOver, createCanvas } = require('./canvas');

function loadSpriteSrc(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!raw.frames || !raw.frames.length) throw new Error(`${filePath}: no frames`);
  for (const f of raw.frames) {
    if (f.pixels.length !== raw.height) throw new Error(`${filePath}: frame height mismatch`);
    for (const row of f.pixels) {
      if (row.length !== raw.width) throw new Error(`${filePath}: frame row width mismatch`);
    }
  }
  return raw;
}

/** Pretty JSON: one pixel row per line, so diffs stay per-row and the matrix is human-scannable. */
function formatSpriteSrc(sprite) {
  const lines = [];
  lines.push('{');
  lines.push(`  "name": ${JSON.stringify(sprite.name)},`);
  lines.push(`  "kind": ${JSON.stringify(sprite.kind)},`);
  lines.push(`  "width": ${sprite.width},`);
  lines.push(`  "height": ${sprite.height},`);
  if (sprite.notes) lines.push(`  "notes": ${JSON.stringify(sprite.notes)},`);
  lines.push('  "frames": [');
  sprite.frames.forEach((frame, fi) => {
    lines.push('    {');
    lines.push('      "pixels": [');
    frame.pixels.forEach((row, ri) => {
      const rowStr = row.map((v) => String(v).padStart(2, ' ')).join(',');
      const comma = ri < frame.pixels.length - 1 ? ',' : '';
      lines.push(`        [${rowStr}]${comma}`);
    });
    lines.push('      ]');
    lines.push(fi < sprite.frames.length - 1 ? '    },' : '    }');
  });
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

function writeSpriteSrc(filePath, sprite) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, formatSpriteSrc(sprite));
}

/** Render every frame and lay them out left-to-right into one spritesheet canvas. */
function composeFramesHorizontal(sprite, palette) {
  const sheet = createCanvas(sprite.width * sprite.frames.length, sprite.height);
  sprite.frames.forEach((frame, i) => {
    const frameCanvas = matrixToCanvas(frame.pixels, palette);
    compositeOver(sheet, frameCanvas, i * sprite.width, 0);
  });
  return sheet;
}

module.exports = { loadSpriteSrc, writeSpriteSrc, formatSpriteSrc, composeFramesHorizontal };
