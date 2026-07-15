/**
 * gl/pixi-stress.ts
 *
 * Renderer (b) for the FPS stress test - PixiJS's idiomatic answer to "many
 * moving sprites" is ParticleContainer, not a plain Container of Sprites
 * (that would work too, and does for the ~4k tiles in gl/pixi-world.ts, but
 * ParticleContainer is the documented fast path once you're deliberately
 * stress-testing sprite count). All particles share ONE texture on purpose
 * - PixiJS's own docs note mixed textures fall off the ParticleContainer
 * fast path, so this keeps the benchmark honest about what "10k sprites in
 * PixiJS" actually means in practice (see docs/R3_COMPARATIVO_RENDER.md).
 */
import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import { STRESS_PX_PER_TILE, STRESS_SPRITE_SIZE_PX } from './stress-constants';
import { genStressSprites, stressSpritePosition, type StressSprite } from './stress';

export class PixiStressScene {
  readonly container: ParticleContainer;
  private particles: Particle[] = [];
  private sprites: StressSprite[] = [];

  constructor(private texture: Texture) {
    this.container = new ParticleContainer({
      dynamicProperties: { position: true, rotation: false, scale: false, color: false, uvs: false },
    });
  }

  setCount(count: number): void {
    if (this.particles.length > 0) {
      this.container.removeParticle(...this.particles);
    }
    this.sprites = genStressSprites(count);
    this.particles = this.sprites.map((s) => {
      const pos = stressSpritePosition(s, 0);
      return new Particle({
        texture: this.texture,
        x: pos.x * STRESS_PX_PER_TILE,
        y: pos.y * STRESS_PX_PER_TILE,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: STRESS_SPRITE_SIZE_PX / this.texture.width,
        scaleY: STRESS_SPRITE_SIZE_PX / this.texture.height,
      });
    });
    if (this.particles.length > 0) {
      this.container.addParticle(...this.particles);
    }
  }

  update(nowMs: number): void {
    const tSeconds = nowMs / 1000;
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i]!;
      const p = this.particles[i]!;
      const pos = stressSpritePosition(s, tSeconds);
      p.x = pos.x * STRESS_PX_PER_TILE;
      p.y = pos.y * STRESS_PX_PER_TILE;
    }
  }
}
