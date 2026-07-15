import { describe, expect, it } from 'vitest';
import { tickNatives } from './natives';
import { NPC_HOMES } from './behavior';
import { validateWorld } from './validate';
import type { Native, World } from './types';
import { NATIVE_REGEN_PER_BEAT } from './types';

function mockWorld(): World {
  return {
    meta: { name: 'O Coração', seed: 'seed-1', tickCount: 5, worldTime: 300 },
    width: 64,
    height: 64,
    tiles: Array.from({ length: 64 * 64 }, () => ({ biome: 'meadow' as const })),
    players: {},
    natives: {
      gota: {
        id: 'gota',
        name: 'Gota',
        position: { x: 30, y: 30 },
        behaviorTree: 'wanderer',
        behaviorState: '{}',
        inventory: {},
        hp: 100,
        faction: 'wanderer',
      },
    },
    events: [],
  };
}

describe('tickNatives - NPC behaviors', () => {
  it('moves the NPC on wander action', () => {
    const world = mockWorld();
    const res = tickNatives(world, 'seed-1', 6, 360);
    const initialPos = world.natives!['gota']!.position;
    const finalPos = res.world.natives!['gota']!.position;

    expect(finalPos).not.toEqual(initialPos);
    expect(Math.abs(finalPos.x - initialPos.x) + Math.abs(finalPos.y - initialPos.y)).toBe(1);
  });

  it('triggers speech when a player is near and respects dialogue cooldown', () => {
    const world = mockWorld();
    world.players['player1'] = { login: 'player1', position: { x: 31, y: 30 }, inventory: {}, energy: 100 };

    const res1 = tickNatives(world, 'seed-1', 6, 360);
    expect(res1.events).toHaveLength(1);
    expect(res1.events[0]?.type).toBe('native_spoke');
    expect((res1.events[0] as any).nativeId).toBe('gota');

    const res2 = tickNatives(res1.world, 'seed-1', 7, 420);
    expect(res2.events).toHaveLength(0);

    let currentWorld = res1.world;
    let resAfterCooldown;
    for (let t = 7; t <= 17; t++) {
      resAfterCooldown = tickNatives(currentWorld, 'seed-1', t, t * 60);
      currentWorld = resAfterCooldown.world;
    }
    expect(resAfterCooldown?.events).toHaveLength(1);
  });

  it('navigates home when no player is near (for merchant/guardian)', () => {
    const world = mockWorld();
    world.natives = {
      raiz: {
        id: 'raiz',
        name: 'Raiz',
        position: { x: 40, y: 6 },
        behaviorTree: 'merchant',
        behaviorState: '{}',
        inventory: {},
        hp: 100,
        faction: 'merchant',
      },
    };

    const res1 = tickNatives(world, 'seed-1', 6, 360);
    expect(res1.world.natives!['raiz']!.position).toEqual({ x: 41, y: 6 });

    const res2 = tickNatives(res1.world, 'seed-1', 7, 420);
    expect(res2.world.natives!['raiz']!.position).toEqual({ x: 42, y: 6 });

    const res3 = tickNatives(res2.world, 'seed-1', 8, 480);
    expect(res3.world.natives!['raiz']!.position).toEqual({ x: 43, y: 6 });

    const res4 = tickNatives(res3.world, 'seed-1', 9, 540);
    expect(res4.world.natives!['raiz']!.position).toEqual({ x: 43, y: 6 });
    expect(NPC_HOMES['raiz']).toEqual({ x: 43, y: 6 });
  });
});

describe('tickNatives - safety and determinism', () => {
  it('is a no-op when world.natives is absent (pre-Nativos world)', () => {
    const world = mockWorld();
    delete world.natives;
    const res = tickNatives(world, 'seed-1', 6, 360);
    expect(res).toEqual({ world, events: [] });
    expect(res.world).toBe(world); // same reference, not just deep-equal
  });

  it('is a no-op when world.natives is an empty object', () => {
    const world = mockWorld();
    world.natives = {};
    const res = tickNatives(world, 'seed-1', 6, 360);
    expect(res.world).toBe(world);
    expect(res.events).toEqual([]);
  });

  it('skips (rather than throws on) a Native with an unknown behaviorTree key', () => {
    const world = mockWorld();
    world.natives!['gota']!.behaviorTree = 'does-not-exist';
    const res = tickNatives(world, 'seed-1', 6, 360);
    expect(res.world.natives!['gota']!.position).toEqual({ x: 30, y: 30 }); // untouched
    expect(res.events).toEqual([]);
  });

  it('does not mutate the input world', () => {
    const world = mockWorld();
    const snapshot = structuredClone(world);
    tickNatives(world, 'seed-1', 6, 360);
    expect(world).toEqual(snapshot);
  });

  it('is a pure function: identical inputs always produce a deep-equal result', () => {
    const world = mockWorld();
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 100 };
    const a = tickNatives(world, 'seed-1', 6, 360);
    const b = tickNatives(world, 'seed-1', 6, 360);
    expect(a).toEqual(b);
  });

  it('the rngSeed actually reaches the RNG (varying it changes the outcome)', () => {
    // wander only has 4 possible destinations, so any single pair of seeds
    // has a real chance of landing on the same tile by coincidence - assert
    // over a spread of seeds instead of one arbitrary pair.
    const world = mockWorld();
    const outcomes = new Set(
      Array.from({ length: 8 }, (_, i) => {
        const res = tickNatives(world, `seed-${i}`, 6, 360);
        return JSON.stringify(res.world.natives!['gota']!.position);
      }),
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('processes multiple Natives in deterministic (sorted-id) order regardless of insertion order', () => {
    function worldWithTwoSpeakers(idsInInsertionOrder: [string, string]): World {
      const w = mockWorld();
      w.natives = {};
      for (const id of idsInInsertionOrder) {
        const native: Native = {
          id,
          name: id,
          position: { x: 30, y: 30 },
          behaviorTree: 'wanderer',
          behaviorState: '{}',
          inventory: {},
          hp: 100,
          faction: 'wanderer',
        };
        w.natives[id] = native;
      }
      w.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 100 };
      return w;
    }

    const insertedZetaFirst = worldWithTwoSpeakers(['zeta', 'alpha']);
    const insertedAlphaFirst = worldWithTwoSpeakers(['alpha', 'zeta']);

    const resA = tickNatives(insertedZetaFirst, 'order-seed', 6, 360);
    const resB = tickNatives(insertedAlphaFirst, 'order-seed', 6, 360);

    expect(resA.events.map((e) => (e as any).nativeId)).toEqual(['alpha', 'zeta']);
    expect(resB.events.map((e) => (e as any).nativeId)).toEqual(['alpha', 'zeta']);
  });

  it('keeps the result valid against the hardened world validator', () => {
    const world = mockWorld();
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 100 };
    const res = tickNatives(world, 'seed-1', 6, 360);
    // tickNatives does not itself append events to world.events (the caller,
    // engine/tick.ts's beatOnce, does that) - validate the merged shape.
    const merged: World = { ...res.world, events: [...world.events, ...res.events] };
    expect(validateWorld(merged)).toEqual({ valid: true, errors: [] });
  });
});

describe('tickNatives - combat aftermath (v2): faint and regen', () => {
  it('a fainted Native (hp 0) spends the beat recovering: regen only, no wandering, no talking', () => {
    const world = mockWorld();
    world.natives!['gota'] = { ...world.natives!['gota']!, hp: 0 };
    world.players['player1'] = { login: 'player1', position: { x: 31, y: 30 }, inventory: {}, energy: 100 };

    const res = tickNatives(world, 'seed-1', 6, 360);
    const gota = res.world.natives!['gota']!;
    expect(gota.hp).toBe(NATIVE_REGEN_PER_BEAT);
    expect(gota.position).toEqual({ x: 30, y: 30 }); // did not move
    expect(res.events).toHaveLength(0); // did not speak, player nearby or not
  });

  it('a hurt-but-standing Native regens AND still acts', () => {
    const world = mockWorld();
    world.natives!['gota'] = { ...world.natives!['gota']!, hp: 40 };

    const res = tickNatives(world, 'seed-1', 6, 360);
    const gota = res.world.natives!['gota']!;
    expect(gota.hp).toBe(40 + NATIVE_REGEN_PER_BEAT);
    expect(gota.position).not.toEqual({ x: 30, y: 30 }); // wandered as usual
  });

  it('regen stops exactly at the ceiling and a full Native is untouched', () => {
    const world = mockWorld();
    world.natives!['gota'] = { ...world.natives!['gota']!, hp: 99 };
    const res = tickNatives(world, 'seed-1', 6, 360);
    expect(res.world.natives!['gota']!.hp).toBe(100);

    const res2 = tickNatives(res.world, 'seed-1', 7, 420);
    expect(res2.world.natives!['gota']!.hp).toBe(100);
  });

  it('a fainted Native fully recovers after enough beats and acts again', () => {
    let world: World = mockWorld();
    world.natives!['gota'] = { ...world.natives!['gota']!, hp: 0 };

    const beatsToFull = Math.ceil(100 / NATIVE_REGEN_PER_BEAT);
    for (let beat = 0; beat < beatsToFull; beat++) {
      world = tickNatives(world, 'seed-1', 6 + beat, 360 + beat * 60).world;
    }
    expect(world.natives!['gota']!.hp).toBe(100);
    expect(validateWorld(world).valid).toBe(true);
  });
});
