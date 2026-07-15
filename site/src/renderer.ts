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
import type { PeerGhost } from './p2p';

/** Water alternates frames roughly once a second (GDD: gentle shimmer, not a strobe). */
const WATER_FRAME_MS = 1000;
/** Core breathing loop: 4 frames, ~1.4s per full pulse - reads as a heartbeat, not a flicker. */
const CORE_FRAME_MS = 350;
/** Portal hum: 2 frames - deliberately a different cadence from o Núcleo (350ms) and água (1000ms) so none of the three visually sync up (R6, D-17). */
const PORTAL_FRAME_MS = 700;
/** Void behind the map island - darkest tone of Resurrect 64, dimmed further. */
const BG_COLOR = '#100c15';
/** Share of meadow tiles that bloom with flowers. */
const FLOWER_CHANCE = 0.1;
/** Opacity of the local avatar — "intenção", not yet written by the Pulse (D-22, "O Registro"). */
const LOCAL_GHOST_ALPHA = 0.4;

/**
 * D-26 — the renderer seam. Everything a "janela" (window) needs to draw
 * one frame, with NO drawing-technology types in it (no ctx, no dpr): the
 * same scene feeds the default Canvas2D window (createCanvasRenderer,
 * below) and, when the player opts in, the lazy WebGL window
 * (renderer-webgl.ts). Windows are disposable by architecture; the world
 * contract stays untouched.
 */
export interface FrameScene {
  world: World;
  sprites: Sprites;
  camera: Camera;
  localPlayer: LocalPlayer;
  /**
   * Fixed map position of O Coração's portal marker (R6, D-17) - data-driven
   * from the portal registry (site/src/portals.ts / main.ts), NEVER engine
   * state: this tile isn't part of world.json anywhere, on purpose. `null`/
   * `undefined` while it shouldn't be drawn (registry still loading or
   * empty, or the player is currently visiting another world - see
   * main.ts's getPortalMarker()).
   */
  portalMarker?: { x: number; y: number } | null;
  /**
   * Other players' live P2P positions (R7, D-25c) - the "camada Intenção"
   * made literal: each entry is where a WebRTC-connected peer's avatar
   * ACTUALLY is right now, cosmetic and ephemeral, never world state. Empty/
   * absent while P2P is off, still negotiating, or (main.ts) the local
   * player is visiting another world through a portal - every position in
   * here is O Coração-relative, so it would be meaningless drawn over a
   * different map. Rendered as an extra translucent ghost ON TOP OF the
   * peer's own solid Registro entry (block 3 below), never replacing it -
   * see block "3.5" for why no name tag is drawn a second time.
   */
  p2pGhosts?: ReadonlyMap<string, PeerGhost>;
}

/** What the Canvas2D draw path actually consumes: the scene plus this window's own drawing handles. Internal to this module and its tests — other code talks to `Renderer`. */
export interface RenderContext extends FrameScene {
  ctx: CanvasRenderingContext2D;
  /** devicePixelRatio at the time the canvas backing store was sized. */
  dpr: number;
}

/**
 * A "janela" (D-26): one way of putting a FrameScene on screen. Canvas2D
 * is the default and the PERMANENT fallback; WebGL/PixiJS is an opt-in
 * upgrade loaded only on demand. The interface is deliberately tiny —
 * anything a specific technology needs (contexts, textures, scene graphs)
 * lives behind it, so swapping windows can never leak into game code.
 */
export interface Renderer {
  /** Which implementation this is — for logging/diagnostics only, never for behavior branches. */
  readonly kind: 'canvas2d' | 'webgl';
  /** Re-fits the drawing surface to the canvas' CSS size (call on window/viewport resize). Returns the CSS-pixel viewport so the caller keeps the Camera in sync. */
  resize(): { width: number; height: number };
  /** Draws one frame. Safe to call every animation frame. */
  render(scene: FrameScene, nowMs: number): void;
  /** Releases everything this window owns. The Renderer must not be used afterwards. */
  destroy(): void;
}

/**
 * The default window: Canvas2D (D-26). Owns the 2D context and the
 * devicePixelRatio-aware backing-store sizing that used to live in
 * main.ts. Returns null when the browser can't give us a 2D context at
 * all (main.ts turns that into a friendly error message).
 */
export function createCanvasRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let dpr = Math.min(window.devicePixelRatio || 1, 3);
  return {
    kind: 'canvas2d',
    resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      return { width, height };
    },
    render(scene, nowMs) {
      drawFrame({ ...scene, ctx, dpr }, nowMs);
    },
    destroy() {
      // Nothing retained beyond the context itself. The canvas element
      // stays with the page — note for the WebGL window: a canvas that has
      // produced a 2D context can never produce a WebGL one, so an
      // upgraded window must bring its OWN element instead of reusing this
      // canvas after destroy().
    },
  };
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

  // 2.1. Draw Oficinas (A Fábrica's 4 máquinas-sintetizador, R4, D-23/D-25a).
  // Static world dressing, drawn right after the Core and before any
  // Nativo/player (block 2.5+) so a body standing on the same tile always
  // reads in front of the machine, never behind it. One generic sprite read
  // 4x, each labeled by name via the same drawPlayerName used for Nativos
  // (D-25a: style comes from the recipe/material, never a duplicated
  // machine — see assets/CREDITS.md).
  for (const machine of Object.values(world.machines ?? {})) {
    const mx = machine.position.x;
    const my = machine.position.y;
    if (mx < tileMinX || mx > tileMaxX || my < tileMinY || my > tileMaxY) continue;

    const mx0 = camera.worldToScreenX(mx * TILE_SIZE_PX);
    const mx1 = camera.worldToScreenX((mx + 1) * TILE_SIZE_PX);
    const my0 = camera.worldToScreenY(my * TILE_SIZE_PX);
    const my1 = camera.worldToScreenY((my + 1) * TILE_SIZE_PX);

    drawSpriteFrame(ctx, sprites.oficina, 0, mx0, my0, mx1, my1);
    drawPlayerName(ctx, machine.name, mx0, my0, mx1, false);
  }

  // 2.2. Draw the Portal marker (O Salão de Portais' map affordance, R6/D-17).
  // Data-driven from the portal registry (site/src/portals.ts), NOT engine
  // state - this tile isn't part of world.json anywhere. main.ts only hands
  // a position through when there's somewhere to travel TO and we're home
  // in O Coração to begin with (see main.ts's getPortalMarker()).
  if (rc.portalMarker) {
    const px = rc.portalMarker.x;
    const py = rc.portalMarker.y;
    if (px >= tileMinX && px <= tileMaxX && py >= tileMinY && py <= tileMaxY) {
      const px0 = camera.worldToScreenX(px * TILE_SIZE_PX);
      const px1 = camera.worldToScreenX((px + 1) * TILE_SIZE_PX);
      const py0 = camera.worldToScreenY(py * TILE_SIZE_PX);
      const py1 = camera.worldToScreenY((py + 1) * TILE_SIZE_PX);

      const portalFrame = Math.floor(nowMs / PORTAL_FRAME_MS) % sprites.portal.frameCount;
      drawSpriteFrame(ctx, sprites.portal, portalFrame, px0, py0, px1, py1);
      drawPlayerName(ctx, 'Portais', px0, py0, px1, false);
    }
  }

  // 2.5. Draw Nativos (NPCs — official world state, so solid like other players).
  // A Native that spoke on the current beat — autonomously (native_spoke) or
  // answering a player's /conversar (native_replied, v2) — gets a small
  // speech bubble (issue #23).
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
    drawPlayerName(ctx, native.name, nx0, ny0, nx1, false);
    if (spokeThisTick.has(native.id)) drawSpeechMark(ctx, nx0, ny0, nx1);
  }

  // 3. Draw other players (official world state)
  // A player that spoke (/dizer) on the current beat gets the same speech bubble
  // as a Native (issue #23 pattern) — the mural event, mirrored onto the map.
  const saidThisTick = new Set(
    world.events
      .filter((e): e is Extract<typeof e, { type: 'player_said' }> => e.type === 'player_said')
      .filter((e) => e.tick === world.meta.tickCount)
      .map((e) => e.login),
  );
  for (const [login, player] of Object.entries(world.players)) {
    // "O Eco" (D-25b, flips D-22): other players render solid (they are real,
    // Registro is all we know of them). The local player's OWN official entry
    // renders as the pale echo trailing behind — you are solid where you feel
    // you are (block 4), and your Registro follows until the Pulse catches up.
    const isLocalEcho = login === localPlayer.username;

    const px = player.position.x;
    const py = player.position.y;

    // Viewport check
    if (px >= tileMinX && px <= tileMaxX && py >= tileMinY && py <= tileMaxY) {
      const px0 = camera.worldToScreenX(px * TILE_SIZE_PX);
      const px1 = camera.worldToScreenX((px + 1) * TILE_SIZE_PX);
      const py0 = camera.worldToScreenY(py * TILE_SIZE_PX);
      const py1 = camera.worldToScreenY((py + 1) * TILE_SIZE_PX);

      const prevAlpha = ctx.globalAlpha;
      if (isLocalEcho) ctx.globalAlpha = LOCAL_GHOST_ALPHA;
      drawSpriteFrame(ctx, sprites.no_avatar, 0, px0, py0, px1, py1);
      if (!isLocalEcho) drawPlayerName(ctx, `@${player.login}`, px0, py0, px1, false);
      ctx.globalAlpha = prevAlpha;
      if (saidThisTick.has(player.login) && !isLocalEcho) drawSpeechMark(ctx, px0, py0, px1);
    }
  }

  // 3.5. Draw P2P "Intenção" ghosts (R7, D-25c): a WebRTC-connected peer's
  // LIVE position, drawn on top of their already-drawn solid Registro above
  // (block 3) - same translucency as the local echo (LOCAL_GHOST_ALPHA): an
  // Intenção is an Intenção whoever it belongs to (docs/LORE.md). No name
  // tag here on purpose - the solid Registro entry for the same login
  // (block 3) already carries one; a second label this close would just be
  // clutter, mirroring how block 3 itself skips the name for isLocalEcho.
  // A cheap directional cue (the protocol's optional `face`): mirror the
  // sprite horizontally when facing left, reusing the flip already built
  // for the water rim (drawSpriteFrame's flipX) rather than adding new art
  // - there is no directional sprite sheet for the avatar yet.
  if (rc.p2pGhosts) {
    for (const ghost of rc.p2pGhosts.values()) {
      const gx = ghost.x;
      const gy = ghost.y;
      if (gx < tileMinX - 1 || gx > tileMaxX + 1 || gy < tileMinY - 1 || gy > tileMaxY + 1) continue;

      const gx0 = camera.worldToScreenX(gx * TILE_SIZE_PX);
      const gx1 = camera.worldToScreenX((gx + 1) * TILE_SIZE_PX);
      const gy0 = camera.worldToScreenY(gy * TILE_SIZE_PX);
      const gy1 = camera.worldToScreenY((gy + 1) * TILE_SIZE_PX);

      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = LOCAL_GHOST_ALPHA;
      drawSpriteFrame(ctx, sprites.no_avatar, 0, gx0, gy0, gx1, gy1, ghost.face === 'left');
      ctx.globalAlpha = prevAlpha;
    }
  }

  // 4. Draw local player SOLID at its visual position ("O Eco", D-25b): you
  // are where you feel you are; the pale echo above is your Registro — the
  // last position the Pulse wrote into the Crônica — catching up to you.
  const lpx = localPlayer.visualX;
  const lpy = localPlayer.visualY;

  // Viewport check
  if (lpx >= tileMinX - 1 && lpx <= tileMaxX + 1 && lpy >= tileMinY - 1 && lpy <= tileMaxY + 1) {
    const px0 = camera.worldToScreenX(lpx * TILE_SIZE_PX);
    const px1 = camera.worldToScreenX((lpx + 1) * TILE_SIZE_PX);
    const py0 = camera.worldToScreenY(lpy * TILE_SIZE_PX);
    const py1 = camera.worldToScreenY((lpy + 1) * TILE_SIZE_PX);

    drawSpriteFrame(ctx, sprites.no_avatar, 0, px0, py0, px1, py1);
    drawPlayerName(ctx, localPlayer.username, px0, py0, px1, true);
    if (saidThisTick.has(localPlayer.username)) drawSpeechMark(ctx, px0, py0, px1);
  }
}
