import { describe, expect, it } from 'vitest';
import { getTile, isInBounds, tileIndex, type World } from './types';

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
