#!/usr/bin/env node
/* sintetizar.mjs — a bancada do REPLAY da ABA SOM (passo 1), o "cmp de pixel do
   som". O par do `executar.mjs` (que prova o replay da Oficina em Node), mas aqui
   o replay EXIGE o browser: renderiza o evento pra Float32Array via
   OfflineAudioContext num Chromium headless (Playwright) — o análogo do visor que
   renderiza o objeto — e MEDE. Prova, com números: (1) o MESMO evento renderizado
   2x sai byte-a-byte idêntico (delta máx de amostra) e o somCanonico 2x idêntico
   (dados); (2) a semente discrimina (mesma semente = mesmas amostras, diferente =
   diferentes) num evento com ruído; (3) órfão/id-duplicado/ciclo gritam e o
   caminho bom ainda renderiza; (4) faz som DE VERDADE — a bolha varre freq0->freq1
   e o envelope sobe-e-cai, o lfo treme na taxa certa, a soma carrega as duas
   frequências. Sem rede externa (server local + Chromium do sandbox). O
   "soa bonito?" é do ideador; isto barra a regressão muda.
     npm run sintetizar            # todas as provas
     node tools/bancadas/sintetizar.mjs */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SR = 44100;   // taxa fixa do render (determinismo)

/* server estático mínimo servindo o REPO (pros imports de módulo) + uma página
   em branco na origem (import dinâmico e OfflineAudioContext precisam de http). */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__som.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><meta charset="utf-8"><title>som bench</title>'); return; }
  const p = join(REPO, decodeURIComponent(url.pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const PW = join(REPO, 'node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('sintetizar: Playwright não encontrado. Rode uma vez: npm ci (na raiz)'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${base}/__som.html`, { waitUntil: 'load' });

/* tudo o que precisa de amostras roda DENTRO do browser (o Web Audio mora lá) e
   volta só NÚMEROS — nada de despejar Float32Array de 8k amostras pela ponte. */
const R = await page.evaluate(async (SR) => {
  const nucleo = await import('/prototipos/fps/v3/motor/somnucleo.js');
  const web = await import('/prototipos/fps/v3/motor/somweb.js');
  const bolha = await import('/prototipos/fps/v3/pecas-som/_bolha.js');
  const { somNucleo, somCanonico } = nucleo;
  const { renderarOffline } = web;

  // ---- medidores puros ----
  const rms = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
  const maxDelta = (a, b) => { let m = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; } return m; };
  const rmsJanela = (a, t0, t1) => { const i0 = Math.max(0, t0 * SR | 0), i1 = Math.min(a.length, t1 * SR | 0); let s = 0; for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
  const picoIdx = (a) => { let m = -1, idx = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > m) { m = v; idx = i; } } return idx; };
  const zc = (a, t0, t1) => { const i0 = t0 * SR | 0, i1 = Math.min(a.length, t1 * SR | 0); let c = 0; for (let i = i0 + 1; i < i1; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) c++; return c; };
  // Goertzel: magnitude de UMA frequência (normalizada pelo tamanho)
  const bin = (x, f, sr) => { const w = 2 * Math.PI * f / sr; const c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; } const re = s1 - s2 * Math.cos(w), im = s2 * Math.sin(w); return Math.sqrt(re * re + im * im) / x.length; };
  // envelope de amplitude: RMS por bloco, JÁ sem a média (DC) — senão o DC vaza
  // no bin de 10 Hz (que não cai no centro da janela) e infla o chão do medidor.
  const envBloco = (a, bloco) => { const out = []; for (let i = 0; i + bloco <= a.length; i += bloco) { let s = 0; for (let j = 0; j < bloco; j++) s += a[i + j] * a[i + j]; out.push(Math.sqrt(s / bloco)); } let m = 0; for (const v of out) m += v; m /= out.length || 1; return Float32Array.from(out, (v) => v - m); };

  const out = {};

  // ===== 1. BOLHA: replay byte-a-byte + canon + forma + sweep =====
  const b1 = await renderarOffline(bolha, { sampleRate: SR });
  const b2 = await renderarOffline(bolha, { sampleRate: SR });
  const cA = JSON.stringify(somCanonico(somNucleo(bolha.PASSOS, bolha.PARAMS, bolha.semente)));
  const cB = JSON.stringify(somCanonico(somNucleo(bolha.PASSOS, bolha.PARAMS, bolha.semente)));
  const pIdx = picoIdx(b1);
  out.bolha = {
    len: b1.length, replayDelta: maxDelta(b1, b2), canonIgual: cA === cB, canonLen: cA.length,
    rms: rms(b1), picoT: pIdx / SR,
    rmsInicio: rmsJanela(b1, 0, 0.045), rmsFim: rmsJanela(b1, 0.135, 0.18),   // sobe-e-cai (decaimento)
    zcA: zc(b1, 0.015, 0.035), zcB: zc(b1, 0.065, 0.085),                       // sweep: janela tardia varre mais alto
  };

  // ===== 2. SEMENTE: um grão de água (ruido -> filtro -> envelope) =====
  const grao = { PASSOS: [
    ['ruido', { id: 'n', cor: 'rosa', k: 0.05 }],
    ['filtro', { id: 'f', de: 'n', tipo: 'passa-banda', freq: 1200, q: 1 }],
    ['envelope', { id: 'e', de: 'f', ataque: 0.01, pico: 0.9, decaimento: 0.2, duracao: 0.25 }],
  ], PARAMS: {}, semente: 7 };
  const g7a = await renderarOffline(grao, { sampleRate: SR, semente: 7 });
  const g7b = await renderarOffline(grao, { sampleRate: SR, semente: 7 });
  const g8 = await renderarOffline(grao, { sampleRate: SR, semente: 8 });
  out.semente = { igualDelta: maxDelta(g7a, g7b), difDelta: maxDelta(g7a, g8), rms: rms(g7a) };

  // ===== 3. LFO (tremor): tom estável * (0.5 +/- profundidade a 10 Hz) =====
  const tremolo = (prof) => ({ PASSOS: [
    ['oscilador', { id: 'tom', tipo: 'seno', freq: 440 }],
    ['ganho', { id: 'g', de: 'tom', valor: 0.5 }],
    ['lfo', { id: 'trem', tipo: 'seno', freq: 10, profundidade: prof, alvo: { no: 'g', param: 'ganho' } }],
  ], PARAMS: {}, semente: 0 });
  const comLfo = await renderarOffline(tremolo(0.5), { sampleRate: SR, dur: 0.6 });
  const semLfo = await renderarOffline(tremolo(0), { sampleRate: SR, dur: 0.6 });
  const bloco = Math.round(SR / 100);          // envelope amostrado a 100 Hz (441 -> exato);
  const envSr = SR / bloco;                     // blocos longos (~4 períodos) baixam o chão do medidor
  out.lfo = {
    magCom: bin(envBloco(comLfo, bloco), 10, envSr),   // energia a 10 Hz no envelope
    magSem: bin(envBloco(semLfo, bloco), 10, envSr),
    rms: rms(comLfo),
  };

  // ===== 4. SOMA: mixa 440 e 660; as DUAS frequências presentes =====
  const somaEv = { PASSOS: [
    ['oscilador', { id: 'a', tipo: 'seno', freq: 440 }],
    ['oscilador', { id: 'b', tipo: 'seno', freq: 660 }],
    ['soma', { id: 'mix', de: ['a', 'b'] }],
    ['envelope', { id: 'out', de: 'mix', ataque: 0.01, pico: 0.8, decaimento: 0.3, duracao: 0.4 }],
  ], PARAMS: {}, semente: 0 };
  const sMix = await renderarOffline(somaEv, { sampleRate: SR });
  out.soma = { bin440: bin(sMix, 440, SR), bin660: bin(sMix, 660, SR), bin550: bin(sMix, 550, SR), rms: rms(sMix) };

  // ===== 5. VALIDAÇÃO (dados) + o caminho bom ainda renderiza =====
  const orfaoEv = { PASSOS: [
    ['oscilador', { id: 'o', freq: 440 }],
    ['envelope', { id: 'e', de: 'o', ataque: 0.01, pico: 0.9, decaimento: 0.1, duracao: 0.2 }],
    ['filtro', { id: 'f', de: 'fantasma', freq: 800 }],   // órfão: `de` inexistente
  ], PARAMS: {}, semente: 0 };
  const gOrfao = somNucleo(orfaoEv.PASSOS, orfaoEv.PARAMS, 0);
  const rOrfao = await renderarOffline(orfaoEv, { sampleRate: SR });
  const gDup = somNucleo([['oscilador', { id: 'o', freq: 440 }], ['oscilador', { id: 'o', freq: 880 }], ['envelope', { id: 'e', de: 'o', duracao: 0.2 }]], {}, 0);
  const gCiclo = somNucleo([['ganho', { id: 'a', de: 'b', valor: 1 }], ['ganho', { id: 'b', de: 'a', valor: 1 }]], {}, 0);
  out.validacao = {
    orfaoGrita: gOrfao.orfaos.some((o) => o.motivo.includes('inexistente')), orfaoSaida: gOrfao.saida, orfaoRms: rms(rOrfao),
    dupGrita: gDup.orfaos.some((o) => o.motivo.includes('duplicado')),
    cicloGrita: gCiclo.orfaos.some((o) => o.motivo.includes('ciclo')),
  };

  return out;
}, SR);

await browser.close();
server.close();

/* ---- afirmações por medição: cada uma DISCRIMINA ---- */
let falhas = 0;
const ok = (cond, msg, num) => { console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${msg}${num !== undefined ? ` — ${num}` : ''}`); if (!cond) falhas++; };
const f = (x, d = 5) => (typeof x === 'number' ? x.toFixed(d) : String(x));

console.log('\nbancada sintetizar — replay + prova do som via OfflineAudioContext\n');

const B = R.bolha;
console.log(`[1] bolha (${B.len} amostras @ ${SR} Hz)`);
ok(B.replayDelta === 0, `replay byte-a-byte: 2 renders, delta MÁX de amostra = 0`, f(B.replayDelta, 9));
ok(B.canonIgual, `somCanonico 2x idêntico (dados)`, `${B.canonLen} chars`);
ok(B.rms > 0.02, `faz som (RMS > 0)`, f(B.rms));
ok(B.picoT < 0.035, `envelope: pico perto do ataque (t < 35 ms)`, `${f(B.picoT * 1000, 2)} ms`);
ok(B.rmsInicio > B.rmsFim * 3, `envelope sobe-e-cai: RMS início >> fim (>3x)`, `${f(B.rmsInicio)} vs ${f(B.rmsFim)}`);
ok(B.zcB > B.zcA * 1.3, `sweep varre p/ cima: cruz. de zero tardias > iniciais`, `${B.zcA} -> ${B.zcB}`);

const S = R.semente;
console.log('\n[2] semente (grão de água: ruido -> filtro -> envelope)');
ok(S.igualDelta === 0, `mesma semente (7) 2x = mesmas amostras (delta 0)`, f(S.igualDelta, 9));
ok(S.difDelta > 0, `semente diferente (7 vs 8) = amostras diferentes`, f(S.difDelta));
ok(S.rms > 0.02, `grão faz som (RMS > 0)`, f(S.rms));

const L = R.lfo;
console.log('\n[3] lfo (tremor a 10 Hz no ganho)');
ok(L.magCom > L.magSem * 8, `energia a 10 Hz no envelope: COM lfo >> SEM`, `${f(L.magCom)} vs ${f(L.magSem)}`);
ok(L.rms > 0.02, `tremolo faz som (RMS > 0)`, f(L.rms));

const M = R.soma;
console.log('\n[4] soma (mixa 440 + 660 Hz)');
ok(M.bin440 > M.bin550 * 5 && M.bin660 > M.bin550 * 5, `as DUAS presentes, a ausente (550) fraca`, `440=${f(M.bin440)} 660=${f(M.bin660)} 550=${f(M.bin550)}`);
ok(M.rms > 0.02, `soma faz som (RMS > 0)`, f(M.rms));

const V = R.validacao;
console.log('\n[5] validação (órfão/duplicado/ciclo gritam; grafo intacto)');
ok(V.orfaoGrita, 'órfão (de inexistente) grita');
ok(V.orfaoSaida === 'e' && V.orfaoRms > 0.02, `caminho bom ainda renderiza (saída='${V.orfaoSaida}', RMS ${f(V.orfaoRms)})`);
ok(V.dupGrita, `id duplicado grita`);
ok(V.cicloGrita, `ciclo grita (aresta de volta derrubada)`);

if (errs.length) { falhas++; console.log(`\n  FALHA erros de página: ${errs.join(' | ')}`); }
console.log(falhas ? `\nsintetizar: ${falhas} falha(s)` : '\nsintetizar: replay PROVADO, som real, validação verde');
process.exit(falhas ? 1 : 0);
