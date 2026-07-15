/**
 * gl/pixi-world.ts
 *
 * Renderer (b) of the R3 comparison: PixiJS v8/WebGL. Builds one Pixi
 * scene graph for the world/heart.json map (batched tile Sprites, Nativos,
 * players), then layers the lighting target on top:
 *   - ambient day/night tint + warm dawn/dusk overlay (two full-viewport
 *     Graphics rects, driven by the same gl/daynight.ts curve the canvas
 *     renderer uses)
 *   - a point light (radial-gradient Sprite, additive blend) over the
 *     Núcleo, pulsing with its existing 4-frame breathing animation
 *   - a bloom pass (core's own BlurFilter, no extra dependency) on a small
 *     "glow" container holding a second Núcleo sprite + the light sprite
 *   - a water-shimmer fragment shader (gl/pixi-filters.ts) applied to the
 *     Container holding only the water tiles
 *
 * Unlike the canvas renderer's per-frame worldToScreen() loop, the camera
 * here is just the transform of one root Container - Pixi's scene graph
 * gives that for free. Tiles are NOT manually viewport-culled (all 4096 of
 * O Coração's tiles are built once); the GPU batcher handles that count
 * without needing it. Both of these are real, load-bearing differences
 * from the Canvas2D side, called out in docs/R3_COMPARATIVO_RENDER.md.
 */
import { BlurFilter, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { World } from '../../engine/types';
import { TILE_SIZE_PX } from '../../engine/types';
import { hashTile } from './hash';
import type { PixiSheet, PixiSprites } from './sprites-pixi';
import { dayNightState, timeOfDayFraction } from './daynight';
import { createWaterShimmerFilter, setShimmerTime } from './pixi-filters';

const WATER_FRAME_MS = 1000;
const CORE_FRAME_MS = 350;
const FLOWER_CHANCE = 0.1;

function meadowSheet(sprites: PixiSprites, x: number, y: number): PixiSheet {
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

function nativeSheet(sprites: PixiSprites, id: string): PixiSheet {
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
  const idx = y * world.width + x;
  if (x < 0 || x >= world.width || y < 0 || y >= world.height) return false;
  return world.tiles[idx]?.biome === 'water';
}

function rimVariant(sprites: PixiSprites, x: number, y: number): PixiSheet {
  return hashTile(x, y, 3) % 2 === 0 ? sprites.margemAgua : sprites.margemAguaB;
}

function rimFlipped(x: number, y: number): boolean {
  return hashTile(x, y, 4) % 2 === 0;
}

function makeRadialLightTexture(size = 256): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sem contexto 2D para gerar a textura da luz.');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

function lerpColorInt(hexA: number, hexB: number, t: number): number {
  const ar = (hexA >> 16) & 0xff;
  const ag = (hexA >> 8) & 0xff;
  const ab = hexA & 0xff;
  const br = (hexB >> 16) & 0xff;
  const bg = (hexB >> 8) & 0xff;
  const bb = hexB & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | b;
}

const NAME_STYLE = new TextStyle({
  fontFamily: '"Courier New", Courier, monospace',
  fontWeight: 'bold',
  fontSize: 9,
  fill: 0xffffff,
  stroke: { color: 0x2e222f, width: 2 },
});

export class PixiWorldScene {
  readonly stageRoot = new Container();
  readonly worldContainer = new Container();
  private tilesContainer = new Container();
  private waterContainer = new Container();
  private entitiesContainer = new Container();
  private glowContainer = new Container();
  private ambient = new Graphics();
  private warmOverlay = new Graphics();

  private waterSprites: Sprite[] = [];
  private waterFrames: Texture[];
  private coreSprite: Sprite | null = null;
  private coreGlowSprite: Sprite | null = null;
  private lightSprite: Sprite;
  private coreFrames: Texture[];
  private coreCenterWorldPx = { x: 0, y: 0 };
  private coreTileSpanPx = 0;

  private readonly waterFilter = createWaterShimmerFilter();
  private readonly bloomFilter = new BlurFilter({ strength: 10, quality: 3 });

  private viewportW = 0;
  private viewportH = 0;

  constructor(
    private world: World,
    sprites: PixiSprites,
  ) {
    this.coreFrames = sprites.nucleo.frames;
    this.waterFrames = sprites.agua.frames;

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[y * world.width + x];
        if (!tile) continue;
        this.buildTile(sprites, world, x, y, tile.biome);
      }
    }

    for (const native of Object.values(world.natives ?? {})) {
      this.buildEntity(nativeSheet(sprites, native.id), native.position.x, native.position.y, native.name);
    }
    for (const [, player] of Object.entries(world.players)) {
      this.buildEntity(sprites.no_avatar, player.position.x, player.position.y, `@${player.login}`);
    }

    this.lightSprite = new Sprite(makeRadialLightTexture());
    this.lightSprite.anchor.set(0.5);
    this.lightSprite.tint = 0xffdca8;
    this.lightSprite.blendMode = 'add';
    this.lightSprite.position.set(this.coreCenterWorldPx.x, this.coreCenterWorldPx.y);

    if (this.coreSprite) {
      this.coreGlowSprite = new Sprite(this.coreSprite.texture);
      this.coreGlowSprite.anchor.set(0.5);
      this.coreGlowSprite.position.set(this.coreCenterWorldPx.x, this.coreCenterWorldPx.y);
      this.glowContainer.addChild(this.coreGlowSprite);
    }
    this.glowContainer.addChild(this.lightSprite);
    this.glowContainer.filters = [this.bloomFilter];
    this.glowContainer.blendMode = 'add';

    this.waterContainer.filters = [this.waterFilter];

    this.worldContainer.addChild(this.tilesContainer, this.waterContainer, this.entitiesContainer);
    // glowContainer is a SEPARATE sibling (not nested in worldContainer) so it
    // can sit ABOVE the ambient/warm tint overlays in z-order while still
    // sharing the exact same camera transform (applyCamera drives both) - the
    // additive point light + bloom need to visually pierce the night tint,
    // the same way the canvas renderer draws its light gradient AFTER the
    // tint fillRect. Getting this order wrong was caught by QA screenshots:
    // an earlier version nested glowContainer inside worldContainer, so the
    // multiply-blend tint painted over top of the light and drowned it out.
    this.stageRoot.addChild(this.worldContainer, this.ambient, this.warmOverlay, this.glowContainer);
  }

  private buildTile(sprites: PixiSprites, world: World, x: number, y: number, biome: string): void {
    const px = x * TILE_SIZE_PX;
    const py = y * TILE_SIZE_PX;

    switch (biome) {
      case 'meadow':
      case 'core': {
        const sheet = meadowSheet(sprites, x, y);
        const sprite = new Sprite(sheet.frames[0]);
        sprite.position.set(px, py);
        this.tilesContainer.addChild(sprite);
        this.addRim(sprites, world, x, y, px, py);
        if (biome === 'core') {
          this.registerCoreFootprint(x, y);
        }
        break;
      }
      case 'forest': {
        const sprite = new Sprite(sprites.floresta.frames[0]);
        sprite.position.set(px, py);
        this.tilesContainer.addChild(sprite);
        break;
      }
      case 'ruins': {
        const sprite = new Sprite(sprites.ruina.frames[0]);
        sprite.position.set(px, py);
        this.tilesContainer.addChild(sprite);
        break;
      }
      case 'water': {
        const sprite = new Sprite(sprites.agua.frames[0]);
        sprite.position.set(px, py);
        this.waterContainer.addChild(sprite);
        this.waterSprites.push(sprite);
        break;
      }
      default:
        break;
    }
  }

  private addRim(sprites: PixiSprites, world: World, x: number, y: number, px: number, py: number): void {
    const sheet = rimVariant(sprites, x, y);
    const flip = rimFlipped(x, y);
    for (const { dx, dy, frame } of MEADOW_RIM_NEIGHBORS) {
      if (!isWaterTile(world, x + dx, y + dy)) continue;
      const rim = new Sprite(sheet.frames[frame]);
      rim.anchor.set(0.5, 0);
      rim.position.set(px + TILE_SIZE_PX / 2, py);
      rim.width = TILE_SIZE_PX;
      rim.height = TILE_SIZE_PX;
      if (flip) rim.scale.x *= -1;
      this.tilesContainer.addChild(rim);
    }
  }

  private coreMinX = Infinity;
  private coreMinY = Infinity;
  private coreMaxX = -Infinity;
  private coreMaxY = -Infinity;

  private registerCoreFootprint(x: number, y: number): void {
    this.coreMinX = Math.min(this.coreMinX, x);
    this.coreMinY = Math.min(this.coreMinY, y);
    this.coreMaxX = Math.max(this.coreMaxX, x);
    this.coreMaxY = Math.max(this.coreMaxY, y);

    if (!this.coreSprite) {
      this.coreSprite = new Sprite(this.coreFrames[0]);
      this.entitiesContainer.addChild(this.coreSprite);
    }
    const x0 = this.coreMinX * TILE_SIZE_PX;
    const y0 = this.coreMinY * TILE_SIZE_PX;
    this.coreSprite.position.set(x0, y0);
    this.coreTileSpanPx = (this.coreMaxX - this.coreMinX + 1) * TILE_SIZE_PX;
    this.coreCenterWorldPx = {
      x: x0 + this.coreTileSpanPx / 2,
      y: y0 + this.coreTileSpanPx / 2,
    };
  }

  private buildEntity(sheet: PixiSheet, x: number, y: number, name: string): void {
    const sprite = new Sprite(sheet.frames[0]);
    sprite.position.set(x * TILE_SIZE_PX, y * TILE_SIZE_PX);
    this.entitiesContainer.addChild(sprite);

    const label = new Text({ text: name, style: NAME_STYLE });
    label.anchor.set(0.5, 1);
    label.position.set(x * TILE_SIZE_PX + TILE_SIZE_PX / 2, y * TILE_SIZE_PX - 1);
    this.entitiesContainer.addChild(label);
    this.labels.push(label);
  }

  private labels: Text[] = [];

  /** Full-viewport overlays (ambient tint, warm glow) live outside worldContainer, so they must be resized in CSS-px screen space, not world-px. */
  resize(width: number, height: number): void {
    this.viewportW = width;
    this.viewportH = height;
  }

  applyCamera(x: number, y: number, zoom: number): void {
    this.worldContainer.scale.set(zoom);
    this.worldContainer.position.set(-x * zoom, -y * zoom);
    // glowContainer is a sibling, not a child, of worldContainer (see the
    // comment in the constructor) - it needs the identical transform to
    // stay glued to the Núcleo's world position.
    this.glowContainer.scale.set(zoom);
    this.glowContainer.position.set(-x * zoom, -y * zoom);
    // Labels live inside worldContainer (so they track their entity's world
    // position for free) but must read as fixed-size screen text, like the
    // canvas renderer's ctx.font (defined directly in CSS px) - counteract
    // the container's zoom so rendered glyph size stays constant.
    const inverseZoom = zoom > 0 ? 1 / zoom : 1;
    for (const label of this.labels) {
      label.scale.set(inverseZoom);
    }
  }

  update(nowMs: number, worldTimeOverrideMinutes?: number): void {
    const waterFrame = Math.floor(nowMs / WATER_FRAME_MS) % this.waterFrames.length;
    const waterTex = this.waterFrames[waterFrame];
    if (waterTex) {
      for (const s of this.waterSprites) {
        s.texture = waterTex;
      }
    }
    setShimmerTime(this.waterFilter, nowMs / 1000);

    const coreFrame = Math.floor(nowMs / CORE_FRAME_MS) % this.coreFrames.length;
    const tex = this.coreFrames[coreFrame];
    if (tex) {
      if (this.coreSprite) this.coreSprite.texture = tex;
      if (this.coreGlowSprite) this.coreGlowSprite.texture = tex;
    }

    const worldTime = worldTimeOverrideMinutes ?? this.world.meta.worldTime;
    const dn = dayNightState(timeOfDayFraction(worldTime));

    if (this.viewportW > 0 && this.viewportH > 0) {
      this.ambient.clear();
      this.ambient
        .rect(0, 0, this.viewportW, this.viewportH)
        .fill({ color: lerpColorInt(0xffffff, dn.nightColor, dn.darkness) });
      this.ambient.blendMode = 'multiply';

      this.warmOverlay.clear();
      if (dn.warmth > 0.01) {
        this.warmOverlay.rect(0, 0, this.viewportW, this.viewportH).fill({ color: dn.warmColor, alpha: dn.warmth * 0.16 });
      }
    }

    const pulse = 0.85 + 0.15 * Math.sin((nowMs / CORE_FRAME_MS) * 0.6);
    const lightScale = ((TILE_SIZE_PX * (3.2 + dn.darkness * 1.1)) / 128) * pulse;
    this.lightSprite.scale.set(lightScale);
    this.lightSprite.alpha = 0.55 + dn.darkness * 0.35;
  }
}
