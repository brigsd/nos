/**
 * engine/combat.ts
 *
 * Combate por turnos, autoritativo e determinístico (D-05, GDD "Combate"):
 * the tick rolls the whole fight with official stats and a seeded Rng; the
 * client only REPLAYS the recorded actions. Pure module - every random draw
 * comes from the caller's `Rng` (engine/commands.ts seeds it per event from
 * the world seed + issue number), never Date.now()/Math.random(). Same
 * world + same command => same fight, blow by blow.
 *
 * Design numbers follow the frozen v2 reference (colaborador2/v2 combat.ts):
 * 5 rounds max, 80%/75% hit chances, faction-based Native stats, XP 100/40.
 * One deliberate departure, flagged in docs/CONTINUITY.md: a defeated Native
 * is NOT deleted from the world (that would orphan its past events and break
 * the validator's cross-checks, besides killing a canonical character
 * forever). It faints at 0 HP and recovers NATIVE_REGEN_PER_BEAT per beat
 * (engine/natives.ts); loot is a fixed faction drop, minted like any
 * creature drop - the Native's own pack is never stolen, so the economy's
 * merchant stock survives combat.
 */

import type { CombatAction, CombatOutcome, Inventory, Native, Player } from './types';
import { getCombatStats, getNativeMaxHp, MAX_HP_PER_LEVEL, NATIVE_REGEN_PER_BEAT } from './types';
import type { Rng } from './rng';

/** Energy one /atacar costs - fighting is the most expensive act in the world. */
export const ATTACK_ENERGY_COST = 10;

/** Combat is body to body: the target must be on an adjacent tile (Chebyshev <= 1). */
export const ATTACK_RANGE_TILES = 1;

/** A fight never drags past this many rounds - past it, both sides disengage (standoff). */
export const MAX_COMBAT_ROUNDS = 5;

/** Chance a player's blow lands. */
export const PLAYER_HIT_CHANCE = 0.8;

/** Chance a Native's counter lands. */
export const NATIVE_HIT_CHANCE = 0.75;

/** Energy a defeated player wakes up with at the spawn tile (respawn penalty). */
export const RESPAWN_ENERGY = 20;

/** XP awarded for defeating a Native, by faction (guardians hit harder and pay better). */
export const XP_BY_FACTION: Record<Native['faction'], number> = {
  wanderer: 40,
  merchant: 40,
  guardian: 100,
};

/**
 * Fixed drops for defeating a Native, by faction. Minted like a creature
 * drop - deliberately NOT taken from the Native's own inventory (see module
 * docs). Kept small: combat must not out-earn honest collecting.
 */
export const LOOT_BY_FACTION: Record<Native['faction'], Inventory> = {
  wanderer: { pulse_fragment: 1 },
  merchant: { wood: 2 },
  guardian: { stone: 2 },
};

/** XP needed to go from `level` to `level + 1`. */
export function xpToNextLevel(level: number): number {
  return level * 100;
}

function playerAttack(level: number): number {
  return 15 + (level - 1) * 2;
}

function playerDefense(level: number): number {
  return 5 + (level - 1);
}

function nativeAttack(native: Native): number {
  return native.faction === 'guardian' ? 18 : 12;
}

function nativeDefense(native: Native): number {
  return native.faction === 'guardian' ? 8 : 3;
}

export interface CombatResult {
  outcome: CombatOutcome;
  /** Turn-by-turn script, in resolution order (the client replay). */
  actions: CombatAction[];
  playerHpAfter: number;
  nativeHpAfter: number;
  /** 0 unless victory. */
  xpGained: number;
  /** Empty unless victory. */
  loot: Inventory;
}

/**
 * Rolls a full fight between `player` and `native`. Pure: no world mutation
 * here - the /atacar handler applies the result. Rounds alternate strikes
 * (player first); the fight ends on a knockout or after MAX_COMBAT_ROUNDS.
 */
export function resolveCombat(player: Player, native: Native, rng: Rng): CombatResult {
  const stats = getCombatStats(player);
  let playerHp = stats.hp;
  let nativeHp = native.hp;
  const actions: CombatAction[] = [];

  for (let round = 0; round < MAX_COMBAT_ROUNDS && playerHp > 0 && nativeHp > 0; round++) {
    // Player strikes first - attacking is the aggressor's one advantage.
    if (rng.chance(PLAYER_HIT_CHANCE)) {
      const damage = Math.max(1, playerAttack(stats.level) + rng.nextInt(-3, 3) - nativeDefense(native));
      nativeHp = Math.max(0, nativeHp - damage);
      actions.push({ actor: player.login, target: native.id, damage, kind: 'attack' });
    } else {
      actions.push({ actor: player.login, target: native.id, damage: 0, kind: 'dodge' });
    }
    if (nativeHp <= 0) break;

    if (rng.chance(NATIVE_HIT_CHANCE)) {
      const damage = Math.max(1, nativeAttack(native) + rng.nextInt(-2, 2) - playerDefense(stats.level));
      playerHp = Math.max(0, playerHp - damage);
      actions.push({ actor: native.id, target: player.login, damage, kind: 'counter' });
    } else {
      actions.push({ actor: native.id, target: player.login, damage: 0, kind: 'dodge' });
    }
  }

  const outcome: CombatOutcome = nativeHp <= 0 ? 'victory' : playerHp <= 0 ? 'defeat' : 'standoff';

  return {
    outcome,
    actions,
    playerHpAfter: playerHp,
    nativeHpAfter: nativeHp,
    xpGained: outcome === 'victory' ? XP_BY_FACTION[native.faction] : 0,
    loot: outcome === 'victory' ? { ...LOOT_BY_FACTION[native.faction] } : {},
  };
}

/**
 * Adds `xpGained` to `player`, applying at most one level-up (a single
 * fight's XP can never cross two levels: xpToNextLevel(1) = 100 = the
 * biggest single reward). Leveling raises max HP and heals to full -
 * getting stronger is the world acknowledging you, so it is generous once.
 */
export function applyXP(player: Player, xpGained: number): Player {
  const stats = getCombatStats(player);
  const total = stats.xp + xpGained;
  const needed = xpToNextLevel(stats.level);

  if (total < needed) {
    return { ...player, xp: total };
  }

  const level = stats.level + 1;
  const maxHp = stats.maxHp + MAX_HP_PER_LEVEL;
  return { ...player, level, xp: total - needed, maxHp, hp: maxHp };
}

/**
 * One beat of recovery for a fainted/hurt Native: +NATIVE_REGEN_PER_BEAT HP
 * up to its ceiling. Returns the same object when nothing changes, so
 * callers can cheaply detect a no-op.
 */
export function regenNative(native: Native): Native {
  const maxHp = getNativeMaxHp(native);
  if (native.hp >= maxHp) return native;
  return { ...native, hp: Math.min(maxHp, native.hp + NATIVE_REGEN_PER_BEAT) };
}
