/**
 * engine/rng.ts
 *
 * Deterministic pseudo-random number generation. The engine never calls
 * Math.random() - every draw flows through an `Rng` instance seeded
 * explicitly, so "same state + same commands + same seed => same result"
 * always holds (see docs/ARCHITECTURE.md, principle 4).
 */

/** Derives a 32-bit unsigned integer from an arbitrary string (xfnv1a hash). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 PRNG: small, fast, and fully deterministic from a 32-bit seed.
 * Not cryptographically secure - it doesn't need to be. Good enough quality
 * for procedural map generation and deterministic tie-breaking in the tick.
 */
export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
  }

  /** Next deterministic float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Deterministic integer in [min, max] (inclusive on both ends). */
  nextInt(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.nextInt: max (${max}) < min (${min})`);
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Deterministic boolean, true with probability `p` (default 0.5). */
  chance(p = 0.5): boolean {
    return this.next() < p;
  }
}
