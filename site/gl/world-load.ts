/**
 * gl/world-load.ts
 *
 * Loads the SAME world/heart.json both renderers draw, from the local
 * build-time copy only (site/public/world/heart.json, regenerated from the
 * repo's canonical world/ by scripts/copy-data.mjs) - deliberately no live
 * raw.githubusercontent.com fetch like site/src/world.ts. This prototype is
 * an offline-reproducible benchmark/QA harness, not a page meant to track
 * the live world.
 */
import type { World } from '../../engine/types';

const WORLD_URL = './world/heart.json';

export async function loadWorldLocal(): Promise<World> {
  const res = await fetch(`${WORLD_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Falha ao buscar ${WORLD_URL}: HTTP ${res.status}`);
  }
  return (await res.json()) as World;
}
