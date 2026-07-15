import { describe, expect, it } from 'vitest';
import {
  advanceWorld,
  HEART_GENESIS_UNIX_SECONDS,
  MAX_CATCHUP_TICKS,
  MAX_EVENTS,
  TICK_INTERVAL_SECONDS,
  WORLD_MINUTES_PER_TICK,
} from './tick';
import { validateWorld } from './validate';
import type { CorePulseEvent, Native, World, WorldEvent } from './types';

function tinyWorld(metaOverrides: Partial<World['meta']> = {}, events: WorldEvent[] = []): World {
  return {
    meta: { name: 'Test', seed: 'seed', tickCount: 0, worldTime: 0, ...metaOverrides },
    width: 1,
    height: 1,
    tiles: [{ biome: 'meadow' }],
    players: {},
    events,
  };
}

function gota(overrides: Partial<Native> = {}): Native {
  return {
    id: 'gota',
    name: 'Gota',
    position: { x: 2, y: 2 },
    behaviorTree: 'wanderer',
    behaviorState: '{}',
    inventory: {},
    hp: 100,
    faction: 'wanderer',
    ...overrides,
  };
}

/** A larger open-meadow world (wander needs room to move) with a lone Native, no players. */
function worldWithNative(metaOverrides: Partial<World['meta']> = {}): World {
  return {
    meta: { name: 'Test', seed: 'seed', tickCount: 0, worldTime: 0, ...metaOverrides },
    width: 5,
    height: 5,
    tiles: Array.from({ length: 25 }, () => ({ biome: 'meadow' as const })),
    players: {},
    natives: { gota: gota() },
    events: [],
  };
}

/** Unix time at which exactly `n` beats are due for a world that has already processed `tickCount` beats. */
function nowForDueTicks(tickCount: number, n: number): number {
  return HEART_GENESIS_UNIX_SECONDS + (tickCount + n) * TICK_INTERVAL_SECONDS;
}

function fillerPulses(count: number): CorePulseEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'core_pulse' as const,
    tick: i,
    worldTime: i * WORLD_MINUTES_PER_TICK,
  }));
}

describe('advanceWorld - single beat', () => {
  it('increments tickCount by 1 and worldTime by WORLD_MINUTES_PER_TICK', () => {
    const world = tinyWorld({ tickCount: 5, worldTime: 300 });
    const { world: result } = advanceWorld(world, nowForDueTicks(5, 1));
    expect(result.meta.tickCount).toBe(6);
    expect(result.meta.worldTime).toBe(300 + WORLD_MINUTES_PER_TICK);
  });

  it('appends exactly one core_pulse event recording the beat', () => {
    const world = tinyWorld();
    const { world: result } = advanceWorld(world, nowForDueTicks(0, 1));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({ type: 'core_pulse', tick: 1, worldTime: WORLD_MINUTES_PER_TICK });
  });

  it('does not mutate the input world', () => {
    const world = tinyWorld({ tickCount: 7, worldTime: 420 });
    const snapshot = structuredClone(world);
    advanceWorld(world, nowForDueTicks(7, 1));
    expect(world).toEqual(snapshot);
  });

  it('is a pure function: the same inputs always produce a deep-equal result', () => {
    const world = tinyWorld({ tickCount: 2, worldTime: 120 });
    const now = nowForDueTicks(2, 1);
    expect(advanceWorld(world, now)).toEqual(advanceWorld(world, now));
  });

  it('is a no-op (returns the same reference) when no beat is due yet', () => {
    const world = tinyWorld({ tickCount: 3, worldTime: 180 });
    const justAfterLastBeat = HEART_GENESIS_UNIX_SECONDS + 3 * TICK_INTERVAL_SECONDS + 1;
    const { world: result } = advanceWorld(world, justAfterLastBeat);
    expect(result).toBe(world);
  });
});

describe('advanceWorld - D-19 self-correction (missed beats)', () => {
  it('compensates 2 missed beats (3 due at once) in a single call', () => {
    const world = tinyWorld({ tickCount: 10, worldTime: 600 });
    const { world: result } = advanceWorld(world, nowForDueTicks(10, 3));

    expect(result.meta.tickCount).toBe(13);
    expect(result.meta.worldTime).toBe(600 + 3 * WORLD_MINUTES_PER_TICK);
    expect(result.events).toHaveLength(3);
    expect(result.events.map((e) => e.tick)).toEqual([11, 12, 13]);
    expect(result.events.every((e) => e.type === 'core_pulse')).toBe(true);
  });

  it('records a strictly increasing worldTime for each compensated beat', () => {
    const world = tinyWorld({ tickCount: 0, worldTime: 0 });
    const { world: result } = advanceWorld(world, nowForDueTicks(0, 4));
    expect(result.events.map((e) => e.worldTime)).toEqual([60, 120, 180, 240]);
  });

  it('caps a very large backlog at MAX_CATCHUP_TICKS instead of processing it all at once', () => {
    const world = tinyWorld({ tickCount: 0, worldTime: 0 });
    const { world: result } = advanceWorld(world, nowForDueTicks(0, MAX_CATCHUP_TICKS + 50));
    expect(result.meta.tickCount).toBe(MAX_CATCHUP_TICKS);
    expect(result.events).toHaveLength(MAX_CATCHUP_TICKS);
  });

  it('a capped call leaves the world behind schedule so a later call keeps compensating', () => {
    const world = tinyWorld({ tickCount: 0, worldTime: 0 });
    const now = nowForDueTicks(0, MAX_CATCHUP_TICKS + 50);
    const { world: firstCall } = advanceWorld(world, now);
    expect(firstCall.meta.tickCount).toBe(MAX_CATCHUP_TICKS);

    const { world: secondCall } = advanceWorld(firstCall, now);
    expect(secondCall.meta.tickCount).toBe(2 * MAX_CATCHUP_TICKS);
  });
});

describe('advanceWorld - event log cap', () => {
  it('keeps events at MAX_EVENTS, dropping the oldest entry first', () => {
    const existing = fillerPulses(MAX_EVENTS);
    const world = tinyWorld({ tickCount: MAX_EVENTS, worldTime: MAX_EVENTS * WORLD_MINUTES_PER_TICK }, existing);
    const { world: result } = advanceWorld(world, nowForDueTicks(MAX_EVENTS, 1));

    expect(result.events).toHaveLength(MAX_EVENTS);
    expect(result.events.some((e) => e.tick === 0)).toBe(false); // oldest filler event evicted
    expect(result.events.at(-1)).toEqual({
      type: 'core_pulse',
      tick: MAX_EVENTS + 1,
      worldTime: (MAX_EVENTS + 1) * WORLD_MINUTES_PER_TICK,
    });
  });

  it('never exceeds MAX_EVENTS even when compensating several missed beats at once', () => {
    const existing = fillerPulses(MAX_EVENTS);
    const world = tinyWorld({ tickCount: MAX_EVENTS, worldTime: MAX_EVENTS * WORLD_MINUTES_PER_TICK }, existing);
    const { world: result } = advanceWorld(world, nowForDueTicks(MAX_EVENTS, 5));

    expect(result.events.length).toBeLessThanOrEqual(MAX_EVENTS);
    expect(result.events.at(-1)).toMatchObject({ tick: MAX_EVENTS + 5 });
  });

  it('does not touch events at all when under the cap', () => {
    const existing = fillerPulses(3);
    const world = tinyWorld({ tickCount: 3, worldTime: 180 }, existing);
    const { world: result } = advanceWorld(world, nowForDueTicks(3, 1));
    expect(result.events).toHaveLength(4);
  });
});

describe('advanceWorld - result always passes the validator', () => {
  it('validates after a normal single beat', () => {
    const { world: result } = advanceWorld(tinyWorld(), nowForDueTicks(0, 1));
    expect(validateWorld(result)).toEqual({ valid: true, errors: [] });
  });

  it('validates after compensating several missed beats', () => {
    const { world: result } = advanceWorld(tinyWorld(), nowForDueTicks(0, 4));
    expect(validateWorld(result).valid).toBe(true);
  });

  it('validates once the event log is sitting at its cap', () => {
    const existing = fillerPulses(MAX_EVENTS);
    const world = tinyWorld({ tickCount: MAX_EVENTS, worldTime: MAX_EVENTS * WORLD_MINUTES_PER_TICK }, existing);
    const { world: result } = advanceWorld(world, nowForDueTicks(MAX_EVENTS, 1));
    expect(validateWorld(result).valid).toBe(true);
  });

  it('validates a genesis world (tickCount 0) advanced for the first time', () => {
    const { world: result } = advanceWorld(tinyWorld({ tickCount: 0, worldTime: 0 }), nowForDueTicks(0, 1));
    expect(validateWorld(result).valid).toBe(true);
  });
});

describe('advanceWorld - os Nativos act every beat', () => {
  it('a lone wanderer Native moves on a single beat', () => {
    const world = worldWithNative({ tickCount: 4, worldTime: 240 });
    const { world: result } = advanceWorld(world, nowForDueTicks(4, 1));

    const before = world.natives!['gota']!.position;
    const after = result.natives!['gota']!.position;
    expect(after).not.toEqual(before);
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBe(1);
  });

  it('the Native beat happens before the core_pulse event, appended in the same beat', () => {
    // Native events (if any) land before that beat's core_pulse in the log
    // - see engine/tick.ts's beatOnce. With a lone wanderer and no players,
    // no native_spoke fires, so only core_pulse should appear either way;
    // this asserts the ordering contract holds when it does fire too (a
    // guardian placed right next to a player).
    const world: World = {
      meta: { name: 'Test', seed: 'seed', tickCount: 0, worldTime: 0 },
      width: 5,
      height: 5,
      tiles: Array.from({ length: 25 }, () => ({ biome: 'meadow' as const })),
      players: { alice: { login: 'alice', position: { x: 2, y: 2 }, inventory: {}, energy: 100 } },
      natives: { cinza: gota({ id: 'cinza', name: 'Cinza', behaviorTree: 'guardian', faction: 'guardian' }) },
      events: [],
    };

    const { world: result } = advanceWorld(world, nowForDueTicks(0, 1));
    expect(result.events.map((e) => e.type)).toEqual(['native_spoke', 'core_pulse']);
  });

  it('ticks the Natives once per compensated beat, not once per call', () => {
    // Guardian starts away from its NPC_HOMES spot with no player around, so
    // move_towards_home advances it by exactly 1 tile per beat.
    const home = { x: 25, y: 8 }; // NPC_HOMES.cinza
    const world: World = {
      meta: { name: 'Test', seed: 'seed', tickCount: 0, worldTime: 0 },
      width: 64,
      height: 64,
      tiles: Array.from({ length: 64 * 64 }, () => ({ biome: 'meadow' as const })),
      players: {},
      natives: {
        cinza: gota({ id: 'cinza', name: 'Cinza', behaviorTree: 'guardian', faction: 'guardian', position: { x: home.x - 3, y: home.y } }),
      },
      events: [],
    };

    const { world: result } = advanceWorld(world, nowForDueTicks(0, 3));
    expect(result.meta.tickCount).toBe(3);
    expect(result.natives!['cinza']!.position).toEqual(home); // 3 beats x 1 tile closer = home, exactly
  });

  it('does not mutate the input world natives', () => {
    const world = worldWithNative({ tickCount: 4, worldTime: 240 });
    const snapshot = structuredClone(world);
    advanceWorld(world, nowForDueTicks(4, 1));
    expect(world).toEqual(snapshot);
  });

  it('a world with no natives ticks exactly as before (backward compatible no-op)', () => {
    const { world: result } = advanceWorld(tinyWorld({ tickCount: 4, worldTime: 240 }), nowForDueTicks(4, 1));
    expect(result.natives).toBeUndefined();
    expect(validateWorld(result).valid).toBe(true);
  });

  it('keeps validating once Natives are present and acting', () => {
    const world = worldWithNative({ tickCount: 4, worldTime: 240 });
    const { world: result } = advanceWorld(world, nowForDueTicks(4, 3));
    expect(validateWorld(result)).toEqual({ valid: true, errors: [] });
  });
});
