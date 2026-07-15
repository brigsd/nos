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
  PLAYER_SPAWN,
  type Tile,
  type TileDeco,
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
  return { ...PLAYER_SPAWN };
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

// ---------------------------------------------------------------------------
// A Cidade (R8, docs/CITY_PLAN.md) - city layout migration. Kept here for
// the same reason seedInitialNatives/seedFactoryMachines are: this is
// world-placement logic, deciding *where in the map* the city's districts
// sit. Everything below is deterministic - no RNG, no Date.now(); the plan
// is a pure function of the fixed Core geometry plus the two anchor tiles
// (PLAYER_SPAWN, SALAO_PORTAL_TILE).
// ---------------------------------------------------------------------------

/**
 * Tile of O Coração's living portal - the anchor of O Salão de Portais.
 * Historically this lived only in site/src/main.ts (PORTAL_MARKER_POSITION,
 * R6 fase 1: east border, always visible/clickable at the default zoom);
 * the city migration frames the same tile with the Salão's arch row, so the
 * client now imports it from here - one constant, structurally impossible
 * for the marker and its architecture to drift apart.
 */
export const SALAO_PORTAL_TILE: Position = { x: 57, y: 34 };

/**
 * The city's machine placement: the 4 oficinas move from the clearing's
 * corners to its cardinal mid-edges, in a pinwheel (C4 rotational symmetry
 * around o Núcleo - deliberately NOT mirror symmetry, CITY_PLAN "simetria
 * quebrada de propósito"). Each cardinal is a gate: the east avenue arrives
 * at the Cozinha, the south road leaves from the Estaleiro, the Forja fronts
 * the river to the north, the Bancada watches the west path. Derived from
 * coreClearingBox() rather than hardcoded, same reasoning as
 * factoryMachinePositions().
 */
export function cityMachinePositions(): Record<MachineId, Position> {
  const box = coreClearingBox();
  const midW = Math.floor((box.x0 + box.x1) / 2);
  const midE = midW + 1;
  const midN = Math.floor((box.y0 + box.y1) / 2);
  const midS = midN + 1;
  return {
    forja: { x: midE, y: box.y0 }, // north gate - riverfront (têmpera)
    cozinha: { x: box.x1, y: midS }, // east gate - mouth of the avenue
    estaleiro: { x: midW, y: box.y1 }, // south gate - head of the south road
    bancada: { x: box.x0, y: midN }, // west gate - toward o Largo do Mural
  };
}

/** One planned decoration: paint `deco` on tile (x, y). */
export interface CityPlanTile {
  x: number;
  y: number;
  deco: TileDeco;
}

/**
 * The full city decoration plan (docs/CITY_PLAN.md, "Zoneamento") as a flat
 * list of tile paints, later entries winning over earlier ones. Pure
 * function of the fixed geometry constants - no world input, no RNG - so
 * genesis worlds and live retrofits always agree tile-for-tile. Exported
 * for the anti-drift tests (e.g. "every planned tile is meadow on the real
 * map", "the spawn tile never carries a standing object").
 */
export function cityDecoPlan(): CityPlanTile[] {
  const plan: CityPlanTile[] = [];
  const box = coreClearingBox();
  const spawn = PLAYER_SPAWN;
  const portal = SALAO_PORTAL_TILE;

  // --- A Praça das Oficinas: flagstone floor over the whole clearing except
  // the Núcleo's own 2x2; light pylons on the 4 corners - exactly the tiles
  // the machines are vacating (factoryMachinePositions), so "where the
  // oficinas first stood, the city raised lights".
  const corners = Object.values(factoryMachinePositions());
  const isCorner = (x: number, y: number): boolean => corners.some((c) => c.x === x && c.y === y);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const onCore =
        x >= CORE_ORIGIN.x && x < CORE_ORIGIN.x + CORE_SIZE && y >= CORE_ORIGIN.y && y < CORE_ORIGIN.y + CORE_SIZE;
      if (onCore) continue;
      plan.push({ x, y, deco: isCorner(x, y) ? 'pylon' : 'plaza' });
    }
  }

  // --- O Largo do Mural: a small flagstone court west of the plaza, on the
  // spawn's own row, holding the mural stone; a short paved path connects it
  // to the plaza's west edge - the first thing a brand-new Nó can follow.
  const muralX = box.x0 - 5;
  for (let y = spawn.y - 1; y <= spawn.y + 1; y++) {
    for (let x = muralX - 1; x <= muralX + 1; x++) {
      plan.push({ x, y, deco: 'plaza' });
    }
  }
  plan.push({ x: muralX, y: spawn.y, deco: 'mural_stone' });
  for (let x = muralX + 2; x < box.x0; x++) {
    plan.push({ x, y: spawn.y, deco: 'pavement' });
  }

  // --- A Avenida do Pulso: a 2-wide paved axis from the plaza's east gate
  // to the Salão's esplanade, on the portal's row and the row above it.
  const esplanadeX0 = portal.x - 2;
  const aveX0 = box.x1 + 1;
  const aveX1 = esplanadeX0 - 1;
  for (let x = aveX0; x <= aveX1; x++) {
    plan.push({ x, y: portal.y - 1, deco: 'pavement' });
    plan.push({ x, y: portal.y, deco: 'pavement' });
  }
  // Twin pylons flanking the avenue's midpoint (os Marcos Gêmeos) - the one
  // vertical accent on the long axis, right where the old ruins sit to the
  // south (CITY_PLAN: the avenue acknowledges the archaeology it crosses).
  const aveMidX = Math.floor((aveX0 + aveX1) / 2);
  plan.push({ x: aveMidX, y: portal.y - 2, deco: 'pylon' });
  plan.push({ x: aveMidX, y: portal.y + 1, deco: 'pylon' });

  // --- O Salão de Portais: a flagstone esplanade around the living portal,
  // with the arch row on the portal's own meridian: two awake arches
  // flanking it, then dormant arch seeds marching south - visible room for
  // every future federated world (D-17: one more world, one more arch).
  // The floor deliberately STOPS one row past the last awake arch (scene
  // self-audit round 2, R2-11/R2-15: a 5x9 slab read as one monolithic grey
  // rectangle at map zoom): the dormant seeds stand on bare meadow beyond
  // the pavement's edge - when a world wakes an arch, a future migration
  // extends the floor to meet it. The hall is visibly unfinished on purpose.
  const esplanadeX1 = portal.x + 2;
  for (let y = portal.y - 2; y <= portal.y + 3; y++) {
    for (let x = esplanadeX0; x <= esplanadeX1; x++) {
      plan.push({ x, y, deco: 'plaza' });
    }
  }
  plan.push({ x: portal.x, y: portal.y - 2, deco: 'arch' });
  plan.push({ x: portal.x, y: portal.y + 2, deco: 'arch' });
  plan.push({ x: portal.x, y: portal.y + 4, deco: 'arch_dormant' });
  plan.push({ x: portal.x, y: portal.y + 6, deco: 'arch_dormant' });

  // --- A Estrada do Sul: leaves the Estaleiro gate paved, then decays into
  // a dirt trail and dies at the southern forest's edge - the city ends in
  // an open road through the free periphery (T14's future building ground).
  // The last trail tile (box.y1 + 7 = y 43) is the final meadow tile before
  // the forest wall at (32, 44) - pinned by the "whole plan lands on meadow"
  // test in mapgen.test.ts.
  const southX = Math.floor((box.x0 + box.x1) / 2);
  plan.push({ x: southX, y: box.y1 + 1, deco: 'pavement' });
  plan.push({ x: southX, y: box.y1 + 2, deco: 'pavement' });
  for (let y = box.y1 + 3; y <= box.y1 + 7; y++) {
    plan.push({ x: southX, y, deco: 'trail' });
  }

  return plan;
}

/**
 * Lays the city of O Coração (docs/CITY_PLAN.md) into `world`: moves the 4
 * oficinas from the clearing corners to their cardinal gates
 * (cityMachinePositions) and paints the decoration plan (cityDecoPlan) onto
 * the tiles. Pure, deterministic, additive and idempotent, in the
 * seedInitialNatives/seedFactoryMachines family - but deliberately
 * ALL-OR-NOTHING, with a double guard:
 *
 *   (a) if ANY tile already carries a `deco`, the city has been laid -
 *       return `world` unchanged (the migration ran once, forever);
 *   (b) if the machines are missing or ANY of the 4 is not exactly at its
 *       original clearing-corner spot (factoryMachinePositions), some other
 *       state already rearranged them - return `world` unchanged rather
 *       than clobber a future the migration knows nothing about.
 *
 * After one successful run, (a) is permanently false, so the move can never
 * fire twice; and because the move and the paint happen together, the world
 * can never end up half-city (pylons on top of machines, or moved machines
 * with no plaza). Painting itself is total and safe on any world: out-of-
 * bounds plan tiles are skipped (tiny test worlds) and only 'meadow' tiles
 * are ever painted - never water (o rio continua protagonista), never the
 * Core, never forest/ruins. NEVER hand-edit world/heart.json to add this -
 * this function, run by the tick, is the only sanctioned way (same rule as
 * os Nativos and A Fábrica above).
 */
export function seedCityLayout(world: World): World {
  if (world.tiles.some((tile) => tile.deco !== undefined)) {
    return world;
  }

  const machines = world.machines;
  if (!machines) return world;
  const legacy = factoryMachinePositions();
  for (const id of MACHINE_IDS) {
    const machine = machines[id];
    if (!machine || machine.position.x !== legacy[id].x || machine.position.y !== legacy[id].y) {
      return world;
    }
  }

  const cityPositions = cityMachinePositions();
  const nextMachines: Record<string, Machine> = {};
  for (const id of MACHINE_IDS) {
    nextMachines[id] = { ...machines[id]!, position: { ...cityPositions[id] } };
  }

  const nextTiles = [...world.tiles];
  for (const { x, y, deco } of cityDecoPlan()) {
    if (!isInBounds(x, y, world.width, world.height)) continue;
    const idx = tileIndex(x, y, world.width);
    const tile = nextTiles[idx]!;
    if (tile.biome !== 'meadow') continue;
    nextTiles[idx] = { ...tile, deco };
  }

  return { ...world, tiles: nextTiles, machines: nextMachines };
}
