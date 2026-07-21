/* Vitest de engine/serialize: ida-e-volta do estado do mundo pro JSON sem perda. */
import { describe, expect, it } from 'vitest';
import { serializeWorld } from './serialize';
import type { World } from './types';

function sampleWorld(): World {
  return {
    meta: { name: 'Test', seed: 'seed', tickCount: 1, worldTime: 60 },
    width: 2,
    height: 1,
    tiles: [{ biome: 'meadow' }, { biome: 'forest', resource: 'wood' }],
    players: {
      octocat: { login: 'octocat', position: { x: 0, y: 0 }, inventory: {}, energy: 100 },
    },
    events: [{ type: 'core_pulse', tick: 1, worldTime: 60 }],
  };
}

describe('serializeWorld', () => {
  it('round-trips to an equivalent object through JSON.parse', () => {
    const world = sampleWorld();
    expect(JSON.parse(serializeWorld(world))).toEqual(world);
  });

  it('renders each tile as its own compact line', () => {
    const text = serializeWorld(sampleWorld());
    expect(text).toContain('    {"biome":"meadow"}');
    expect(text).toContain('    {"biome":"forest","resource":"wood"}');
  });

  it('handles an empty tiles array without leaving a stray placeholder', () => {
    const world = sampleWorld();
    world.tiles = [];
    world.width = 0;
    const text = serializeWorld(world);
    expect(JSON.parse(text)).toEqual(world);
    expect(text).toContain('"tiles": []');
  });

  it('ends with a single trailing newline', () => {
    const text = serializeWorld(sampleWorld());
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});
