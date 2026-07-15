/**
 * gl/sprites-pixi.ts
 *
 * Loads the SAME tileset PNGs as gl/sprites-canvas.ts, but as PixiJS
 * Textures (sliced into per-frame sub-textures for the multi-frame sheets),
 * with nearest-neighbour scaling forced per texture - the task's
 * "pixel-perfect scaling (nearest neighbor, no smoothing)" requirement.
 */
import { Assets, Rectangle, Texture } from 'pixi.js';

const SPRITE_BASE = './assets/sprites/';

export interface PixiSheet {
  frames: Texture[];
  frameWidth: number;
  frameHeight: number;
}

async function loadSheet(file: string, frameWidth: number, frameHeight: number, frameCount: number): Promise<PixiSheet> {
  const base = await Assets.load<Texture>(SPRITE_BASE + file);
  base.source.scaleMode = 'nearest';
  const frames: Texture[] = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(
      new Texture({
        source: base.source,
        frame: new Rectangle(i * frameWidth, 0, frameWidth, frameHeight),
        label: `${file}#${i}`,
      }),
    );
  }
  return { frames, frameWidth, frameHeight };
}

export interface PixiSprites {
  campina1: PixiSheet;
  campina2: PixiSheet;
  campina3: PixiSheet;
  campinaFlores: PixiSheet;
  floresta: PixiSheet;
  ruina: PixiSheet;
  agua: PixiSheet;
  margemAgua: PixiSheet;
  margemAguaB: PixiSheet;
  nucleo: PixiSheet;
  no_avatar: PixiSheet;
  nativoGota: PixiSheet;
  nativoRaiz: PixiSheet;
  nativoCinza: PixiSheet;
}

export async function loadSpritesPixi(): Promise<PixiSprites> {
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
