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

/**
 * Pulso (₱) a player starts with. Zero on purpose: the only mint is trading
 * with os Nativos (engine/economy.ts), so /entrar never creates currency out
 * of thin air - the tick stays the whole economy's "banco central" (GDD
 * "Economia (v2)"). Nunca conversível em dinheiro real (D-20).
 */
export const STARTING_PULSO = 0;

// ---------------------------------------------------------------------------
// Biomes and resources
// ---------------------------------------------------------------------------

export type Biome = 'meadow' | 'forest' | 'water' | 'ruins' | 'core';

export const BIOMES: readonly Biome[] = ['meadow', 'forest', 'water', 'ruins', 'core'];

export type ResourceType = 'wood' | 'stone' | 'pulse_fragment';

export const RESOURCE_TYPES: readonly ResourceType[] = ['wood', 'stone', 'pulse_fragment'];

/**
 * Player-facing pt-BR names for each resource (docs/LORE.md lexicon). Single
 * source for both the engine's command feedback and the site HUD, so the two
 * can never call the same item by different names.
 */
export const RESOURCE_LABELS_PTBR: Record<ResourceType, string> = {
  wood: 'madeira',
  stone: 'pedra',
  pulse_fragment: 'fragmento de pulso',
};

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

/**
 * Purely visual city decoration layered on a tile (the R7 city migration,
 * docs/CITY_PLAN.md). Ground kinds (plaza/pavement/trail) repaint the floor;
 * object kinds (pylon/arch/arch_dormant/mural_stone) stand on it. The engine
 * itself never reads this field for rules - movement, collection, energy and
 * every command behave exactly the same with or without it (walkability is
 * untouched by design, CITY_PLAN "tudo caminhável e seguro"). Optional for
 * backward compatibility with tiles written before the city existed.
 */
export type TileDeco =
  | 'plaza'
  | 'pavement'
  | 'trail'
  | 'pylon'
  | 'arch'
  | 'arch_dormant'
  | 'mural_stone';

export const TILE_DECOS: readonly TileDeco[] = [
  'plaza',
  'pavement',
  'trail',
  'pylon',
  'arch',
  'arch_dormant',
  'mural_stone',
];

/** The TileDeco kinds that are standing objects (drawn on a flagstone base by the client), as opposed to ground repaints. */
export const TILE_DECO_OBJECTS: readonly TileDeco[] = ['pylon', 'arch', 'arch_dormant', 'mural_stone'];

export interface Tile {
  biome: Biome;
  /** Collectible resource sitting on this tile, if any. */
  resource?: ResourceType;
  /** City decoration on this tile, if any (visual only - see TileDeco). */
  deco?: TileDeco;
}

// ---------------------------------------------------------------------------
// Player (o No)
// ---------------------------------------------------------------------------

export interface Position {
  x: number;
  y: number;
}

/**
 * Tile where /entrar places a brand-new avatar (see engine/commands.ts).
 * Single source shared with the city layout (engine/mapgen.ts's
 * seedCityLayout keeps this tile free of standing objects - CITY_PLAN
 * "spawn livre") so the two can never drift apart.
 */
export const PLAYER_SPAWN: Position = { x: 30, y: 30 };

/** Resource stockpile by type; a missing key means zero units. */
export type Inventory = Partial<Record<ResourceType, number>>;

export interface Player {
  /** GitHub login - the player's unique identity. */
  login: string;
  position: Position;
  inventory: Inventory;
  energy: number;
  /**
   * Pulso (₱) balance - v2 economy. Optional for backward compatibility with
   * players written before the economy existed; an absent field means zero
   * (read it through `getPulso`, never `player.pulso` directly).
   */
  pulso?: number;
  /**
   * Crafted items (A Fábrica, v2.5 - engine/fabrication.ts), indexed by item
   * id from `ITEM_CATALOG`; missing key means zero, same convention as
   * `Inventory`. Deliberately a field of its own rather than folded into
   * `inventory`: `inventory` stays exactly the fixed wood/stone/pulse_fragment
   * shape the schema has always enforced (`Inventory`'s `additionalProperties:
   * false`), so this change cannot loosen that existing contract or touch any
   * of its current callers. Optional for backward compatibility with players
   * written before A Fábrica existed; an absent field means "no crafted items"
   * (read it through `getItemQty`, never `player.items` directly).
   */
  items?: Record<string, number>;
}

/** A player's Pulso (₱) balance, treating the pre-economy `undefined` as zero. */
export function getPulso(player: Pick<Player, 'pulso'>): number {
  return player.pulso ?? 0;
}

/**
 * A player's held quantity of crafted item `itemId` (engine/fabrication.ts),
 * treating both an absent `items` field (pre-Fábrica player) and an absent
 * key within it as zero - the same "missing means zero" convention as
 * `getPulso`/`Inventory`.
 */
export function getItemQty(player: Pick<Player, 'items'>, itemId: string): number {
  return getOwn(player.items, itemId) ?? 0;
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
  faction: NativeFaction;
}

// ---------------------------------------------------------------------------
// A Fábrica (v2.5, D-23/D-25a) - the 4 synthesizer machines that turn
// resources/items into crafted items. Only the world-placement shape lives
// here (mirrors how `Native` sits in types.ts while its behavior lives in
// behavior.ts/natives.ts); the item catalog and recipes are engine data, not
// world state, so they live in engine/fabrication.ts instead - the same
// split as `TradeRecipe`/`TRADE_RECIPES` living in engine/economy.ts rather
// than here.
// ---------------------------------------------------------------------------

/**
 * The 4 machines-sintetizador (D-25a), one per item destino: Forja (equipa),
 * Cozinha (consome), Bancada (usa/liga), Estaleiro (pilota - assembled from
 * peças made at the other 3). Exactly 4, forever, by design (D-25a) - a new
 * "destino" would be a product decision, not an engine one.
 */
export type MachineId = 'forja' | 'cozinha' | 'bancada' | 'estaleiro';

export const MACHINE_IDS: readonly MachineId[] = ['forja', 'cozinha', 'bancada', 'estaleiro'];

export interface Machine {
  /** Unique identifier (one of MACHINE_IDS). Doubles as its key in World.machines. */
  id: MachineId;
  /** Display name shown to players (e.g. "Forja"). */
  name: string;
  position: Position;
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
  | 'trade_completed'
  | 'native_replied'
  | 'item_synthesized';

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

export interface TradeCompletedEvent extends WorldEventBase {
  type: 'trade_completed';
  login: string;
  nativeId: string;
  /** Items the player handed over (may be empty when paying in ₱ only). */
  given: Inventory;
  /** Items the player received (may be empty when selling for ₱ only). */
  received: Inventory;
  /** Net change in the player's ₱ balance: positive = earned, negative = paid, 0 = pure barter. */
  pulsoDelta: number;
}

/**
 * A Native answering a specific player's /conversar (v2 "interação leve").
 * Unlike native_spoke (autonomous small talk from the behavior trees), this
 * one is addressed: `login` is who the Native replied to.
 */
export interface NativeRepliedEvent extends WorldEventBase {
  type: 'native_replied';
  nativeId: string;
  login: string;
  message: string;
}

/**
 * A player synthesizing an item at a machine (A Fábrica, v2.5,
 * engine/fabrication.ts's `/sintetizar`). `recipeId` is the key into
 * `SYNTHESIS_RECIPES`; `output` mirrors the recipe's own output shape so the
 * event is self-describing without a second lookup (same reasoning as
 * TradeCompletedEvent carrying `given`/`received` inline).
 */
export interface ItemSynthesizedEvent extends WorldEventBase {
  type: 'item_synthesized';
  login: string;
  machineId: MachineId;
  recipeId: string;
  output: { itemId: string; quantity: number };
}

export type WorldEvent =
  | PlayerJoinedEvent
  | PlayerMovedEvent
  | ResourceCollectedEvent
  | PlayerSaidEvent
  | CorePulseEvent
  | NativeSpokeEvent
  | TradeCompletedEvent
  | NativeRepliedEvent
  | ItemSynthesizedEvent;

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
  /** A Fábrica's 4 oficinas, indexed by id (v2.5, optional for backward compatibility with pre-Fábrica worlds - see engine/mapgen.ts's seedFactoryMachines). */
  machines?: Record<string, Machine>;
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
