#!/usr/bin/env node
'use strict';
/**
 * Scene-cohesion tool for A Cidade (R7, docs/CITY_PLAN.md) - the city-scale
 * sibling of map-mock.cjs: instead of a hand-typed 8x8 grid, it renders
 * REGIONS OF A REAL WORLD FILE (biomes + Tile.deco + machines + natives +
 * players), mirroring site/src/renderer.ts's draw rules tile for tile -
 * same hashTile mixing, same variant salts, same rim overlays, same
 * "flagstone base under standing objects" rule - so composition can be
 * judged (and screenshotted into site/qa/city/) before/without a browser.
 *
 * Usage:
 *   node assets/tools/city-mock.cjs [worldJsonPath] [outDir]
 *
 * Defaults: world/heart.json (which carries deco once the live migration
 * has run; pre-merge, pass a migrated COPY produced via seedCityLayout) and
 * site/qa/city/. Emits one PNG per preset scene, at 4x.
 */

const fs = require('fs');
const path = require('path');
const { loadPalette, matrixToCanvas, scaleNearest, createCanvas, compositeOver, savePNG } = require('./lib/canvas.cjs');
const { loadSpriteSrc } = require('./lib/spritesrc.cjs');
const { ASSETS, SRC_DIR } = require('./render.cjs');

const TILE = 16;
const SCALE = 4;

/**
 * Same bit-mixing hash as site/src/hash.ts's hashTile - kept in sync BY
 * VALUE (the renderer's variant picks must match this tool's, or the mock
 * lies about what the site will show). If you change one, change both.
 */
function hashTile(x, y, salt = 0) {
  let h = Math.imul(x, 0x1f1f1f1f) ^ Math.imul(y, 0x2545f491) ^ Math.imul(salt, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

const FLOWER_CHANCE = 0.1;

/** Presets: the city's districts + a whole-map overview (CITY_PLAN zoning). */
const SCENES = [
  { name: 'city-praca', x0: 21, y0: 25, x1: 41, y1: 41 },
  { name: 'city-salao', x0: 48, y0: 27, x1: 63, y1: 43 },
  { name: 'city-overview', x0: 0, y0: 0, x1: 63, y1: 63, scale: 2 },
];

/** O Coração's living portal tile - client-side marker (engine/mapgen.ts's SALAO_PORTAL_TILE; the mock mirrors it like the site does). */
const PORTAL_TILE = { x: 57, y: 34 };

function mirrorH(canvas) {
  const out = createCanvas(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const j = (y * canvas.width + (canvas.width - 1 - x)) * 4;
      out.data[j] = canvas.data[i];
      out.data[j + 1] = canvas.data[i + 1];
      out.data[j + 2] = canvas.data[i + 2];
      out.data[j + 3] = canvas.data[i + 3];
    }
  }
  return out;
}

function build(worldPath, outDir) {
  const palette = loadPalette(path.join(ASSETS, 'palette.json'));
  const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  const frames = (name) => loadSpriteSrc(path.join(SRC_DIR, `${name}.json`)).frames.map((f) => matrixToCanvas(f.pixels, palette));
  const one = (name) => frames(name)[0];

  const campina = [one('campina_1'), one('campina_2'), one('campina_3')];
  const campinaFlores = one('campina_flores');
  const floresta = one('floresta');
  const ruina = one('ruina');
  const agua = frames('agua_ondula_2frames')[0];
  const margem = frames('margem_agua_4dir');
  const margemB = frames('margem_agua_4dir_b');
  const nucleo = frames('nucleo_pulse_4frames')[2]; // peak - hero shot
  const laje = [one('laje_praca'), one('laje_praca_b')];
  const calcada = one('calcada_veia');
  const calcadaVeia = one('calcada_veia_b');
  const caminho = one('caminho_terra');
  const pilar = frames('pilar_pulso_4frames')[2]; // peak, in sync with the nucleo frame above
  const arco = one('arco_desperto');
  const arcoSemente = one('arco_semente');
  const pedraMural = one('pedra_mural');
  const oficina = one('oficina');
  const portal = frames('portal_2frames')[0];
  const avatar = one('no_avatar');
  const nativos = { gota: one('nativo_gota'), raiz: one('nativo_raiz'), cinza: one('nativo_cinza') };

  const tileAt = (x, y) => world.tiles[y * world.width + x];
  const isWater = (x, y) => x >= 0 && y >= 0 && x < world.width && y < world.height && tileAt(x, y).biome === 'water';

  const meadowCanvas = (x, y) => {
    if (hashTile(x, y, 1) % 1000 < FLOWER_CHANCE * 1000) return campinaFlores;
    return campina[hashTile(x, y, 2) % 3];
  };
  const lajeCanvas = (x, y) => laje[hashTile(x, y, 5) % 2];
  const pavementCanvas = (x, y) => (hashTile(x, y, 6) % 3 === 0 ? calcadaVeia : calcada);

  // Mirrored-rim variants precomputed (drawMeadowRim's per-tile flip).
  const margemFlip = margem.map(mirrorH);
  const margemBFlip = margemB.map(mirrorH);

  for (const scene of SCENES) {
    const scale = scene.scale ?? SCALE;
    const w = (scene.x1 - scene.x0 + 1) * TILE;
    const h = (scene.y1 - scene.y0 + 1) * TILE;
    const map = createCanvas(w, h);

    // Pass 1: ground (biome + rim + ground deco + flagstone base under objects).
    for (let y = scene.y0; y <= scene.y1; y++) {
      for (let x = scene.x0; x <= scene.x1; x++) {
        const tile = tileAt(x, y);
        const px = (x - scene.x0) * TILE;
        const py = (y - scene.y0) * TILE;
        switch (tile.biome) {
          case 'meadow':
          case 'core': {
            compositeOver(map, meadowCanvas(x, y), px, py);
            // drawMeadowRim: one strip per cardinal water neighbour, variant+flip hashed.
            const sheet = hashTile(x, y, 3) % 2 === 0 ? margem : margemB;
            const sheetF = hashTile(x, y, 3) % 2 === 0 ? margemFlip : margemBFlip;
            const flip = hashTile(x, y, 4) % 2 === 0;
            const pick = flip ? sheetF : sheet;
            if (tile.biome === 'meadow') {
              if (isWater(x, y + 1)) compositeOver(map, pick[0], px, py);
              if (isWater(x - 1, y)) compositeOver(map, pick[1], px, py);
              if (isWater(x, y - 1)) compositeOver(map, pick[2], px, py);
              if (isWater(x + 1, y)) compositeOver(map, pick[3], px, py);
            }
            break;
          }
          case 'forest':
            compositeOver(map, floresta, px, py);
            break;
          case 'ruins':
            compositeOver(map, ruina, px, py);
            break;
          case 'water':
            compositeOver(map, agua, px, py);
            break;
        }
        switch (tile.deco) {
          case 'plaza':
            compositeOver(map, lajeCanvas(x, y), px, py);
            break;
          case 'pavement':
            compositeOver(map, pavementCanvas(x, y), px, py);
            break;
          case 'trail':
            compositeOver(map, caminho, px, py);
            break;
          case 'pylon':
          case 'arch':
          case 'mural_stone':
            compositeOver(map, lajeCanvas(x, y), px, py); // flagstone base under city objects
            break;
          case 'arch_dormant':
            // Deliberately NO flagstone base: dormant seeds stand on bare
            // meadow beyond the pavement's edge (R2-11) - the floor arrives
            // when the world does.
            break;
        }
      }
    }

    // Pass 2: standing deco objects.
    for (let y = scene.y0; y <= scene.y1; y++) {
      for (let x = scene.x0; x <= scene.x1; x++) {
        const deco = tileAt(x, y).deco;
        const px = (x - scene.x0) * TILE;
        const py = (y - scene.y0) * TILE;
        if (deco === 'pylon') compositeOver(map, pilar, px, py);
        else if (deco === 'arch') compositeOver(map, arco, px, py);
        else if (deco === 'arch_dormant') compositeOver(map, arcoSemente, px, py);
        else if (deco === 'mural_stone') compositeOver(map, pedraMural, px, py);
      }
    }

    // Pass 3: the Núcleo (32x32 over its 2x2 footprint), machines, portal, bodies.
    const inScene = (x, y) => x >= scene.x0 && x <= scene.x1 && y >= scene.y0 && y <= scene.y1;
    let coreMin = null;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (tileAt(x, y).biome === 'core' && (coreMin === null || y < coreMin.y || (y === coreMin.y && x < coreMin.x))) {
          coreMin = { x, y };
        }
      }
    }
    if (coreMin && inScene(coreMin.x, coreMin.y)) {
      compositeOver(map, nucleo, (coreMin.x - scene.x0) * TILE, (coreMin.y - scene.y0) * TILE);
    }
    for (const machine of Object.values(world.machines ?? {})) {
      if (inScene(machine.position.x, machine.position.y)) {
        compositeOver(map, oficina, (machine.position.x - scene.x0) * TILE, (machine.position.y - scene.y0) * TILE);
      }
    }
    if (inScene(PORTAL_TILE.x, PORTAL_TILE.y)) {
      compositeOver(map, portal, (PORTAL_TILE.x - scene.x0) * TILE, (PORTAL_TILE.y - scene.y0) * TILE);
    }
    for (const native of Object.values(world.natives ?? {})) {
      const spr = nativos[native.id];
      if (spr && inScene(native.position.x, native.position.y)) {
        compositeOver(map, spr, (native.position.x - scene.x0) * TILE, (native.position.y - scene.y0) * TILE);
      }
    }
    for (const player of Object.values(world.players ?? {})) {
      if (inScene(player.position.x, player.position.y)) {
        compositeOver(map, avatar, (player.position.x - scene.x0) * TILE, (player.position.y - scene.y0) * TILE);
      }
    }

    const outPath = path.join(outDir, `${scene.name}.png`);
    savePNG(outPath, scaleNearest(map, scale));
    console.log(`${scene.name} -> ${outPath} (${w * scale}x${h * scale})`);
  }
}

if (require.main === module) {
  const worldPath = process.argv[2] || path.join(ASSETS, '..', 'world', 'heart.json');
  const outDir = process.argv[3] || path.join(ASSETS, '..', 'site', 'qa', 'city');
  build(worldPath, outDir);
}

module.exports = { build, SCENES };
