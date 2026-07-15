/**
 * engine/mapgen.ts
 *
 * Deterministic procedural generator for O Coração, the origin world: a
 * central meadow around the pulsing Core, a river crossing the map bank to
 * bank, organic forest patches, a few small ruins, and resources scattered
 * according to their biome (see docs/GDD.md, docs/LORE.md).
 *
 * Everything here is a pure function of the seed. No Date.now(), no
 * Math.random() - every random draw goes through engine/rng.ts, consumed in
 * a fixed order, so the same seed always yields byte-identical output.
 */

import { Rng } from './rng';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  isInBounds,
  tileIndex,
  MACHINE_IDS,
  type Tile,
  type World,
  type Native,
  type Machine,
  type MachineId,
  type Position,
  type Biome,
} from './types';
import { MACHINES } from './fabrication';

/** The one and only seed for O Coração - the world is one, per the GDD. */
export const HEART_WORLD_SEED = 'commit-primordial';

export const HEART_WORLD_NAME = 'O Coração';

/** Top-left tile of the Core's 2x2 footprint. */
export const CORE_ORIGIN = { x: 32, y: 32 } as const;

/** The Core is a 2x2 block. */
export const CORE_SIZE = 2;

/** Extra meadow ring kept clear around the Core (river/forest/ruins avoid it). */
const CORE_CLEARING_PADDING = 3;

/** Target share of the map covered by forest (~25%, GDD). */
export const FOREST_TARGET_RATIO = 0.25;

/** Small inclusive integer range, all four bounds included. */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const NEIGHBORS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inBox(x: number, y: number, box: Box): boolean {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}

function coreClearingBox(): Box {
  return {
    x0: CORE_ORIGIN.x - CORE_CLEARING_PADDING,
    y0: CORE_ORIGIN.y - CORE_CLEARING_PADDING,
    x1: CORE_ORIGIN.x + CORE_SIZE - 1 + CORE_CLEARING_PADDING,
    y1: CORE_ORIGIN.y + CORE_SIZE - 1 + CORE_CLEARING_PADDING,
  };
}

// ---------------------------------------------------------------------------
// River: a single orthogonally-connected path crossing the map bank to bank,
// steering around the Core's clearing whenever it would cut through it.
// ---------------------------------------------------------------------------

function carveRiver(tiles: Tile[], width: number, height: number, rng: Rng, keepout: Box): void {
  const horizontal = rng.chance(0.5);
  // The walk below is a biased random walk on the cross axis. Left fully
  // unconstrained it can (and, for some seeds, does) drift into a map edge
  // and hug it for the whole crossing - connected and edge-to-edge, but a
  // bad look for "a river crossing the map". A mild pull back toward the
  // centerline keeps it meandering through the middle instead.
  const crossLen = horizontal ? height : width;
  const center = Math.floor(crossLen / 2);
  const comfortBand = crossLen * 0.35;
  const margin = Math.round(crossLen * 0.2);
  let x = horizontal ? 0 : rng.nextInt(margin, width - 1 - margin);
  let y = horizontal ? rng.nextInt(margin, height - 1 - margin) : 0;

  const forward: readonly [number, number] = horizontal ? [1, 0] : [0, 1];
  const perpA: readonly [number, number] = horizontal ? [0, -1] : [-1, 0];
  const perpB: readonly [number, number] = horizontal ? [0, 1] : [1, 0];
  const allDirs: ReadonlyArray<readonly [number, number]> = [
    forward,
    perpA,
    perpB,
    [-forward[0], -forward[1]],
  ];

  const validStep = (px: number, py: number): boolean =>
    isInBounds(px, py, width, height) && !inBox(px, py, keepout);

  const paint = (px: number, py: number): void => {
    if (validStep(px, py)) {
      tiles[tileIndex(px, py, width)] = { biome: 'water' };
    }
  };

  paint(x, y);
  const goalReached = (): boolean => (horizontal ? x >= width - 1 : y >= height - 1);
  const maxSteps = (horizontal ? width : height) * 8;

  for (let step = 0; !goalReached() && step < maxSteps; step++) {
    // Mean-reversion: the further the walker strays from the centerline,
    // the more the remaining (non-forward) probability mass shifts toward
    // the direction that pulls it back. `pull` saturates at +-1 so the walk
    // never becomes fully deterministic - it still wanders, just within a
    // comfortable central band.
    const cross = horizontal ? y : x;
    const pull = clamp((cross - center) / comfortBand, -1, 1);
    const pForward = 0.55;
    const pRemaining = 1 - pForward;
    const pPerpA = clamp(pRemaining * (0.5 + 0.5 * pull), 0.05, pRemaining - 0.05);
    const pPerpB = pRemaining - pPerpA;

    const roll = rng.next();
    const order =
      roll < pForward
        ? [forward, perpA, perpB]
        : roll < pForward + pPerpA
          ? [perpA, forward, perpB]
          : [perpB, forward, perpA];

    let moved = false;
    for (const [dx, dy] of order) {
      const nx = x + dx;
      const ny = y + dy;
      if (!validStep(nx, ny)) continue;
      x = nx;
      y = ny;
      paint(x, y);
      moved = true;
      break;
    }

    if (!moved) {
      // Boxed in by the map edge and the Core's clearing at once (should be
      // geometrically impossible for O Coração, but fail safe rather than
      // corrupt the walker's position): try any of the four directions.
      for (const [dx, dy] of allDirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (!validStep(nx, ny)) continue;
        x = nx;
        y = ny;
        paint(x, y);
        moved = true;
        break;
      }
    }

    // Occasionally widen the river by a tile so it doesn't read as a single
    // pixel-thin line.
    if (rng.chance(0.4)) {
      const [wdx, wdy] = rng.chance(0.5) ? perpA : perpB;
      paint(x + wdx, y + wdy);
    }
  }
}

// ---------------------------------------------------------------------------
// Forest: organic patches grown from random seed points until ~25% of the
// map is covered.
// ---------------------------------------------------------------------------

function scatterForest(tiles: Tile[], width: number, height: number, rng: Rng, keepout: Box): void {
  const targetForest = Math.round(width * height * FOREST_TARGET_RATIO);
  let forestCount = 0;
  let attempts = 0;
  const maxAttempts = 500;

  const eligible = (x: number, y: number): boolean => {
    if (!isInBounds(x, y, width, height)) return false;
    if (inBox(x, y, keepout)) return false;
    return tiles[tileIndex(x, y, width)]!.biome === 'meadow';
  };

  while (forestCount < targetForest && attempts < maxAttempts) {
    attempts++;
    const sx = rng.nextInt(0, width - 1);
    const sy = rng.nextInt(0, height - 1);
    if (!eligible(sx, sy)) continue;

    const patchTarget = rng.nextInt(60, 260);
    const frontier: Array<[number, number]> = [[sx, sy]];
    let claimedInPatch = 0;

    while (frontier.length > 0 && claimedInPatch < patchTarget && forestCount < targetForest) {
      const pickAt = rng.nextInt(0, frontier.length - 1);
      const [cx, cy] = frontier.splice(pickAt, 1)[0]!;
      if (!eligible(cx, cy)) continue;

      tiles[tileIndex(cx, cy, width)] = { biome: 'forest' };
      claimedInPatch++;
      forestCount++;

      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (eligible(nx, ny) && rng.chance(0.62)) {
          frontier.push([nx, ny]);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Ruins: 2-3 small clusters scattered away from the Core's clearing.
// ---------------------------------------------------------------------------

function placeRuins(tiles: Tile[], width: number, height: number, rng: Rng, keepout: Box): void {
  const ruinCount = rng.nextInt(2, 3);
  const centers: Array<[number, number]> = [];
  let attempts = 0;
  const maxAttempts = 300;
  const minSeparation = 14;

  const eligible = (x: number, y: number): boolean => {
    if (!isInBounds(x, y, width, height)) return false;
    if (inBox(x, y, keepout)) return false;
    return tiles[tileIndex(x, y, width)]!.biome === 'meadow';
  };

  while (centers.length < ruinCount && attempts < maxAttempts) {
    attempts++;
    const cx = rng.nextInt(3, width - 4);
    const cy = rng.nextInt(3, height - 4);
    if (!eligible(cx, cy)) continue;
    if (centers.some(([ux, uy]) => Math.hypot(ux - cx, uy - cy) < minSeparation)) continue;

    const size = rng.nextInt(4, 9);
    const frontier: Array<[number, number]> = [[cx, cy]];
    let claimed = 0;

    while (frontier.length > 0 && claimed < size) {
      const pickAt = rng.nextInt(0, frontier.length - 1);
      const [x, y] = frontier.splice(pickAt, 1)[0]!;
      if (!eligible(x, y)) continue;

      tiles[tileIndex(x, y, width)] = { biome: 'ruins' };
      claimed++;

      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = x + dx;
        const ny = y + dy;
        if (eligible(nx, ny) && rng.chance(0.5)) frontier.push([nx, ny]);
      }
    }

    if (claimed > 0) centers.push([cx, cy]);
  }
}

// ---------------------------------------------------------------------------
// Core: always the same 2x2 footprint at CORE_ORIGIN.
// ---------------------------------------------------------------------------

function placeCore(tiles: Tile[], width: number): void {
  for (let dy = 0; dy < CORE_SIZE; dy++) {
    for (let dx = 0; dx < CORE_SIZE; dx++) {
      const x = CORE_ORIGIN.x + dx;
      const y = CORE_ORIGIN.y + dy;
      tiles[tileIndex(x, y, width)] = { biome: 'core' };
    }
  }
}

// ---------------------------------------------------------------------------
// Resources: wood in forest, stone in ruins, rare pulse fragments on the
// riverbank (meadow/forest ground within reach of water).
// ---------------------------------------------------------------------------

function isNearWater(tiles: Tile[], width: number, height: number, x: number, y: number, radius = 1): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isInBounds(nx, ny, width, height)) continue;
      if (tiles[tileIndex(nx, ny, width)]!.biome === 'water') return true;
    }
  }
  return false;
}

function scatterResources(tiles: Tile[], width: number, height: number, rng: Rng): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = tileIndex(x, y, width);
      const tile = tiles[key]!;

      if (tile.biome === 'forest' && rng.chance(0.22)) {
        tiles[key] = { ...tile, resource: 'wood' };
      } else if (tile.biome === 'ruins' && rng.chance(0.7)) {
        tiles[key] = { ...tile, resource: 'stone' };
      } else if (
        (tile.biome === 'meadow' || tile.biome === 'forest') &&
        rng.chance(0.12) &&
        isNearWater(tiles, width, height, x, y)
      ) {
        tiles[key] = { ...tile, resource: 'pulse_fragment' };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates O Coração from scratch: a deterministic function of `seed`
 * alone. Calling this twice with the same seed always yields
 * deep-equal (byte-identical once serialized) worlds.
 */
export function generateHeartWorld(seed: string = HEART_WORLD_SEED): World {
  const width = WORLD_WIDTH;
  const height = WORLD_HEIGHT;
  const rng = new Rng(seed);
  const keepout = coreClearingBox();

  const tiles: Tile[] = new Array(width * height);
  for (let i = 0; i < tiles.length; i++) {
    tiles[i] = { biome: 'meadow' };
  }

  // Fixed pipeline order - this *is* the determinism contract. Changing the
  // order changes the map even for the same seed.
  carveRiver(tiles, width, height, rng, keepout);
  scatterForest(tiles, width, height, rng, keepout);
  placeRuins(tiles, width, height, rng, keepout);
  placeCore(tiles, width);
  scatterResources(tiles, width, height, rng);

  const world: World = {
    meta: {
      name: HEART_WORLD_NAME,
      seed,
      tickCount: 0,
      worldTime: 0,
    },
    width,
    height,
    tiles,
    players: {},
    events: [],
  };

  // A brand-new O Coração is born with its 3 Nativos already in place - see
  // seedInitialNatives() below, the same function scripts/tick.ts uses to
  // retrofit a world that predates them.
  return seedInitialNatives(world);
}

// ---------------------------------------------------------------------------
// Natives (os Nativos) seeding - v2. Kept in mapgen.ts (rather than
// natives.ts, which only coordinates the per-beat behavior tick) because
// this is world-generation logic: it decides *where in the map* gota, raiz
// and cinza start out, the same way carveRiver/scatterForest/placeRuins
// decide where everything else goes.
// ---------------------------------------------------------------------------

/**
 * First walkable tile of `biome`, scanning row-major from (0, 0). Not
 * random on purpose: a Native's starting spot only needs to be deterministic
 * and inside the right biome, and a fixed scan order means a fresh
 * generateHeartWorld() call and a seedInitialNatives() retrofit of an
 * already-generated world (same seed => same tiles) always agree, with no
 * RNG draw to keep in sync between the two call sites.
 */
function findWalkableTileForBiome(
  tiles: readonly Tile[],
  biome: Biome,
  width: number,
  height: number,
): Position {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[tileIndex(x, y, width)]?.biome === biome) {
        return { x, y };
      }
    }
  }
  // Unreachable for O Coração's real biome mix (meadow/forest/ruins all
  // exist by construction) - fail safe to the player spawn tile instead of
  // throwing and blocking the whole tick.
  return { x: 30, y: 30 };
}

/**
 * Seeds the 3 Nativos - gota (wanderer), raiz (merchant), cinza (guardian) -
 * into `world` if it doesn't have any yet. Pure and idempotent: calling it
 * on a world that already has `natives` returns that world unchanged, so
 * `if (!world.natives) world = seedInitialNatives(world)` (scripts/tick.ts)
 * is always safe to run on every tick, forever, without ever duplicating or
 * resetting a Native that has since moved or spoken.
 *
 * Positions are derived only from `world.tiles` - no RNG, no Date.now() - so
 * a brand-new genesis world (generateHeartWorld) and a live world retrofitted
 * later (same seed => byte-identical tiles, see engine/mapgen.test.ts "the
 * committed world/heart.json") always place the same 3 Nativos on the same
 * tiles. NEVER hand-edit world/heart.json to add natives - this function,
 * run by the tick, is the only sanctioned way (docs/CONTINUITY.md v2 audit).
 */
export function seedInitialNatives(world: World): World {
  if (world.natives && Object.keys(world.natives).length > 0) {
    return world;
  }

  const gotaPos = findWalkableTileForBiome(world.tiles, 'meadow', world.width, world.height);
  const raizPos = findWalkableTileForBiome(world.tiles, 'forest', world.width, world.height);
  const cinzaPos = findWalkableTileForBiome(world.tiles, 'ruins', world.width, world.height);

  const natives: Record<string, Native> = {
    gota: {
      id: 'gota',
      name: 'Gota',
      position: gotaPos,
      behaviorTree: 'wanderer',
      behaviorState: '{}',
      inventory: { pulse_fragment: 5 },
      hp: 100,
      faction: 'wanderer',
    },
    raiz: {
      id: 'raiz',
      name: 'Raiz',
      position: raizPos,
      behaviorTree: 'merchant',
      behaviorState: '{}',
      inventory: { wood: 10 },
      hp: 100,
      faction: 'merchant',
    },
    cinza: {
      id: 'cinza',
      name: 'Cinza',
      position: cinzaPos,
      behaviorTree: 'guardian',
      behaviorState: '{}',
      inventory: { stone: 10 },
      hp: 120,
      faction: 'guardian',
    },
  };

  return { ...world, natives };
}

// ---------------------------------------------------------------------------
// A Fábrica (v2.5, D-23/D-25a) - machine seeding. Kept here (rather than
// engine/fabrication.ts, which owns the catalog data and the synthesis
// logic) for the same reason seedInitialNatives is here: this is
// world-generation/placement logic, deciding *where in the map* the 4
// oficinas sit - the same job carveRiver/scatterForest/placeRuins/
// seedInitialNatives already do for everything else.
// ---------------------------------------------------------------------------

/**
 * The 4 oficinas sit at the corners of o Núcleo's clearing (the same
 * padded, always-meadow keepout box carveRiver/scatterForest/placeRuins
 * already steer around - see coreClearingBox()) - close enough to read as
 * "o Coração's industrial ring", never on the Core itself, and never on the
 * player spawn tile (30, 30). Derived from CORE_ORIGIN/CORE_SIZE/
 * CORE_CLEARING_PADDING rather than hardcoded, so a future change to any of
 * those automatically keeps the oficinas on the clearing's edge instead of
 * silently drifting into the river/forest/ruins.
 */
function factoryMachinePositions(): Record<MachineId, Position> {
  const box = coreClearingBox();
  return {
    forja: { x: box.x0, y: box.y0 },
    cozinha: { x: box.x1, y: box.y0 },
    bancada: { x: box.x0, y: box.y1 },
    estaleiro: { x: box.x1, y: box.y1 },
  };
}

/**
 * Seeds the 4 oficinas-sintetizador - forja, cozinha, bancada, estaleiro
 * (D-25a) - into `world` if it doesn't have any yet. Pure and idempotent,
 * additive-only, exactly like seedInitialNatives above: calling it on a
 * world that already has `machines` returns that world unchanged, so
 * `if (!world.machines) world = seedFactoryMachines(world)`
 * (scripts/tick.ts) is always safe to run on every tick, forever, without
 * ever duplicating or resetting a machine. Positions are static (derived
 * only from the fixed Core geometry, no RNG, no world.tiles scan needed
 * unlike os Nativos) - a brand-new genesis world and a live world
 * retrofitted later always place the same 4 machines on the same tiles.
 * NEVER hand-edit world/heart.json to add machines - this function, run by
 * the tick, is the only sanctioned way (mirrors the Nativos migration,
 * docs/CONTINUITY.md).
 */
export function seedFactoryMachines(world: World): World {
  if (world.machines && Object.keys(world.machines).length > 0) {
    return world;
  }

  const positions = factoryMachinePositions();
  const machines: Record<string, Machine> = {};
  for (const id of MACHINE_IDS) {
    machines[id] = { id, name: MACHINES[id].name, position: positions[id] };
  }

  return { ...world, machines };
}
