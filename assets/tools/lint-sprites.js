/* lint-sprites: valida os PNGs de assets/sprites contra os .json de src — o gate de arte do CI (npm run lint:sprites). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.resolve(ROOT, 'assets', 'sprites', 'src');
const PALETTE_PATH = path.resolve(ROOT, 'assets', 'palette.json');

const paletteRaw = JSON.parse(fs.readFileSync(PALETTE_PATH, 'utf-8'));
const paletteSize = paletteRaw.colors.length;

const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.json'));

let errors = 0;

for (const file of files) {
  const filePath = path.join(SRC_DIR, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Check required fields
    if (!data.name || !data.kind || typeof data.width !== 'number' || typeof data.height !== 'number' || !Array.isArray(data.frames)) {
      console.error(`❌ ${file}: Missing required fields (name, kind, width, height, frames)`);
      errors++;
      continue;
    }

    // Check kind
    if (data.kind !== 'tile' && data.kind !== 'object') {
      console.error(`❌ ${file}: invalid kind: ${data.kind}`);
      errors++;
    }

    // Check sizes
    if (data.kind === 'tile') {
      if (data.width !== 16 || data.height !== 16) {
        console.error(`❌ ${file}: tiles must be 16x16 (got ${data.width}x${data.height})`);
        errors++;
      }
    } else {
      if ((data.width !== 16 && data.width !== 32) || (data.height !== 16 && data.height !== 32)) {
        console.error(`❌ ${file}: objects must be 16x16 or 32x32 (got ${data.width}x${data.height})`);
        errors++;
      }
    }

    // Check frames and pixels
    if (data.frames.length === 0) {
      console.error(`❌ ${file}: frames array is empty`);
      errors++;
    }

    for (let f = 0; f < data.frames.length; f++) {
      const frame = data.frames[f];
      if (!frame || !Array.isArray(frame.pixels)) {
        console.error(`❌ ${file}: frame ${f} missing pixels array`);
        errors++;
        continue;
      }

      if (frame.pixels.length !== data.height) {
        console.error(`❌ ${file}: frame ${f} height mismatch: expected ${data.height}, got ${frame.pixels.length}`);
        errors++;
        continue;
      }

      for (let y = 0; y < frame.pixels.length; y++) {
        const row = frame.pixels[y];
        if (!Array.isArray(row)) {
          console.error(`❌ ${file}: frame ${f} row ${y} is not an array`);
          errors++;
          continue;
        }

        if (row.length !== data.width) {
          console.error(`❌ ${file}: frame ${f} row ${y} width mismatch: expected ${data.width}, got ${row.length}`);
          errors++;
          continue;
        }

        for (let x = 0; x < row.length; x++) {
          const pixel = row[x];
          if (typeof pixel !== 'number' || !Number.isInteger(pixel)) {
            console.error(`❌ ${file}: frame ${f} at (${x},${y}) pixel is not an integer: ${pixel}`);
            errors++;
          } else if (pixel < -1 || pixel >= paletteSize) {
            console.error(`❌ ${file}: frame ${f} at (${x},${y}) pixel index out of palette range: ${pixel}`);
            errors++;
          }
        }
      }
    }
  } catch (err) {
    console.error(`❌ ${file}: Failed to parse JSON: ${err.message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\n❌ Sprite lint failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`\n✅ All ${files.length} sprites passed linting successfully.`);
  process.exit(0);
}
