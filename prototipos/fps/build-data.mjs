// Gera data.js: mundo compacto + sprites base64 para a demo raycaster.
import fs from 'node:fs';

const ROOT = new URL('../..', import.meta.url).pathname;
const w = JSON.parse(fs.readFileSync(`${ROOT}/world/heart.json`, 'utf8'));

// biome -> 1 char
const CODE = { meadow: 'm', forest: 'f', water: 'w', ruins: 'r', core: 'c' };
let tiles = '';
for (const t of w.tiles) tiles += CODE[t.biome];

const spriteDir = `${ROOT}/site/public/assets/sprites`;
const want = {
  floresta: 'floresta.png',
  ruina: 'ruina.png',
  nucleo: 'nucleo_pulse_4frames.png',
  campina1: 'campina_1.png',
  campina2: 'campina_2.png',
  campinaFlores: 'campina_flores.png',
  agua: 'agua_ondula_2frames.png',
  caminho: 'caminho_terra.png',
  oficina: 'oficina.png',
  gota: 'nativo_gota.png',
  raiz: 'nativo_raiz.png',
  cinza: 'nativo_cinza.png',
  avatar: 'no_avatar.png',
  portal: 'portal_2frames.png',
};
const sprites = {};
for (const [k, f] of Object.entries(want)) {
  sprites[k] = 'data:image/png;base64,' + fs.readFileSync(`${spriteDir}/${f}`).toString('base64');
}

const data = {
  width: w.width,
  height: w.height,
  tiles,
  tick: w.meta.tickCount,
  machines: Object.fromEntries(Object.entries(w.machines ?? {}).map(([k, v]) => [k, v.position])),
  natives: Object.fromEntries(Object.entries(w.natives ?? {}).map(([k, v]) => [k, v.position])),
  players: Object.fromEntries(Object.entries(w.players ?? {}).map(([k, v]) => [k, v.position])),
};

/* o cabeçalho vai junto: regenerar não pode apagar o resumo que o MAPA lê */
const CABECALHO = '/* data.js — snapshot do mundo pro dev local do v2: abre nos-fps.html direto do disco sem build (no Pages, o build-fps inline os dados no lugar da tag). */';
fs.writeFileSync(
  new URL('data.js', import.meta.url).pathname,
  `${CABECALHO}\nconst NOS_DATA = ${JSON.stringify(data)};\nconst NOS_SPRITES = ${JSON.stringify(sprites)};\n`,
);
console.log('ok — tiles', tiles.length, 'sprites', Object.keys(sprites).length,
  Math.round(fs.statSync(new URL('data.js', import.meta.url).pathname).size / 1024) + 'KB');
