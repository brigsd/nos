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

/**
 * Dedicated sentinel swapped in for `tiles` while stringifying the rest of
 * the world, then swapped back out for the real (compactly-rendered) tiles
 * block below. This stands in for a real tiles array/value, so the only
 * place it can ever appear in `skeleton` is the value we substitute it for
 * - unlike matching on the incidental `"tiles": []` text JSON.stringify
 * happens to produce for an *empty* array, which would silently stop
 * matching if the skeleton were ever built any other way.
 */
const TILES_PLACEHOLDER = '__NOS_SERIALIZE_TILES_PLACEHOLDER__';

export function serializeWorld(world: World): string {
  const skeleton = JSON.stringify({ ...world, tiles: TILES_PLACEHOLDER }, null, 2);

  const tilesBlock =
    world.tiles.length === 0
      ? '[]'
      : `[\n${world.tiles.map((tile) => `    ${JSON.stringify(tile)}`).join(',\n')}\n  ]`;

  const quotedPlaceholder = JSON.stringify(TILES_PLACEHOLDER);
  if (!skeleton.includes(quotedPlaceholder)) {
    // Unreachable in practice - the placeholder is unique and is always
    // serialized as the `tiles` value above. Fail loudly instead of
    // silently writing a corrupt skeleton to world/*.json.
    throw new Error('serializeWorld: tiles placeholder not found in skeleton');
  }

  const withTiles = skeleton.replace(quotedPlaceholder, tilesBlock);
  return `${withTiles}\n`;
}
