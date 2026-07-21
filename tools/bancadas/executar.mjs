#!/usr/bin/env node
/* executar.mjs — a bancada do REPLAY da OFICINA (passo 1), sem browser. Roda a
   lista de PASSOS de uma peça, serializa a lista, re-parseia e re-executa, e
   afirma que o NEUTRO saiu IDÊNTICO — mesmos ids, mesmas posições, mesmas faces.
   O replay é o coração de tudo (doc): "quando o arquivo de passos refizer o
   objeto igual, o resto é trabalho conhecido". Também prova, no mesmo neutro,
   que a mescla sumiu com `de` e manteve `para`, e imprime a colisão calculada.
     node tools/bancadas/executar.mjs                 # peça _oficina-toco
     node tools/bancadas/executar.mjs _oficina-toco   # outra peça-objeto */
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const nome = (process.argv.slice(2).find((a) => !a.startsWith('--')) || '_oficina-toco').replace(/[^a-z0-9_-]/gi, '');

const { nucleo, neutroCanonico, colisaoDe } = await import(pathToFileURL(join(REPO, 'prototipos/fps/v3/motor/oficina.js')).href);
const peca = await import(pathToFileURL(join(REPO, 'prototipos/fps/v3/pecas', `${nome}.js`)).href);
const { PASSOS, PARAMS = {}, TOPO = {} } = peca;
if (!Array.isArray(PASSOS)) { console.error(`peça ${nome} não exporta PASSOS (é uma peça-objeto da Oficina?)`); process.exit(2); }

/* 1 · executa */
const n1 = neutroCanonico(nucleo(PASSOS, PARAMS, TOPO));

/* 2 · serializa os PASSOS (o que o arquivo salva), re-parseia, re-executa */
const PASSOS2 = JSON.parse(JSON.stringify(PASSOS));
const n2 = neutroCanonico(nucleo(PASSOS2, JSON.parse(JSON.stringify(PARAMS)), JSON.parse(JSON.stringify(TOPO))));

/* 3 · afirma neutro IDÊNTICO */
const s1 = JSON.stringify(n1), s2 = JSON.stringify(n2);
let falhas = 0;
function ok(cond, msg, extra) { if (cond) { console.log(`  ✓ ${msg}`); } else { falhas++; console.log(`  ✗ ${msg}${extra ? `\n      ${extra}` : ''}`); } }

console.log(`bancada executar — peça "${nome}" (${PASSOS.length} passos, lados=${TOPO.lados ?? '—'})`);
console.log(`  vértices=${n1.V.length}  faces=${n1.F.length}  órfãos=${n1.orfaos.length}  mesclas=${n1.merges.length}`);

/* diagnóstico útil quando quebra: primeira diferença */
let diff = '';
if (s1 !== s2) {
  const va = JSON.stringify(n1.V), vb = JSON.stringify(n2.V);
  const fa = JSON.stringify(n1.F), fb = JSON.stringify(n2.F);
  diff = va !== vb ? 'vértices divergem' : fa !== fb ? 'faces divergem' : 'órfãos/mesclas divergem';
}
ok(s1 === s2, 'replay: serializar -> re-parsear -> re-executar dá o NEUTRO idêntico', diff);

/* o neutro não pode estar vazio (peça degenerada passaria calada) */
ok(n1.V.length >= 4 && n1.F.length >= 4, `neutro não-trivial (${n1.V.length} vértices, ${n1.F.length} faces)`);

/* a mescla realmente sumiu com `de` e manteve `para` */
if (n1.merges.length) {
  const vivos = new Set(n1.V.map((r) => r[0]));
  const m = n1.merges[0];
  ok(m.de.every((d) => !vivos.has(d)), `mescla: origem ${JSON.stringify(m.de)} sumiu do neutro`);
  ok(vivos.has(m.para), `mescla: destino ${m.para} continua vivo`);
  ok(n1.F.every(([, vs]) => !vs.some((v) => m.de.includes(v))), 'mescla: nenhuma face aponta mais pra um id mesclado');
}

/* órfão grita, não corrompe: se houver órfão, ainda assim há malha */
ok(n1.orfaos.length === 0, `sem órfãos na peça shipável (grita ${n1.orfaos.length})`, n1.orfaos.length ? JSON.stringify(n1.orfaos) : '');

const col = colisaoDe(PASSOS, PARAMS, TOPO);
console.log(`  colisão: forma=${col.forma} raio=${col.raio.toFixed(4)} altura=${col.altura.toFixed(4)} base=${col.base.toFixed(4)}`);

console.log(falhas ? `\nexecutar: ${falhas} falha(s)` : '\nexecutar: replay PROVADO, tudo idêntico');
process.exit(falhas ? 1 : 0);
