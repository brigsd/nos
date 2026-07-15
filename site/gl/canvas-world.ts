/**
 * gl/canvas-world.ts
 *
 * Renderer (a) of the R3 comparison: the SAME drawing approach as the live
 * site/src/renderer.ts (tile loop, water rim, Núcleo pulse, Nativos and
 * players - copied, not imported, per the task's "must not touch site/src"
 * rule), extended with the lighting target the task asks both renderers to
 * attempt:
 *   - day/night ambient tint (multiply-blend overlay + warm dawn/dusk glow)
 *   - a point light + a cheap single-sprite bloom pass over the Núcleo
 *
 * What is deliberately NOT attempted here, and why (see docs/R3_...md for
 * the full writeup): water shimmer stays the existing 2-frame flipbook (a
 * true per-pixel distortion shader would need a putImageData round-trip
 * every frame - CPU-side pixel readback, not something Canvas2D exposes any
 * GPU-side hook for), and there is no CRT/scanline pass (same reason, at
 * full-frame cost instead of one sprite).
 */
import type { World } from '../../engine/types';
import { getTile, TILE_SIZE_PX } from '../../engine/types';
import type { Camera } from './camera';
import { hashTile } from './hash';
import type { Sprites, SpriteSheet } from './sprites-canvas';
import { dayNightState, timeOfDayFraction } from './daynight';

const WATER_FRAME_MS = 1000;
const CORE_FRAME_MS = 350;
const BG_COLOR = '#100c15';
const FLOWER_CHANCE = 0.1;

function meadowSprite(sprites: Sprites, x: number, y: number): SpriteSheet {
  const isFlower = hashTile(x, y, 1) % 1000 < FLOWER_CHANCE * 1000;
  if (isFlower) return sprites.campinaFlores;
  switch (hashTile(x, y, 2) % 3) {
    case 0:
      return sprites.campina1;
    case 1:
      return sprites.campina2;
    default:
      return sprites.campina3;
  }
}

function nativeSprite(sprites: Sprites, id: string): SpriteSheet {
  switch (id) {
    case 'raiz':
      return sprites.nativoRaiz;
    case 'cinza':
      return sprites.nativoCinza;
    default:
      return sprites.nativoGota;
  }
}

const MEADOW_RIM_NEIGHBORS: ReadonlyArray<{ dx: number; dy: number; frame: number }> = [
  { dx: 0, dy: 1, frame: 0 },
  { dx: -1, dy: 0, frame: 1 },
  { dx: 0, dy: -1, frame: 2 },
  { dx: 1, dy: 0, frame: 3 },
];

function isWaterTile(world: World, x: number, y: number): boolean {
  return getTile(world, x, y)?.biome === 'water';
}

function rimVariant(sprites: Sprites, x: number, y: number): SpriteSheet {
  return hashTile(x, y, 3) % 2 === 0 ? sprites.margemAgua : sprites.margemAguaB;
}

function rimFlipped(x: number, y: number): boolean {
  return hashTile(x, y, 4) % 2 === 0;
}

function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  flipX = false,
): void {
  const w = sx1 - sx0;
  const h = sy1 - sy0;
  if (w <= 0 || h <= 0) return;
  if (!flipX) {
    ctx.drawImage(sheet.image, frameIndex * sheet.frameWidth, 0, sheet.frameWidth, sheet.frameHeight, sx0, sy0, w, h);
    return;
  }
  ctx.save();
  ctx.translate(sx0 + w, sy0);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet.image, frameIndex * sheet.frameWidth, 0, sheet.frameWidth, sheet.frameHeight, 0, 0, w, h);
  ctx.restore();
}

function drawMeadowRim(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  world: World,
  x: number,
  y: number,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
): void {
  const sheet = rimVariant(sprites, x, y);
  const flip = rimFlipped(x, y);
  for (const { dx, dy, frame } of MEADOW_RIM_NEIGHBORS) {
    if (isWaterTile(world, x + dx, y + dy)) {
      drawSpriteFrame(ctx, sheet, frame, sx0, sy0, sx1, sy1, flip);
    }
  }
}

function drawPlayerName(ctx: CanvasRenderingContext2D, name: string, px0: number, py0: number, px1: number): void {
  ctx.save();
  ctx.font = 'bold 9px "Courier New", Courier, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const cx = (px0 + px1) / 2;
  const cy = py0 - 3;
  ctx.fillStyle = '#2e222f';
  ctx.fillText(name, cx - 1, cy);
  ctx.fillText(name, cx + 1, cy);
  ctx.fillText(name, cx, cy - 1);
  ctx.fillText(name, cx, cy + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, cx, cy);
  ctx.restore();
}

function lerpColor(hexA: number, hexB: number, t: number): string {
  const ar = (hexA >> 16) & 0xff;
  const ag = (hexA >> 8) & 0xff;
  const ab = hexA & 0xff;
  const br = (hexB >> 16) & 0xff;
  const bg = (hexB >> 8) & 0xff;
  const bb = hexB & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export interface CanvasWorldContext {
  ctx: CanvasRenderingContext2D;
  world: World;
  sprites: Sprites;
  camera: Camera;
  dpr: number;
  /** Overrides world.meta.worldTime for the day/night curve (query-param driven for day/night screenshots), falls back to the world's own value. */
  worldTimeOverrideMinutes?: number;
}

export function drawCanvasWorldFrame(rc: CanvasWorldContext, nowMs: number): void {
  const { ctx, world, sprites, camera, dpr } = rc;
  const { width: cssW, height: cssH } = camera.viewport;
  if (cssW <= 0 || cssH <= 0) return;

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
          drawMeadowRim(ctx, sprites, world, x, y, sx0, sy0, sx1, sy1);
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

  let coreCx = 0;
  let coreCy = 0;
  let coreRadiusPx = 0;
  const coreFrame = Math.floor(nowMs / CORE_FRAME_MS) % sprites.nucleo.frameCount;
  if (coreMinX <= coreMaxX && coreMinY <= coreMaxY) {
    const nx0 = camera.worldToScreenX(coreMinX * TILE_SIZE_PX);
    const nx1 = camera.worldToScreenX((coreMaxX + 1) * TILE_SIZE_PX);
    const ny0 = camera.worldToScreenY(coreMinY * TILE_SIZE_PX);
    const ny1 = camera.worldToScreenY((coreMaxY + 1) * TILE_SIZE_PX);
    drawSpriteFrame(ctx, sprites.nucleo, coreFrame, nx0, ny0, nx1, ny1);
    coreCx = (nx0 + nx1) / 2;
    coreCy = (ny0 + ny1) / 2;
    coreRadiusPx = (nx1 - nx0) / 2;
  }

  const spokeThisTick = new Set(
    world.events
      .filter(
        (e): e is Extract<typeof e, { type: 'native_spoke' | 'native_replied' }> =>
          e.type === 'native_spoke' || e.type === 'native_replied',
      )
      .filter((e) => e.tick === world.meta.tickCount)
      .map((e) => e.nativeId),
  );
  for (const native of Object.values(world.natives ?? {})) {
    const nx = native.position.x;
    const ny = native.position.y;
    if (nx < tileMinX || nx > tileMaxX || ny < tileMinY || ny > tileMaxY) continue;
    const nx0 = camera.worldToScreenX(nx * TILE_SIZE_PX);
    const nx1 = camera.worldToScreenX((nx + 1) * TILE_SIZE_PX);
    const ny0 = camera.worldToScreenY(ny * TILE_SIZE_PX);
    const ny1 = camera.worldToScreenY((ny + 1) * TILE_SIZE_PX);
    drawSpriteFrame(ctx, nativeSprite(sprites, native.id), 0, nx0, ny0, nx1, ny1);
    drawPlayerName(ctx, native.name, nx0, ny0, nx1);
    void spokeThisTick;
  }

  for (const [, player] of Object.entries(world.players)) {
    const px = player.position.x;
    const py = player.position.y;
    if (px < tileMinX || px > tileMaxX || py < tileMinY || py > tileMaxY) continue;
    const px0 = camera.worldToScreenX(px * TILE_SIZE_PX);
    const px1 = camera.worldToScreenX((px + 1) * TILE_SIZE_PX);
    const py0 = camera.worldToScreenY(py * TILE_SIZE_PX);
    const py1 = camera.worldToScreenY((py + 1) * TILE_SIZE_PX);
    drawSpriteFrame(ctx, sprites.no_avatar, 0, px0, py0, px1, py1);
    drawPlayerName(ctx, `@${player.login}`, px0, py0, px1);
  }

  // --- Lighting pass (R3 addition, not in the live renderer) ---------------
  const worldTime = rc.worldTimeOverrideMinutes ?? world.meta.worldTime;
  const dn = dayNightState(timeOfDayFraction(worldTime));

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = lerpColor(0xffffff, dn.nightColor, dn.darkness);
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.restore();

  if (dn.warmth > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = dn.warmth * 0.16;
    ctx.fillStyle = `#${dn.warmColor.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.restore();
  }

  if (coreRadiusPx > 0) {
    // Point light: radial gradient in additive ('lighter') composite so it
    // pierces the night-tint layer just applied above.
    const pulse = 0.85 + 0.15 * Math.sin((nowMs / CORE_FRAME_MS) * 0.6);
    const lightRadius = coreRadiusPx * (3.2 + dn.darkness * 1.1) * pulse;
    const gradient = ctx.createRadialGradient(coreCx, coreCy, 0, coreCx, coreCy, lightRadius);
    gradient.addColorStop(0, `rgba(255, 220, 168, ${0.4 + dn.darkness * 0.28})`);
    gradient.addColorStop(0.5, `rgba(255, 190, 120, ${0.16 + dn.darkness * 0.12})`);
    gradient.addColorStop(1, 'rgba(255, 190, 120, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(coreCx, coreCy, lightRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bloom: a single blurred, oversized, additive re-draw of the Núcleo
    // sprite itself. Cheap because it is exactly one extra draw call - see
    // the file header for why this does not generalize to many glow
    // sources the way the PixiJS BlurFilter pass does.
    const bloomSize = coreRadiusPx * 2.6;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.filter = 'blur(6px)';
    drawSpriteFrame(
      ctx,
      sprites.nucleo,
      coreFrame,
      coreCx - bloomSize / 2,
      coreCy - bloomSize / 2,
      coreCx + bloomSize / 2,
      coreCy + bloomSize / 2,
    );
    ctx.restore();
  }
}
