#!/usr/bin/env node
/**
 * scripts/build-fps.mjs
 *
 * Publishes the first-person prototype (prototipos/fps/) as an official
 * Pages route: reads the repo's canonical world state (world/heart.json)
 * and sprite atlas (assets/sprites/), compacts them into the NOS_DATA /
 * NOS_SPRITES payload the raycaster expects, inlines that payload into
 * prototipos/fps/nos-fps.html and writes the self-contained result to
 * site/public/fps/index.html — Vite then ships it verbatim in dist/.
 *
 * Deploy trigger (measured 2026-07-17): pages.yml fires on push to
 * site/**, world/**, assets/** or engine/types.ts. TWO gaps stop a
 * FPS-only change (prototipos/fps/**) from reaching /fps/ on its own:
 *   1) prototipos/fps/** is NOT in the trigger paths; and
 *   2) the tick's world/** commits are made by github-actions[bot]
 *      (GITHUB_TOKEN), and by GitHub design a GITHUB_TOKEN push does NOT
 *      start another workflow — so batidas alone never redeploy Pages.
 * Net effect: a raycaster change only ships when a HUMAN push touches one
 * of the trigger paths (e.g. editing this file). Permanent fix is adding
 * 'prototipos/fps/**' to pages.yml — needs the ideador (workflow edits are
 * gated for the coder session). Until then: touch site/** to publish.
 * Published rounds: D-36/37/38 (2026-07-17), D-39, D-40 (som), D-41, D-42 (brasa), D-44 (?res=), D-45 (render em camadas + stutter dos billboards — this touch).
 *
 * prototipos/fps/nos-fps.html stays the single source of truth for the
 * prototype; site/public/fps/ is pure build output, regenerated before
 * every dev/build run and never committed (see site/.gitignore).
 *
 * No dependencies — Node built-ins only, mirroring scripts/copy-data.mjs.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SITE_ROOT, '..');

const world = JSON.parse(readFileSync(path.join(REPO_ROOT, 'world', 'heart.json'), 'utf8'));

// biome -> 1 char (must match the decoder table in nos-fps.html)
const CODE = { meadow: 'm', forest: 'f', water: 'w', ruins: 'r', core: 'c' };
let tiles = '';
for (const t of world.tiles) {
  const c = CODE[t.biome];
  if (!c) throw new Error(`build-fps: bioma sem código: ${t.biome}`);
  tiles += c;
}

const spriteDir = path.join(REPO_ROOT, 'assets', 'sprites');
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
  brasa: 'nativo_brasa.png',
  portal: 'portal_2frames.png',
};
const sprites = {};
for (const [key, file] of Object.entries(want)) {
  sprites[key] = `data:image/png;base64,${readFileSync(path.join(spriteDir, file)).toString('base64')}`;
}

const positionsOf = (record) =>
  Object.fromEntries(Object.entries(record ?? {}).map(([k, v]) => [k, v.position]));

const data = {
  width: world.width,
  height: world.height,
  tiles,
  tick: world.meta.tickCount,
  machines: positionsOf(world.machines),
  natives: positionsOf(world.natives),
  players: positionsOf(world.players),
};

/* GI assada (D-36): o path tracer offline (prototipos/fps/bake/) escreve as
   3 grades de luz num PNG; se o artefato não existir (checkout fresco, CI),
   assa aqui mesmo — segundos, determinístico. Falhou? Publica sem GI: o
   cliente degrada sozinho (typeof NOS_GI). */
const giPng = path.join(REPO_ROOT, 'prototipos', 'fps', 'bake', 'out', 'gi.png');
if (!existsSync(giPng)) {
  const r = spawnSync('node', [path.join(REPO_ROOT, 'prototipos', 'fps', 'bake', 'bake-gi.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) console.warn('build-fps: bake-gi falhou — publicando sem GI');
}
const gi = existsSync(giPng) ? `data:image/png;base64,${readFileSync(giPng).toString('base64')}` : null;

/* mundos conectados (D-37): o Portal do Átrio mostra o registro de portais
   no próprio FPS — só os campos que o painel usa. */
const registry = JSON.parse(readFileSync(path.join(REPO_ROOT, 'worlds', 'registry.json'), 'utf8'));
const worlds = registry.map(({ id, name, status, descriptionPtBR }) => ({ id, name, status, descriptionPtBR }));

const html = readFileSync(path.join(REPO_ROOT, 'prototipos', 'fps', 'nos-fps.html'), 'utf8');
const DATA_TAG = '<script src="data.js"></script>';
if (!html.includes(DATA_TAG)) {
  throw new Error('build-fps: tag <script src="data.js"> não encontrada em prototipos/fps/nos-fps.html');
}
const inline = `<script>const NOS_DATA = ${JSON.stringify(data)};\nconst NOS_SPRITES = ${JSON.stringify(sprites)};\nconst NOS_GI = ${JSON.stringify(gi)};\nconst NOS_WORLDS = ${JSON.stringify(worlds)};</script>`;
const out = html.replace(DATA_TAG, inline);

const outDir = path.join(SITE_ROOT, 'public', 'fps');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'index.html');
writeFileSync(outFile, out);
console.log(
  `build-fps: batida #${data.tick} -> site/public/fps/index.html (${Math.round(statSync(outFile).size / 1024)}KB)`,
);
