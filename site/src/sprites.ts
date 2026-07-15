/**
 * src/sprites.ts
 *
 * Loads the pre-rendered tileset PNGs (built by assets/tools/render.cjs from
 * the palette-index sources in assets/sprites/src/*.json) as plain
 * <img> elements. Multi-frame sprites are single-row spritesheets, per the
 * project's `nome_acao_Nframes.png` convention - see docs/GDD.md and
 * assets/CREDITS.md. margem_agua_4dir is the one exception: its 4 frames
 * are static orientation variants (water-side S/W/N/E), not an animation.
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
  campina3: SpriteSheet;
  campinaFlores: SpriteSheet;
  floresta: SpriteSheet;
  ruina: SpriteSheet;
  /** 2-frame shimmer loop, 16x16 per frame. */
  agua: SpriteSheet;
  /** Sandy/wet rim drawn over campina tiles bordering water (issue #12).
   *  4 static orientation frames, water-side S/W/N/E - see meadowRimFrame
   *  in renderer.ts. */
  margemAgua: SpriteSheet;
  /** Second rim variant (art-reviewer follow-up, PR #12): same 4-frame
   *  layout as margemAgua, different wave/fleck placement. drawMeadowRim
   *  in renderer.ts alternates between the two per-tile so a straight
   *  coastline doesn't repeat one identical relief every 16px. */
  margemAguaB: SpriteSheet;
  /** 4-frame breathing pulse, 32x32 per frame (covers the Core's 2x2 tile footprint). */
  nucleo: SpriteSheet;
  /** Player avatar: small hooded traveler. */
  no_avatar: SpriteSheet;
  /** Nativos d'O Coração (v2, issue #23) - keyed to render by Native.id. */
  nativoGota: SpriteSheet;
  nativoRaiz: SpriteSheet;
  nativoCinza: SpriteSheet;
  /** A Fábrica's 4 máquinas-sintetizador (R4, D-23/D-25a) - one generic console read 4x, per-machine name drawn alongside it (see renderer.ts). */
  oficina: SpriteSheet;
  /** O Salão de Portais' map marker (R6, D-17) - drawn once, at a fixed spot in O Coração only. 2-frame slow hum (see renderer.ts's PORTAL_FRAME_MS). */
  portal: SpriteSheet;
  /** A Cidade (R8, docs/CITY_PLAN.md) - Tile.deco layer. Plaza flagstone floor, 2 hash-picked variants (deco "plaza"; also the base under standing city objects). */
  lajePraca: SpriteSheet;
  lajePracaB: SpriteSheet;
  /** Avenue pavement (deco "pavement"): plain courses / violet vein-node variant, hash-scattered. */
  calcadaVeia: SpriteSheet;
  calcadaVeiaB: SpriteSheet;
  /** Dirt trail (deco "trail") - the T7 caminho_terra tile, finally on the map: the south road decaying into the periphery. */
  caminhoTerra: SpriteSheet;
  /** Light pylon (deco "pylon"), 4 frames breathing on the SAME clock as o Núcleo (CORE_FRAME_MS). */
  pilarPulso: SpriteSheet;
  /** Awake portal-hall arch (deco "arch") - static; only the living portal marker animates. */
  arcoDesperto: SpriteSheet;
  /** Dormant arch socket (deco "arch_dormant") - stands on bare meadow beyond the pavement's edge. */
  arcoSemente: SpriteSheet;
  /** The mural stone at o Largo do Mural (deco "mural_stone"). */
  pedraMural: SpriteSheet;
}

export async function loadSprites(): Promise<Sprites> {
  const [
    campina1,
    campina2,
    campina3,
    campinaFlores,
    floresta,
    ruina,
    agua,
    margemAgua,
    margemAguaB,
    nucleo,
    no_avatar,
    nativoGota,
    nativoRaiz,
    nativoCinza,
    oficina,
    portal,
    lajePraca,
    lajePracaB,
    calcadaVeia,
    calcadaVeiaB,
    caminhoTerra,
    pilarPulso,
    arcoDesperto,
    arcoSemente,
    pedraMural,
  ] = await Promise.all([
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
    loadSheet('oficina.png', 16, 16, 1),
    loadSheet('portal_2frames.png', 16, 16, 2),
    loadSheet('laje_praca.png', 16, 16, 1),
    loadSheet('laje_praca_b.png', 16, 16, 1),
    loadSheet('calcada_veia.png', 16, 16, 1),
    loadSheet('calcada_veia_b.png', 16, 16, 1),
    loadSheet('caminho_terra.png', 16, 16, 1),
    loadSheet('pilar_pulso_4frames.png', 16, 16, 4),
    loadSheet('arco_desperto.png', 16, 16, 1),
    loadSheet('arco_semente.png', 16, 16, 1),
    loadSheet('pedra_mural.png', 16, 16, 1),
  ]);
  return {
    campina1,
    campina2,
    campina3,
    campinaFlores,
    floresta,
    ruina,
    agua,
    margemAgua,
    margemAguaB,
    nucleo,
    no_avatar,
    nativoGota,
    nativoRaiz,
    nativoCinza,
    oficina,
    portal,
    lajePraca,
    lajePracaB,
    calcadaVeia,
    calcadaVeiaB,
    caminhoTerra,
    pilarPulso,
    arcoDesperto,
    arcoSemente,
    pedraMural,
  };
}
