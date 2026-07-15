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
// Combat baselines (v2). A player written before combat existed simply has
// no hp/maxHp/level/xp fields - these defaults are what those absences mean.
// Read them through `getCombatStats`, never the raw optional fields.
// ---------------------------------------------------------------------------

/** Hit points a player has when the field is absent (pre-combat worlds) and at creation. */
export const DEFAULT_MAX_HP = 100;

/** Level a player has when the field is absent and at creation. */
export const DEFAULT_LEVEL = 1;

/** Extra max HP gained per level beyond the first. */
export const MAX_HP_PER_LEVEL = 10;

/** HP a fainted (hp 0) Native recovers per beat until back at its ceiling. */
export const NATIVE_REGEN_PER_BEAT = 5;

/** Fallback HP ceiling per Native faction, for Natives written before maxHp existed (mirrors seedInitialNatives). */
export const NATIVE_MAX_HP_BY_FACTION: Record<NativeFaction, number> = {
  wanderer: 100,
  merchant: 100,
  guardian: 120,
};

/** A Native's HP ceiling, treating the pre-combat `undefined` as its faction baseline. */
export function getNativeMaxHp(native: Pick<Native, 'maxHp' | 'faction'>): number {
  return native.maxHp ?? NATIVE_MAX_HP_BY_FACTION[native.faction];
}

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
  /** Hit points - v2 combat. Optional for backward compatibility; absent means full (see getCombatStats). */
  hp?: number;
  /** Max hit points - v2 combat. Absent means DEFAULT_MAX_HP + level bonus. */
  maxHp?: number;
  /** Level - v2 combat. Absent means DEFAULT_LEVEL. */
  level?: number;
  /** Experience points toward the next level - v2 combat. Absent means 0. */
  xp?: number;
}

/** A player's combat numbers with every pre-combat absence resolved to its default. */
export function getCombatStats(
  player: Pick<Player, 'hp' | 'maxHp' | 'level' | 'xp'>,
): { hp: number; maxHp: number; level: number; xp: number } {
  const level = player.level ?? DEFAULT_LEVEL;
  const maxHp = player.maxHp ?? DEFAULT_MAX_HP + (level - DEFAULT_LEVEL) * MAX_HP_PER_LEVEL;
  return { hp: player.hp ?? maxHp, maxHp, level, xp: player.xp ?? 0 };
}

// ---------------------------------------------------------------------------
// Natives (os Nativos) - v2, GDD "NPCs": procedural behavior trees + scripted
// (non-LLM) dialogue, see docs/DECISIONS.md D-09. Only the NPC shape lives
// here for this slice - combat/economy/structures are separate fatias and
// deliberately not represented in this file yet.
// ---------------------------------------------------------------------------

export type NativeFaction = 'wanderer' | 'merchant' | 'guardian';

/** Ceiling on a `native_spoke` message's length (mirrors PlayerSaidEvent's own cap). */
export const NATIVE_MESSAGE_MAX_LENGTH = 280;

export interface Native {
  /** Unique identifier for this NPC (e.g. "gota"). Doubles as its key in World.natives. */
  id: string;
  /** Display name shown to players (e.g. "Gota"). */
  name: string;
  position: Position;
  /** Key into engine/behavior.ts's BEHAVIOR_TREES. */
  behaviorTree: string;
  /** Serialized (JSON string) scratch state the behavior tree persists between beats, e.g. dialogue cooldown. */
  behaviorState: string;
  /** Goods this Native carries (for future trading; not yet actionable in this slice). */
  inventory: Inventory;
  hp: number;
  /** HP ceiling - v2 combat. Optional: absent means the faction baseline (getNativeMaxHp). */
  maxHp?: number;
  faction: NativeFaction;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type WorldEventType =
  | 'player_joined'
  | 'player_moved'
  | 'resource_collected'
  | 'player_said'
  | 'core_pulse'
  | 'native_spoke'
  | 'combat_resolved';

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

export interface NativeSpokeEvent extends WorldEventBase {
  type: 'native_spoke';
  nativeId: string;
  message: string;
}

// --- Combate (v2, D-05): the tick resolves the whole fight; the client only replays. ---

/** One turn-step of a resolved combat, in resolution order - the client's replay script. */
export interface CombatAction {
  /** Who acted: a player login or a Native id. */
  actor: string;
  /** Who was hit (or dodged): the other party. */
  target: string;
  /** Damage dealt; 0 on a dodge. */
  damage: number;
  /** attack = player hits Native, counter = Native hits back, dodge = the blow missed. */
  kind: 'attack' | 'counter' | 'dodge';
}

export type CombatOutcome = 'victory' | 'defeat' | 'standoff';

export interface CombatResolvedEvent extends WorldEventBase {
  type: 'combat_resolved';
  login: string;
  /** The Native fought. Named nativeId (not targetId) so the validator's generic native cross-check covers it. */
  nativeId: string;
  outcome: CombatOutcome;
  /** Turn-by-turn script for the client replay (bounded by max rounds x 2). */
  actions: CombatAction[];
  /** XP the player earned (0 unless victory). */
  xpGained: number;
  /** Items dropped for the player (empty unless victory). */
  loot: Inventory;
  /** Both sides' HP when the dust settled - the replay's final frame. */
  playerHpAfter: number;
  nativeHpAfter: number;
}

export type WorldEvent =
  | PlayerJoinedEvent
  | PlayerMovedEvent
  | ResourceCollectedEvent
  | PlayerSaidEvent
  | CorePulseEvent
  | NativeSpokeEvent
  | CombatResolvedEvent;

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
  /** NPCs (os Nativos) inhabiting the world, indexed by id (v2, optional for backward compatibility with pre-Nativos worlds). */
  natives?: Record<string, Native>;
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

// ---------------------------------------------------------------------------
// Safe lookup helpers (issue #28 - defense-in-depth against prototype
// pollution, ahead of combate/economia adding more string-keyed lookups)
// ---------------------------------------------------------------------------

/**
 * Looks up `key` in `dict`, returning the value only if it is an *own*
 * property - never one inherited from `Object.prototype` (`__proto__`,
 * `constructor`, `toString`, `hasOwnProperty`, ...). A plain `dict[key]`
 * with a hostile `key` string (e.g. a player login or future item/target id
 * that happens to collide with a built-in name) can silently resolve to
 * that built-in instead of `undefined`, and callers that just check
 * truthiness (`if (player) ...`) would then misread "not found" as "found".
 *
 * `Object.hasOwn` settles that ambiguity structurally: it only reports keys
 * that were actually set on `dict` itself. Use this wherever a dictionary is
 * indexed by a string that ultimately comes from player/external input
 * (e.g. `getOwn(world.players, cmd.login)`), in place of `dict[key]`.
 *
 * Returns `undefined` for a missing dict, an absent key, or an inherited
 * key - i.e. every "not really there" case looks the same to callers.
 */
export function getOwn<T>(dict: Record<string, T> | undefined | null, key: string): T | undefined {
  if (dict == null) return undefined;
  return Object.hasOwn(dict, key) ? dict[key] : undefined;
}
