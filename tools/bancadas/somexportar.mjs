#!/usr/bin/env node
/* somexportar.mjs — a bancada do EXPORTAR da ABA SOM (S5a), o análogo sonoro do passo 10
   do 3D. Sobe o `som.html` num Chromium headless (Playwright, gestos REAIS) servido pelo
   servir.mjs REAL, e PROVA, com números, o CORAÇÃO do S5a: "o arquivo reabre o som".
     (1) ROUND-TRIP bit-a-bit: editar um param, serializar o evento atual, gravar num TEMP
         e RE-IMPORTAR em Node dá o `somCanonico` IDÊNTICO ao grafo do editor (página==Node);
     (2) ANATOMIA: a string tem o cabeçalho gerado, os dois imports do núcleo/adaptador,
         PARAMS/semente/PASSOS, o `meta` com a `duracao` como CHAMADA (não o valor), e o
         `construir` — o formato das peças de pecas-som/;
     (3) O CATÁLOGO REABRE: cada um dos 4 presets, carregado pelo editor, serializado e
         re-importado, round-trip idêntico — e igual ao preset ORIGINAL (a peça reabre);
     (4) O BOTÃO grava o arquivo: clicar "Exportar" POSTa /som/salvar e o arquivo GRAVADO em
         pecas-som/ === a string do serializar, e re-importar replica o grafo;
     (5) SEGURANÇA: /som/salvar rejeita ../.., /etc, a/b, .., espaço e símbolo (o `nomeSeguro`
         reusado do /oficina/salvar) sem escrever fora; um GET serve com no-store;
     (6) NEUTRALIZAÇÃO: trocar `String(x)` por `x.toFixed(3)` no serializador faz o round-trip
         DIVERGIR (o teste discrimina o mecanismo certo — arredondar QUEBRA o bit-a-bit);
     (7) FALLBACK: sem a rota (estático puro), o Exportar cai no DOWNLOAD sem quebrar;
     (8) sem regressão: a aba abre sem erro de console, o /oficina/salvar (passo 10) segue
         gravando em pecas/, e a aba Objeto (oficina.html) intacta.
   Relógio congelado (Date.now/Math.random) pro screenshot ser determinístico.
     npm run somexportar
     node tools/bancadas/somexportar.mjs */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, extname, relative, sep as pathSep } from 'node:path';
import { criarServidor } from '../servir.mjs';                                   // o servir.mjs REAL (grava em pecas-som/ via /som/salvar + no-store)
import { serializarEvento } from '../../prototipos/fps/v3/motor/somexport.js';   // o serializador PURO (pro round-trip e a neutralização em Node)
import { somNucleo, somCanonico, duracaoDoGrafo } from '../../prototipos/fps/v3/motor/somnucleo.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const V3 = resolve(REPO, 'prototipos/fps/v3');
const OUT = resolve(REPO, 'scratchpad/som5a');
const VW = 1100, VH = 620;
mkdirSync(OUT, { recursive: true });

/* dirs TEMP: o shim do motor (pro '../motor/*.js' das exports re-importadas resolver o motor
   REAL), o rt (onde as strings viram arquivo e re-importam) e os pecas TEMP onde as rotas de
   salvar gravam — NUNCA o rastreado (pecas/ e pecas-som/ ficam intocados). */
const T_MOTOR = join(OUT, 'motor');   // shim: '../motor/somnucleo.js' + '../motor/somweb.js' das exports TEMP
const T_RT = join(OUT, 'rt');         // round-trip: a string gravada aqui, re-importada em Node
const T_SRV = join(OUT, 'srv');       // pecas-som/ TEMP onde /som/salvar grava (o botão)
const T_OFC = join(OUT, 'ofc');       // pecas/ TEMP onde /oficina/salvar grava (a prova de não-regressão do passo 10)
for (const d of [T_MOTOR, T_RT, T_SRV, T_OFC]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
for (const m of ['somnucleo', 'somweb']) {   // o shim re-exporta o motor REAL pro Node re-importar as exports
  const rel = relative(T_MOTOR, resolve(V3, 'motor', m + '.js')).split(pathSep).join('/');
  writeFileSync(join(T_MOTOR, m + '.js'), `export * from ${JSON.stringify(rel)};\n`);
}
const reimportar = async (dir, conteudo, nomeArq) => {   // grava no TEMP e importa em Node (com o shim do motor ao lado)
  const arq = join(dir, nomeArq + '.js');
  writeFileSync(arq, conteudo);
  return import(pathToFileURL(arq).href + '?v=' + Date.now());
};
const canonDe = (M) => JSON.stringify(somCanonico(somNucleo(M.PASSOS, M.PARAMS, M.semente)));

/* SERVIDOR PRINCIPAL: o servir.mjs REAL, servindo v3 na raiz (então o fetch RELATIVO
   `som/salvar` da página resolve pra /som/salvar), com pecasSom -> T_SRV (o botão grava lá,
   nunca no rastreado). `pecas` fica no default REAL (V3/pecas) só pra SERVIR o toco pra a aba
   Objeto no fim — nunca POSTo /oficina/salvar neste servidor (a prova do passo 10 usa um
   servidor descartável com pecas -> T_OFC). */
const srv = criarServidor({ raiz: V3, pecasSom: T_SRV });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}`;

/* SERVIDOR ESTÁTICO puro (sem as rotas de salvar) pra a prova do FALLBACK: o POST /som/salvar
   cai em 404 e o Exportar baixa o .js em vez de gravar. */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const estatico = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(404); res.end(); return; }   // sem rota POST → o Exportar cai no download
  const p = join(V3, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(V3) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((ok) => estatico.listen(0, '127.0.0.1', ok));
const baseEstatico = `http://127.0.0.1:${estatico.address().port}`;

const PW = join(REPO, 'node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('somexportar: Playwright não encontrado. Rode uma vez: npm ci (na raiz)'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH } });

/* RELÓGIO CONGELADO (padrão das bancadas): Date.now/Math.random fixos, pro screenshot ser
   determinístico. O som é semeado pelo rng do núcleo (Math.random é PROIBIDO lá), então
   congelar Math.random não afeta o determinismo do áudio. */
await page.addInitScript(() => {
  const T = 1700000000000; Date.now = () => T;
  let s = 0x12345678 >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});

const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

let falhas = 0;
const ok = (cond, msg, num) => { console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${msg}${num !== undefined ? ` — ${num}` : ''}`); if (!cond) falhas++; };
const P = {
  canonico: () => page.evaluate(() => window.__som.canonico()),
  serializar: () => page.evaluate(() => window.__som.serializar()),
  recarregar: (n) => page.evaluate((nn) => window.__som.recarregar(nn), n),
  passos: () => page.evaluate(() => window.__som.passos()),
  setParam: (id, k, v) => page.evaluate(([i, kk, vv]) => window.__som.setParam(i, kk, vv), [id, k, v]),
  aguardar: () => page.evaluate(() => window.__som.aguardar()),
  evento: () => page.evaluate(() => window.__som.evento()),
  nomeEvento: () => page.evaluate(() => window.__som.nomeEvento()),
  ultimoDownload: () => page.evaluate(() => window.__som.ultimoDownload()),
};

console.log('\nbancada somexportar — o EXPORTAR da aba Som (S5a): "o arquivo reabre o som"\n');

await page.goto(`${base}/som.html?som=_passo`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const ready = await page.evaluate(() => window.__ready === true);
ok(ready, 'a aba abre e carrega o _passo (window.__ready)');
if (!ready) { console.error('  a aba não abriu — abortando'); await browser.close(); srv.close(); estatico.close(); process.exit(1); }

/* ===== 1. ROUND-TRIP bit-a-bit do grafo EDITADO (o CORAÇÃO): página == Node ===== */
console.log('[1] round-trip bit-a-bit: editar → serializar → re-importar dá o MESMO grafo (somCanonico)');
await P.setParam('grao', 'freq', 1900.567);   // edita um param com decimais (String reabre EXATO; toFixed quebraria)
await P.setParam('grao', 'q', 0.55);
await P.aguardar();
const canonEd = await P.canonico();
const strEd = await P.serializar();
const passosEd = await P.passos();
const Mrt = await reimportar(T_RT, strEd, 'rt_editado');
const canonRT = canonDe(Mrt);
ok(canonRT === canonEd, 'somCanonico(re-import) === somCanonico(editor) — a peça exportada REABRE IDÊNTICA (página==Node)',
  `${canonRT.length} chars · ${canonRT === canonEd ? 'idêntico' : 'DIVERGE'}`);
ok(JSON.stringify(Mrt.PASSOS) === JSON.stringify(passosEd) && JSON.stringify(Mrt.PARAMS) === '{}' && (Mrt.semente >>> 0) === 1337,
  'PASSOS re-abrem iguais à lista EDITADA · PARAMS {} (o editor inlina) · semente 1337',
  `${Mrt.PASSOS.length} passos · semente ${Mrt.semente}`);
ok(Math.abs(Mrt.PASSOS.find((p) => p[1].id === 'grao')[1].freq - 1900.567) === 0,
  'o valor com decimais reabriu EXATO (String(double), não arredondado)', `grao.freq ${Mrt.PASSOS.find((p) => p[1].id === 'grao')[1].freq}`);

/* ===== 2. ANATOMIA: o formato IDÊNTICO às peças de pecas-som/ ===== */
console.log('\n[2] anatomia: cabeçalho + 2 imports + PARAMS/semente/PASSOS + meta.duracao CHAMADA + construir');
const temImports = strEd.includes("import { somNucleo, duracaoDoGrafo } from '../motor/somnucleo.js';") && strEd.includes("import { construirGrafo } from '../motor/somweb.js';");
const metaBloco = strEd.slice(strEd.indexOf('export const meta'));
const durChamada = /duracao: duracaoDoGrafo\(somNucleo\(PASSOS, PARAMS, semente\)\),/.test(metaBloco) && !/duracao:\s*[0-9]/.test(metaBloco);   // a CHAMADA, nunca o valor numérico
ok(strEd.startsWith('/*') && temImports, 'a string tem o cabeçalho de comentário GERADO e os DOIS imports do núcleo/adaptador');
ok(/export const PARAMS = /.test(strEd) && /export const semente = 1337;/.test(strEd) && /export const PASSOS = \[/.test(strEd),
  'exporta PARAMS + `semente = 1337;` + PASSOS (a lista reabre pra editar)');
ok(durChamada && strEd.includes("tipo: 'som',"), "meta.duracao é a CHAMADA duracaoDoGrafo(somNucleo(PASSOS, PARAMS, semente)) (recalculada no load, NÃO o valor) · tipo:'som'");
ok(strEd.includes('export function construir(ctx, quando = 0) { return construirGrafo(somNucleo(PASSOS, PARAMS, semente), ctx, quando); }'),
  'exporta o `construir(ctx, quando)` — o mesmo envelope de uma peça-som');
ok(typeof Mrt.meta.duracao === 'number' && Math.abs(Mrt.meta.duracao - duracaoDoGrafo(somNucleo(Mrt.PASSOS, Mrt.PARAMS, Mrt.semente))) < 1e-12 && Mrt.meta.tipo === 'som' && Mrt.meta.nome === '_passo',
  'no re-import, meta.duracao é NÚMERO calculado (bate com duracaoDoGrafo), tipo=som, nome=_passo', `duracao ${Mrt.meta.duracao.toFixed(4)} s`);

/* ===== 3. O CATÁLOGO REABRE: cada um dos 4 presets round-trip idêntico (editor == export == original) ===== */
console.log('\n[3] o catálogo reabre: cada preset carregado, serializado e re-importado round-trip idêntico');
const PRESETS = ['_passo', '_vento', '_bolha', '_agua'];
for (const arq of PRESETS) {
  await P.recarregar(arq);
  const canonEdP = await P.canonico();
  const strP = await P.serializar();
  const Mp = await reimportar(T_RT, strP, 'rt_' + arq);
  const canonRTp = canonDe(Mp);
  const orig = await import(pathToFileURL(join(V3, 'pecas-som', arq + '.js')).href);
  const canonOrig = JSON.stringify(somCanonico(somNucleo(orig.PASSOS, orig.PARAMS, orig.semente)));
  ok(canonRTp === canonEdP && canonEdP === canonOrig,
    `${arq}: re-import == editor == preset ORIGINAL (o catálogo reabre bit-a-bit)`,
    `${strP.length} chars · ${canonRTp === canonEdP && canonEdP === canonOrig ? 'idêntico' : 'DIVERGE'}`);
}

/* ===== 4. O BOTÃO grava o arquivo (gesto real): o conteúdo gravado === a string ===== */
console.log('\n[4] o botão "Exportar" grava o arquivo (POST /som/salvar): o gravado === a string, re-import replica');
await P.recarregar('_passo');
const strBotao = await P.serializar();
const nomeArq = await P.nomeEvento();
await page.click('#btExportar');   // GESTO real do Playwright
await page.waitForFunction(() => /salvo em pecas-som/.test(document.getElementById('exportarMsg').textContent), { timeout: 8000 }).catch(() => {});
const msgBotao = await page.$eval('#exportarMsg', (el) => el.textContent);
const gravado = existsSync(join(T_SRV, nomeArq + '.js')) ? readFileSync(join(T_SRV, nomeArq + '.js'), 'utf8') : null;
ok(gravado === strBotao && /salvo em pecas-som\/_passo\.js/.test(msgBotao),
  'clicar Exportar grava pecas-som/_passo.js e o arquivo === a string do serializar', `via servidor · igual ${gravado === strBotao} · msg "${msgBotao}"`);
const Mg = await import(pathToFileURL(join(T_SRV, nomeArq + '.js')).href + '?v=' + Date.now());
ok(canonDe(Mg) === (await P.canonico()), 're-importar o arquivo GRAVADO PELO BOTÃO replica o grafo (canônico == editor)');
await page.screenshot({ path: join(OUT, 'som-exportar.png') });

/* ===== 5. SEGURANÇA (o nomeSeguro reusado) + no-store ===== */
console.log('\n[5] segurança: /som/salvar rejeita nomes maliciosos (o mesmo nomeSeguro) sem escrever fora + no-store');
const antesSeg = readdirSync(T_SRV).sort().join(',');
const maus = ['../../evil', '/etc/passwd', 'a/b', '..', 'com espaco', 'x;rm -rf'];
let rejeitados = 0;
for (const mau of maus) { const rr = await fetch(`${base}/som/salvar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: mau, conteudo: 'HACK' }) }); if (rr.status >= 400) rejeitados++; }
const depoisSeg = readdirSync(T_SRV).sort().join(',');
const escapou = existsSync(join(V3, 'evil.js')) || existsSync(resolve(V3, 'pecas-som', 'evil.js')) || existsSync(resolve(REPO, 'evil.js')) || existsSync('/tmp/HACK') || existsSync(join(T_SRV, '..', 'evil.js'));
ok(rejeitados === maus.length, 'TODOS os nomes maliciosos rejeitados (../.., /etc, a/b, .., espaço, símbolo)', `${rejeitados}/${maus.length} (status>=400)`);
ok(antesSeg === depoisSeg && !escapou, 'NADA escrito fora nem a mais em pecas-som/ (o traversal não escapou)', `escapou ${escapou}`);
const rNoStore = await fetch(`${base}/motor/somexport.js`);
ok(rNoStore.status === 200 && rNoStore.headers.get('cache-control') === 'no-store', 'GET a um módulo do som serve com Cache-Control: no-store', `cache-control ${rNoStore.headers.get('cache-control')}`);

/* ===== 6. NEUTRALIZAÇÃO: String(x) vs x.toFixed(3) — o teste discrimina o mecanismo (pure Node) ===== */
console.log('\n[6] neutralização: trocar String(x) por x.toFixed(3) faz o round-trip DIVERGIR (o teste discrimina)');
const evNeut = { meta: { nome: 'neut', desc: 'prova da neutralização' }, PARAMS: {}, semente: 0,
  PASSOS: [['oscilador', { id: 'o', tipo: 'seno', freq: 440.123456789 }], ['envelope', { id: 'saida', de: 'o', ataque: 0.006, pico: 0.9, decaimento: 0.16, duracao: 0.18 }]] };
const canonNeut = JSON.stringify(somCanonico(somNucleo(evNeut.PASSOS, evNeut.PARAMS, evNeut.semente)));
const strBom = serializarEvento(evNeut);                          // String(x) — o mecanismo CERTO
const strMau = serializarEvento(evNeut, (x) => x.toFixed(3));     // x.toFixed(3) — NEUTRALIZADO
const Mbom = await reimportar(T_RT, strBom, 'neut_bom');
const Mmau = await reimportar(T_RT, strMau, 'neut_mau');
ok(canonDe(Mbom) === canonNeut && strBom.includes('440.123456789'),
  'String(x): o round-trip BATE bit-a-bit (freq reabre 440.123456789)', 'reabre exato');
ok(canonDe(Mmau) !== canonNeut && strMau.includes('440.123'),
  'x.toFixed(3): o round-trip DIVERGE (freq virou 440.123) — o teste PROVA que String, não toFixed, é o mecanismo',
  `neutralizado: ${Mmau.PASSOS[0][1].freq}`);

/* ===== 7. FALLBACK: sem a rota (estático puro), o Exportar baixa o .js sem quebrar ===== */
console.log('\n[7] fallback: sem a rota /som/salvar, o Exportar cai no DOWNLOAD (blob + <a download>)');
const page2 = await browser.newPage({ viewport: { width: VW, height: VH } });
const errs2 = [];
page2.on('pageerror', (e) => errs2.push(String(e)));
page2.on('console', (m) => { if (m.type() === 'error') errs2.push('console.error: ' + m.text()); });
await page2.addInitScript(() => { const T = 1700000000000; Date.now = () => T; });
await page2.goto(`${baseEstatico}/som.html?som=_agua`, { waitUntil: 'load' });
await page2.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const dlAntes = await page2.evaluate(() => window.__som.ultimoDownload());
const resSalvar = await page2.evaluate(() => window.__som.exportar());   // POST → 404 (rota ausente) → FALLBACK download
const dlDepois = await page2.evaluate(() => window.__som.ultimoDownload());
ok(resSalvar && resSalvar.via === 'download' && dlAntes === null && dlDepois && dlDepois.nome === '_agua.js' && dlDepois.tamanho > 200,
  'sem a rota, o Exportar cai no DOWNLOAD sem quebrar (blob + <a download>)', `via ${resSalvar && resSalvar.via} · baixou ${dlDepois && dlDepois.nome} (${dlDepois && dlDepois.tamanho} chars)`);
/* o 404 do POST é o PRÓPRIO gatilho do fallback (o navegador o loga) — só um erro INESPERADO
   (exceção de página, módulo que não carrega) é falha. */
const errs2Inesperados = errs2.filter((e) => !/404|Failed to load resource|Failed to fetch/.test(e));
ok(errs2Inesperados.length === 0, 'o fallback não gera erro INESPERADO (o 404 do POST é o gatilho do fallback, não uma quebra)', errs2Inesperados.length ? errs2Inesperados.join(' | ') : '0 (só o 404 esperado do POST)');
await page2.close();

/* ===== 8. SEM REGRESSÃO: console limpo · /oficina/salvar (passo 10) intacto · aba Objeto viva ===== */
console.log('\n[8] sem regressão: console limpo · /oficina/salvar (passo 10) ainda grava · aba Objeto intacta');
ok(errs.length === 0, 'a aba Som abre, edita e exporta SEM erro de console', errs.length ? errs.join(' | ') : '0 erros');
const errsSom = errs.length;
/* o /oficina/salvar (passo 10) segue vivo e gravando em pecas/ (aqui T_OFC temp): a rota-irmã
   nova não regrediu a antiga. */
const PECA3D = `/* zzz_probe — fixture da bancada (S5a): prova que /oficina/salvar segue vivo. */
import { executar, colisaoDe } from '../motor/oficina.js';
export const PARAMS = { r: 0.5 };
export const TOPO = { lados: 6 };
export const PASSOS = [ ['cilindro', { id: 0, raio: 'r', altura: 1, lados: 'lados' }] ];
export const meta = { nome: 'zzz_probe', tipo: 'objeto', desc: 'probe', colisao: colisaoDe(PASSOS, PARAMS, TOPO) };
export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
`;
const srvOfc = criarServidor({ raiz: V3, pecas: T_OFC });   // servidor descartável: pecas -> TEMP (nunca o rastreado)
await new Promise((r) => srvOfc.listen(0, '127.0.0.1', r));
const rOfc = await fetch(`http://127.0.0.1:${srvOfc.address().port}/oficina/salvar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'zzz_probe', conteudo: PECA3D }) });
const jOfc = await rOfc.json().catch(() => ({}));
const gravadoOfc = existsSync(join(T_OFC, 'zzz_probe.js')) ? readFileSync(join(T_OFC, 'zzz_probe.js'), 'utf8') : null;
srvOfc.close();
ok(rOfc.status === 200 && jOfc.ok === true && gravadoOfc === PECA3D, '/oficina/salvar (passo 10) SEGUE gravando em pecas/ (a rota-irmã /som/salvar não regrediu)', `status ${rOfc.status}`);
await page.goto(`${base}/oficina.html?peca=_oficina-toco`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const objReady = await page.evaluate(() => window.__ready === true);
ok(objReady, 'a aba Objeto (oficina.html) segue intacta: abre e renderiza (__ready)');
ok(errs.length === errsSom, 'a aba Objeto abre sem NOVO erro de console', errs.length === errsSom ? 'ok' : errs.slice(errsSom).join(' | '));

await browser.close();
srv.close();
estatico.close();

console.log(`\nscreenshot: ${join(OUT, 'som-exportar.png')}`);
console.log(falhas ? `\nsomexportar: ${falhas} falha(s)` : '\nsomexportar: o round-trip reabre o som bit-a-bit (página==Node), a anatomia bate com pecas-som/, os 4 presets reabrem, o botão grava o arquivo (gravado === a string), a segurança rejeita, a neutralização (toFixed) DIVERGE, o fallback baixa, e nada regrediu (passo 10 + aba Objeto)');
process.exit(falhas ? 1 : 0);
