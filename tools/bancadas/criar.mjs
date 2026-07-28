#!/usr/bin/env node
/**
 * criar.mjs — P7 do playground (D-120): A CAMADA IA, laço único.
 *
 * Recebe uma peça e devolve NUM COMANDO: estado como dado (vértices/faces/
 * caixa/colisão, direto do núcleo — sem browser), o manifesto de capacidades
 * (as ops que EXISTEM de verdade, de `Object.keys(OPS)` — nunca hand-copiado,
 * cruzado contra a doc), os renders (3 ângulos texturizados + 3 geo=normais —
 * a evidência forçada) e os GATES (auditar + porteiro + gabarito, se houver
 * referência) resumidos num VEREDITO AGREGADO. Fecha o "83%": nenhum destes
 * passos fica de fora por esquecimento — um comando só cobre todos.
 *
 *   node tools/bancadas/criar.mjs _viga
 *   node tools/bancadas/criar.mjs _viga --res=1200
 *
 * Exit 0 = APROVADO, exit 1 = REPROVADO (algum gate obrigatório falhou).
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirPeca, pixels } from './bench/sandbox.mjs';
import { decodePng, pngStats } from './bench/pngstats.mjs';
import { mascaraParaPng, sobreposicaoParaPng } from './bench/pngwrite.mjs';
import { extrairSilhueta, rasterizarContorno, validarContorno, iou, areaMascara, LIMIAR_IOU } from './bench/gabarito-nucleo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = join(HERE, 'out');
const PECAS = join(REPO, 'prototipos/fps/v3/pecas');
const GABARITOS = join(REPO, 'prototipos/fps/v3/gabaritos');
const SKILL = join(REPO, '.claude/skills/criar-peca/SKILL.md');
const OFICINA_DOC = join(REPO, 'docs/oficina.md');

const args = process.argv.slice(2);
const nome = (args.find((a) => !a.startsWith('--')) || '').replace(/[^a-z0-9_-]/gi, '');
const res = /^--res=(\d+)$/.exec(args.find((a) => a.startsWith('--res=')) || '')?.[1] || '900';
if (!nome) { console.error('uso: node tools/bancadas/criar.mjs <peça> [--res=N]'); process.exit(2); }
if (!existsSync(join(PECAS, `${nome}.js`))) { console.error(`peça desconhecida: ${nome} (veja prototipos/fps/v3/pecas/)`); process.exit(2); }

const linhas = [];
const log = (s = '') => { linhas.push(s); console.log(s); };
let reprovado = false;
const falha = (motivo) => { reprovado = true; log(`  ✗ ${motivo}`); };
const ok = (motivo) => log(`  ✓ ${motivo}`);

log(`═══ criar — ${nome} ═══`);

/* 1 · ESTADO COMO DADO (headless, direto do núcleo — sem browser) */
log('\n── estado (núcleo) ──');
const { nucleo, neutroCanonico, colisaoDe, OPS } = await import(pathToFileURL(join(REPO, 'prototipos/fps/v3/motor/oficina.js')).href);
const mod = await import(pathToFileURL(join(PECAS, `${nome}.js`)).href);
const temPassos = Array.isArray(mod.PASSOS);
if (temPassos) {
  try {
    const n = neutroCanonico(nucleo(mod.PASSOS, mod.PARAMS ?? {}, mod.TOPO ?? {}, mod.MATERIAIS ?? {}, mod.ESQUELETO ?? null));
    // linha de V é [id, x, y, z, ...] (achatada — ver o comentário de neutroCanonico), não [id,[x,y,z]]
    const xs = n.V.map((v) => v[1]), ys = n.V.map((v) => v[2]), zs = n.V.map((v) => v[3]);
    const caixa = n.V.length ? { min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] } : null;
    log(`  vértices=${n.V.length}  faces=${n.F.length}  passos=${mod.PASSOS.length}`);
    if (caixa) log(`  caixa: [${caixa.min.map((v) => v.toFixed(3))}] .. [${caixa.max.map((v) => v.toFixed(3))}]`);
    const col = colisaoDe(mod.PASSOS, mod.PARAMS ?? {}, mod.TOPO ?? {}, mod.MATERIAIS ?? {});
    log(`  colisão: forma=${col.forma} raio=${col.raio.toFixed(4)} altura=${col.altura.toFixed(4)} base=${col.base.toFixed(4)}`);
    if (n.orfaos.length === 0) ok('sem órfãos (grita 0)'); else falha(`${n.orfaos.length} órfão(s): ${JSON.stringify(n.orfaos).slice(0, 200)}`);
  } catch (e) { falha(`núcleo lançou: ${e.message}`); }
} else {
  log('  peça JS-pura (sem PASSOS/PARAMS/TOPO exportado) — sem estado de núcleo pra inspecionar, só os gates abaixo');
}

/* 2 · MANIFESTO DE CAPACIDADES — Object.keys(OPS), nunca hand-copiado; cruza contra a skill */
log('\n── manifesto (núcleo x doc) ──');
const opsNucleo = new Set(Object.keys(OPS));
log(`  ${opsNucleo.size} ops implementadas: ${[...opsNucleo].join(', ')}`);
const opsDoc = new Set();
{
  const texto = readFileSync(SKILL, 'utf8').split('\n');
  let dentro = false;
  for (const linha of texto) {
    if (linha.startsWith('| op | args | nota |')) { dentro = true; continue; }
    if (!dentro) continue;
    if (!linha.startsWith('|')) break;
    if (linha.startsWith('|---')) continue;
    const primeiraCelula = linha.split('|')[1] || '';
    for (const m of primeiraCelula.matchAll(/`([a-zA-Z]+)`/g)) opsDoc.add(m[1]);
  }
}
const semDoc = [...opsNucleo].filter((o) => !opsDoc.has(o));
const semOp = [...opsDoc].filter((o) => !opsNucleo.has(o));
if (semDoc.length === 0 && semOp.length === 0) ok('vocabulário da skill criar-peca em dia com o núcleo');
else {
  if (semDoc.length) falha(`op(s) no núcleo SEM doc na skill: ${semDoc.join(', ')}`);
  if (semOp.length) falha(`skill documenta op que NÃO existe (ou não é mais) no núcleo: ${semOp.join(', ')}`);
}

/* 2b · manifesto x docs/oficina.md (Rodada 3, D-120 estendido): a "Lista de
   operações" tem uma coluna Status (FEITO|ROTEIRO), marcação estruturada —
   não a prosa livre da Observação, que cita "FEITO" e "NÃO existe" sem
   formato fixo. Regra: toda linha FEITO tem que existir em OPS; toda chave de
   OPS tem que ter uma linha FEITO; linha ROTEIRO cuja op JÁ existe em OPS é
   ACHADO (roteiro construído, doc não atualizado) — reportado como falha. */
log('\n── manifesto (núcleo x docs/oficina.md) ──');
{
  const feitoOficina = new Set();
  const roteiroOficina = new Set();
  const texto = readFileSync(OFICINA_DOC, 'utf8').split('\n');
  let dentro = false;
  for (const linha of texto) {
    if (linha.startsWith('| Status | Operação |')) { dentro = true; continue; }
    if (!dentro) continue;
    if (!linha.startsWith('|')) break;
    if (linha.startsWith('|---')) continue;
    const celulas = linha.split('|');
    const status = (celulas[1] || '').trim();
    const celulaOp = celulas[2] || '';
    const nomes = [...celulaOp.matchAll(/`([a-zA-Z]+)`/g)].map((m) => m[1]);
    if (status === 'FEITO') for (const n of nomes) feitoOficina.add(n);
    else if (status === 'ROTEIRO') for (const n of nomes) roteiroOficina.add(n);
    else falha(`docs/oficina.md: linha de op com Status inesperado (${JSON.stringify(status)}): ${nomes.join(', ') || '(sem op)'}`);
  }
  const opsSemFeito = [...opsNucleo].filter((o) => !feitoOficina.has(o));
  const feitoSemOp = [...feitoOficina].filter((o) => !opsNucleo.has(o));
  const roteiroJaConstruido = [...roteiroOficina].filter((o) => opsNucleo.has(o));
  if (opsSemFeito.length === 0 && feitoSemOp.length === 0 && roteiroJaConstruido.length === 0) {
    ok('tabela de operações do oficina.md em dia com o núcleo');
  } else {
    if (opsSemFeito.length) falha(`op(s) no núcleo SEM linha FEITO em docs/oficina.md: ${opsSemFeito.join(', ')}`);
    if (feitoSemOp.length) falha(`docs/oficina.md marca FEITO uma op que NÃO existe no núcleo: ${feitoSemOp.join(', ')}`);
    if (roteiroJaConstruido.length) falha(`docs/oficina.md marca ROTEIRO op(s) que JÁ existem no núcleo (achado — roteiro construído, doc desatualizado): ${roteiroJaConstruido.join(', ')}`);
  }
}

/* 3 · AUDITAR (headless — os críticos de senso crítico [cpu]) */
log('\n── auditar (crítico [cpu]) ──');
{
  const { built, meta: metaAud, erro } = await construirPeca(nome);
  if (erro) falha(`construir() lançou: ${erro.message}`);
  else {
    const tools = [];
    for (const fn of readdirSync(join(HERE, 'bench/tools')).filter((f) => f.endsWith('.mjs'))) {
      const m = await import(pathToFileURL(join(HERE, 'bench/tools', fn)));
      if (m.analisar && m.dom) tools.push({ id: m.id || fn, analisar: m.analisar });
    }
    let total = 0;
    for (const t of tools) {
      // D-128: `meta` no ctx — o crítico de simetria é OPT-IN por `meta.simetria`
      let fnd = []; try { fnd = t.analisar(built, { pixels, meta: metaAud }) || []; } catch (e) { fnd = [{ sev: 'erro', msg: 'ferramenta quebrou: ' + e.message }]; }
      if (fnd.length) { total += fnd.length; falha(`${t.id}: ${fnd.map((x) => `[${x.sev}] ${x.msg}`).join(' | ')}`); }
    }
    if (total === 0) ok(`limpo nos ${tools.length} críticos`);
  }
}

/* 4 · BROWSER (uma vez só) — porteiro, renders (evidência), gabarito */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res2) => {
  const p = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res2.writeHead(404); res2.end(); return; }
  res2.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res2.end(readFileSync(p));
});
await new Promise((ok2) => server.listen(0, '127.0.0.1', ok2));
const base = `http://127.0.0.1:${server.address().port}/prototipos/fps/v3/visor.html`;
const PW = join(REPO, 'node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('Playwright não encontrado. Rode: npm ci (na raiz)'); process.exit(2); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const RES = parseInt(res, 10), VW = Math.max(900, RES), VH = Math.round(VW * 9 / 16);
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const errosPagina = [];
page.on('pageerror', (e) => errosPagina.push(e.message));
mkdirSync(OUT, { recursive: true });
const gabaritoPath = join(GABARITOS, `${nome}.js`);   // declarado fora do try abaixo: o veredito final (depois do finally) também lê

async function screenshot(peca, angulo, extra = '') {
  await page.goto(`${base}?peca=${peca}&res=${res}&ts=4&a=${angulo}${extra}`, { waitUntil: 'load' });
  await page.waitForTimeout(1300);
  const ready = await page.evaluate(() => window.__ready === true);
  const buf = await page.screenshot();
  return { ready, buf };
}

try {

/* 4a · porteiro (a checagem de render — reusa a 1ª navegação) */
log('\n── porteiro (render) ──');
const primeira = await screenshot(nome, '38');
if (!primeira.ready) falha('window.__ready ≠ true (peça não abriu)');
try {
  const s = pngStats(primeira.buf);
  if (s.cores < 4 || s.fracDominante > 0.985 || s.lumaRange < 6) falha(`frame degenerado (cores=${s.cores}, dominante=${(s.fracDominante * 100) | 0}%, luma=${s.lumaRange})`);
  else ok(`frame são (cores=${s.cores}, dominante=${(s.fracDominante * 100) | 0}%, luma=${s.lumaRange})`);
} catch (e) { falha('frame ilegível: ' + e.message); }
if (errosPagina.length) falha(`${errosPagina.length} erro(s) de página: ${errosPagina.slice(0, 2).join(' ; ')}`);

/* 4b · renders — a EVIDÊNCIA forçada (3 ângulos texturizados + 3 geo=normais) */
log('\n── renders (evidência — LEIA os PNGs) ──');
const ANGULOS = ['38', '0', '90'];
writeFileSync(join(OUT, `criar-${nome}-38.png`), primeira.buf);   // já screenshotada pro porteiro, reusa
log(`  ${join(OUT, `criar-${nome}-38.png`)}`);
for (const a of ANGULOS.slice(1)) {
  const r = await screenshot(nome, a);
  writeFileSync(join(OUT, `criar-${nome}-${a}.png`), r.buf);
  log(`  ${join(OUT, `criar-${nome}-${a}.png`)}`);
}
for (const a of ANGULOS) {
  const r = await screenshot(nome, a, '&debug=normais');
  writeFileSync(join(OUT, `criar-${nome}-normais-${a}.png`), r.buf);
  log(`  ${join(OUT, `criar-${nome}-normais-${a}.png`)}`);
}

/* 4c · gabarito (SÓ se existir referência — opcional, mas se existir é obrigatório passar) */
log('\n── gabarito (IoU) ──');
if (!existsSync(gabaritoPath)) {
  log('  sem gabarito (prototipos/fps/v3/gabaritos/) — forma NÃO verificada numericamente; não é reprovação, mas também não é "aprovado" nesse eixo');
} else {
  try {
    const { CONTORNOS } = await import(pathToFileURL(gabaritoPath).href);
    const angulos = Object.keys(CONTORNOS ?? {});
    if (!angulos.length) throw new Error('CONTORNOS vazio');
    let piorIou = Infinity;
    for (const angulo of angulos) {
      const contorno = validarContorno(CONTORNOS[angulo], `CONTORNOS['${angulo}']`);
      const fundoR = await screenshot('_vazio', angulo);
      const objR = await screenshot(nome, angulo);
      if (!fundoR.ready || !objR.ready) { falha(`gabarito @${angulo}°: peça ou fundo não abriram`); piorIou = 0; continue; }
      const sil = extrairSilhueta(decodePng(fundoR.buf), decodePng(objR.buf));
      if (areaMascara(sil) === 0) { falha(`gabarito @${angulo}°: silhueta vazia`); piorIou = 0; continue; }
      const ref = rasterizarContorno(contorno, sil.W, sil.H);
      const pontuacao = iou(sil, ref);
      piorIou = Math.min(piorIou, pontuacao);
      const passouAngulo = pontuacao >= LIMIAR_IOU;
      const evidPath = join(OUT, `criar-${nome}-gabarito-${angulo}`);
      writeFileSync(`${evidPath}-sobreposicao.png`, sobreposicaoParaPng(sil, ref));
      log(`  ${passouAngulo ? '✓' : '✗'} @${angulo}°: IoU=${pontuacao.toFixed(3)} (limiar ${LIMIAR_IOU}) — ${evidPath}-sobreposicao.png`);
      if (!passouAngulo) reprovado = true;
    }
    if (Number.isFinite(piorIou) && piorIou >= LIMIAR_IOU) ok(`forma verificada — pior IoU ${piorIou.toFixed(3)}`);
  } catch (e) { falha(`gabarito malformado ou falhou: ${e.message}`); }
}

} catch (e) {
  falha(`bancada de render quebrou no meio: ${e.message}`);
} finally {
  await browser.close(); server.close();
}

/* 5 · VEREDITO AGREGADO */
log(`\n═══ ${reprovado ? 'REPROVADO ✗' : 'APROVADO ✓'} — ${nome} ═══`);
if (!existsSync(gabaritoPath)) log('  (sem gabarito: a forma não tem número — "aprovado" aqui é núcleo+auditar+porteiro, não silhueta)');
process.exit(reprovado ? 1 : 0);
