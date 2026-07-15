/**
 * gl/hash.ts
 *
 * Copy of site/src/hash.ts (R3 prototype is self-contained per task rules -
 * it must not import from site/src/). Deterministic bit-mixing hash used
 * both for cosmetic tile variants (mirroring the live renderer) and for the
 * stress-test sprite generator (gl/stress.ts) - the task requires
 * hash-based positions, never Math.random.
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
