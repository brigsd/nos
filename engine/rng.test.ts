import { describe, expect, it } from 'vitest';
import { hashSeed, Rng } from './rng';

describe('hashSeed', () => {
  it('is deterministic for the same string', () => {
    expect(hashSeed('commit-primordial')).toBe(hashSeed('commit-primordial'));
  });

  it('differs across distinct strings (no accidental collisions for these cases)', () => {
    expect(hashSeed('commit-primordial')).not.toBe(hashSeed('outro-seed'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });

  it('always returns a non-negative 32-bit integer', () => {
    for (const seed of ['', 'x', 'commit-primordial', 'a very long seed string indeed']) {
      const h = hashSeed(seed);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('Rng', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = new Rng('commit-primordial');
    const b = new Rng('commit-primordial');
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng('commit-primordial');
    const b = new Rng('another-seed');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('never returns a value outside [0, 1)', () => {
    const rng = new Rng('bounds-check');
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt is inclusive on both ends and stays in range', () => {
    const rng = new Rng('int-check');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([1, 2, 3]));
  });

  it('nextInt supports a degenerate single-value range', () => {
    const rng = new Rng('degenerate');
    expect(rng.nextInt(5, 5)).toBe(5);
  });

  it('chance(1) is always true and chance(0) is always false', () => {
    const rng = new Rng('chance-check');
    for (let i = 0; i < 20; i++) {
      expect(rng.chance(1)).toBe(true);
      expect(rng.chance(0)).toBe(false);
    }
  });
});
