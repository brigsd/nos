#!/usr/bin/env node
/**
 * Generates world/heart.json from scratch via the deterministic mapgen
 * pipeline, validates it against the schema, and writes it to disk.
 *
 * Usage: npm run genworld
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHeartWorld, HEART_WORLD_SEED } from '../mapgen';
import { serializeWorld } from '../serialize';
import { assertValidWorld } from '../validate';
import type { Biome } from '../types';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(moduleDir, '..', '..', 'world', 'heart.json');

const world = generateHeartWorld(HEART_WORLD_SEED);

// Never write state that wouldn't pass the same gate the tick will use.
assertValidWorld(world);

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, serializeWorld(world), 'utf-8');

const counts: Partial<Record<Biome, number>> = {};
for (const tile of world.tiles) counts[tile.biome] = (counts[tile.biome] ?? 0) + 1;
let resourceCount = 0;
for (const tile of world.tiles) if (tile.resource) resourceCount++;

console.log(`World written to ${path.relative(process.cwd(), outPath)}`);
console.log(`  name: ${world.meta.name}`);
console.log(`  seed: ${world.meta.seed}`);
console.log(`  size: ${world.width}x${world.height} (${world.tiles.length} tiles)`);
console.log(`  biomes: ${JSON.stringify(counts)}`);
console.log(`  resource tiles: ${resourceCount}`);
