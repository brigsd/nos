import { describe, expect, it } from 'vitest';
import { assertValidWorld, validateWorld } from './validate';
import type { World } from './types';

function validWorld(): World {
  return {
    meta: { name: 'Test World', seed: 'seed-1', tickCount: 3, worldTime: 180 },
    width: 2,
    height: 2,
    tiles: [
      { biome: 'meadow' },
      { biome: 'forest', resource: 'wood' },
      { biome: 'ruins', resource: 'stone' },
      { biome: 'core' },
    ],
    players: {
      octocat: {
        login: 'octocat',
        position: { x: 0, y: 0 },
        inventory: { wood: 2, pulse_fragment: 1 },
        energy: 80,
      },
    },
    events: [
      { type: 'player_joined', tick: 0, worldTime: 0, login: 'octocat' },
      {
        type: 'player_moved',
        tick: 1,
        worldTime: 60,
        login: 'octocat',
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
      },
      {
        type: 'resource_collected',
        tick: 2,
        worldTime: 120,
        login: 'octocat',
        resource: 'wood',
        quantity: 1,
        position: { x: 1, y: 0 },
      },
      { type: 'player_said', tick: 2, worldTime: 120, login: 'octocat', message: 'Ola, Coracao.' },
      { type: 'core_pulse', tick: 3, worldTime: 180 },
    ],
  };
}

/** A deep clone of a valid world, loosely typed so tests can build malformed fixtures on purpose. */
function invalidatableClone(): Record<string, unknown> {
  return structuredClone(validWorld()) as unknown as Record<string, unknown>;
}

describe('validateWorld - accepts valid state', () => {
  it('accepts a well-formed world', () => {
    const result = validateWorld(validWorld());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a world with no players and no events yet (genesis)', () => {
    const world = validWorld();
    world.players = {};
    world.events = [];
    expect(validateWorld(world).valid).toBe(true);
  });
});

describe('validateWorld - rejects invalid state', () => {
  it('rejects data that is not an object at all', () => {
    expect(validateWorld(null).valid).toBe(false);
    expect(validateWorld('not a world').valid).toBe(false);
    expect(validateWorld(42).valid).toBe(false);
  });

  it('rejects a world missing a required top-level field', () => {
    const world = invalidatableClone();
    delete world['meta'];
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an unknown biome value', () => {
    const world = structuredClone(validWorld());
    // @ts-expect-error - deliberately invalid for the test
    world.tiles[0].biome = 'lava';
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a tiles array whose length does not match width * height', () => {
    const world = structuredClone(validWorld());
    world.tiles.push({ biome: 'meadow' });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/tiles\.length/);
  });

  it('rejects negative energy', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.energy = -5;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects energy above the maximum', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.energy = 999;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a malformed GitHub login (leading hyphen)', () => {
    const world = structuredClone(validWorld());
    const player = world.players['octocat']!;
    delete world.players['octocat'];
    world.players['-bad-login'] = { ...player, login: '-bad-login' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a player whose login does not match its map key', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.login = 'someoneelse';
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/does not match its map key/);
  });

  it('rejects a player positioned outside the map bounds', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.position = { x: 999, y: 999 };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/out of bounds/);
  });

  it('rejects a negative inventory quantity', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.inventory.wood = -3;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an extra/unknown property at the world root', () => {
    const world = invalidatableClone();
    world['extra'] = 'not allowed';
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a tile whose resource does not match its biome (wood on water)', () => {
    const world = structuredClone(validWorld());
    world.tiles[0] = { biome: 'water', resource: 'wood' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a tile whose resource does not match its biome (stone outside ruins)', () => {
    const world = structuredClone(validWorld());
    world.tiles[0] = { biome: 'meadow', resource: 'stone' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a pulse fragment sitting on water', () => {
    const world = structuredClone(validWorld());
    world.tiles[0] = { biome: 'water', resource: 'pulse_fragment' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an event with an unknown type', () => {
    const world: World = structuredClone(validWorld());
    // @ts-expect-error - deliberately invalid for the test
    world.events.push({ type: 'reversao', tick: 4, worldTime: 240 });
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an event missing a field required by its type', () => {
    const world = invalidatableClone();
    (world['events'] as unknown[]).push({ type: 'player_said', tick: 4, worldTime: 240, login: 'octocat' });
    expect(validateWorld(world).valid).toBe(false);
  });
});

describe('assertValidWorld', () => {
  it('does not throw for a valid world', () => {
    expect(() => assertValidWorld(validWorld())).not.toThrow();
  });

  it('throws a readable error for invalid state', () => {
    const world = invalidatableClone();
    delete world['events'];
    expect(() => assertValidWorld(world)).toThrow(/Invalid world state/);
  });
});
