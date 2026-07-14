/**
 * src/world.ts
 *
 * Fetches the published world state. `World` is imported directly from the
 * engine by relative path - the client never redefines its own copy of the
 * shape, so it can never drift from what the tick actually writes.
 */
import type { World } from '../../engine/types';

/** Path is relative to index.html so it resolves both at the site root and under /nos/ on Pages. */
const WORLD_URL = './world/heart.json';

export async function loadWorld(): Promise<World> {
  const res = await fetch(WORLD_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Falha ao buscar ${WORLD_URL}: HTTP ${res.status}`);
  }
  return (await res.json()) as World;
}
