/* Vitest de engine/types: invariantes dos tipos centrais do mundo. */
import { describe, expect, it } from 'vitest';
import { getOwn, getTile, isInBounds, tileIndex, type World } from './types';

function tinyWorld(): World {
  return {
    meta: { name: 'Test', seed: 'seed', tickCount: 0, worldTime: 0 },
    width: 2,
    height: 2,
    tiles: [{ biome: 'meadow' }, { biome: 'water' }, { biome: 'forest' }, { biome: 'core' }],
    players: {},
    events: [],
  };
}

describe('tileIndex', () => {
  it('computes row-major indices', () => {
    expect(tileIndex(0, 0, 4)).toBe(0);
    expect(tileIndex(3, 0, 4)).toBe(3);
    expect(tileIndex(0, 1, 4)).toBe(4);
    expect(tileIndex(2, 3, 4)).toBe(14);
  });
});

describe('isInBounds', () => {
  it('accepts coordinates within the grid', () => {
    expect(isInBounds(0, 0, 64, 64)).toBe(true);
    expect(isInBounds(63, 63, 64, 64)).toBe(true);
  });

  it('rejects coordinates outside the grid', () => {
    expect(isInBounds(-1, 0, 64, 64)).toBe(false);
    expect(isInBounds(0, -1, 64, 64)).toBe(false);
    expect(isInBounds(64, 0, 64, 64)).toBe(false);
    expect(isInBounds(0, 64, 64, 64)).toBe(false);
  });
});

describe('getTile', () => {
  it('looks up the tile at (x, y)', () => {
    const world = tinyWorld();
    expect(getTile(world, 0, 0)).toEqual({ biome: 'meadow' });
    expect(getTile(world, 1, 0)).toEqual({ biome: 'water' });
    expect(getTile(world, 0, 1)).toEqual({ biome: 'forest' });
    expect(getTile(world, 1, 1)).toEqual({ biome: 'core' });
  });

  it('returns undefined out of bounds', () => {
    const world = tinyWorld();
    expect(getTile(world, -1, 0)).toBeUndefined();
    expect(getTile(world, 2, 0)).toBeUndefined();
    expect(getTile(world, 0, 2)).toBeUndefined();
  });
});

describe('getOwn (issue #28 - prototype pollution defense-in-depth)', () => {
  it('returns the value for an own key', () => {
    const dict = { alice: { login: 'alice', energy: 100 } };
    expect(getOwn(dict, 'alice')).toBe(dict.alice);
  });

  it('returns undefined for a plain missing key', () => {
    const dict = { alice: 1 };
    expect(getOwn(dict, 'bob')).toBeUndefined();
  });

  it('returns undefined for "__proto__" instead of the inherited Object.prototype', () => {
    const dict: Record<string, number> = { alice: 1 };
    // Sanity check first: this is exactly the footgun getOwn exists to
    // avoid - a plain bracket lookup resolves the inherited accessor.
    expect((dict as Record<string, unknown>)['__proto__']).toBe(Object.prototype);
    expect(getOwn(dict, '__proto__')).toBeUndefined();
  });

  it('returns undefined for "constructor" instead of the inherited Object constructor', () => {
    const dict: Record<string, number> = { alice: 1 };
    expect((dict as Record<string, unknown>)['constructor']).toBe(Object);
    expect(getOwn(dict, 'constructor')).toBeUndefined();
  });

  it('returns undefined for other Object.prototype-inherited keys too (toString, hasOwnProperty)', () => {
    const dict: Record<string, number> = { alice: 1 };
    expect(getOwn(dict, 'toString')).toBeUndefined();
    expect(getOwn(dict, 'hasOwnProperty')).toBeUndefined();
  });

  it('still returns a real own value even when it happens to be named like a built-in', () => {
    // A own data property literally called "__proto__" (e.g. set via a
    // computed key, never via the exotic object-literal setter) must still
    // be readable - getOwn only rejects *inherited* keys, not own ones.
    const dict: Record<string, string> = {};
    Object.defineProperty(dict, '__proto__', { value: 'not-a-prototype', enumerable: true, configurable: true, writable: true });
    expect(Object.hasOwn(dict, '__proto__')).toBe(true);
    expect(getOwn(dict, '__proto__')).toBe('not-a-prototype');
  });

  it('returns undefined for an undefined or null dict without throwing', () => {
    expect(getOwn(undefined, 'alice')).toBeUndefined();
    expect(getOwn(null, 'alice')).toBeUndefined();
  });
});
