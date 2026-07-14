/**
 * engine/serialize.ts
 *
 * Canonical text form for a World written to world/*.json. Plain
 * `JSON.stringify(world, null, 2)` is correct but renders each of the 4096
 * tiles across 3-4 lines, which makes both the initial commit and every
 * future tick's diff needlessly painful to review - and per
 * docs/VISION.md, the git history *is* the world's history, so diffs need
 * to stay legible. This keeps `meta`/`players`/`events` normally
 * pretty-printed, but renders `tiles` one compact object per line so a
 * single tile change shows up as a single changed line.
 */

import type { World } from './types';

export function serializeWorld(world: World): string {
  const skeleton = JSON.stringify({ ...world, tiles: [] }, null, 2);

  const tilesBlock =
    world.tiles.length === 0
      ? '[]'
      : `[\n${world.tiles.map((tile) => `    ${JSON.stringify(tile)}`).join(',\n')}\n  ]`;

  const withTiles = skeleton.replace('"tiles": []', `"tiles": ${tilesBlock}`);
  return `${withTiles}\n`;
}
