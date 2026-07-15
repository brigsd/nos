/**
 * gl/sprites-canvas.ts
 *
 * Loads the tileset PNGs as plain <img> elements, the same way
 * site/src/sprites.ts does, for the Canvas2D side of the comparison.
 */

export interface SpriteSheet {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

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
  campina3: SpriteSheet;
  campinaFlores: SpriteSheet;
  floresta: SpriteSheet;
  ruina: SpriteSheet;
  agua: SpriteSheet;
  margemAgua: SpriteSheet;
  margemAguaB: SpriteSheet;
  nucleo: SpriteSheet;
  no_avatar: SpriteSheet;
  nativoGota: SpriteSheet;
  nativoRaiz: SpriteSheet;
  nativoCinza: SpriteSheet;
}

export async function loadSpritesCanvas(): Promise<Sprites> {
  const [campina1, campina2, campina3, campinaFlores, floresta, ruina, agua, margemAgua, margemAguaB, nucleo, no_avatar, nativoGota, nativoRaiz, nativoCinza] =
    await Promise.all([
      loadSheet('campina_1.png', 16, 16, 1),
      loadSheet('campina_2.png', 16, 16, 1),
      loadSheet('campina_3.png', 16, 16, 1),
      loadSheet('campina_flores.png', 16, 16, 1),
      loadSheet('floresta.png', 16, 16, 1),
      loadSheet('ruina.png', 16, 16, 1),
      loadSheet('agua_ondula_2frames.png', 16, 16, 2),
      loadSheet('margem_agua_4dir.png', 16, 16, 4),
      loadSheet('margem_agua_4dir_b.png', 16, 16, 4),
      loadSheet('nucleo_pulse_4frames.png', 32, 32, 4),
      loadSheet('no_avatar.png', 16, 16, 1),
      loadSheet('nativo_gota.png', 16, 16, 1),
      loadSheet('nativo_raiz.png', 16, 16, 1),
      loadSheet('nativo_cinza.png', 16, 16, 1),
    ]);
  return { campina1, campina2, campina3, campinaFlores, floresta, ruina, agua, margemAgua, margemAguaB, nucleo, no_avatar, nativoGota, nativoRaiz, nativoCinza };
}
