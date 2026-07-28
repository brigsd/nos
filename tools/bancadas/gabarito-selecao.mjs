#!/usr/bin/env node
/* gabarito-selecao.mjs — a PROVA ZERO da Fase 3.5 (docs/rumo/PLANO.md): mede,
 * peça por peça, que uma mudança no núcleo (`motor/oficina.js`) não mudou o
 * resultado de NENHUMA peça já shipada. Percorre `prototipos/fps/v3/pecas/*.js`,
 * constrói cada uma (headless, sem browser) e serializa o neutro de forma
 * DETERMINÍSTICA — ids ordenados, número com precisão fixa — pra um hash por
 * peça e um hash total. `--check <arquivo.json>` compara contra o gabarito
 * gravado e sai ≠0 nomeando a peça e o campo na primeira diferença.
 *
 * O gabarito foi gravado com o núcleo de ANTES da Rodada A (Fase 3.5) — vale
 * pra toda rodada da fase: se ele mudar, a mudança não era aditiva.
 *
 *   node tools/bancadas/gabarito-selecao.mjs                 # mede e GRAVA gabarito-selecao.json
 *   node tools/bancadas/gabarito-selecao.mjs --check          # compara contra o gravado (exit≠0 na 1ª diferença)
 *   node tools/bancadas/gabarito-selecao.mjs --check outro.json
 *
 *   npm run gabarito:selecao        # regrava (só depois de confirmar que a mudança é intencional)
 *   npm run gabarito:selecao:check  # a Prova Zero — roda em toda rodada, sempre precisa sair 0
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PECAS = join(REPO, 'prototipos/fps/v3/pecas');

const GABARITO_PADRAO = join(HERE, 'gabarito-selecao.json');
const args = process.argv.slice(2);
const checkPath = (() => { const i = args.indexOf('--check'); return i >= 0 ? (args[i + 1] || GABARITO_PADRAO) : null; })();

const { nucleo, neutroCanonico } = await import(pathToFileURL(join(REPO, 'prototipos/fps/v3/motor/oficina.js')).href);

/* número com precisão fixa: 9 casas decimais, e "-0" normalizado pra "0" —
 * o mesmo epsilon estrutural que o resto do repo usa pra comparar posição
 * (ver docs/uso/oficina-contrato.md, a exceção de transcendental do D-125/128). */
function fixo(n) {
  if (!Number.isFinite(n)) return String(n);
  const f = n.toFixed(9);
  return f === '-0.000000000' ? '0.000000000' : f;
}

/* serializa o neutro canônico de UMA peça de forma determinística — mesma
 * estrutura do neutroCanonico (V ordenado por id, F ordenado por id, cauda
 * opcional de peso/tinta/parte), mas com número em precisão fixa em vez do
 * double cru, pra que a comparação byte-a-byte não dependa de como o JSON
 * serializa ponto flutuante. */
function serializar(neutro) {
  const V = neutro.V.map((row) => {
    const [id, x, y, z, ...cauda] = row;
    return [id, fixo(x), fixo(y), fixo(z), ...cauda.map((c) => JSON.stringify(c))];
  });
  const F = neutro.F.map((row) => {
    const [id, vs, cor, material, liso, solido, ...cauda] = row;
    return [id, vs.slice(), cor, material, liso, solido, ...cauda.map((c) => JSON.stringify(c))];
  });
  return JSON.stringify({ V, F, orfaos: neutro.orfaos, merges: neutro.merges });
}

function hash(texto) { return createHash('sha256').update(texto).digest('hex'); }

const nomes = readdirSync(PECAS).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort();

const resultado = {};
const falhas = [];
for (const nome of nomes) {
  let mod;
  try { mod = await import(pathToFileURL(join(PECAS, `${nome}.js`)).href); }
  catch (e) { falhas.push(`${nome}: falhou ao importar — ${e.message}`); continue; }
  if (!Array.isArray(mod.PASSOS)) continue;   // peça JS-pura (sem envelope da Oficina) — fora do escopo desta prova
  try {
    const neutro = nucleo(mod.PASSOS, mod.PARAMS ?? {}, mod.TOPO ?? {}, mod.MATERIAIS ?? {}, mod.ESQUELETO ?? null);
    if (neutro.orfaos.length) { falhas.push(`${nome}: ${neutro.orfaos.length} órfão(s) na peça shipável — a peça de referência não pode ter órfão`); continue; }
    const texto = serializar(neutroCanonico(neutro));
    resultado[nome] = { hash: hash(texto), vertices: neutro.V.size, faces: neutro.F.size };
  } catch (e) { falhas.push(`${nome}: núcleo lançou — ${e.message}`); }
}

const nomesOrdenados = Object.keys(resultado).sort();
const hashTotal = hash(nomesOrdenados.map((n) => `${n}:${resultado[n].hash}`).join('|'));
const gabarito = { hashTotal, pecas: resultado };

if (falhas.length) {
  console.error(`✗ ${falhas.length} peça(s) não puderam ser medidas:`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(2);
}

if (!checkPath) {
  console.log(`gabarito-selecao — ${nomesOrdenados.length} peça(s) medida(s)`);
  for (const nome of nomesOrdenados) console.log(`  ${nome}: ${resultado[nome].hash.slice(0, 12)} (V=${resultado[nome].vertices} F=${resultado[nome].faces})`);
  console.log(`hash total: ${hashTotal}`);
  writeFileSync(GABARITO_PADRAO, JSON.stringify(gabarito, null, 2) + '\n');
  console.log(`gravado em ${GABARITO_PADRAO}`);
  process.exit(0);
}

let gravado;
try { gravado = JSON.parse(readFileSync(checkPath, 'utf8')); }
catch (e) { console.error(`✗ não consegui ler o gabarito gravado ${checkPath}: ${e.message}`); process.exit(2); }

let diverge = false;
const nomesGravados = Object.keys(gravado.pecas ?? {}).sort();
const todosNomes = [...new Set([...nomesOrdenados, ...nomesGravados])].sort();
for (const nome of todosNomes) {
  const atual = resultado[nome], antigo = gravado.pecas?.[nome];
  if (!antigo) { console.error(`✗ ${nome}: peça NOVA desde o gabarito — não é regressão, mas o gabarito precisa ser regravado (npm run gabarito:selecao)`); diverge = true; continue; }
  if (!atual) { console.error(`✗ ${nome}: peça SUMIU desde o gabarito (existia, não existe mais ou perdeu PASSOS)`); diverge = true; continue; }
  if (atual.hash !== antigo.hash) {
    console.error(`✗ ${nome}: HASH DIVERGE do gabarito — mudança não é aditiva (V=${atual.vertices} vs ${antigo.vertices}, F=${atual.faces} vs ${antigo.faces})`);
    diverge = true;
  }
}
if (diverge) { console.error(`\ngabarito:selecao FALHOU — alguma peça mudou de resultado`); process.exit(1); }
if (gravado.hashTotal !== hashTotal) { console.error(`✗ hash total diverge apesar de cada peça bater (achado impossível — investigar)`); process.exit(1); }

console.log(`✓ gabarito:selecao — ${nomesOrdenados.length} peça(s) byte-idênticas ao gabarito gravado`);
process.exit(0);
