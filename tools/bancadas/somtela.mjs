#!/usr/bin/env node
/* somtela.mjs — a bancada da CASCA da ABA SOM (passo S2). O par do `oficina.mjs` (que
   dirige o oficina.html), mas pra a aba Som: sobe o `som.html` num Chromium headless
   (Playwright) e PROVA, com números, o que a bancada CONSEGUE verificar sem alto-falante:
   (1) a onda DESENHA (canvas não-vazio) e o desenho BATE com as amostras reais do
   `renderarOffline` — o PICO do desenho cai na coluna do PICO das amostras (o envelope da
   bolha é cedo, à esquerda); (2) DETERMINÍSTICO — o mesmo evento 2× dá o MESMO desenho
   (hash dos pixels), e um evento diferente MUDA o hash (discrimina); (3) o PLAY liga o
   grafo vivo — sem gesto não há AudioContext, e um clique/tecla (gesto CONFIÁVEL do
   Playwright) põe o contexto em 'running' com a `saida` ligada no destino; (4) sem
   regressão — a aba abre sem erro de console e a aba Objeto (oficina.html) segue intacta.
   Relógio congelado (Date.now/Math.random) pra o screenshot ser determinístico.
     npm run somtela
     node tools/bancadas/somtela.mjs */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = resolve(REPO, 'scratchpad/som2');
const VW = 1100, VH = 620;
mkdirSync(OUT, { recursive: true });

/* server estático mínimo servindo o REPO (pros imports de módulo ES) — o mesmo padrão
   das outras bancadas. no-store não importa aqui (processo curto). */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/prototipos/fps/v3`;

const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('somtela: Playwright não encontrado. Rode uma vez: cd site && npm ci'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
/* política de autoplay PADRÃO de propósito (SEM --autoplay-policy): só assim a prova
   "sem gesto não toca" tem sentido — o AudioContext só liga no clique/tecla, que o
   Playwright emite como gesto CONFIÁVEL. */
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH } });

/* RELÓGIO CONGELADO (padrão das bancadas): Date.now/Math.random fixos, pra qualquer
   screenshot ser determinístico. A onda não anima (é canvas estático), então não mexo
   no requestAnimationFrame — o Play/playhead seguem no relógio real do áudio. */
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
const f = (x, d = 4) => (typeof x === 'number' ? x.toFixed(d) : String(x));

console.log('\nbancada somtela — a casca da aba Som (ver a onda + ligar o som)\n');

await page.goto(`${base}/som.html?som=_bolha`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const ready = await page.evaluate(() => window.__ready === true);
ok(ready, 'a aba abre e carrega o _bolha (window.__ready)');
if (!ready) { console.error('  a aba não abriu — abortando'); await browser.close(); server.close(); process.exit(1); }

/* ===== 1. a onda DESENHA e BATE com as amostras ===== */
const ev = await page.evaluate(() => window.__som.evento());
const am = await page.evaluate(() => window.__som.amostras());
const des = await page.evaluate(() => window.__som.desenho());
const nNos = await page.evaluate(() => document.querySelectorAll('#nos .no').length);
console.log(`[1] onda do _bolha (${ev.len} amostras @ ${ev.sr} Hz · dur ${f(ev.dur, 3)} s · canvas ${des.larguraOnda}x${des.alturaOnda})`);
ok(des.pixelsAcesos > 500, 'onda desenhada: canvas NÃO-vazio (pixels de onda)', `${des.pixelsAcesos} px`);
ok(am.rms > 0.02 && am.maxAbs > 0.1, 'as amostras têm sinal (RMS/pico > 0)', `rms ${f(am.rms)} pico ${f(am.maxAbs)}`);
const difCol = Math.abs(des.picoColunaDesenho - am.colunaPicoAmostra);
const tolCol = Math.max(8, Math.round(des.larguraOnda * 0.02));
ok(difCol <= tolCol, 'PICO do desenho na coluna do PICO das amostras (desenho reflete o sinal)', `desenho col ${des.picoColunaDesenho} vs amostra col ${am.colunaPicoAmostra} (dif ${difCol} <= ${tolCol})`);
ok(des.picoColunaDesenho < des.larguraOnda * 0.2, 'pico na FAIXA ESQUERDA (envelope da bolha é cedo — discrimina de um desenho chapado/centrado)', `col ${des.picoColunaDesenho} < ${Math.round(des.larguraOnda * 0.2)}`);
ok(am.picoT < 0.05, 'o pico das amostras é cedo (t < 50 ms — o ataque rápido da bolha)', `${f(am.picoT * 1000, 2)} ms`);

/* ===== 2. DETERMINÍSTICO: mesmo evento -> mesmo desenho; evento diferente -> muda ===== */
const hashA = await page.evaluate(() => window.__som.hashOnda());
await page.evaluate(() => window.__som.recarregar('_bolha'));          // re-render + re-desenha DE VERDADE
const hashA2 = await page.evaluate(() => window.__som.hashOnda());
const bolhaMod = { PASSOS: [
  ['oscilador', { id: 'corpo', tipo: 'seno', freq: 900 }],
  ['alturaEnv', { id: 'sweep', de: 'corpo', freq0: 900, freq1: 200, tempo: 0.12 }],   // DESCE (a bolha SOBE) + ataque lento
  ['envelope', { id: 'saida', de: 'corpo', ataque: 0.05, pico: 0.8, decaimento: 0.05, duracao: 0.28 }],
], PARAMS: {}, semente: 0 };
await page.evaluate((e) => window.__som.desenharEvento(e), bolhaMod);
const hashB = await page.evaluate(() => window.__som.hashOnda());
await page.evaluate(() => window.__som.recarregar('_bolha'));          // restaura pra o screenshot
const hashA3 = await page.evaluate(() => window.__som.hashOnda());
console.log('\n[2] determinismo do desenho (hash FNV-1a dos pixels da onda)');
ok(hashA === hashA2 && hashA === hashA3, 'mesmo evento 2x = MESMO desenho (hash idêntico, relógio congelado)', hashA);
ok(hashB !== hashA, 'evento DIFERENTE = desenho diferente (o hash muda — o desenho segue as amostras)', `${hashA} vs ${hashB}`);
ok(nNos === 3, 'painel lista o grafo do evento (bolha = 3 nós: corpo/sweep/saida)', `${nNos} nós`);

await page.screenshot({ path: join(OUT, 'som-aba.png') });
await page.screenshot({ path: join(OUT, 'som-onda.png'), clip: { x: 0, y: 44, width: VW - Math.min(320, Math.round(VW * 0.32)), height: VH - 44 - 80 } });

/* ===== 3. o PLAY liga o grafo vivo (sem gesto não toca; gesto confiável liga) ===== */
console.log('\n[3] o play liga o grafo vivo (Web Audio exige gesto do usuário)');
const estadoAntes = await page.evaluate(() => window.__som.estadoAudio());
const saidaAntes = await page.evaluate(() => window.__som.saidaLigada());
ok(estadoAntes === 'sem-contexto', 'SEM gesto: nenhum AudioContext criado (respeita a política do browser)', estadoAntes);
ok(saidaAntes === false, 'SEM gesto: nada ligado ao destino ainda');
await page.click('#btPlay');                                          // gesto CONFIÁVEL do Playwright
await page.waitForTimeout(250);                                       // deixa o resume() resolver
const estadoDepois = await page.evaluate(() => window.__som.estadoAudio());
const saidaDepois = await page.evaluate(() => window.__som.saidaLigada());
ok(estadoDepois === 'running', "CLIQUE no Play: AudioContext em 'running'", estadoDepois);
ok(saidaDepois === true, 'CLIQUE no Play: tocarEvento ligou a `saida` no ctx.destination (a fiação que faz som)');
/* a tecla ESPAÇO também é gesto: para, tira o foco do botão e dispara pelo teclado */
await page.evaluate(() => { window.__som && document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
await page.keyboard.press('Space');
await page.waitForTimeout(150);
const estadoEspaco = await page.evaluate(() => window.__som.estadoAudio());
const saidaEspaco = await page.evaluate(() => window.__som.saidaLigada());
ok(estadoEspaco === 'running' && saidaEspaco === true, 'a tecla ESPAÇO também liga o grafo (gesto pelo teclado)');

/* ===== 4. sem regressão: aba sem erro de console + a aba Objeto intacta ===== */
console.log('\n[4] sem regressão');
ok(errs.length === 0, 'a aba Som abre SEM erro de console', errs.length ? errs.join(' | ') : '0 erros');
const errsSom = errs.length;
await page.goto(`${base}/oficina.html?peca=_oficina-toco`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const objReady = await page.evaluate(() => window.__ready === true);
ok(objReady, 'a aba Objeto (oficina.html) segue intacta: abre e renderiza (__ready)');
ok(errs.length === errsSom, 'a aba Objeto abre sem NOVO erro de console', errs.length === errsSom ? 'ok' : errs.slice(errsSom).join(' | '));

await browser.close();
server.close();

console.log(`\nscreenshots: ${join(OUT, 'som-aba.png')} · ${join(OUT, 'som-onda.png')}`);
console.log(falhas ? `\nsomtela: ${falhas} falha(s)` : '\nsomtela: onda desenha e bate com as amostras, determinística, o play liga o grafo vivo, Objeto intacta');
process.exit(falhas ? 1 : 0);
