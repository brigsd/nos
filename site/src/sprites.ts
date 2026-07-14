/**
 * src/sprites.ts
 *
 * Loads the pre-rendered tileset PNGs (built by assets/tools/render.js from
 * the palette-index sources in assets/sprites/src/*.json) as plain
 * <img> elements. Multi-frame sprites are single-row spritesheets, per the
 * project's `nome_acao_Nframes.png` convention - see docs/GDD.md and
 * assets/CREDITS.md.
 */

export interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

/** Relative to index.html, same reasoning as world.ts. */
const SPRITE_BASE = './assets/sprites/';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar sprite: ${src}`));
    img.src = src;
  });
}

async function loadSheet(file: string, frameWidth: number, frameHeight: number, frameCount: number): Promise<SpriteSheet> {
  const image = await loadImage(SPRITE_BASE + file);
  return { image, frameWidth, frameHeight, frameCount };
}

export interface Sprites {
  campina1: SpriteSheet;
  campina2: SpriteSheet;
  campinaFlores: SpriteSheet;
  floresta: SpriteSheet;
  ruina: SpriteSheet;
  /** 2-frame shimmer loop, 16x16 per frame. */
  agua: SpriteSheet;
  /** 4-frame breathing pulse, 32x32 per frame (covers the Core's 2x2 tile footprint). */
  nucleo: SpriteSheet;
  /** Player avatar: small hooded traveler. */
  no_avatar: SpriteSheet;
}

export async function loadSprites(): Promise<Sprites> {
  const [campina1, campina2, campinaFlores, floresta, ruina, agua, nucleo, no_avatar] = await Promise.all([
    loadSheet('campina_1.png', 16, 16, 1),
    loadSheet('campina_2.png', 16, 16, 1),
    loadSheet('campina_flores.png', 16, 16, 1),
    loadSheet('floresta.png', 16, 16, 1),
    loadSheet('ruina.png', 16, 16, 1),
    loadSheet('agua_ondula_2frames.png', 16, 16, 2),
    loadSheet('nucleo_pulse_4frames.png', 32, 32, 4),
    loadSheet('no_avatar.png', 16, 16, 1),
  ]);
  return { campina1, campina2, campinaFlores, floresta, ruina, agua, nucleo, no_avatar };
}
