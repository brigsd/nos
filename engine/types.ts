/**
 * engine/types.ts
 *
 * Shared types for the NOS world state. This file is the single source of
 * truth: `engine/schema/world.schema.json` mirrors it exactly, and the
 * client (site/, added in a later task) imports directly from here so the
 * browser and the tick can never drift apart.
 *
 * Determinism rule: nothing in this file (or anything it depends on) may
 * call Date.now() or Math.random(). Time and randomness always come from
 * explicit parameters (see engine/rng.ts).
 */

// ---------------------------------------------------------------------------
// World dimensions and shared constants
// ---------------------------------------------------------------------------

/** Width of O Coração in tiles (v1 ships a single fixed 64x64 map). */
export const WORLD_WIDTH = 64;

/** Height of O Coração in tiles. */
export const WORLD_HEIGHT = 64;

/** Size of one tile in pixels (pixel art 16x16, see docs/GDD.md). */
export const TILE_SIZE_PX = 16;

/** Maximum energy a player can hold (v1). */
export const MAX_ENERGY = 100;

/** Energy a player starts with when their avatar is first created. */
export const STARTING_ENERGY = 100;

/** Max actions a single player may submit per tick (fairness limit, GDD). */
export const ACTIONS_PER_TICK = 3;

// ---------------------------------------------------------------------------
// Biomes and resources
// ---------------------------------------------------------------------------

export type Biome = 'meadow' | 'forest' | 'water' | 'ruins' | 'core';

export const BIOMES: readonly Biome[] = ['meadow', 'forest', 'water', 'ruins', 'core'];

export type ResourceType = 'wood' | 'stone' | 'pulse_fragment';

export const RESOURCE_TYPES: readonly ResourceType[] = ['wood', 'stone', 'pulse_fragment'];

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

export interface Tile {
  biome: Biome;
  /** Collectible resource sitting on this tile, if any. */
  resource?: ResourceType;
}

// ---------------------------------------------------------------------------
// Player (o No)
// ---------------------------------------------------------------------------

export interface Position {
  x: number;
  y: number;
}

/** Resource stockpile by type; a missing key means zero units. */
export type Inventory = Partial<Record<ResourceType, number>>;

export interface Player {
  /** GitHub login - the player's unique identity. */
  login: string;
  position: Position;
  inventory: Inventory;
  energy: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type WorldEventType =
  | 'player_joined'
  | 'player_moved'
  | 'resource_collected'
  | 'player_said'
  | 'core_pulse';

interface WorldEventBase {
  type: WorldEventType;
  /** Tick number the event happened on. */
  tick: number;
  /** World-time (minutes since the Commit Primordial) at the moment of the event. */
  worldTime: number;
}

export interface PlayerJoinedEvent extends WorldEventBase {
  type: 'player_joined';
  login: string;
}

export interface PlayerMovedEvent extends WorldEventBase {
  type: 'player_moved';
  login: string;
  from: Position;
  to: Position;
}

export interface ResourceCollectedEvent extends WorldEventBase {
  type: 'resource_collected';
  login: string;
  resource: ResourceType;
  quantity: number;
  position: Position;
}

export interface PlayerSaidEvent extends WorldEventBase {
  type: 'player_said';
  login: string;
  message: string;
}

export interface CorePulseEvent extends WorldEventBase {
  type: 'core_pulse';
}

export type WorldEvent =
  | PlayerJoinedEvent
  | PlayerMovedEvent
  | ResourceCollectedEvent
  | PlayerSaidEvent
  | CorePulseEvent;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export interface WorldMeta {
  /** World name (v1: "O Coração"). */
  name: string;
  /** Deterministic seed driving mapgen and every RNG draw in this world. */
  seed: string;
  /** Number of beats (ticks) processed since genesis. */
  tickCount: number;
  /** Accumulated world-time (minutes); advances deterministically each tick. */
  worldTime: number;
}

export interface World {
  meta: WorldMeta;
  width: number;
  height: number;
  /** Tiles in row-major order: index = y * width + x. */
  tiles: Tile[];
  /** Living players, indexed by GitHub login. */
  players: Record<string, Player>;
  events: WorldEvent[];
}

// ---------------------------------------------------------------------------
// Pure indexing helpers (no I/O, no global state - safe anywhere)
// ---------------------------------------------------------------------------

/** Row-major index of tile (x, y) in a `width`-wide grid. */
export function tileIndex(x: number, y: number, width: number = WORLD_WIDTH): number {
  return y * width + x;
}

/** Whether (x, y) falls inside a `width`x`height` grid. */
export function isInBounds(
  x: number,
  y: number,
  width: number = WORLD_WIDTH,
  height: number = WORLD_HEIGHT,
): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

/** Looks up the tile at (x, y), or `undefined` if out of bounds. */
export function getTile(world: World, x: number, y: number): Tile | undefined {
  if (!isInBounds(x, y, world.width, world.height)) return undefined;
  return world.tiles[tileIndex(x, y, world.width)];
}
