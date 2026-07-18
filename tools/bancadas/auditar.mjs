#!/usr/bin/env node
/* auditar.mjs — o GATE de senso crítico [cpu] numa peça REAL (D-60). Roda os
   críticos validados pelo benchmark (lint-de-malha, distancia-paleta, seam,
   banding, órfãos) sobre a peça LIMPA e reporta achados. Offline, em ms.
   Complementa o porteiro (gate de render). Exit≠0 se houver achado.
     node tools/bancadas/auditar.mjs arvore3d
     node tools/bancadas/auditar.mjs            # todas as peças (não-_) */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { construirPeca, pixels } from './bench/sandbox.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PECAS = join(HERE, '../../prototipos/fps/v3/pecas');
let alvos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!alvos.length) alvos = readdirSync(PECAS).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.replace(/\.js$/, ''));

const tools = [];
for (const fn of readdirSync(join(HERE, 'bench/tools')).filter((f) => f.endsWith('.mjs'))) {
  const m = await import(pathToFileURL(join(HERE, 'bench/tools', fn)));
  if (m.analisar && m.dom) tools.push({ id: m.id || fn, analisar: m.analisar });
}
tools.sort((a, b) => a.id.localeCompare(b.id));

let falhas = 0;
for (const nome of alvos) {
  const { built, erro } = await construirPeca(nome);
  if (erro) { falhas++; console.log(`✗ ${nome}: construir lançou — ${erro.message}`); continue; }
  let total = 0; const linhas = [];
  for (const t of tools) {
    let fnd = []; try { fnd = t.analisar(built, { pixels }) || []; } catch (e) { fnd = [{ sev: 'erro', msg: 'ferramenta quebrou: ' + e.message }]; }
    if (fnd.length) { total += fnd.length; linhas.push(`    ⚠ ${t.id}: ${fnd.map((x) => `[${x.sev}] ${x.msg}`).join(' | ')}`); }
  }
  if (total) { falhas++; console.log(`✗ ${nome}: ${total} achado(s)\n${linhas.join('\n')}`); }
  else console.log(`✓ ${nome} — limpo nos ${tools.length} críticos [cpu]`);
}
process.exit(falhas ? 1 : 0);
