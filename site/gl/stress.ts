/**
 * gl/stress.ts
 *
 * Deterministic synthetic sprite stress test (R3 task requirement: "no
 * Math.random - hash-based positions"). Generates N sprites scattered over
 * a virtual field and gives each one a small deterministic orbit so both
 * renderers actually redo per-sprite transform work every frame (a static
 * grid would let a renderer cheat by never touching most sprites again
 * after the first frame).
 *
 * This is a SEPARATE scene from the real world/heart.json render (see
 * world-scene.ts): the FPS table (1k/5k/10k) measures raw sprite
 * throughput, not tile-culling behaviour, so the field intentionally fills
 * the viewport rather than reusing the 64x64 map.
 */
import { hashTile } from './hash';

/** Salt so this generator's hash stream never collides with tile-cosmetic hashes elsewhere. */
const STRESS_SALT = 0x51a1;

/** Virtual scattering field, in tiles - bigger than the viewport at the bench zoom so sprites overlap a little, like a real crowded scene. */
export const STRESS_FIELD_TILES_W = 160;
export const STRESS_FIELD_TILES_H = 100;

export interface StressSprite {
  id: number;
  baseX: number;
  baseY: number;
  /** Orbit phase (radians). */
  phase: number;
  /** Orbit radius, in tiles. */
  radius: number;
  /** Orbit angular speed multiplier. */
  speed: number;
  /** 0..3 - which of the 4 tint/frame variants this sprite uses. */
  variant: number;
}

function hashUnit(i: number, dim: number): number {
  return hashTile(i, dim, STRESS_SALT) % 1000;
}

/** Pure function of `count` alone - same N always yields the same sprite set (determinism required for repeatable benchmarking). */
export function genStressSprites(count: number): StressSprite[] {
  const sprites: StressSprite[] = [];
  for (let i = 0; i < count; i++) {
    const baseX = hashTile(i, 1, STRESS_SALT) % (STRESS_FIELD_TILES_W * 100);
    const baseY = hashTile(i, 2, STRESS_SALT) % (STRESS_FIELD_TILES_H * 100);
    sprites.push({
      id: i,
      baseX: baseX / 100,
      baseY: baseY / 100,
      phase: (hashUnit(i, 3) / 1000) * Math.PI * 2,
      radius: 0.15 + (hashUnit(i, 4) / 1000) * 0.35,
      speed: 0.5 + (hashUnit(i, 5) / 1000) * 1.5,
      variant: hashTile(i, 6, STRESS_SALT) % 4,
    });
  }
  return sprites;
}

export function stressSpritePosition(s: StressSprite, tSeconds: number): { x: number; y: number } {
  const a = s.phase + tSeconds * s.speed;
  return { x: s.baseX + Math.cos(a) * s.radius, y: s.baseY + Math.sin(a) * s.radius };
}
