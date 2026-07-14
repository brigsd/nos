#!/usr/bin/env node
/**
 * Prints an ASCII rendition of world/heart.json - one character per tile -
 * so the biome distribution can be eyeballed (river continuity, meadow
 * clearing around the Core, forest coverage, etc).
 *
 * Usage: npm run mapascii
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tileIndex, type Biome, type World } from '../types';
import { assertValidWorld } from '../validate';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.join(moduleDir, '..', '..', 'world', 'heart.json');

/** One ASCII character per biome. */
const BIOME_CHARS: Record<Biome, string> = {
  meadow: '.',
  forest: '"',
  water: '~',
  ruins: '#',
  core: '@',
};

function render(world: World): string {
  const lines: string[] = [];
  for (let y = 0; y < world.height; y++) {
    let line = '';
    for (let x = 0; x < world.width; x++) {
      const tile = world.tiles[tileIndex(x, y, world.width)]!;
      line += BIOME_CHARS[tile.biome];
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function summarize(world: World): string {
  const counts: Partial<Record<Biome, number>> = {};
  for (const tile of world.tiles) counts[tile.biome] = (counts[tile.biome] ?? 0) + 1;
  const total = world.tiles.length;
  const pct = (n: number): string => `${((n / total) * 100).toFixed(1)}%`;

  return (Object.keys(BIOME_CHARS) as Biome[])
    .map((biome) => {
      const n = counts[biome] ?? 0;
      return `  ${BIOME_CHARS[biome]}  ${biome.padEnd(7)} ${String(n).padStart(5)} tiles  (${pct(n)})`;
    })
    .join('\n');
}

const raw: unknown = JSON.parse(readFileSync(worldPath, 'utf-8'));
assertValidWorld(raw);

console.log(`${raw.meta.name} - seed "${raw.meta.seed}" - tick ${raw.meta.tickCount}`);
console.log(`Legend: ${Object.entries(BIOME_CHARS).map(([b, c]) => `${c}=${b}`).join('  ')}`);
console.log('');
console.log(render(raw));
console.log('');
console.log(summarize(raw));
