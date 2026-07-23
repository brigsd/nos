#!/usr/bin/env node
/* analisar.mjs — a bancada do OUVIDO da Aba Som (passo S3.5): o "cmp de medida do
   som". O par do `sintetizar.mjs` (que prova o REPLAY), mas aqui a prova é a
   ANÁLISE — renderiza EVENTOS CONHECIDOS pra Float32Array via OfflineAudioContext
   num Chromium headless (Playwright), passa por `motor/somanalise.js` (STFT + Hann
   1024/hop 256 + centroide/pitch/envelope) e MEDE, com números que DISCRIMINAM:
     (1) BOLHA: o tom VARRE PRA CIMA (pitch fim > início, a faixa alta chega perto
         de freqTopo=1000), o brilho/centroide fica na casa dos ~500 Hz, o envelope
         tem pico CEDO (< 35 ms), a duração ~0.33 s;
     (2) SENO PURO discrimina: `oscilador seno 440` → o espectrograma é uma LINHA
         horizontal em ~440 e o centroide ~440; `880` sobe a linha e o centroide
         (prova que o eixo de frequência está certo);
     (3) FILTRO baixa o brilho: a MESMA bolha com um passa-baixa 300 dentro da
         energia → o centroide CAI e o TOPO do sweep some no espectrograma (energia
         acima de 700 Hz despenca) — discrimina "cortou agudo" de "só abaixou volume";
     (4) DETERMINÍSTICO: o mesmo evento → o MESMO espectrograma (hash de pixels) e os
         MESMOS descritores; evento diferente → mudam (relógio congelado).
   Sem rede externa (server local + Chromium do sandbox). O "soa bonito?" é do
   ideador; isto barra a regressão muda do que dá pra MEDIR e VER.
     npm run analisar
     node tools/bancadas/analisar.mjs */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SR = 44100;   // taxa fixa do render (determinismo, igual à aba/sintetizar)

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__som.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><meta charset="utf-8"><title>analise bench</title>'); return; }
  const p = join(REPO, decodeURIComponent(url.pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('analisar: Playwright não encontrado. Rode uma vez: cd site && npm ci'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${base}/__som.html`, { waitUntil: 'load' });

/* tudo o que precisa de amostras/canvas roda DENTRO do browser (Web Audio + Canvas
   moram lá) e volta só NÚMEROS/hashes — nada de despejar Float32Array pela ponte. */
const R = await page.evaluate(async (SR) => {
  const web = await import('/prototipos/fps/v3/motor/somweb.js');
  const ana = await import('/prototipos/fps/v3/motor/somanalise.js');
  const bolha = await import('/prototipos/fps/v3/pecas-som/_bolha.js');
  const { renderarOffline } = web;
  const { analisar, desenharEspectrograma } = ana;

  // hash FNV-1a dos pixels de um espectrograma desenhado num canvas de tamanho FIXO
  const hashEspec = (espec, W = 600, H = 300, comTrilha = null) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    desenharEspectrograma(g, W, H, espec, comTrilha ? { trilhaPitch: comTrilha } : {});
    const d = g.getImageData(0, 0, W, H).data;
    let h = 0x811c9dc5; for (let i = 0; i < d.length; i += 4) { h ^= d[i]; h = Math.imul(h, 0x01000193); h ^= d[i + 1]; h = Math.imul(h, 0x01000193); h ^= d[i + 2]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  };
  // energia média (linear, a partir do dB) numa FAIXA de frequência do espectrograma
  const energiaFaixa = (espec, fLo, fHi) => {
    const b0 = Math.max(1, Math.floor(fLo / espec.freqPorBin)), b1 = Math.min(espec.bins - 1, Math.ceil(fHi / espec.freqPorBin));
    let s = 0, n = 0; for (let q = 0; q < espec.quadros; q++) for (let b = b0; b <= b1; b++) { s += Math.pow(10, espec.db[q * espec.bins + b] / 20); n++; }
    return s / Math.max(1, n);
  };

  const out = {};

  // ===== 1. BOLHA (a peça-exemplo): tom varre pra cima, brilho ~500, ataque cedo =====
  const aBolha = await renderarOffline(bolha, { sampleRate: SR });
  const anBolha = analisar(aBolha, SR);
  const pB = anBolha.descritores.pitch, eB = anBolha.descritores.envelope;
  out.bolha = {
    len: aBolha.length, dur: anBolha.descritores.duracao,
    pitchIni: pB.inicioHz, pitchFim: pB.fimHz, pitchMin: pB.minHz, pitchMax: pB.maxHz,
    centroide: anBolha.descritores.brilho.centroideHz,
    ataqueMs: eB.ataqueMs, picoRms: eB.picoRms,
    quadros: anBolha.espectrograma.quadros, bins: anBolha.espectrograma.bins,
  };

  // ===== 2. SENO PURO: 440 vira uma LINHA em ~440 (centroide ~440); 880 sobe =====
  const seno = (f) => ({ PASSOS: [['oscilador', { id: 't', tipo: 'seno', freq: f }]], PARAMS: {}, semente: 0 });
  const faixaPitch = (an) => { const p = an.descritores.pitch, tr = p.trilha; let mn = Infinity, mx = -Infinity, s = 0, n = 0; for (let q = p.quadroInicio; q <= p.quadroFim; q++) { const v = tr[q]; if (v < mn) mn = v; if (v > mx) mx = v; s += v; n++; } return { min: mn, max: mx, media: s / Math.max(1, n) }; };
  const an440 = analisar(await renderarOffline(seno(440), { sampleRate: SR }), SR);
  const an880 = analisar(await renderarOffline(seno(880), { sampleRate: SR }), SR);
  out.seno = {
    c440: an440.descritores.brilho.centroideHz, c880: an880.descritores.brilho.centroideHz,
    linha440: faixaPitch(an440), linha880: faixaPitch(an880),
  };

  // ===== 3. FILTRO baixa o brilho: a MESMA bolha + passa-baixa 300 =====
  const P = { fb: 380, ft: 1000, ts: 0.10, at: 0.006, pk: 0.9, dc: 0.16, du: 0.18 };
  const bolhaBase = { PARAMS: {}, semente: 0, PASSOS: [
    ['oscilador', { id: 'corpo', tipo: 'seno', freq: P.fb }],
    ['alturaEnv', { id: 'sweep', de: 'corpo', freq0: P.fb, freq1: P.ft, tempo: P.ts }],
    ['envelope', { id: 'saida', de: 'corpo', ataque: P.at, pico: P.pk, decaimento: P.dc, duracao: P.du }],
  ] };
  const bolhaLp = { PARAMS: {}, semente: 0, PASSOS: [
    ['oscilador', { id: 'corpo', tipo: 'seno', freq: P.fb }],
    ['alturaEnv', { id: 'sweep', de: 'corpo', freq0: P.fb, freq1: P.ft, tempo: P.ts }],
    ['filtro', { id: 'lp', de: 'corpo', tipo: 'passa-baixa', freq: 300, q: 1 }],
    ['envelope', { id: 'saida', de: 'lp', ataque: P.at, pico: P.pk, decaimento: P.dc, duracao: P.du }],
  ] };
  const anBase = analisar(await renderarOffline(bolhaBase, { sampleRate: SR }), SR);
  const anLp = analisar(await renderarOffline(bolhaLp, { sampleRate: SR }), SR);
  out.filtro = {
    cBase: anBase.descritores.brilho.centroideHz, cLp: anLp.descritores.brilho.centroideHz,
    // topo do sweep (700–1100 Hz) some; o grave (300–450) sobrevive mais
    topoBase: energiaFaixa(anBase.espectrograma, 700, 1100), topoLp: energiaFaixa(anLp.espectrograma, 700, 1100),
    graveBase: energiaFaixa(anBase.espectrograma, 300, 450), graveLp: energiaFaixa(anLp.espectrograma, 300, 450),
    // confirma que a bolha inline bate com a peça _bolha importada
    cBaseVsPeca: Math.abs(anBase.descritores.brilho.centroideHz - anBolha.descritores.brilho.centroideHz),
  };

  // ===== 4. DETERMINÍSTICO: mesmo evento → mesmo hash/descritores; diferente → muda =====
  const h1 = hashEspec(anBase.espectrograma);
  const anBase2 = analisar(await renderarOffline(bolhaBase, { sampleRate: SR }), SR);
  const h2 = hashEspec(anBase2.espectrograma);
  const hLp = hashEspec(anLp.espectrograma);
  const h440 = hashEspec(an440.espectrograma);
  out.deter = {
    hashIgual: h1 === h2, hashMudaFiltro: h1 !== hLp, hashMudaSeno: h1 !== h440,
    centIgual: anBase.descritores.brilho.centroideHz === anBase2.descritores.brilho.centroideHz,
    ataqueIgual: anBase.descritores.envelope.ataqueMs === anBase2.descritores.envelope.ataqueMs,
    h1, hLp, h440,
  };

  return out;
}, SR);

await browser.close();
server.close();

/* ---- afirmações por medição: cada uma DISCRIMINA ---- */
let falhas = 0;
const ok = (cond, msg, num) => { console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${msg}${num !== undefined ? ` — ${num}` : ''}`); if (!cond) falhas++; };
const f = (x, d = 1) => (typeof x === 'number' ? x.toFixed(d) : String(x));

console.log('\nbancada analisar — o OUVIDO da Aba Som (espectrograma + descritores via OfflineAudioContext)\n');

const B = R.bolha;
console.log(`[1] bolha (_bolha): ${B.len} amostras · ${B.quadros} quadros × ${B.bins} bins`);
ok(B.pitchFim > B.pitchIni + 200, 'tom VARRE PRA CIMA: pitch fim >> início', `${f(B.pitchIni)} → ${f(B.pitchFim)} Hz`);
ok(B.pitchMax > 850, 'a faixa alta chega perto de freqTopo (1000)', `max ${f(B.pitchMax)} Hz`);
ok(B.centroide > 440 && B.centroide < 650, 'brilho/centroide na casa dos ~500 Hz', `${f(B.centroide)} Hz`);
ok(B.ataqueMs < 35, 'envelope: pico CEDO (ataque < 35 ms)', `${f(B.ataqueMs)} ms`);
ok(B.dur > 0.30 && B.dur < 0.36, 'duração ~0.33 s', `${f(B.dur, 3)} s`);

const S = R.seno;
console.log('\n[2] seno puro (o eixo de frequência está certo)');
ok(S.linha440.max - S.linha440.min < 6, 'seno 440 é uma LINHA horizontal (pitch quase sem variação)', `spread ${f(S.linha440.max - S.linha440.min, 2)} Hz @ ${f(S.linha440.media)} Hz`);
ok(S.c440 > 420 && S.c440 < 470, 'centroide do 440 ~440 Hz', `${f(S.c440)} Hz`);
ok(S.c880 > 840 && S.c880 < 940, 'centroide do 880 ~880 Hz', `${f(S.c880)} Hz`);
ok(S.c880 > S.c440 * 1.7, '880 SOBE a linha e o centroide vs 440', `${f(S.c440)} → ${f(S.c880)} Hz`);

const F = R.filtro;
console.log('\n[3] filtro passa-baixa 300 baixa o brilho (corta agudo ≠ abaixa volume)');
ok(F.cBaseVsPeca < 1, 'a bolha inline bate com a peça _bolha (centroide idêntico)', `dif ${f(F.cBaseVsPeca, 3)} Hz`);
ok(F.cLp < F.cBase, 'o centroide CAI com o passa-baixa', `${f(F.cBase)} → ${f(F.cLp)} Hz`);
ok(F.topoLp < F.topoBase * 0.5, 'o TOPO do sweep (700–1100 Hz) some do espectrograma', `energia topo ${f(F.topoBase, 5)} → ${f(F.topoLp, 5)}`);
ok(F.graveLp > F.topoLp, 'o grave sobrevive mais que o agudo (foi passa-BAIXA, não mudo)', `grave ${f(F.graveLp, 5)} vs topo ${f(F.topoLp, 5)}`);

const D = R.deter;
console.log('\n[4] determinístico (mesmo evento = mesma imagem + medida)');
ok(D.hashIgual && D.centIgual && D.ataqueIgual, 'MESMO evento → MESMO espectrograma (hash de pixels) e MESMOS descritores', `hash ${D.h1}`);
ok(D.hashMudaFiltro, 'evento diferente (com filtro) → hash MUDA', `${D.h1} → ${D.hLp}`);
ok(D.hashMudaSeno, 'evento diferente (seno) → hash MUDA', `${D.h1} → ${D.h440}`);

if (errs.length) { falhas++; console.log(`\n  FALHA erros de página: ${errs.join(' | ')}`); }
console.log(falhas ? `\nanalisar: ${falhas} falha(s)` : '\nanalisar: o espectrograma + descritores MEDEM o som — sweep sobe, seno vira linha, filtro corta agudo, tudo determinístico');
process.exit(falhas ? 1 : 0);
