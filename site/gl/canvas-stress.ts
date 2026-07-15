/**
 * gl/canvas-stress.ts
 *
 * Renderer (a) for the FPS stress test (R3 task: "Measure FPS with
 * 1k/5k/10k sprites... deterministic synthetic sprite stress"). One
 * ctx.drawImage() call per sprite per frame, nearest-neighbour scaling -
 * the straightforward Canvas2D way to draw a lot of independently moving
 * sprites, matching how site/src/renderer.ts already draws every entity.
 */
import { STRESS_PX_PER_TILE, STRESS_SPRITE_SIZE_PX } from './stress-constants';
import { stressSpritePosition, type StressSprite } from './stress';
import type { SpriteSheet } from './sprites-canvas';

export interface CanvasStressContext {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  viewportW: number;
  viewportH: number;
  sprites: StressSprite[];
  variantSheets: readonly SpriteSheet[];
}

export function drawCanvasStressFrame(rc: CanvasStressContext, nowMs: number): void {
  const { ctx, dpr, viewportW, viewportH, sprites, variantSheets } = rc;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#100c15';
  ctx.fillRect(0, 0, viewportW, viewportH);

  const tSeconds = nowMs / 1000;
  for (const s of sprites) {
    const pos = stressSpritePosition(s, tSeconds);
    const sx = pos.x * STRESS_PX_PER_TILE;
    const sy = pos.y * STRESS_PX_PER_TILE;
    const sheet = variantSheets[s.variant % variantSheets.length]!;
    ctx.drawImage(
      sheet.image,
      0,
      0,
      sheet.frameWidth,
      sheet.frameHeight,
      sx - STRESS_SPRITE_SIZE_PX / 2,
      sy - STRESS_SPRITE_SIZE_PX / 2,
      STRESS_SPRITE_SIZE_PX,
      STRESS_SPRITE_SIZE_PX,
    );
  }
}
