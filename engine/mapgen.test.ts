import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CORE_ORIGIN,
  CORE_SIZE,
  FOREST_TARGET_RATIO,
  generateHeartWorld,
  HEART_WORLD_NAME,
  HEART_WORLD_SEED,
} from './mapgen';
import { tileIndex, WORLD_HEIGHT, WORLD_WIDTH, type Biome, type Tile, type World } from './types';
import { validateWorld } from './validate';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const heartJsonPath = path.join(moduleDir, '..', 'world', 'heart.json');

function hashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function biomeCounts(tiles: Tile[]): Partial<Record<Biome, number>> {
  const counts: Partial<Record<Biome, number>> = {};
  for (const tile of tiles) counts[tile.biome] = (counts[tile.biome] ?? 0) + 1;
  return counts;
}

/** 4-connected flood fill over every tile matching `biome`. */
function connectedComponents(world: World, biome: Biome): number[][] {
  const { width, height, tiles } = world;
  const visited = new Uint8Array(tiles.length);
  const components: number[][] = [];

  for (let start = 0; start < tiles.length; start++) {
    if (tiles[start]!.biome !== biome || visited[start]) continue;

    const component: number[] = [];
    const stack = [start];
    visited[start] = 1;

    while (stack.length > 0) {
      const cur = stack.pop()!;
      component.push(cur);
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = tileIndex(nx, ny, width);
        if (tiles[ni]!.biome === biome && !visited[ni]) {
          visited[ni] = 1;
          stack.push(ni);
        }
      }
    }
    components.push(component);
  }

  return components;
}

describe('generateHeartWorld - determinism', () => {
  it('produces byte-identical JSON for the same seed (hash match)', () => {
    const a = generateHeartWorld(HEART_WORLD_SEED);
    const b = generateHeartWorld(HEART_WORLD_SEED);
    expect(hashOf(a)).toBe(hashOf(b));
    expect(a).toEqual(b);
  });

  it('is stable across many repeated calls, not just two', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      hashes.add(hashOf(generateHeartWorld(HEART_WORLD_SEED)));
    }
    expect(hashes.size).toBe(1);
  });

  it('produces a different map for a different seed', () => {
    const heart = generateHeartWorld(HEART_WORLD_SEED);
    const other = generateHeartWorld('outro-mundo');
    expect(hashOf(heart)).not.toBe(hashOf(other));
  });

  it('carries meta.seed through unchanged and starts at tick 0', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED);
    expect(world.meta.seed).toBe(HEART_WORLD_SEED);
    expect(world.meta.name).toBe(HEART_WORLD_NAME);
    expect(world.meta.tickCount).toBe(0);
    expect(world.meta.worldTime).toBe(0);
    expect(world.players).toEqual({});
    expect(world.events).toEqual([]);
  });
});

describe('generateHeartWorld - shape', () => {
  const world = generateHeartWorld(HEART_WORLD_SEED);

  it('is a fixed 64x64 grid', () => {
    expect(world.width).toBe(WORLD_WIDTH);
    expect(world.height).toBe(WORLD_HEIGHT);
    expect(world.tiles.length).toBe(WORLD_WIDTH * WORLD_HEIGHT);
  });

  it('passes schema + semantic validation', () => {
    const result = validateWorld(world);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('generateHeartWorld - the river is continuous', () => {
  const world = generateHeartWorld(HEART_WORLD_SEED);
  const waterComponents = connectedComponents(world, 'water');

  it('forms a single connected body of water', () => {
    expect(waterComponents.length).toBe(1);
  });

  it('actually crosses the map (touches two opposite edges)', () => {
    const waterIdx = waterComponents[0]!;
    const xs = waterIdx.map((i) => i % world.width);
    const ys = waterIdx.map((i) => Math.floor(i / world.width));

    const touchesLeft = xs.includes(0);
    const touchesRight = xs.includes(world.width - 1);
    const touchesTop = ys.includes(0);
    const touchesBottom = ys.includes(world.height - 1);

    const crossesHorizontally = touchesLeft && touchesRight;
    const crossesVertically = touchesTop && touchesBottom;
    expect(crossesHorizontally || crossesVertically).toBe(true);
  });

  it('does not cut through the Core clearing', () => {
    for (const i of waterComponents[0]!) {
      const x = i % world.width;
      const y = Math.floor(i / world.width);
      const insideCoreFootprint =
        x >= CORE_ORIGIN.x && x < CORE_ORIGIN.x + CORE_SIZE && y >= CORE_ORIGIN.y && y < CORE_ORIGIN.y + CORE_SIZE;
      expect(insideCoreFootprint).toBe(false);
    }
  });
});

describe('generateHeartWorld - the Core', () => {
  const world = generateHeartWorld(HEART_WORLD_SEED);

  it('sits at (32, 32) as a 2x2 core patch', () => {
    for (let dy = 0; dy < CORE_SIZE; dy++) {
      for (let dx = 0; dx < CORE_SIZE; dx++) {
        const tile = world.tiles[tileIndex(CORE_ORIGIN.x + dx, CORE_ORIGIN.y + dy, world.width)]!;
        expect(tile.biome).toBe('core');
      }
    }
  });

  it('is exactly 4 tiles - no stray core tiles elsewhere on the map', () => {
    const counts = biomeCounts(world.tiles);
    expect(counts.core).toBe(CORE_SIZE * CORE_SIZE);
  });

  it('is surrounded by open meadow, not forest or ruins', () => {
    const ring = [
      [CORE_ORIGIN.x - 1, CORE_ORIGIN.y],
      [CORE_ORIGIN.x + CORE_SIZE, CORE_ORIGIN.y],
      [CORE_ORIGIN.x, CORE_ORIGIN.y - 1],
      [CORE_ORIGIN.x, CORE_ORIGIN.y + CORE_SIZE],
    ] as const;
    for (const [x, y] of ring) {
      expect(world.tiles[tileIndex(x, y, world.width)]!.biome).toBe('meadow');
    }
  });
});

describe('generateHeartWorld - biome distribution is within sane ranges', () => {
  const world = generateHeartWorld(HEART_WORLD_SEED);
  const counts = biomeCounts(world.tiles);
  const total = world.tiles.length;
  const ratio = (biome: Biome): number => (counts[biome] ?? 0) / total;

  it('meadow is the majority biome (the central campina)', () => {
    expect(ratio('meadow')).toBeGreaterThan(0.5);
  });

  it('forest covers roughly a quarter of the map', () => {
    expect(ratio('forest')).toBeGreaterThanOrEqual(FOREST_TARGET_RATIO - 0.07);
    expect(ratio('forest')).toBeLessThanOrEqual(FOREST_TARGET_RATIO + 0.07);
  });

  it('water is present but modest (a river, not a flood)', () => {
    expect(ratio('water')).toBeGreaterThan(0.01);
    expect(ratio('water')).toBeLessThan(0.12);
  });

  it('ruins are small and rare', () => {
    expect(ratio('ruins')).toBeGreaterThan(0);
    expect(ratio('ruins')).toBeLessThan(0.05);
  });

  it('every biome tile count adds up to the whole map', () => {
    const sum = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBe(total);
  });
});

describe('generateHeartWorld - ruins', () => {
  const world = generateHeartWorld(HEART_WORLD_SEED);
  const ruinsComponents = connectedComponents(world, 'ruins');

  it('places 2 or 3 separate small clusters', () => {
    expect(ruinsComponents.length).toBeGreaterThanOrEqual(2);
    expect(ruinsComponents.length).toBeLessThanOrEqual(3);
  });

  it('keeps each cluster small', () => {
    for (const cluster of ruinsComponents) {
      expect(cluster.length).toBeGreaterThan(0);
      expect(cluster.length).toBeLessThan(15);
    }
  });
});

describe('generateHeartWorld - resources follow their biome', () => {
  const world = generateHeartWorld(HEART_WORLD_SEED);

  function isAdjacentToWater(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
        if (world.tiles[tileIndex(nx, ny, world.width)]!.biome === 'water') return true;
      }
    }
    return false;
  }

  it('places wood only on forest tiles', () => {
    const woodTiles = world.tiles.filter((t) => t.resource === 'wood');
    expect(woodTiles.length).toBeGreaterThan(0);
    expect(woodTiles.every((t) => t.biome === 'forest')).toBe(true);
  });

  it('places stone only on ruins tiles', () => {
    const stoneTiles = world.tiles.filter((t) => t.resource === 'stone');
    expect(stoneTiles.length).toBeGreaterThan(0);
    expect(stoneTiles.every((t) => t.biome === 'ruins')).toBe(true);
  });

  it('places pulse fragments only on meadow/forest ground near the river, and keeps them rare', () => {
    let fragmentCount = 0;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[tileIndex(x, y, world.width)]!;
        if (tile.resource !== 'pulse_fragment') continue;
        fragmentCount++;
        expect(['meadow', 'forest']).toContain(tile.biome);
        expect(isAdjacentToWater(x, y)).toBe(true);
      }
    }
    expect(fragmentCount).toBeGreaterThan(0);
    expect(fragmentCount).toBeLessThan(60);
  });
});

describe('the committed world/heart.json', () => {
  it('keeps the genesis layout the generator produces right now (regenerate with `npm run genworld` for a brand-new world only)', () => {
    // O Coração has been live and ticking for real since tick #1 (see
    // docs/CONTINUITY.md): world/heart.json now carries real playtime -
    // meta.tickCount/worldTime, players and events all advance every beat,
    // and a tile's resource legitimately disappears the moment a player
    // collects it (engine/commands.ts, "coletar"). So it can never again
    // equal a byte-for-byte fresh genesis generation, and asserting full
    // equality here (as this test used to) would fail forever after tick 1
    // for reasons that have nothing to do with mapgen actually drifting.
    //
    // What must still never silently drift is the genesis layout itself:
    // name, seed, dimensions, and the biome generateHeartWorld(seed) placed
    // on every tile (nothing in the tick/command pipeline ever changes a
    // tile's biome). Resources are checked too, but only in the one
    // direction gameplay is allowed to move them - present in the fresh
    // generation, then possibly collected away on disk. A resource that
    // exists on disk but not in the fresh generation, or that changed type,
    // still fails this test.
    const onDisk = JSON.parse(readFileSync(heartJsonPath, 'utf-8')) as World;
    const fresh = generateHeartWorld(HEART_WORLD_SEED);

    expect(onDisk.meta.name).toBe(fresh.meta.name);
    expect(onDisk.meta.seed).toBe(fresh.meta.seed);
    expect(onDisk.width).toBe(fresh.width);
    expect(onDisk.height).toBe(fresh.height);
    expect(onDisk.tiles.map((tile) => tile.biome)).toEqual(fresh.tiles.map((tile) => tile.biome));

    onDisk.tiles.forEach((tile, index) => {
      if (tile.resource === undefined) return;
      expect(tile.resource).toBe(fresh.tiles[index]!.resource);
    });
  });

  it('validates against the schema', () => {
    const onDisk: unknown = JSON.parse(readFileSync(heartJsonPath, 'utf-8'));
    expect(validateWorld(onDisk).valid).toBe(true);
  });
});
