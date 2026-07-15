import { describe, expect, it } from 'vitest';
import type { Native, Player } from './types';
import {
  DEFAULT_MAX_HP,
  MAX_HP_PER_LEVEL,
  NATIVE_MAX_HP_BY_FACTION,
  NATIVE_REGEN_PER_BEAT,
  RESOURCE_TYPES,
  getCombatStats,
  getNativeMaxHp,
} from './types';
import {
  LOOT_BY_FACTION,
  MAX_COMBAT_ROUNDS,
  XP_BY_FACTION,
  applyXP,
  regenNative,
  resolveCombat,
  xpToNextLevel,
} from './combat';
import { Rng } from './rng';

function player(overrides: Partial<Player> = {}): Player {
  return { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 50, ...overrides };
}

function native(overrides: Partial<Native> = {}): Native {
  return {
    id: 'cinza',
    name: 'Cinza',
    position: { x: 31, y: 30 },
    behaviorTree: 'guardian',
    behaviorState: '{}',
    inventory: { stone: 10 },
    hp: 120,
    faction: 'guardian',
    ...overrides,
  };
}

describe('resolveCombat', () => {
  it('is fully deterministic: same seed => identical fight, action by action', () => {
    const first = resolveCombat(player(), native(), new Rng('seed-combate-1'));
    const second = resolveCombat(player(), native(), new Rng('seed-combate-1'));
    expect(second).toEqual(first);
  });

  it('different seeds may roll different fights', () => {
    const outcomes = new Set(
      Array.from({ length: 30 }, (_, i) => JSON.stringify(resolveCombat(player(), native(), new Rng(`s-${i}`)))),
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('never exceeds MAX_COMBAT_ROUNDS rounds (2 actions per round)', () => {
    for (let i = 0; i < 50; i++) {
      const result = resolveCombat(player(), native(), new Rng(`rounds-${i}`));
      expect(result.actions.length).toBeLessThanOrEqual(MAX_COMBAT_ROUNDS * 2);
      expect(result.actions.length).toBeGreaterThan(0);
    }
  });

  it('HP never goes negative on either side, whatever the seed', () => {
    for (let i = 0; i < 50; i++) {
      const result = resolveCombat(player({ hp: 3 }), native({ hp: 2 }), new Rng(`floor-${i}`));
      expect(result.playerHpAfter).toBeGreaterThanOrEqual(0);
      expect(result.nativeHpAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it('a fragile target falls: victory grants faction XP and mints the faction loot', () => {
    const result = resolveCombat(player(), native({ hp: 1 }), new Rng('quick-win'));
    expect(result.outcome).toBe('victory');
    expect(result.nativeHpAfter).toBe(0);
    expect(result.xpGained).toBe(XP_BY_FACTION.guardian);
    expect(result.loot).toEqual(LOOT_BY_FACTION.guardian);
    // Minted, not stolen: the result's loot is a copy, never the shared constant.
    expect(result.loot).not.toBe(LOOT_BY_FACTION.guardian);
  });

  it('a fragile attacker falls: defeat yields no XP and no loot', () => {
    // hp 1 player: the first Native counter that lands ends it. Find a seed
    // where the guardian wins (its counters land 75% of the time).
    const losing = Array.from({ length: 50 }, (_, i) =>
      resolveCombat(player({ hp: 1 }), native(), new Rng(`lose-${i}`)),
    ).find((r) => r.outcome === 'defeat');
    expect(losing).toBeDefined();
    expect(losing!.playerHpAfter).toBe(0);
    expect(losing!.xpGained).toBe(0);
    expect(losing!.loot).toEqual({});
  });

  it('both sides standing after the round cap is a standoff', () => {
    // Sturdy player vs sturdy guardian cannot end in 5 rounds: max player
    // damage per round is bounded well below 120/5... craft it: huge HP both.
    const result = resolveCombat(player({ hp: 500, maxHp: 500 }), native({ hp: 500, maxHp: 500 }), new Rng('cap'));
    expect(result.outcome).toBe('standoff');
    expect(result.playerHpAfter).toBeGreaterThan(0);
    expect(result.nativeHpAfter).toBeGreaterThan(0);
    expect(result.xpGained).toBe(0);
  });

  it('the action script alternates aggressor first and only ever names the two parties', () => {
    const result = resolveCombat(player(), native(), new Rng('script'));
    expect(result.actions[0]!.actor).toBe('alice');
    for (const action of result.actions) {
      expect(['alice', 'cinza']).toContain(action.actor);
      expect(['alice', 'cinza']).toContain(action.target);
      expect(action.actor).not.toBe(action.target);
      if (action.kind === 'dodge') expect(action.damage).toBe(0);
      else expect(action.damage).toBeGreaterThanOrEqual(1);
    }
  });

  it('never mutates its inputs', () => {
    const p = player({ hp: 40 });
    const n = native();
    resolveCombat(p, n, new Rng('pure'));
    expect(p).toEqual(player({ hp: 40 }));
    expect(n).toEqual(native());
  });

  it('treats a pre-combat player (no hp/level fields) as full-health level 1', () => {
    const legacy = player();
    expect(legacy.hp).toBeUndefined();
    const result = resolveCombat(legacy, native({ hp: 1 }), new Rng('legacy'));
    expect(result.outcome).toBe('victory');
    // The player entered at DEFAULT_MAX_HP - after at most one counter they
    // cannot be below DEFAULT_MAX_HP - (18 + 2).
    expect(result.playerHpAfter).toBeGreaterThanOrEqual(DEFAULT_MAX_HP - 20);
  });
});

describe('applyXP', () => {
  it('accumulates below the threshold', () => {
    const leveled = applyXP(player(), 40);
    expect(getCombatStats(leveled)).toMatchObject({ level: 1, xp: 40 });
  });

  it('levels up at the threshold: +1 level, +MAX_HP_PER_LEVEL ceiling, healed to full', () => {
    const leveled = applyXP(player({ hp: 12, xp: 60 }), 40); // 60 + 40 = 100 = xpToNextLevel(1)
    expect(leveled.level).toBe(2);
    expect(leveled.xp).toBe(0);
    expect(leveled.maxHp).toBe(DEFAULT_MAX_HP + MAX_HP_PER_LEVEL);
    expect(leveled.hp).toBe(leveled.maxHp);
  });

  it('carries the overflow into the next level bar', () => {
    const leveled = applyXP(player({ xp: 90 }), 40);
    expect(leveled.level).toBe(2);
    expect(leveled.xp).toBe(30);
  });

  it('one fight can never cross two levels (largest reward equals the first bar)', () => {
    const biggestReward = Math.max(...Object.values(XP_BY_FACTION));
    expect(biggestReward).toBeLessThanOrEqual(xpToNextLevel(1));
  });
});

describe('regenNative', () => {
  it('heals a fainted Native by NATIVE_REGEN_PER_BEAT', () => {
    const fainted = native({ hp: 0 });
    expect(regenNative(fainted).hp).toBe(NATIVE_REGEN_PER_BEAT);
  });

  it('caps at the faction ceiling when maxHp is absent (pre-combat Natives)', () => {
    const nearlyFull = native({ hp: NATIVE_MAX_HP_BY_FACTION.guardian - 2 });
    expect(regenNative(nearlyFull).hp).toBe(NATIVE_MAX_HP_BY_FACTION.guardian);
  });

  it('caps at an explicit maxHp when present', () => {
    const custom = native({ hp: 48, maxHp: 50 });
    expect(regenNative(custom).hp).toBe(50);
  });

  it('is a reference-equal no-op at full health', () => {
    const full = native();
    expect(regenNative(full)).toBe(full);
  });
});

describe('combat constants sanity (anti-drift)', () => {
  it('every faction has XP, loot and a max-HP baseline', () => {
    for (const faction of ['wanderer', 'merchant', 'guardian'] as const) {
      expect(XP_BY_FACTION[faction]).toBeGreaterThan(0);
      expect(NATIVE_MAX_HP_BY_FACTION[faction]).toBeGreaterThan(0);
      const loot = LOOT_BY_FACTION[faction];
      const total = RESOURCE_TYPES.reduce((sum, r) => sum + (loot[r] ?? 0), 0);
      expect(total).toBeGreaterThan(0);
      for (const resource of Object.keys(loot)) {
        expect(RESOURCE_TYPES).toContain(resource);
      }
    }
  });

  it('getNativeMaxHp matches the seeded roster values (mapgen.ts seedInitialNatives)', () => {
    expect(getNativeMaxHp({ faction: 'wanderer' })).toBe(100);
    expect(getNativeMaxHp({ faction: 'merchant' })).toBe(100);
    expect(getNativeMaxHp({ faction: 'guardian' })).toBe(120);
  });
});
