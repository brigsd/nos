#!/usr/bin/env node
/* somab.mjs — o A/B do SOM (S5b, o FECHO do ouvido da Aba Som): compara o passo
   REAL do jogo (a síntese granular do motor/som.js) com o preset `_passo`
   (pecas-som/_passo.js) PELO OUVIDO — os descritores de motor/somanalise.js
   (`analisar`) sobre renders OFFLINE. O passo real é renderizado SEM tocar no
   som.js: um STUB de window.AudioContext embrulha OfflineAudioContext, então
   `criarSom()->ensure()->passo()` cai no offline e `startRendering()` devolve as
   amostras; o ambiente é mutado (setVolumes({ambiente:0})) pra isolar a pisada do
   leito de vento/água. O passo real VARIA (Math.random), então renderiza N vezes e
   caracteriza a FAIXA (média±desvio, min–max) de centroide/ataque/duração/pico/
   achatamento; o preset (determinístico, semente fixa) é uma amostra só — o A/B diz
   se ele cai DENTRO da faixa e a distância em cada eixo. Também PROVA a PONTE nova
   (tocarEvento liga a saída do evento no barramento eventosG: entra no mix e respeita
   o volume de ambiente, some quando ambiente=0) e a NÃO-REGRESSÃO (criarSom() SEM
   stub, num AudioContext real: passo/proximidadeAgua/setVolumes/ensure/tocarEvento
   rodam, os agendadores disparam, 0 erro de console). Precisa do Chromium (Web Audio
   mora no browser); sem rede externa. O "soa bonito?" é do ideador; isto mede.
     npm run somab            # A/B + ponte + não-regressão
     node tools/bancadas/somab.mjs */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SR = 44100;    // taxa fixa do render (determinismo)
const DUR = 0.6;     // janela do render (s) — IGUAL pros dois lados, pra a medida não depender do tamanho do buffer
const N = 20;        // renders do passo real (ele varia por Math.random)

/* server estático mínimo servindo o REPO (pros imports de módulo) + uma página em
   branco na origem (import dinâmico, OfflineAudioContext e AudioContext precisam de http). */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__somab.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><meta charset="utf-8"><title>somab bench</title>'); return; }
  const p = join(REPO, decodeURIComponent(url.pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const PW = join(REPO, 'node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('somab: Playwright não encontrado. Rode uma vez: npm ci (na raiz)'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${base}/__somab.html`, { waitUntil: 'load' });

/* tudo o que precisa de amostras roda DENTRO do browser (o Web Audio mora lá) e volta
   só NÚMEROS — nada de despejar Float32Array de dezenas de milhares de amostras pela ponte. */
const R = await page.evaluate(async ({ SR, DUR, N }) => {
  const { criarSom } = await import('/prototipos/fps/v3/motor/som.js');
  const { renderarOffline } = await import('/prototipos/fps/v3/motor/somweb.js');
  const { analisar } = await import('/prototipos/fps/v3/motor/somanalise.js');
  const _passo = await import('/prototipos/fps/v3/pecas-som/_passo.js');

  const LEN = Math.ceil(SR * DUR);
  const REAL_AC = window.AudioContext;   // guarda o AudioContext REAL do browser (pra não-regressão)

  // ---- medidores puros ----
  const rms = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
  const maxDelta = (a, b) => { let m = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; } return m; };

  /* descritores PELO OUVIDO (somanalise → analisar): os eixos comparáveis do A/B.
     - centroide (brilho): centroide espectral global (Hz).
     - ataqueMs: quando o RMS pica (o ataque do envelope).
     - picoRms: amplitude de pico do envelope.
     - durEfetivaMs: janela com energia (o gating do próprio analisar, iníc/fim do tom).
     - flatness: achatamento espectral (Wiener) do espectro MÉDIO — 1 = ruído chato,
       ~0 = tonal/concentrado. Um passo é ruído filtrado: espectro concentrado. */
  const descreve = (amostras) => {
    const { espectrograma, descritores } = analisar(amostras, SR);
    const centroide = descritores.brilho.centroideHz;
    const ataqueMs = descritores.envelope.ataqueMs;
    const picoRms = descritores.envelope.picoRms;
    const p = descritores.pitch;
    const durEfetivaMs = p.quadroInicio >= 0 ? (p.quadroFim - p.quadroInicio) * espectrograma.tempoPorQuadro * 1000 : 0;
    // achatamento: espectro médio (db->magnitude linear), depois geomédia/média nos bins 1..bins-1
    const { db, quadros, bins } = espectrograma;
    let lnSoma = 0, arSoma = 0, cnt = 0;
    for (let k = 1; k < bins; k++) {
      let s = 0; for (let q = 0; q < quadros; q++) s += Math.pow(10, db[q * bins + k] / 20);
      const m = s / quadros + 1e-12;
      lnSoma += Math.log(m); arSoma += m; cnt++;
    }
    const flatness = Math.exp(lnSoma / cnt) / (arSoma / cnt);
    return { centroide, ataqueMs, picoRms, durEfetivaMs, flatness };
  };

  // localStorage acopla instâncias (setVolumes grava, criarSom lê): zera antes de cada uma
  const novoSom = () => { try { localStorage.removeItem('nos3_som'); } catch { /* ok */ } return criarSom(); };

  /* renderiza o PASSO REAL offline, SEM tocar no som.js: stub de window.AudioContext
     = wrapper de OfflineAudioContext; captura a instância que o build() cria. */
  const renderPassoReal = async (tipo, sprint) => {
    let cap = null;
    class StubAC extends OfflineAudioContext { constructor() { super(1, LEN, SR); cap = this; } }
    window.AudioContext = StubAC; window.webkitAudioContext = StubAC;
    try {
      const som = novoSom();
      som.ensure();                          // build() -> new StubAC() (AC era null: build, sem resume); cap = a instância
      som.setVolumes({ ambiente: 0 });       // isola a pisada do leito de vento/água
      som.passo(1.0, tipo, sprint);          // lastStep=-1 -> dispara; t0 = AC.currentTime = 0
      const buf = await cap.startRendering();
      return buf.getChannelData(0);
    } finally { window.AudioContext = REAL_AC; window.webkitAudioContext = REAL_AC; }
  };

  /* renderiza a PONTE (tocarEvento) offline: monta o evento e liga no eventosG. */
  const renderPonte = async ({ mudarAmbiente } = {}) => {
    let cap = null;
    class StubAC extends OfflineAudioContext { constructor() { super(1, LEN, SR); cap = this; } }
    window.AudioContext = StubAC; window.webkitAudioContext = StubAC;
    try {
      const som = novoSom();
      if (mudarAmbiente !== undefined) som.setVolumes({ ambiente: mudarAmbiente }); // AC null: só fixa ambienteVol; build lê no eventosG.gain.value
      const g = som.tocarEvento(_passo);     // 1ª chamada: ensure()->build() (AC null: sem resume); liga saida->eventosG
      const buf = await cap.startRendering();
      return { rms: rms(buf.getChannelData(0)), ligou: !!(g && g.saida) };
    } finally { window.AudioContext = REAL_AC; window.webkitAudioContext = REAL_AC; }
  };

  const out = {};

  // ===== A. A/B: passo REAL (N renders) vs preset _passo =====
  const reais = [];
  for (let i = 0; i < N; i++) reais.push(descreve(await renderPassoReal('grama', false)));
  // preset: determinístico (semente fixa) — render 2x pra provar byte-a-byte, descreve 1x
  const pre1 = await renderarOffline(_passo, { sampleRate: SR, dur: DUR, cauda: 0 });
  const pre2 = await renderarOffline(_passo, { sampleRate: SR, dur: DUR, cauda: 0 });
  out.ab = {
    reais,                                   // [{centroide,ataqueMs,picoRms,durEfetivaMs,flatness} x N]
    preset: descreve(pre1),
    presetReplayDelta: maxDelta(pre1, pre2), // 0 = determinístico
  };

  // ===== B. A PONTE: tocarEvento liga no eventosG (mix, sob ambiente) =====
  const rawRms = rms(await renderarOffline(_passo, { sampleRate: SR, dur: DUR, cauda: 0 })); // evento cru no destination (ganho 1)
  const play = await renderPonte({});                     // ambiente default 0.8: toca no mix
  const mute = await renderPonte({ mudarAmbiente: 0 });   // ambiente 0: eventosG.gain=0 -> some
  out.ponte = {
    rawRms, playRms: play.rms, muteRms: mute.rms, ligou: play.ligou,
    razao: rawRms > 0 ? play.rms / rawRms : 0,   // ~0.8 (o ganho de eventosG); ~1.0 seria destination (fura o mix)
  };

  // ===== C. NÃO-REGRESSÃO: criarSom() SEM stub, AudioContext REAL =====
  window.AudioContext = REAL_AC; window.webkitAudioContext = REAL_AC;
  const reg = { erro: null };
  try {
    const som = novoSom();
    som.ensure();                                   // AudioContext real
    reg.estadoInicial = som.debug().estado;
    som.passo(1.0, 'grama', false);
    som.passo(1.5, 'areia', true);
    som.proximidadeAgua(3.0);                        // liga o fundo de água + alimenta o agendador
    som.setVolumes({ ambiente: 0.5, passos: 0.7 });
    som.tocarEvento(_passo);                          // a ponte AO VIVO
    await new Promise((r) => setTimeout(r, 800));    // deixa os agendadores (agendarAgua/agendarRajada) dispararem
    reg.estadoFinal = som.debug().estado;
    reg.volumes = som.volumes();
    reg.waterGain = som.debug().waterGain;
    som.destroy();
  } catch (e) { reg.erro = String(e && e.stack || e); }
  out.reg = reg;

  return out;
}, { SR, DUR, N });

await browser.close();
server.close();

/* ---- estatística + relatório ---- */
const stats = (arr) => {
  const n = arr.length, mean = arr.reduce((a, b) => a + b, 0) / n;
  const varr = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return { mean, std: Math.sqrt(varr), min: Math.min(...arr), max: Math.max(...arr), n };
};
let falhas = 0;
const ok = (cond, msg, num) => { console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${msg}${num !== undefined ? ` — ${num}` : ''}`); if (!cond) falhas++; };
const f = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : String(x));

console.log('\nbancada somab — A/B do passo (real vs _passo) + a ponte + não-regressão\n');

// ===== A. A/B =====
const AB = R.ab;
const EIXOS = [
  { k: 'centroide',    rot: 'brilho/centroide', un: 'Hz', d: 0 },
  { k: 'ataqueMs',     rot: 'ataque',           un: 'ms', d: 1 },
  { k: 'durEfetivaMs', rot: 'duração efetiva',  un: 'ms', d: 0 },
  { k: 'picoRms',      rot: 'pico do envelope', un: '',   d: 3 },
  { k: 'flatness',     rot: 'achatam. espectral', un: '', d: 4 },
];
console.log(`[A] A/B — passo REAL do jogo (grama, N=${AB.reais.length} renders) vs preset _passo\n`);
console.log('  eixo                  real: média ± desvio   [min – max]           _passo     z     dentro?');
console.log('  ' + '-'.repeat(92));
let dentroTodos = 0;
for (const e of EIXOS) {
  const s = stats(AB.reais.map((r) => r[e.k]));
  const pv = AB.preset[e.k];
  const dentro = pv >= s.min && pv <= s.max;
  if (dentro) dentroTodos++;
  const z = s.std > 0 ? (pv - s.mean) / s.std : 0;
  const un = e.un ? ' ' + e.un : '';
  const col = (x) => f(x, e.d) + un;
  console.log(
    `  ${(e.rot + (e.un ? ` (${e.un})` : '')).padEnd(22)}` +
    `${(f(s.mean, e.d) + ' ± ' + f(s.std, e.d)).padEnd(22)}` +
    `[${f(s.min, e.d)} – ${f(s.max, e.d)}]`.padEnd(22) +
    `${f(pv, e.d).padStart(8)}  ${(z >= 0 ? '+' : '') + f(z, 1).padStart(5)}   ${dentro ? 'SIM' : 'não'}`
  );
}
console.log('');
const picoReal = stats(AB.reais.map((r) => r.picoRms));
ok(picoReal.min > 0.003, 'passo real faz som em TODOS os N renders (pico do envelope > 0)', `min ${f(picoReal.min, 3)}`);
ok(AB.preset.picoRms > 0.003, 'preset _passo faz som (pico do envelope > 0)', f(AB.preset.picoRms, 3));
ok(AB.presetReplayDelta === 0, 'preset é determinístico (2 renders byte-a-byte)', f(AB.presetReplayDelta, 9));
{
  const sc = stats(AB.reais.map((r) => r.centroide));
  ok(sc.std > 0, 'passo real VARIA (desvio do centroide > 0)', `${f(sc.std, 1)} Hz`);
  // sanidade FROUXA (barra regressão grosseira, não julga timbre): preset no mesmo campo
  const razaoC = AB.preset.centroide / sc.mean;
  ok(razaoC > 0.5 && razaoC < 2, 'preset no MESMO campo de brilho do real (0.5x–2x)', `${f(razaoC, 2)}x`);
  const sd = stats(AB.reais.map((r) => r.durEfetivaMs));
  const razaoD = AB.preset.durEfetivaMs / (sd.mean || 1);
  // guarda de regressão GROSSEIRA (não julga o timbre): o preset condensa 16 grãos
  // espalhados em 1, então É mais curto que o passo real — a distância exata está na
  // tabela acima (z da duração). Aqui só barra o preset degenerar (silêncio/estouro).
  ok(razaoD > 0.15 && razaoD < 6, 'preset na ordem de grandeza da duração do real (guarda frouxa)', `${f(razaoD, 2)}x`);
}
console.log(`  → o preset cai dentro da faixa [min–max] em ${dentroTodos}/${EIXOS.length} eixos (o resto é a distância medida acima; "soa bom" é do ideador).`);

// ===== B. A PONTE =====
const P = R.ponte;
console.log('\n[B] a ponte — tocarEvento liga a saída do evento no barramento eventosG (o mix)');
ok(P.ligou, 'tocarEvento devolve o grafo com saída (ligou no eventosG)');
ok(P.playRms > 0.002, 'evento TOCA no mix (RMS > 0 com ambiente padrão)', f(P.playRms, 4));
ok(P.razao > 0.7 && P.razao < 0.9, 'saída sob o volume de AMBIENTE (~0.8 do cru), NÃO no destination (~1.0)', `${f(P.razao, 3)}x`);
ok(P.muteRms < P.playRms * 0.02, 'ambiente=0 SILENCIA o evento (passa pelo bus de ambiente)', `${f(P.muteRms, 6)} vs ${f(P.playRms, 4)}`);

// ===== C. NÃO-REGRESSÃO =====
const G = R.reg;
console.log('\n[C] não-regressão — criarSom() SEM stub (AudioContext real): a API de sempre + a ponte');
ok(!G.erro, 'nenhuma exceção ao rodar ensure/passo/proximidadeAgua/setVolumes/tocarEvento', G.erro || 'ok');
ok(typeof G.estadoFinal === 'string', 'ensure criou o contexto (debug().estado responde)', `${G.estadoInicial} → ${G.estadoFinal}`);
ok(G.volumes && G.volumes.ambiente === 0.5 && G.volumes.passos === 0.7, 'setVolumes aplicou (volumes lê de volta)', JSON.stringify(G.volumes));
ok(typeof G.waterGain === 'number' && G.waterGain > 0, 'proximidadeAgua abriu o fundo de água (waterGain > 0)', f(G.waterGain, 4));
ok(errs.length === 0, '0 erro de console na página', errs.length ? errs.join(' | ') : '0');

console.log(falhas ? `\nsomab: ${falhas} falha(s)` : '\nsomab: A/B medido, ponte no mix PROVADA, áudio do jogo preservado');
process.exit(falhas ? 1 : 0);
