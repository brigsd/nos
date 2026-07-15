import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  cityDecoPlan,
  cityMachinePositions,
  CORE_ORIGIN,
  CORE_SIZE,
  FOREST_TARGET_RATIO,
  generateHeartWorld,
  HEART_WORLD_NAME,
  HEART_WORLD_SEED,
  SALAO_PORTAL_TILE,
  seedCityLayout,
  seedFactoryMachines,
  seedInitialNatives,
} from './mapgen';
import {
  MACHINE_IDS,
  PLAYER_SPAWN,
  TILE_DECO_OBJECTS,
  tileIndex,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Biome,
  type Machine,
  type Native,
  type Tile,
  type World,
} from './types';
import { MACHINES } from './fabrication';
import { advanceWorld, HEART_GENESIS_UNIX_SECONDS, TICK_INTERVAL_SECONDS } from './tick';
import { assertValidWorld, validateWorld } from './validate';

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

describe('seedInitialNatives - shape and determinism', () => {
  it('generateHeartWorld() already carries the 3 Nativos, each on a tile of the right biome', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED);
    expect(Object.keys(world.natives ?? {}).sort()).toEqual(['cinza', 'gota', 'raiz']);

    const gota = world.natives!['gota']!;
    const raiz = world.natives!['raiz']!;
    const cinza = world.natives!['cinza']!;

    expect(gota).toMatchObject({ id: 'gota', behaviorTree: 'wanderer', faction: 'wanderer' });
    expect(raiz).toMatchObject({ id: 'raiz', behaviorTree: 'merchant', faction: 'merchant' });
    expect(cinza).toMatchObject({ id: 'cinza', behaviorTree: 'guardian', faction: 'guardian' });

    expect(world.tiles[tileIndex(gota.position.x, gota.position.y, world.width)]!.biome).toBe('meadow');
    expect(world.tiles[tileIndex(raiz.position.x, raiz.position.y, world.width)]!.biome).toBe('forest');
    expect(world.tiles[tileIndex(cinza.position.x, cinza.position.y, world.width)]!.biome).toBe('ruins');
  });

  it('is deterministic: repeated genesis generations place the same 3 Nativos on the same tiles', () => {
    const a = generateHeartWorld(HEART_WORLD_SEED);
    const b = generateHeartWorld(HEART_WORLD_SEED);
    expect(a.natives).toEqual(b.natives);
  });

  it('a different seed can relocate the Nativos (positions follow the seed, not a hard-coded constant)', () => {
    const heart = generateHeartWorld(HEART_WORLD_SEED);
    const other = generateHeartWorld('outro-mundo');
    // The map layout differs per seed (already covered above), so at least
    // one of the 3 Nativos landing somewhere else is the expected outcome,
    // not a hard requirement on which one.
    expect(heart.natives).not.toEqual(other.natives);
  });

  it('the resulting world passes schema + semantic validation', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED);
    expect(validateWorld(world)).toEqual({ valid: true, errors: [] });
  });

  it('is idempotent: seeding an already-seeded world is a no-op', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED);
    const seededAgain = seedInitialNatives(world);
    expect(seededAgain).toEqual(world);
    expect(seededAgain.natives).toBe(world.natives); // same reference - no new object allocated
  });

  it('is additive: seeding a natives-less world only adds the natives field, nothing else', () => {
    const width = 10;
    const height = 10;
    const tiles: Tile[] = Array.from({ length: width * height }, () => ({ biome: 'meadow' as const }));
    tiles[tileIndex(5, 5, width)] = { biome: 'forest' };
    tiles[tileIndex(9, 9, width)] = { biome: 'ruins' };

    const bare: World = {
      meta: { name: 'Bare', seed: 'bare-seed', tickCount: 12, worldTime: 720 },
      width,
      height,
      tiles,
      players: { alice: { login: 'alice', position: { x: 1, y: 1 }, inventory: { wood: 2 }, energy: 90 } },
      events: [{ type: 'player_joined', tick: 1, worldTime: 60, login: 'alice' }],
    };

    const seeded = seedInitialNatives(bare);

    expect(seeded.meta).toEqual(bare.meta);
    expect(seeded.width).toBe(bare.width);
    expect(seeded.height).toBe(bare.height);
    expect(seeded.tiles).toEqual(bare.tiles);
    expect(seeded.players).toEqual(bare.players);
    expect(seeded.events).toEqual(bare.events);
    expect(Object.keys(seeded.natives!).sort()).toEqual(['cinza', 'gota', 'raiz']);
  });

  it('falls back to the (30, 30) spawn tile when a required biome is entirely absent from the map', () => {
    const width = 3;
    const height = 3;
    const tiles: Tile[] = Array.from({ length: width * height }, () => ({ biome: 'meadow' as const }));
    // No forest, no ruins anywhere on this tiny map.
    const bare: World = {
      meta: { name: 'Tiny', seed: 'tiny-seed', tickCount: 0, worldTime: 0 },
      width,
      height,
      tiles,
      players: {},
      events: [],
    };

    const seeded = seedInitialNatives(bare);
    expect(seeded.natives!['raiz']!.position).toEqual({ x: 30, y: 30 });
    expect(seeded.natives!['cinza']!.position).toEqual({ x: 30, y: 30 });
    expect(seeded.natives!['gota']!.position).toEqual({ x: 0, y: 0 }); // meadow is everywhere here
  });
});

describe('seedInitialNatives - retrofitting the live world/heart.json (issue #22 migration check)', () => {
  // This is the mandated pre-merge check for issue #22: load the REAL,
  // currently-committed world/heart.json (already ticking, with a real
  // player and real event history), run it through exactly the flow
  // scripts/tick.ts uses (validate -> seed if needed -> advanceWorld ->
  // validate), and confirm the migration is safe. world/heart.json itself
  // is never written by this test or by this PR - only the real tick,
  // post-merge, performs the live retrofit.
  const onDiskRaw: unknown = JSON.parse(readFileSync(heartJsonPath, 'utf-8'));
  assertValidWorld(onDiskRaw);
  const onDisk = onDiskRaw;
  // The live world has since been retrofitted with os Nativos in production
  // (issue #27's tick seeded gota/raiz/cinza). To keep testing the retrofit
  // LOGIC regardless of the live file's current state - the same lesson as the
  // byte-for-byte mapgen check above - derive a synthetic pre-migration world
  // (same real playtime, natives stripped) and seed THAT.
  const preMigration: World = { ...onDisk, natives: undefined };

  it('sanity: the live world has real playtime to protect and the Nativos migration has run', () => {
    expect(onDisk.meta.tickCount).toBeGreaterThanOrEqual(26);
    expect(Object.keys(onDisk.players)).toContain('brigsd');
    expect(onDisk.events.length).toBeGreaterThan(0);
    expect(onDisk.natives).toBeDefined(); // issue #27's tick already seeded the Nativos
  });

  it('(a) seeding alone adds exactly the 3 Nativos, deterministically', () => {
    const seeded = seedInitialNatives(preMigration);
    expect(Object.keys(seeded.natives ?? {}).sort()).toEqual(['cinza', 'gota', 'raiz']);
    // Same seed ("commit-primordial") + same tiles => same spots a fresh
    // generateHeartWorld() would have used from genesis.
    const fresh = generateHeartWorld(onDisk.meta.seed);
    expect(seeded.natives).toEqual(fresh.natives);
  });

  it('(b) seeding alone preserves players.brigsd, tickCount and every pre-existing event byte-for-byte', () => {
    const seeded = seedInitialNatives(preMigration);
    expect(seeded.meta.tickCount).toBe(onDisk.meta.tickCount);
    expect(seeded.meta.worldTime).toBe(onDisk.meta.worldTime);
    expect(seeded.players).toEqual(onDisk.players);
    expect(seeded.players['brigsd']).toEqual(onDisk.players['brigsd']);
    expect(seeded.events).toEqual(onDisk.events);
    expect(seeded.tiles).toEqual(onDisk.tiles);
  });

  it('(c) the seeded world passes the hardened validator', () => {
    const seeded = seedInitialNatives(preMigration);
    const result = validateWorld(seeded);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('seeding is idempotent when applied to the live world twice', () => {
    const once = seedInitialNatives(preMigration);
    const twice = seedInitialNatives(once);
    expect(twice).toEqual(once);
  });

  it('the full tick flow (seed + advanceWorld, as scripts/tick.ts runs it) preserves brigsd/tickCount/events and stays valid', () => {
    const seeded = seedInitialNatives(preMigration);
    assertValidWorld(seeded);

    // Deterministic "exactly 1 beat due" instant, independent of wall-clock
    // time so this test's outcome never depends on when CI happens to run.
    const now = HEART_GENESIS_UNIX_SECONDS + (onDisk.meta.tickCount + 1) * TICK_INTERVAL_SECONDS;
    const { world: advanced } = advanceWorld(seeded, now, []);

    // (a) still 3 Nativos, now possibly having taken one step/spoken.
    expect(Object.keys(advanced.natives ?? {}).sort()).toEqual(['cinza', 'gota', 'raiz']);

    // (b) tickCount advanced by exactly 1 beat (not reset, not skipped);
    // brigsd is untouched (no commands were submitted in this simulation);
    // every pre-existing event is still present, in order, as a prefix.
    expect(advanced.meta.tickCount).toBe(onDisk.meta.tickCount + 1);
    expect(advanced.players['brigsd']).toEqual(onDisk.players['brigsd']);
    expect(advanced.events.slice(0, onDisk.events.length)).toEqual(onDisk.events);
    expect(advanced.events.length).toBeGreaterThan(onDisk.events.length);

    // (c) the hardened validator accepts the result.
    expect(validateWorld(advanced)).toEqual({ valid: true, errors: [] });

    console.log(
      [
        '',
        '=== Migração do mundo vivo (issue #22) ===',
        `Antes:  tick #${onDisk.meta.tickCount}, worldTime ${onDisk.meta.worldTime}min, ` +
          `${Object.keys(onDisk.players).length} jogador(es), ${onDisk.events.length} evento(s), natives: nenhum`,
        `Depois: tick #${advanced.meta.tickCount}, worldTime ${advanced.meta.worldTime}min, ` +
          `${Object.keys(advanced.players).length} jogador(es), ${advanced.events.length} evento(s), ` +
          `natives: ${Object.keys(advanced.natives ?? {}).join(', ')}`,
        `brigsd preservado: ${JSON.stringify(advanced.players['brigsd']) === JSON.stringify(onDisk.players['brigsd'])}`,
        `${onDisk.events.length} eventos pré-existentes preservados como prefixo: ${
          JSON.stringify(advanced.events.slice(0, onDisk.events.length)) === JSON.stringify(onDisk.events)
        }`,
        `Validador endurecido: ${validateWorld(advanced).valid ? 'PASSOU' : 'FALHOU'}`,
        '===========================================',
        '',
      ].join('\n'),
    );
  });

  it('the Nativos seeded onto the live world sit on walkable (non-water) tiles', () => {
    const seeded = seedInitialNatives(preMigration);
    for (const native of Object.values(seeded.natives!) as Native[]) {
      const tile = seeded.tiles[tileIndex(native.position.x, native.position.y, seeded.width)]!;
      expect(tile.biome).not.toBe('water');
    }
  });
});

describe('seedFactoryMachines - A Fábrica (v2.5, D-23/D-25a) machine placement', () => {
  it('is a no-op on a fresh generateHeartWorld() world - it does not seed machines by itself (only scripts/tick.ts does)', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED);
    expect(world.machines).toBeUndefined();
  });

  it('places exactly the 4 oficinas, each keyed by its own id, on the clearing around o Núcleo (never on water)', () => {
    const world = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    expect(Object.keys(world.machines ?? {}).sort()).toEqual(['bancada', 'cozinha', 'estaleiro', 'forja']);

    for (const id of MACHINE_IDS) {
      const machine = world.machines![id]!;
      expect(machine.id).toBe(id);
      expect(machine.name).toBe(MACHINES[id].name);
      const tile = world.tiles[tileIndex(machine.position.x, machine.position.y, world.width)]!;
      expect(tile.biome).not.toBe('water');
      expect(tile.biome).not.toBe('core');
    }
  });

  it('places every oficina near o Núcleo (within the padded clearing), never on the Core tiles themselves, never on the player spawn tile', () => {
    const world = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    for (const machine of Object.values(world.machines!) as Machine[]) {
      const dx = Math.abs(machine.position.x - CORE_ORIGIN.x);
      const dy = Math.abs(machine.position.y - CORE_ORIGIN.y);
      // Comfortably within a "near the Core" radius (well short of the map edge).
      expect(dx).toBeLessThanOrEqual(6);
      expect(dy).toBeLessThanOrEqual(6);

      const onCore =
        machine.position.x >= CORE_ORIGIN.x &&
        machine.position.x < CORE_ORIGIN.x + CORE_SIZE &&
        machine.position.y >= CORE_ORIGIN.y &&
        machine.position.y < CORE_ORIGIN.y + CORE_SIZE;
      expect(onCore).toBe(false);

      expect(machine.position).not.toEqual({ x: 30, y: 30 }); // player /entrar spawn
    }
  });

  it('is deterministic: repeated seeding of a fresh genesis world always places the same 4 machines on the same tiles', () => {
    const a = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    const b = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    expect(a.machines).toEqual(b.machines);
  });

  it('positions do not depend on the seed (static, near a fixed Core geometry - unlike os Nativos, no tile scan is involved)', () => {
    const heart = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    const other = seedFactoryMachines(generateHeartWorld('outro-mundo'));
    expect(heart.machines).toEqual(other.machines);
  });

  it('the resulting world passes schema + semantic validation', () => {
    const world = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    expect(validateWorld(world)).toEqual({ valid: true, errors: [] });
  });

  it('is idempotent: seeding an already-seeded world is a no-op', () => {
    const world = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    const seededAgain = seedFactoryMachines(world);
    expect(seededAgain).toEqual(world);
    expect(seededAgain.machines).toBe(world.machines); // same reference - no new object allocated
  });

  it('is additive: seeding a machines-less world only adds the machines field, nothing else', () => {
    const width = 10;
    const height = 10;
    const tiles: Tile[] = Array.from({ length: width * height }, () => ({ biome: 'meadow' as const }));

    const bare: World = {
      meta: { name: 'Bare', seed: 'bare-seed', tickCount: 12, worldTime: 720 },
      width,
      height,
      tiles,
      players: { alice: { login: 'alice', position: { x: 1, y: 1 }, inventory: { wood: 2 }, energy: 90 } },
      events: [{ type: 'player_joined', tick: 1, worldTime: 60, login: 'alice' }],
      natives: { gota: { id: 'gota', name: 'Gota', position: { x: 0, y: 0 }, behaviorTree: 'wanderer', behaviorState: '{}', inventory: {}, hp: 100, faction: 'wanderer' } },
    };

    const seeded = seedFactoryMachines(bare);

    expect(seeded.meta).toEqual(bare.meta);
    expect(seeded.width).toBe(bare.width);
    expect(seeded.height).toBe(bare.height);
    expect(seeded.tiles).toEqual(bare.tiles);
    expect(seeded.players).toEqual(bare.players);
    expect(seeded.events).toEqual(bare.events);
    expect(seeded.natives).toEqual(bare.natives);
    expect(Object.keys(seeded.machines!).sort()).toEqual(['bancada', 'cozinha', 'estaleiro', 'forja']);
  });
});

describe('seedFactoryMachines - retrofitting the live world/heart.json', () => {
  // Same shape as the Nativos migration check above: load the REAL,
  // currently-committed world/heart.json, run it through exactly the flow
  // scripts/tick.ts uses (validate -> seed if needed -> advanceWorld ->
  // validate), and confirm the migration is safe. world/heart.json itself is
  // never written by this test - only the real tick, post-merge, performs
  // the live retrofit.
  const onDiskRaw: unknown = JSON.parse(readFileSync(heartJsonPath, 'utf-8'));
  assertValidWorld(onDiskRaw);
  const onDisk = onDiskRaw;
  const preMigration: World = { ...onDisk, machines: undefined };

  it('sanity: the live world has real playtime to protect and the migration already happened', () => {
    expect(onDisk.meta.tickCount).toBeGreaterThan(0);
    expect(Object.keys(onDisk.players)).toContain('brigsd');
    // The real tick seeded the oficinas into the live world right after PR #39
    // merged (same lifecycle as the Nativos migration, issue #30) - from here
    // on this suite checks the migration against a synthetic preMigration
    // world, while the on-disk world is expected to already carry them.
    expect(Object.keys(onDisk.machines ?? {}).sort()).toEqual(['bancada', 'cozinha', 'estaleiro', 'forja']);
  });

  it('(a) seeding alone adds exactly the 4 oficinas, deterministically', () => {
    const seeded = seedFactoryMachines(preMigration);
    expect(Object.keys(seeded.machines ?? {}).sort()).toEqual(['bancada', 'cozinha', 'estaleiro', 'forja']);
    const fresh = seedFactoryMachines(generateHeartWorld(onDisk.meta.seed));
    expect(seeded.machines).toEqual(fresh.machines);
  });

  it('(b) seeding alone preserves players.brigsd, tickCount, natives and every pre-existing event byte-for-byte', () => {
    const seeded = seedFactoryMachines(preMigration);
    expect(seeded.meta.tickCount).toBe(onDisk.meta.tickCount);
    expect(seeded.players).toEqual(onDisk.players);
    expect(seeded.natives).toEqual(onDisk.natives);
    expect(seeded.events).toEqual(onDisk.events);
    expect(seeded.tiles).toEqual(onDisk.tiles);
  });

  it('(c) the seeded world passes the hardened validator', () => {
    const seeded = seedFactoryMachines(preMigration);
    expect(validateWorld(seeded)).toEqual({ valid: true, errors: [] });
  });

  it('seeding is idempotent when applied to the live world twice', () => {
    const once = seedFactoryMachines(preMigration);
    const twice = seedFactoryMachines(once);
    expect(twice).toEqual(once);
  });

  it('the full tick flow (seed + advanceWorld, as scripts/tick.ts runs it) preserves brigsd/tickCount/events and stays valid', () => {
    const seeded = seedFactoryMachines(preMigration);
    assertValidWorld(seeded);

    const now = HEART_GENESIS_UNIX_SECONDS + (onDisk.meta.tickCount + 1) * TICK_INTERVAL_SECONDS;
    const { world: advanced } = advanceWorld(seeded, now, []);

    expect(Object.keys(advanced.machines ?? {}).sort()).toEqual(['bancada', 'cozinha', 'estaleiro', 'forja']);
    expect(advanced.meta.tickCount).toBe(onDisk.meta.tickCount + 1);
    expect(advanced.players['brigsd']).toEqual(onDisk.players['brigsd']);
    expect(advanced.events.slice(0, onDisk.events.length)).toEqual(onDisk.events);
    expect(validateWorld(advanced)).toEqual({ valid: true, errors: [] });
  });
});

describe('seedCityLayout - A Cidade (R7, docs/CITY_PLAN.md) shape and determinism', () => {
  /** The full genesis chain a brand-new world goes through in scripts/tick.ts. */
  function freshCity(): World {
    return seedCityLayout(seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED)));
  }

  it('does nothing on a fresh generateHeartWorld() world (no machines yet - only the tick chain lays the city)', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED);
    const after = seedCityLayout(world);
    expect(after).toBe(world); // same reference - untouched
  });

  it('moves the 4 oficinas from the clearing corners to their cardinal gates (pinwheel around o Núcleo)', () => {
    const world = freshCity();
    const positions = cityMachinePositions();
    for (const id of MACHINE_IDS) {
      expect(world.machines![id]!.position).toEqual(positions[id]);
      expect(world.machines![id]!.name).toBe(MACHINES[id].name); // name/id survive the move
      expect(world.machines![id]!.id).toBe(id);
    }
    // The 4 city positions are 4 distinct tiles, none of them the spawn, none on the Core.
    const keys = new Set(Object.values(positions).map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(4);
    for (const p of Object.values(positions)) {
      expect(p).not.toEqual(PLAYER_SPAWN);
      const onCore =
        p.x >= CORE_ORIGIN.x && p.x < CORE_ORIGIN.x + CORE_SIZE && p.y >= CORE_ORIGIN.y && p.y < CORE_ORIGIN.y + CORE_SIZE;
      expect(onCore).toBe(false);
      const tile = world.tiles[tileIndex(p.x, p.y, world.width)]!;
      expect(tile.biome).toBe('meadow'); // machines stand on the (always-meadow) clearing
    }
  });

  it('paints every planned deco tile - the whole plan lands on meadow on the real map', () => {
    const world = freshCity();
    // Every plan coordinate is meadow on O Coração's real layout (the plan
    // was designed against it - see docs/CITY_PLAN.md). If mapgen or the
    // plan ever drift so that a planned tile lands on water/forest/ruins,
    // this fails loudly instead of silently leaving holes in the city.
    const base = generateHeartWorld(HEART_WORLD_SEED);
    for (const { x, y, deco } of cityDecoPlan()) {
      const baseTile = base.tiles[tileIndex(x, y, base.width)]!;
      expect(`${x},${y}:${baseTile.biome}`).toBe(`${x},${y}:meadow`);
      const tile = world.tiles[tileIndex(x, y, world.width)]!;
      expect(tile.deco).toBeDefined();
      // Later plan entries win (mural stone over court floor, arches over
      // esplanade) - so the tile's final deco is the LAST plan entry for it.
      void deco;
    }
  });

  it('never decorates water, the Core, or any out-of-plan tile; never touches biomes or resources', () => {
    const base = seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
    const world = seedCityLayout(base);
    const planned = new Set(cityDecoPlan().map(({ x, y }) => tileIndex(x, y, world.width)));
    world.tiles.forEach((tile, idx) => {
      expect(tile.biome).toBe(base.tiles[idx]!.biome);
      expect(tile.resource).toBe(base.tiles[idx]!.resource);
      if (tile.deco !== undefined) {
        expect(planned.has(idx)).toBe(true);
        expect(tile.biome).toBe('meadow');
      } else {
        expect(planned.has(idx)).toBe(false);
      }
    });
  });

  it('keeps the spawn tile free of standing objects and clear of machines', () => {
    const world = freshCity();
    const spawnTile = world.tiles[tileIndex(PLAYER_SPAWN.x, PLAYER_SPAWN.y, world.width)]!;
    // Ground deco (the plaza floor) is fine underfoot; an object would sit ON the player.
    expect(spawnTile.deco).toBeDefined();
    expect(TILE_DECO_OBJECTS).not.toContain(spawnTile.deco!);
    for (const machine of Object.values(world.machines!) as Machine[]) {
      expect(machine.position).not.toEqual(PLAYER_SPAWN);
    }
  });

  it('frames the living portal: esplanade under SALAO_PORTAL_TILE, arch row on its meridian, dormant seeds south', () => {
    const world = freshCity();
    const { x, y } = SALAO_PORTAL_TILE;
    const at = (tx: number, ty: number): Tile => world.tiles[tileIndex(tx, ty, world.width)]!;
    expect(at(x, y).deco).toBe('plaza'); // the portal marker (client-side) stands on the hall floor
    expect(at(x, y - 2).deco).toBe('arch');
    expect(at(x, y + 2).deco).toBe('arch');
    expect(at(x, y + 4).deco).toBe('arch_dormant');
    expect(at(x, y + 6).deco).toBe('arch_dormant');
  });

  it('raises the 4 plaza pylons exactly on the legacy machine corner spots', () => {
    const world = freshCity();
    const legacyCorners = [
      { x: 29, y: 29 },
      { x: 36, y: 29 },
      { x: 29, y: 36 },
      { x: 36, y: 36 },
    ];
    for (const c of legacyCorners) {
      expect(world.tiles[tileIndex(c.x, c.y, world.width)]!.deco).toBe('pylon');
    }
  });

  it('is deterministic: repeated runs produce deep-equal cities', () => {
    expect(freshCity()).toEqual(freshCity());
  });

  it('is idempotent: laying the city twice is a no-op (same reference)', () => {
    const world = freshCity();
    const again = seedCityLayout(world);
    expect(again).toBe(world);
  });

  it('the resulting world passes schema + semantic validation', () => {
    expect(validateWorld(freshCity())).toEqual({ valid: true, errors: [] });
  });

  it('is total on tiny worlds: out-of-bounds plan tiles are skipped, nothing throws', () => {
    const width = 10;
    const height = 10;
    const tiles: Tile[] = Array.from({ length: width * height }, () => ({ biome: 'meadow' as const }));
    const bare: World = {
      meta: { name: 'Tiny', seed: 'tiny-seed', tickCount: 0, worldTime: 0 },
      width,
      height,
      tiles,
      players: {},
      events: [],
      machines: Object.fromEntries(
        MACHINE_IDS.map((id) => [id, { id, name: MACHINES[id].name, position: { x: 1, y: 1 } }]),
      ),
    };
    // Machines are NOT at the legacy corners here, so the guard refuses -
    // and, crucially, nothing explodes evaluating the out-of-bounds plan.
    expect(() => seedCityLayout(bare)).not.toThrow();
    expect(seedCityLayout(bare)).toBe(bare);
  });
});

describe('seedCityLayout - the double guard (never clobber future states)', () => {
  function eligibleWorld(): World {
    return seedFactoryMachines(generateHeartWorld(HEART_WORLD_SEED));
  }

  it('refuses when machines are absent', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED);
    expect(seedCityLayout(world)).toBe(world);
  });

  it('refuses when ANY machine has left its original corner (a future state moved it)', () => {
    for (const id of MACHINE_IDS) {
      const world = eligibleWorld();
      const moved: World = {
        ...world,
        machines: {
          ...world.machines!,
          [id]: { ...world.machines![id]!, position: { x: 10, y: 10 } },
        },
      };
      expect(seedCityLayout(moved)).toBe(moved);
    }
  });

  it('refuses when any tile already carries deco (the city was laid once, forever)', () => {
    const world = eligibleWorld();
    const laid = seedCityLayout(world);
    expect(laid).not.toBe(world);
    // Even if some future state moved the machines BACK to the legacy
    // corners, the deco guard alone keeps the migration from re-firing.
    const machinesBack: World = { ...laid, machines: world.machines! };
    expect(seedCityLayout(machinesBack)).toBe(machinesBack);
  });

  it('all-or-nothing: a refused world has neither moved machines nor any deco', () => {
    const world = generateHeartWorld(HEART_WORLD_SEED); // no machines
    const after = seedCityLayout(world);
    expect(after.tiles.every((t) => t.deco === undefined)).toBe(true);
    expect(after.machines).toBeUndefined();
  });
});

describe('seedCityLayout - retrofitting the live world/heart.json', () => {
  // Same shape as the Nativos/A Fábrica migration checks above: load the
  // REAL, currently-committed world/heart.json, run it through exactly the
  // flow scripts/tick.ts uses (validate -> seed if needed -> advanceWorld ->
  // validate), and confirm the migration is safe. world/heart.json itself is
  // never written by this test - only the real tick, post-merge, performs
  // the live retrofit. Because the live file's state changes the moment that
  // real tick runs, everything below tests a SYNTHETIC pre-migration world
  // (same real playtime, deco stripped, machines pinned back to the legacy
  // corners), like the other two suites learned to.
  const onDiskRaw: unknown = JSON.parse(readFileSync(heartJsonPath, 'utf-8'));
  assertValidWorld(onDiskRaw);
  const onDisk = onDiskRaw;

  // Synthetic pre-migration state: the live playtime with deco stripped and
  // the machines pinned back to their legacy clearing corners (the exact
  // positions seedFactoryMachines has always produced - hardcoded here on
  // purpose, as a pin: the guard in seedCityLayout compares against these,
  // so if they ever silently changed, this suite must scream).
  const preMigration: World = {
    ...onDisk,
    tiles: onDisk.tiles.map((tile) => {
      if (tile.deco === undefined) return tile;
      const { deco: _deco, ...rest } = tile;
      return rest;
    }),
    machines: Object.fromEntries(
      MACHINE_IDS.map((id) => [
        id,
        {
          id,
          name: MACHINES[id].name,
          position: {
            forja: { x: 29, y: 29 },
            cozinha: { x: 36, y: 29 },
            bancada: { x: 29, y: 36 },
            estaleiro: { x: 36, y: 36 },
          }[id]!,
        },
      ]),
    ),
  };

  it('sanity: the live world is in exactly one legitimate state (pre-city XOR post-city), never half-migrated', () => {
    const hasDeco = onDisk.tiles.some((t) => t.deco !== undefined);
    const positions = cityMachinePositions();
    const machinesAtCity = MACHINE_IDS.every(
      (id) =>
        onDisk.machines?.[id]?.position.x === positions[id].x &&
        onDisk.machines?.[id]?.position.y === positions[id].y,
    );
    const machinesAtLegacy = MACHINE_IDS.every(
      (id) =>
        onDisk.machines?.[id]?.position.x === preMigration.machines![id]!.position.x &&
        onDisk.machines?.[id]?.position.y === preMigration.machines![id]!.position.y,
    );
    // pre: no deco + legacy corners. post: deco + city gates. Anything else is drift.
    expect(hasDeco ? machinesAtCity : machinesAtLegacy).toBe(true);
    expect(onDisk.meta.tickCount).toBeGreaterThan(0);
    expect(Object.keys(onDisk.players)).toContain('brigsd');
  });

  it('(a) seeding alone moves the 4 machines to the city gates and paints deco, deterministically equal to a fresh genesis city', () => {
    const seeded = seedCityLayout(preMigration);
    expect(seeded).not.toBe(preMigration);
    const fresh = seedCityLayout(seedFactoryMachines(generateHeartWorld(onDisk.meta.seed)));
    expect(seeded.machines).toEqual(fresh.machines);
    // Same deco on the same tiles as genesis (live tiles may lack a
    // collected resource here and there, but deco placement matches 1:1).
    expect(seeded.tiles.map((t) => t.deco ?? null)).toEqual(fresh.tiles.map((t) => t.deco ?? null));
  });

  it('(b) seeding alone preserves players.brigsd, tickCount, natives and every pre-existing event byte-for-byte; only deco is added to tiles', () => {
    const seeded = seedCityLayout(preMigration);
    expect(seeded.meta).toEqual(onDisk.meta);
    expect(seeded.players).toEqual(onDisk.players);
    expect(seeded.players['brigsd']).toEqual(onDisk.players['brigsd']);
    expect(seeded.natives).toEqual(onDisk.natives);
    expect(seeded.events).toEqual(onDisk.events);
    seeded.tiles.forEach((tile, idx) => {
      expect(tile.biome).toBe(preMigration.tiles[idx]!.biome);
      expect(tile.resource).toBe(preMigration.tiles[idx]!.resource);
    });
  });

  it('(c) the seeded world passes the hardened validator', () => {
    expect(validateWorld(seedCityLayout(preMigration))).toEqual({ valid: true, errors: [] });
  });

  it('seeding is idempotent when applied to the live world twice', () => {
    const once = seedCityLayout(preMigration);
    const twice = seedCityLayout(once);
    expect(twice).toBe(once);
  });

  it('no machine ends up on water, on the Core, or on the player spawn', () => {
    const seeded = seedCityLayout(preMigration);
    for (const machine of Object.values(seeded.machines!) as Machine[]) {
      const tile = seeded.tiles[tileIndex(machine.position.x, machine.position.y, seeded.width)]!;
      expect(tile.biome).not.toBe('water');
      expect(tile.biome).not.toBe('core');
      expect(machine.position).not.toEqual(PLAYER_SPAWN);
    }
  });

  it('the full tick flow (seed + advanceWorld, as scripts/tick.ts runs it) preserves brigsd/tickCount/events and stays valid', () => {
    const seeded = seedCityLayout(preMigration);
    assertValidWorld(seeded);

    const now = HEART_GENESIS_UNIX_SECONDS + (onDisk.meta.tickCount + 1) * TICK_INTERVAL_SECONDS;
    const { world: advanced } = advanceWorld(seeded, now, []);

    const positions = cityMachinePositions();
    for (const id of MACHINE_IDS) {
      expect(advanced.machines![id]!.position).toEqual(positions[id]);
    }
    expect(advanced.meta.tickCount).toBe(onDisk.meta.tickCount + 1);
    expect(advanced.players['brigsd']).toEqual(onDisk.players['brigsd']);
    expect(advanced.events.slice(0, onDisk.events.length)).toEqual(onDisk.events);
    expect(validateWorld(advanced)).toEqual({ valid: true, errors: [] });

    console.log(
      [
        '',
        '=== Migração da cidade (R7, docs/CITY_PLAN.md) ===',
        `Antes:  tick #${onDisk.meta.tickCount}, máquinas nos cantos, ${preMigration.tiles.filter((t) => t.deco).length} tiles com deco`,
        `Depois: tick #${advanced.meta.tickCount}, máquinas nos portões cardeais, ${advanced.tiles.filter((t) => t.deco).length} tiles com deco`,
        `brigsd preservado: ${JSON.stringify(advanced.players['brigsd']) === JSON.stringify(onDisk.players['brigsd'])}`,
        `Validador endurecido: ${validateWorld(advanced).valid ? 'PASSOU' : 'FALHOU'}`,
        '===================================================',
        '',
      ].join('\n'),
    );
  });
});
