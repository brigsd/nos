/**
 * src/hash.ts
 *
 * Deterministic bit-mixing hash for purely cosmetic decisions in the
 * renderer (which meadow sprite variant a tile gets, etc). This is
 * intentionally NOT engine/rng.ts: that PRNG drives gameplay/world
 * generation determinism and must stay the engine's alone. This hash never
 * touches world state, only how a given tile is *drawn*, so it's local to
 * the client.
 *
 * Salted per decision so two different "coin flips" for the same (x, y)
 * (e.g. "is this a flower tile?" vs "campina_1 or campina_2?") don't
 * correlate with each other.
 *
 * Mixing is bit-rotation/XOR based (no `(x + y) % 2` style arithmetic) so
 * neighboring tiles never fall into a visible grid/checkerboard pattern.
 */
export function hashTile(x: number, y: number, salt = 0): number {
  let h = Math.imul(x, 0x1f1f1f1f) ^ Math.imul(y, 0x2545f491) ^ Math.imul(salt, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
