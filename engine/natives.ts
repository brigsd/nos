/**
 * engine/natives.ts
 *
 * Coordinates one beat's worth of behavior-tree evaluation for every Native
 * (NPC) in the world. Pure and deterministic: called once per beat from
 * engine/tick.ts's beatOnce(), with a sub-seed derived from the world's own
 * seed plus the beat number - never Date.now()/Math.random().
 */

import type { World, WorldEvent } from './types';
import { Rng } from './rng';
import { BEHAVIOR_TREES, evaluateBTNode } from './behavior';

export interface TickNativesResult {
  world: World;
  events: WorldEvent[];
}

/**
 * Advances every Native's behavior tree by one beat. A no-op (same world
 * reference, no events) when `world.natives` is absent, so it is always
 * safe to call even before engine/mapgen.ts's seedInitialNatives() has run.
 */
export function tickNatives(world: World, rngSeed: string, tickNum: number, worldTime: number): TickNativesResult {
  if (!world.natives) {
    return { world, events: [] };
  }

  let currentWorld = world;
  const allEvents: WorldEvent[] = [];

  // Sorted so execution order never depends on object key insertion order -
  // same beat, same natives, same order, every time.
  const nativeIds = Object.keys(world.natives).sort();

  for (const id of nativeIds) {
    const native = currentWorld.natives?.[id];
    if (!native) continue; // defensive: a prior native's action cannot remove another, but never trust it blindly

    const tree = BEHAVIOR_TREES[native.behaviorTree];
    if (!tree) continue; // unknown behaviorTree key - stand still rather than throw and abort the whole beat

    // Deterministic sub-seed: same world seed + same native id + same beat
    // number always yields the same rolls for this Native on this beat.
    const subSeed = `${rngSeed}-${id}-${tickNum}`;
    const subRng = new Rng(subSeed);

    const result = evaluateBTNode(tree, id, currentWorld, subRng, tickNum, worldTime);
    currentWorld = result.world;
    allEvents.push(...result.events);
  }

  return { world: currentWorld, events: allEvents };
}
