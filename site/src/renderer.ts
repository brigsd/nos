/**
 * src/renderer.ts
 *
 * Draws one frame: dark background, every visible tile (viewport-culled),
 * the Core sprite pulsing over its tile footprint, and all players (both other
 * players in world state and the local player with smooth movement).
 * Pure presentation - no game rules live here.
 */
import type { World } from '../../engine/types';
import { getTile, TILE_SIZE_PX } from '../../engine/types';
import type { Camera } from './camera';
import { hashTile } from './hash';
import type { Sprites, SpriteSheet } from './sprites';
import type { LocalPlayer } from './player';

/** Water alternates frames roughly once a second (GDD: gentle shimmer, not a strobe). */
const WATER_FRAME_MS = 1000;
/** Core breathing loop: 4 frames, ~1.4s per full pulse - reads as a heartbeat, not a flicker. */
const CORE_FRAME_MS = 350;
/** Void behind the map island - darkest tone of Resurrect 64, dimmed further. */
const BG_COLOR = '#100c15';
/** Share of meadow tiles that bloom with flowers. */
const FLOWER_CHANCE = 0.1;
/** Opacity of the local avatar — "intenção", not yet written by the Pulse (D-22, "O Registro"). */
const LOCAL_GHOST_ALPHA = 0.4;

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  world: World;
  sprites: Sprites;
  camera: Camera;
  /** devicePixelRatio at the time the canvas backing store was sized. */
  dpr: number;
  localPlayer: LocalPlayer;
}

/** Deterministic meadow variant so tile choice never depends on draw order/frame - and never forms a checkerboard. */
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

/** Maps a Native's id to its sprite. Natives are seeded from a fixed roster (gota/raiz/cinza). */
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

/**
 * Sandy/wet rim for the grass->water border (issue #12: the meeting used to
 * be a hard cut). Each entry is a neighbour offset paired with the
 * matching frame in sprites.margemAgua (S,W,N,E - see
 * assets/tools/author-sprites.cjs, genMargemAgua4Dir). Deliberately just a
 * 4-direction cardinal check, not full 16-variant autotiling: for every
 * side of a campina tile that touches water, draw that side's rim strip on
 * top: two touching sides (an inlet corner) simply draw two overlapping
 * strips, no extra cases needed.
 */
const MEADOW_RIM_NEIGHBORS: ReadonlyArray<{ dx: number; dy: number; frame: number }> = [
  { dx: 0, dy: 1, frame: 0 }, // water to the south
  { dx: -1, dy: 0, frame: 1 }, // water to the west
  { dx: 0, dy: -1, frame: 2 }, // water to the north
  { dx: 1, dy: 0, frame: 3 }, // water to the east
];

function isWaterTile(world: World, x: number, y: number): boolean {
  return getTile(world, x, y)?.biome === 'water';
}

/**
 * Art-reviewer follow-up (PR #12): MEADOW_RIM_NEIGHBORS always draws the
 * exact same hand-authored strip, so a long straight coastline repeated one
 * identical relief every 16px - obvious at close zoom. Breaking that up
 * without full autotiling: pick one of two rim sprites (margemAgua /
 * margemAguaB - same technique, different wave phase, see
 * assets/tools/author-sprites.cjs) and independently mirror the draw
 * horizontally, both via a positional hash of the tile so the pick is
 * stable across redraws (same reasoning as meadowSprite above) and both
 * sides of an inlet corner still agree on one look for that tile.
 */
function rimVariant(sprites: Sprites, x: number, y: number): SpriteSheet {
  return hashTile(x, y, 3) % 2 === 0 ? sprites.margemAgua : sprites.margemAguaB;
}

function rimFlipped(x: number, y: number): boolean {
  return hashTile(x, y, 4) % 2 === 0;
}

/** Draws the rim strip on top of an already-drawn campina tile for every cardinal side touching water. */
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

function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  frameIndex: number,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  /** Mirror the drawn frame horizontally in place. Only used by drawMeadowRim so far. */
  flipX = false,
): void {
  const w = sx1 - sx0;
  const h = sy1 - sy0;
  if (w <= 0 || h <= 0) return;
  if (!flipX) {
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
    return;
  }
  // Mirror horizontally about the tile's own screen rect, so the flip never
  // shifts where the tile is drawn - only which way the rim strip faces.
  ctx.save();
  ctx.translate(sx0 + w, sy0);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet.image, frameIndex * sheet.frameWidth, 0, sheet.frameWidth, sheet.frameHeight, 0, 0, w, h);
  ctx.restore();
}

function drawPlayerName(
  ctx: CanvasRenderingContext2D,
  name: string,
  px0: number,
  py0: number,
  px1: number,
  isLocal: boolean,
): void {
  ctx.save();
  ctx.font = 'bold 9px "Courier New", Courier, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const cx = (px0 + px1) / 2;
  const cy = py0 - 3;

  // Shadow/border
  ctx.fillStyle = '#2e222f'; // Black from Resurrect 64
  ctx.fillText(name, cx - 1, cy);
  ctx.fillText(name, cx + 1, cy);
  ctx.fillText(name, cx, cy - 1);
  ctx.fillText(name, cx, cy + 1);

  // Text color
  ctx.fillStyle = isLocal ? '#fbff86' : '#ffffff'; // paleYellow for local player, white for others
  ctx.fillText(name, cx, cy);
  ctx.restore();
}

/** A tiny pixel speech bubble above a Native that spoke this beat (issue #23). Fixed screen size, like the name tags. */
function drawSpeechMark(ctx: CanvasRenderingContext2D, px0: number, py0: number, px1: number): void {
  const cx = Math.round((px0 + px1) / 2);
  const top = py0 - 15;
  ctx.save();
  ctx.fillStyle = '#fbf5ef'; // near-white (Resurrect 64)
  ctx.fillRect(cx - 5, top, 10, 6); // bubble body
  ctx.fillRect(cx - 2, top + 6, 3, 2); // tail
  ctx.fillStyle = '#2e222f'; // dark dots (Resurrect 64)
  ctx.fillRect(cx - 3, top + 2, 1, 2);
  ctx.fillRect(cx, top + 2, 1, 2);
  ctx.fillRect(cx + 3, top + 2, 1, 2);
  ctx.restore();
}

export function drawFrame(rc: RenderContext, nowMs: number): void {
  const { ctx, world, sprites, camera, dpr, localPlayer } = rc;
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

  // 1. Draw biomes/tiles
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

  // 2. Draw Core (O Nucleo)
  if (coreMinX <= coreMaxX && coreMinY <= coreMaxY) {
    const frame = Math.floor(nowMs / CORE_FRAME_MS) % sprites.nucleo.frameCount;
    const nx0 = camera.worldToScreenX(coreMinX * TILE_SIZE_PX);
    const nx1 = camera.worldToScreenX((coreMaxX + 1) * TILE_SIZE_PX);
    const ny0 = camera.worldToScreenY(coreMinY * TILE_SIZE_PX);
    const ny1 = camera.worldToScreenY((coreMaxY + 1) * TILE_SIZE_PX);
    drawSpriteFrame(ctx, sprites.nucleo, frame, nx0, ny0, nx1, ny1);
  }

  // 2.5. Draw Nativos (NPCs — official world state, so solid like other players).
  // A Native that spoke on the current beat gets a small speech bubble (issue #23).
  const spokeThisTick = new Set(
    world.events
      .filter((e): e is Extract<typeof e, { type: 'native_spoke' }> => e.type === 'native_spoke')
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
    drawPlayerName(ctx, native.name, nx0, ny0, nx1, false);
    if (spokeThisTick.has(native.id)) drawSpeechMark(ctx, nx0, ny0, nx1);
  }

  // 3. Draw other players (official world state)
  for (const [login, player] of Object.entries(world.players)) {
    // If the official player is the local player, we skip rendering it here
    // because we render the local player smoothly at its visual position.
    if (login === localPlayer.username) continue;

    const px = player.position.x;
    const py = player.position.y;

    // Viewport check
    if (px >= tileMinX && px <= tileMaxX && py >= tileMinY && py <= tileMaxY) {
      const px0 = camera.worldToScreenX(px * TILE_SIZE_PX);
      const px1 = camera.worldToScreenX((px + 1) * TILE_SIZE_PX);
      const py0 = camera.worldToScreenY(py * TILE_SIZE_PX);
      const py1 = camera.worldToScreenY((py + 1) * TILE_SIZE_PX);

      drawSpriteFrame(ctx, sprites.no_avatar, 0, px0, py0, px1, py1);
      drawPlayerName(ctx, `@${player.login}`, px0, py0, px1, false);
    }
  }

  // 4. Draw local player as "intenção" — a translucent ghost (D-22, "O Registro").
  // The world state (drawn solid above) is what is real; the local avatar is only
  // intention until the Pulse writes it into the Crônica. So it renders faded,
  // moving ahead of its official self until the next tick makes it real.
  const lpx = localPlayer.visualX;
  const lpy = localPlayer.visualY;

  // Viewport check
  if (lpx >= tileMinX - 1 && lpx <= tileMaxX + 1 && lpy >= tileMinY - 1 && lpy <= tileMaxY + 1) {
    const px0 = camera.worldToScreenX(lpx * TILE_SIZE_PX);
    const px1 = camera.worldToScreenX((lpx + 1) * TILE_SIZE_PX);
    const py0 = camera.worldToScreenY(lpy * TILE_SIZE_PX);
    const py1 = camera.worldToScreenY((lpy + 1) * TILE_SIZE_PX);

    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = LOCAL_GHOST_ALPHA;
    drawSpriteFrame(ctx, sprites.no_avatar, 0, px0, py0, px1, py1);
    drawPlayerName(ctx, localPlayer.username, px0, py0, px1, true);
    ctx.globalAlpha = prevAlpha;
  }
}
