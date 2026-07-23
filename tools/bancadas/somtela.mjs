#!/usr/bin/env node
/* somtela.mjs — a bancada da ABA SOM. Sobe o `som.html` num Chromium headless (Playwright)
   e PROVA, com números, o que dá pra verificar sem alto-falante. Cobria a CASCA (S2: a onda
   desenha + bate com as amostras, determinística; o Play liga o grafo vivo) e agora cobre o
   EDITOR ao vivo (S3):
     (1) o painel LISTA os blocos como CARDS de controle (um por nó);
     (2) EDITAR um param muda o SOM — arrastar um slider REAL muda a onda (hash de pixels
         antes≠depois) e é DETERMINÍSTICO (mesmo valor → mesmo hash), e o grafo editado bate
         com o render (renderarOffline é a fonte do desenho);
     (3) ADD/LIGAR/REMOVER: adicionar muda a CONTAGEM do grafo (o bloco novo nasce solto, a
         onda só muda ao LIGAR); ligar um filtro no caminho ABAFA a onda (RMS cai); remover
         tira o nó;
     (4) VALIDAÇÃO surfada sem quebrar: `de` pra id inexistente / ciclo / sem-saída → aviso na
         UI, página VIVA, o resto renderiza (grafo.orfaos não vazio, sem crash);
     (5) CONSISTÊNCIA: o grafo que a UI segura passa por somCanonico ida-e-volta idêntico;
     (6) o PLAY toca a versão ATUAL (editada) — tocarEvento liga o grafo editado;
     (7) sem regressão — a aba abre sem erro de console e a aba Objeto (oficina.html) intacta.
   Relógio congelado (Date.now/Math.random) pro screenshot ser determinístico.
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
/* helpers que dirigem a UI de verdade (via o probe __som, que chama as MESMAS funções do editor) */
const P = { hash: () => page.evaluate(() => window.__som.hashOnda()),
  grafo: () => page.evaluate(() => window.__som.grafo()),
  amostras: () => page.evaluate(() => window.__som.amostras()),
  aviso: () => page.evaluate(() => window.__som.aviso()),
  nCards: () => page.evaluate(() => window.__som.nCards()),
  nInval: () => page.evaluate(() => window.__som.nInvalidos()),
  passos: () => page.evaluate(() => window.__som.passos()),
  recarregar: () => page.evaluate(() => window.__som.recarregar('_bolha')),
  add: (op) => page.evaluate((o) => window.__som.addBloco(o), op),
  remover: (id) => page.evaluate((i) => window.__som.remover(i), id),
  setParam: (id, k, v) => page.evaluate(([i, kk, vv]) => window.__som.setParam(i, kk, vv), [id, k, v]),
  ligar: (id, de) => page.evaluate(([i, d]) => window.__som.ligar(i, d), [id, de]),
  ligarAlvo: (id, no, pm) => page.evaluate(([i, n, p]) => window.__som.ligarAlvo(i, n, p), [id, no, pm]),
};

console.log('\nbancada somtela — o EDITOR de blocos da aba Som (montar/editar o grafo, ao vivo)\n');

await page.goto(`${base}/som.html?som=_bolha`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const ready = await page.evaluate(() => window.__ready === true);
ok(ready, 'a aba abre e carrega o _bolha (window.__ready)');
if (!ready) { console.error('  a aba não abriu — abortando'); await browser.close(); server.close(); process.exit(1); }

/* ===== 1. a onda DESENHA, BATE com as amostras, e o editor LISTA os blocos ===== */
const ev = await page.evaluate(() => window.__som.evento());
const am = await P.amostras();
const des = await page.evaluate(() => window.__som.desenho());
const nCards0 = await P.nCards();
console.log(`[1] onda do _bolha (${ev.len} amostras @ ${ev.sr} Hz · dur ${f(ev.dur, 3)} s · canvas ${des.larguraOnda}x${des.alturaOnda})`);
ok(des.pixelsAcesos > 500, 'onda desenhada: canvas NÃO-vazio (pixels de onda)', `${des.pixelsAcesos} px`);
ok(am.rms > 0.02 && am.maxAbs > 0.1, 'as amostras têm sinal (RMS/pico > 0)', `rms ${f(am.rms)} pico ${f(am.maxAbs)}`);
const difCol = Math.abs(des.picoColunaDesenho - am.colunaPicoAmostra);
const tolCol = Math.max(8, Math.round(des.larguraOnda * 0.02));
ok(difCol <= tolCol, 'PICO do desenho na coluna do PICO das amostras (desenho reflete o sinal)', `desenho col ${des.picoColunaDesenho} vs amostra col ${am.colunaPicoAmostra} (dif ${difCol} <= ${tolCol})`);
ok(nCards0 === 3, 'o editor LISTA os blocos como cards (bolha = 3: corpo/sweep/saida)', `${nCards0} cards`);
const g0 = await P.grafo();
ok(g0.nNos === 3 && g0.saida === 'saida' && g0.orfaos.length === 0, 'o grafo da UI é limpo (3 nós, saída=saida, 0 órfão)', `saida ${g0.saida}, órfãos ${g0.orfaos.length}`);

/* screenshot do EDITOR aberto (o deliverable) — estado limpo do _bolha, relógio congelado */
await page.screenshot({ path: join(OUT, 'som-aba.png') });
await page.screenshot({ path: join(OUT, 'som-editor.png'), clip: { x: VW - Math.min(340, Math.round(VW * 0.34)), y: 44, width: Math.min(340, Math.round(VW * 0.34)), height: VH - 44 - 26 } });

/* ===== 2. EDITAR muda o som (slider REAL) — determinístico, e o render segue o grafo ===== */
console.log('\n[2] editar um param AO VIVO muda a onda (slider real → renderarOffline → canvas)');
const hBase = await P.hash();
const selSlider = '.cardNo[data-id="sweep"] input[type=range][data-k="freq1"]';   // o topo do glissando: muda a FORMA
async function arrastar(sel, v) { await page.$eval(sel, (el, val) => { el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v); await page.evaluate(() => window.__som.aguardar()); }
await arrastar(selSlider, 2000);
const hEdit = await P.hash();
ok(hEdit !== hBase, 'arrastar o slider freq1 (1000→2000 Hz) MUDA a onda (hash de pixels muda)', `${hBase} → ${hEdit}`);
await arrastar(selSlider, 700);
const hDif = await P.hash();
await arrastar(selSlider, 2000);
const hEdit2 = await P.hash();
ok(hEdit2 === hEdit && hDif !== hEdit, 'DETERMINÍSTICO: mesmo valor → MESMO hash; valor diferente → hash diferente', `2000→${hEdit2}, 700→${hDif}`);
const passosEdit = await P.passos();
const freq1Edit = passosEdit.find((p) => p[1].id === 'sweep')[1].freq1;
ok(freq1Edit === 2000, 'o grafo que a UI segura reflete a edição (sweep.freq1 = 2000)', `freq1 ${freq1Edit}`);
/* um param de DURAÇÃO muda a JANELA do render (o desenho = renderarOffline do grafo editado) */
await P.setParam('saida', 'duracao', 0.4);
await page.evaluate(() => window.__som.aguardar());
const amDur = await P.amostras();
const lenEsperado = Math.ceil(44100 * (0.4 + 0.03));
ok(Math.abs(amDur.len - lenEsperado) <= 2, 'editar duracao=0.4 s re-dimensiona o render (len bate com renderarOffline)', `${amDur.len} ≈ ${lenEsperado}`);

/* ===== 3. ADD / LIGAR / REMOVER ===== */
console.log('\n[3] montar o grafo: adicionar, ligar (o de) e remover blocos');
await P.recarregar();                                   // volta ao _bolha limpo
const hLimpo = await P.hash();
const rmsLimpo = (await P.amostras()).rms;
/* ADD: o bloco novo nasce SOLTO (órfão) — muda a CONTAGEM do grafo, mas a onda ainda NÃO */
await P.add('filtro');
const gAdd = await P.grafo();
const hAdd = await P.hash();
ok(gAdd.nNos === 4 && (await P.nCards()) === 4, 'ADD filtro: o grafo cresce (3→4 nós / cards)', `${gAdd.nNos} nós`);
ok(gAdd.orfaos.some((m) => /sem `?de`?/.test(m)) && hAdd === hLimpo, 'o filtro nasce SOLTO: grita "sem de" e a onda NÃO muda até ligar', `onda ${hAdd === hLimpo ? 'igual' : 'mudou'}`);
/* LIGAR: pluga o filtro no caminho (corpo → flt1 → saida) e abaixa o corte → ABAFA a onda */
const fltId = gAdd.ids.find((id) => id.startsWith('flt'));
await P.ligar(fltId, 'corpo');                          // filtro.de = corpo
await P.ligar('saida', fltId);                          // envelope agora consome o filtro
await P.setParam(fltId, 'freq', 260);                   // passa-baixa baixo: corta o glissando agudo
await page.evaluate(() => window.__som.aguardar());
const gLig = await P.grafo();
const hLig = await P.hash();
const rmsLig = (await P.amostras()).rms;
ok(gLig.orfaos.length === 0 && gLig.saida === 'saida' && gLig.nArestas === 3, 'LIGAR: caminho corpo→filtro→saida fechado (0 órfão, 3 arestas)', `arestas ${gLig.nArestas}`);
ok(hLig !== hLimpo && rmsLig < rmsLimpo * 0.9, 'ligar um FILTRO no caminho ABAFA a onda (RMS cai, hash muda)', `rms ${f(rmsLimpo)} → ${f(rmsLig)}`);
/* REMOVER: tira um nó; a contagem cai e o grafo se reajusta */
await P.recarregar();
await P.remover('sweep');                               // tira o modulador de altura
const gRem = await P.grafo();
const hRem = await P.hash();
ok(gRem.nNos === 2 && (await P.nCards()) === 2 && gRem.saida === 'saida', 'REMOVER sweep: o grafo encolhe (3→2 nós), saída intacta', `${gRem.nNos} nós`);
ok(hRem !== hLimpo && gRem.orfaos.length === 0, 'sem o glissando a onda muda (tom fixo sob o envelope), grafo limpo', `hash ${hRem}`);
/* LFO: adicionar um modulador e MIRAR um param VÁLIDO (alvo/param por PARAM_MOD) */
await P.recarregar();
await P.add('lfo');
const lfoId = (await P.grafo()).ids.find((id) => id.startsWith('lfo'));
await P.ligarAlvo(lfoId, 'saida', 'ganho');             // tremolo: mira o ganho do envelope
await P.setParam(lfoId, 'profundidade', 0.5);
await page.evaluate(() => window.__som.aguardar());
const gLfo = await P.grafo();
const hLfo = await P.hash();
ok(gLfo.orfaos.length === 0 && gLfo.nArestas === 3, 'ADD+MIRAR lfo: modula saida.ganho (alvo/param válido por PARAM_MOD, 0 órfão, 3 arestas)', `arestas ${gLfo.nArestas}`);
ok(hLfo !== hLimpo, 'o tremolo do lfo reflete na onda (hash muda)', `hash ${hLfo}`);

/* ===== 4. VALIDAÇÃO surfada sem quebrar (a página fica VIVA e o resto renderiza) ===== */
console.log('\n[4] validação surfada: órfão / ciclo / sem-saída gritam SEM quebrar');
// (a) de -> id inexistente
await P.recarregar();
await P.ligar('saida', 'fantasma');
const gInex = await P.grafo();
ok(gInex.orfaos.some((m) => /inexistente/.test(m)) && (await P.nInval()) >= 1 && (await P.aviso()) !== '', 'de → id INEXISTENTE: grita na UI (card em âmbar + aviso), grafo.orfaos não vazio', `órfãos ${gInex.orfaos.length}`);
ok((await P.amostras()).len > 0 && (await page.evaluate(() => window.__som.desenho())).pixelsAcesos > 100, 'a página fica VIVA e o resto renderiza (canvas não-vazio)', 'renderou');
// (b) ciclo
await P.recarregar();
await P.add('ganho'); await P.add('ganho');
const gg = (await P.grafo()).ids.filter((id) => id.startsWith('gan'));
await P.ligar(gg[0], gg[1]); await P.ligar(gg[1], gg[0]);
const gCiclo = await P.grafo();
ok(gCiclo.orfaos.some((m) => /ciclo/.test(m)), 'CICLO no grafo: grita "ciclo" (aresta de volta derrubada)', `órfãos: ${gCiclo.orfaos.filter((m) => /ciclo/.test(m)).length}`);
ok((await page.evaluate(() => window.__som.desenho())).pixelsAcesos > 100, 'a página segue VIVA com o ciclo (não travou em laço)', 'renderou');
// (c) sem saída
await P.recarregar();
await P.remover('saida'); await P.remover('corpo');       // sobra só o modulador → nenhum nó de áudio livre
const gVazio = await P.grafo();
ok(gVazio.saida === null && gVazio.orfaos.some((m) => /sem saída/.test(m)), 'SEM SAÍDA: grita "sem saída" e saida=null', `saida ${gVazio.saida}`);
ok((await page.evaluate(() => window.__ready === true)), 'a página continua VIVA (renderou silêncio, sem crash)', '__ready');

/* ===== 5. CONSISTÊNCIA: o grafo da UI ida-e-volta idêntico pelo somCanonico ===== */
console.log('\n[5] consistência: o grafo que a UI segura é canônico-estável');
await P.recarregar();
await P.setParam('sweep', 'freq1', 1500);                 // um grafo editado qualquer
const canA = await page.evaluate(() => window.__som.canonico());
const canA2 = await page.evaluate(() => window.__som.canonico());
ok(canA === canA2 && canA.length > 10, 'somCanonico(grafo da UI) é IDÊNTICO ida-e-volta (round-trip estável)', `${canA.length} chars`);

/* ===== 6. o PLAY toca a versão ATUAL (editada) ===== */
console.log('\n[6] o Play liga o grafo EDITADO (Web Audio exige gesto do usuário)');
const estadoAntes = await page.evaluate(() => window.__som.estadoAudio());
ok(estadoAntes === 'sem-contexto', 'SEM gesto: nenhum AudioContext criado (respeita a política do browser)', estadoAntes);
await P.recarregar();
await P.setParam('corpo', 'freq', 620);                   // edita ANTES de tocar
await page.click('#btPlay');                              // gesto CONFIÁVEL do Playwright
await page.waitForTimeout(250);
const estadoDepois = await page.evaluate(() => window.__som.estadoAudio());
const saidaDepois = await page.evaluate(() => window.__som.saidaLigada());
const passosPlay = await P.passos();
const freqPlay = passosPlay.find((p) => p[1].id === 'corpo')[1].freq;
ok(estadoDepois === 'running' && saidaDepois === true, "CLIQUE no Play: AudioContext 'running' + a `saida` ligada no destino", estadoDepois);
ok(freqPlay === 620, 'o Play montou a versão ATUAL editada (tocarEvento usa o PASSOS editado — corpo.freq=620)', `freq ${freqPlay}`);
/* a tecla ESPAÇO também é gesto */
await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
await page.keyboard.press('Space');
await page.waitForTimeout(150);
ok((await page.evaluate(() => window.__som.estadoAudio())) === 'running' && (await page.evaluate(() => window.__som.saidaLigada())), 'a tecla ESPAÇO também liga o grafo (gesto pelo teclado)');

/* ===== 7. sem regressão: aba sem erro de console + a aba Objeto intacta ===== */
console.log('\n[7] sem regressão');
ok(errs.length === 0, 'a aba Som abre e edita SEM erro de console', errs.length ? errs.join(' | ') : '0 erros');
const errsSom = errs.length;
await page.goto(`${base}/oficina.html?peca=_oficina-toco`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const objReady = await page.evaluate(() => window.__ready === true);
ok(objReady, 'a aba Objeto (oficina.html) segue intacta: abre e renderiza (__ready)');
ok(errs.length === errsSom, 'a aba Objeto abre sem NOVO erro de console', errs.length === errsSom ? 'ok' : errs.slice(errsSom).join(' | '));

await browser.close();
server.close();

console.log(`\nscreenshots: ${join(OUT, 'som-aba.png')} · ${join(OUT, 'som-editor.png')}`);
console.log(falhas ? `\nsomtela: ${falhas} falha(s)` : '\nsomtela: o editor lista os blocos, editar muda o som ao vivo (determinístico), add/ligar/remover montam o grafo, a validação grita sem quebrar, o Play toca a versão editada, Objeto intacta');
process.exit(falhas ? 1 : 0);
