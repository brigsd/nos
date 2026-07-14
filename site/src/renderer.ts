/**
 * src/renderer.ts
 *
 * Draws one frame: dark background, every visible tile (viewport-culled),
 * and the Core sprite pulsing over its tile footprint. Pure presentation -
 * no game rules live here (see docs/ARCHITECTURE.md, "cliente burro").
 */
import type { World } from '../../engine/types';
import { TILE_SIZE_PX } from '../../engine/types';
import type { Camera } from './camera';
import { hashTile } from './hash';
import type { Sprites, SpriteSheet } from './sprites';

/** Water alternates frames roughly once a second (GDD: gentle shimmer, not a strobe). */
const WATER_FRAME_MS = 1000;
/** Core breathing loop: 4 frames, ~1.4s per full pulse - reads as a heartbeat, not a flicker. */
const CORE_FRAME_MS = 350;
/** Void behind the map island - darkest tone of Resurrect 64, dimmed further. */
const BG_COLOR = '#100c15';
/** Share of meadow tiles that bloom with flowers. */
const FLOWER_CHANCE = 0.1;

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  world: World;
  sprites: Sprites;
  camera: Camera;
  /** devicePixelRatio at the time the canvas backing store was sized. */
  dpr: number;
}

/** Deterministic meadow variant so tile choice never depends on draw order/frame - and never forms a checkerboard. */
function meadowSprite(sprites: Sprites, x: number, y: number): SpriteSheet {
  const isFlower = hashTile(x, y, 1) % 1000 < FLOWER_CHANCE * 1000;
  if (isFlower) return sprites.campinaFlores;
  return (hashTile(x, y, 2) & 1) === 0 ? sprites.campina1 : sprites.campina2;
}

function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
): void {
  const w = sx1 - sx0;
  const h = sy1 - sy0;
  if (w <= 0 || h <= 0) return;
  ctx.drawImage(
    sheet.image,
    frameIndex * sheet.frameWidth,
    0,
    sheet.frameWidth,
    sheet.frameHeight,
    sx0,
    sy0,
    w,
    h,
  );
}

export function drawFrame(rc: RenderContext, nowMs: number): void {
  const { ctx, world, sprites, camera, dpr } = rc;
  const { width: cssW, height: cssH } = camera.viewport;
  if (cssW <= 0 || cssH <= 0) return;

  // 1 unit == 1 CSS px from here on; camera math already lives in that space.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, cssW, cssH);

  const viewWorldX1 = camera.x + cssW / camera.zoom;
  const viewWorldY1 = camera.y + cssH / camera.zoom;
  const tileMinX = Math.max(0, Math.floor(camera.x / TILE_SIZE_PX) - 1);
  const tileMinY = Math.max(0, Math.floor(camera.y / TILE_SIZE_PX) - 1);
  const tileMaxX = Math.min(world.width - 1, Math.ceil(viewWorldX1 / TILE_SIZE_PX) + 1);
  const tileMaxY = Math.min(world.height - 1, Math.ceil(viewWorldY1 / TILE_SIZE_PX) + 1);

  const waterFrame = Math.floor(nowMs / WATER_FRAME_MS) % sprites.agua.frameCount;

  let coreMinX = Infinity;
  let coreMinY = Infinity;
  let coreMaxX = -Infinity;
  let coreMaxY = -Infinity;

  for (let y = tileMinY; y <= tileMaxY; y++) {
    const sy0 = camera.worldToScreenY(y * TILE_SIZE_PX);
    const sy1 = camera.worldToScreenY((y + 1) * TILE_SIZE_PX);
    const rowOffset = y * world.width;

    for (let x = tileMinX; x <= tileMaxX; x++) {
      const tile = world.tiles[rowOffset + x];
      if (!tile) continue;
      const sx0 = camera.worldToScreenX(x * TILE_SIZE_PX);
      const sx1 = camera.worldToScreenX((x + 1) * TILE_SIZE_PX);

      switch (tile.biome) {
        case 'meadow':
          drawSpriteFrame(ctx, meadowSprite(sprites, x, y), 0, sx0, sy0, sx1, sy1);
          break;
        case 'forest':
          drawSpriteFrame(ctx, sprites.floresta, 0, sx0, sy0, sx1, sy1);
          break;
        case 'ruins':
          drawSpriteFrame(ctx, sprites.ruina, 0, sx0, sy0, sx1, sy1);
          break;
        case 'water':
          drawSpriteFrame(ctx, sprites.agua, waterFrame, sx0, sy0, sx1, sy1);
          break;
        case 'core':
          // Ground base under the Nucleo glow, plus track the footprint so
          // we can draw the (larger) pulse sprite once, after the loop.
          drawSpriteFrame(ctx, meadowSprite(sprites, x, y), 0, sx0, sy0, sx1, sy1);
          if (x < coreMinX) coreMinX = x;
          if (y < coreMinY) coreMinY = y;
          if (x > coreMaxX) coreMaxX = x;
          if (y > coreMaxY) coreMaxY = y;
          break;
        default:
          break;
      }
    }
  }

  if (coreMinX <= coreMaxX && coreMinY <= coreMaxY) {
    const frame = Math.floor(nowMs / CORE_FRAME_MS) % sprites.nucleo.frameCount;
    const nx0 = camera.worldToScreenX(coreMinX * TILE_SIZE_PX);
    const nx1 = camera.worldToScreenX((coreMaxX + 1) * TILE_SIZE_PX);
    const ny0 = camera.worldToScreenY(coreMinY * TILE_SIZE_PX);
    const ny1 = camera.worldToScreenY((coreMaxY + 1) * TILE_SIZE_PX);
    drawSpriteFrame(ctx, sprites.nucleo, frame, nx0, ny0, nx1, ny1);
  }
}
