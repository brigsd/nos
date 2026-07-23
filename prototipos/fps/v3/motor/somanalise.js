/* somanalise.js — a ANÁLISE do som (passo S3.5 da Aba Som): o "ouvido" que
   faltava. A IA e o usuário não-especialista não ESCUTAM, então o som se prova
   por MEDIDA e IMAGEM — este módulo transforma as amostras num ESPECTROGRAMA que
   dá pra VER (tempo × frequência × energia) e em DESCRITORES numéricos que dá pra
   comparar (o análogo sonoro de dar Read num PNG do render 3D). PURO e
   DETERMINÍSTICO: só recebe Float32Array + sample rate, faz STFT (janela Hann de
   1024, hop 256, magnitude em dB) e mede — SEM Date, SEM Math.random, SEM tocar em
   Web Audio nem canvas no topo (o helper de desenho só usa o contexto 2D DENTRO da
   função, então o módulo importa headless no vitest). O par de análise do
   `renderarOffline` (somweb.js) — ele é a "câmera" (evento → amostras), este é o
   "ouvido" (amostras → medida + imagem). Ver docs/oficina.md "## Aba Som" (S3.5).

   analisar(amostras, sr, opts) -> { espectrograma, descritores }
     espectrograma: matriz quadros×bins de dB (+ metadados de eixo) pra desenhar.
     descritores:  tom no tempo (pitch = bin de pico por quadro), brilho (centroide
       espectral), envelope (RMS por quadro → pico e quando), duração.
   desenharEspectrograma(ctx, W, H, espec, opts): pinta a matriz num canvas 2D.
   frasesDescritores(descritores): os rótulos amigáveis (linguagem de gente). */

/* parâmetros PADRÃO da STFT — mexer aqui muda a resolução de tempo×frequência de
   TODO mundo (aba + bancada), então ficam nomeados num lugar só. Hann 1024 @ 44.1k
   = ~23 ms de janela (resolução de freq ~43 Hz/bin); hop 256 = 1 quadro a cada
   ~5.8 ms (75% de sobreposição — trilha de pitch/envelope suave). */
export const JANELA = 1024;   // tamanho da janela Hann (potência de 2, pra FFT radix-2)
export const HOP = 256;       // avanço entre quadros (amostras)
export const FREQ_MAX = 4000; // topo do eixo de frequência MOSTRADO no espectrograma (Hz)
/* piso de energia pra um quadro CONTAR como "com som" (fração do quadro de pico):
   abaixo disso é silêncio/cauda e o bin de pico vira lixo — não entra no tom. */
const LIMIAR_ENERGIA = 0.005; // -46 dB do pico

/* ----------------------------------------------------------------------------
   FFT radix-2 iterativa (Cooley-Tukey), in-place, com tabelas de bit-reversal e
   twiddles PRÉ-CALCULADAS e cacheadas por N. Aritmética pura de ponto flutuante:
   o MESMO vetor de entrada dá o MESMO espectro, sempre (determinismo). N é sempre
   potência de 2 (JANELA=1024).
---------------------------------------------------------------------------- */
const _tabFft = new Map();
function tabelasFft(n) {
  let t = _tabFft.get(n);
  if (t) return t;
  const rev = new Uint32Array(n);
  const bits = Math.round(Math.log2(n));
  for (let i = 0; i < n; i++) { let x = i, r = 0; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r >>> 0; }
  const cos = new Float64Array(n >> 1), sin = new Float64Array(n >> 1);
  for (let i = 0; i < (n >> 1); i++) { const a = -2 * Math.PI * i / n; cos[i] = Math.cos(a); sin[i] = Math.sin(a); }
  t = { rev, cos, sin };
  _tabFft.set(n, t);
  return t;
}
function fft(re, im) {
  const n = re.length;
  const { rev, cos, sin } = tabelasFft(n);
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; } }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, passo = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0, idx = 0; k < half; k++, idx += passo) {
        const wr = cos[idx], wi = sin[idx];
        const a = i + k, b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
      }
    }
  }
}

/* janela de Hann cacheada por N (periódica: divide por N, não N-1 — a que casa com
   o espectro do Web Audio). Coerente = tira o vazamento das bordas do quadro. */
const _tabHann = new Map();
function hann(n) {
  let w = _tabHann.get(n);
  if (w) return w;
  w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
  _tabHann.set(n, w);
  return w;
}

/* interpolação parabólica no pico (sub-bin): refina a frequência do bin de pico
   usando os vizinhos em dB — um pico de janela Hann é ~parábola em log-magnitude,
   então isto tira a "escada" da resolução de bin (o 440 sai ~440, não ~431). */
function refinaPico(dbEsq, dbPico, dbDir) {
  const den = dbEsq - 2 * dbPico + dbDir;
  if (den === 0) return 0;
  let d = 0.5 * (dbEsq - dbDir) / den;
  if (d > 0.5) d = 0.5; else if (d < -0.5) d = -0.5;
  return d;
}

const emDb = (mag) => 20 * Math.log10(mag + 1e-12);

/* ----------------------------------------------------------------------------
   analisar(amostras, sr, opts): o "ouvido". STFT determinística + descritores.
   opts: { janela, hop, freqMax, limiar } sobrescrevem os padrões.
---------------------------------------------------------------------------- */
export function analisar(amostras, sr, opts = {}) {
  const N = opts.janela ?? JANELA;
  const hop = opts.hop ?? HOP;
  const freqMax = opts.freqMax ?? FREQ_MAX;
  const limiar = opts.limiar ?? LIMIAR_ENERGIA;
  const win = hann(N);
  const freqPorBin = sr / N;
  const nBinsCompleto = (N >> 1) + 1;                 // 0..N/2 (Nyquist)
  const bins = Math.min(nBinsCompleto, Math.max(1, Math.ceil(freqMax / freqPorBin) + 1));
  const len = amostras.length;
  const quadros = len >= N ? Math.floor((len - N) / hop) + 1 : 1;
  const dur = len / sr;

  /* a matriz do espectrograma (dB), quadros×bins, linha-maior [q*bins + bin] — só
     os bins ATÉ freqMax (o que se mostra); os descritores usam o espectro inteiro. */
  const db = new Float32Array(quadros * bins);
  const trilhaPitch = new Float32Array(quadros);      // Hz do bin de pico por quadro
  const trilhaBrilho = new Float32Array(quadros);     // centroide por quadro (Hz)
  const trilhaRms = new Float32Array(quadros);        // RMS do bloco cru por quadro
  let dbMax = -Infinity;

  // acumuladores do CENTROIDE global (ponderado por magnitude — quadro mais alto pesa mais)
  let somaFMag = 0, somaMag = 0;

  const re = new Float64Array(N), im = new Float64Array(N);
  const magFrame = new Float64Array(nBinsCompleto);

  for (let q = 0; q < quadros; q++) {
    const base = q * hop;
    // RMS do bloco CRU (sem janela) — o envelope de amplitude honesto
    let somaQuad = 0, nQuad = 0;
    for (let i = 0; i < N; i++) {
      const idx = base + i;
      const s = idx < len ? amostras[idx] : 0;
      re[i] = s * win[i]; im[i] = 0;                  // janela Hann só pra o espectro
      if (idx < len) { somaQuad += s * s; nQuad++; }
    }
    trilhaRms[q] = Math.sqrt(somaQuad / Math.max(1, nQuad));
    fft(re, im);

    // magnitude por bin (0..Nyquist) + acumula centroide + acha o pico
    let picoBin = 1, picoMag = -1, cFMag = 0, cMag = 0;
    for (let k = 0; k < nBinsCompleto; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
      magFrame[k] = m;
      if (k >= 1) {                                    // pula o DC (bin 0) — não é tom nem brilho
        const f = k * freqPorBin;
        cFMag += f * m; cMag += m;
        if (m > picoMag) { picoMag = m; picoBin = k; }
      }
      if (k < bins) { const d = emDb(m); db[q * bins + k] = d; if (d > dbMax) dbMax = d; }
    }
    somaFMag += cFMag; somaMag += cMag;
    trilhaBrilho[q] = cMag > 0 ? cFMag / cMag : 0;

    // tom do quadro: freq do bin de pico, refinada sub-bin por parábola em dB
    let pf = picoBin;
    if (picoBin >= 1 && picoBin < nBinsCompleto - 1) pf += refinaPico(emDb(magFrame[picoBin - 1]), emDb(magFrame[picoBin]), emDb(magFrame[picoBin + 1]));
    trilhaPitch[q] = pf * freqPorBin;
  }
  if (!Number.isFinite(dbMax)) dbMax = 0;
  const dbMin = dbMax - (opts.dinamicaDb ?? 72);       // faixa dinâmica mostrada (dB abaixo do pico)

  /* ---- descritores a partir das trilhas ---- */
  // envelope: pico do RMS por quadro e QUANDO (centro do quadro de pico)
  let picoQuadro = 0, picoRms = 0;
  for (let q = 0; q < quadros; q++) if (trilhaRms[q] > picoRms) { picoRms = trilhaRms[q]; picoQuadro = q; }
  const picoT = (picoQuadro * hop + N / 2) / sr;

  // tom: só nos quadros COM energia (>= limiar do pico) — fora disso o pico é lixo
  const porta = picoRms * limiar;
  let iniQ = -1, fimQ = -1, minHz = Infinity, maxHz = -Infinity;
  for (let q = 0; q < quadros; q++) {
    if (trilhaRms[q] < porta) continue;
    if (iniQ < 0) iniQ = q;
    fimQ = q;
    const hz = trilhaPitch[q];
    if (hz < minHz) minHz = hz;
    if (hz > maxHz) maxHz = hz;
  }
  const temTom = iniQ >= 0;
  const pitch = {
    inicioHz: temTom ? trilhaPitch[iniQ] : 0,
    fimHz: temTom ? trilhaPitch[fimQ] : 0,
    minHz: temTom ? minHz : 0,
    maxHz: temTom ? maxHz : 0,
    quadroInicio: iniQ, quadroFim: fimQ,
    trilha: trilhaPitch,
  };
  // brilho global: centroide ponderado por magnitude sobre o sinal todo
  const centroideHz = somaMag > 0 ? somaFMag / somaMag : 0;

  const espectrograma = {
    janela: N, hop, sr, quadros, bins, freqPorBin,
    freqMax: bins * freqPorBin, dur,
    tempoPorQuadro: hop / sr,
    db, dbMax, dbMin,
  };
  const descritores = {
    duracao: dur,
    pitch,
    brilho: { centroideHz, trilha: trilhaBrilho },
    envelope: { picoRms, picoT, picoQuadro, ataqueMs: picoT * 1000, trilha: trilhaRms },
  };
  return { espectrograma, descritores };
}

/* ----------------------------------------------------------------------------
   COLORMAP "magma" (preto → roxo → laranja → amarelo): lê bem no fundo escuro do
   app e o t=0 já quase some no fundo. Interpola linear entre âncoras. Puro.
---------------------------------------------------------------------------- */
const MAGMA = [
  [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
  [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 253, 191],
];
function cor(t) {
  if (t <= 0) return MAGMA[0];
  if (t >= 1) return MAGMA[MAGMA.length - 1];
  const x = t * (MAGMA.length - 1), i = Math.floor(x), f = x - i;
  const a = MAGMA[i], b = MAGMA[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/* desenharEspectrograma(ctx, W, H, espec, opts): pinta a matriz de dB num canvas 2D
   de W×H pixels de dispositivo (x = tempo, y = frequência com o GRAVE embaixo, cor =
   energia). Amostra a matriz por pixel (nearest) e escreve uma ImageData de uma vez —
   determinístico (mesma matriz + mesmo W/H → mesmos pixels). opts.trilhaPitch desenha
   a trilha de tom por cima (bônus). O contexto só é tocado AQUI (headless-safe). */
export function desenharEspectrograma(ctx, W, H, espec, opts = {}) {
  W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
  const { db, quadros, bins, dbMax, dbMin } = espec;
  const faixa = (dbMax - dbMin) || 1;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    // y=0 (topo) = freq MAIS ALTA; y=H-1 (base) = freq mais baixa (grave embaixo)
    const bin = Math.min(bins - 1, Math.floor((1 - y / H) * bins));
    for (let x = 0; x < W; x++) {
      const q = Math.min(quadros - 1, Math.floor(x / W * quadros));
      const t = (db[q * bins + bin] - dbMin) / faixa;
      const c = cor(t < 0 ? 0 : t > 1 ? 1 : t);
      const o = (y * W + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // bônus: a trilha de PITCH por cima (linha ciano), só nos quadros com tom
  const tr = opts.trilhaPitch;
  if (tr && tr.trilha && espec.freqMax > 0) {
    const fTopo = espec.freqMax;
    ctx.save();
    ctx.strokeStyle = opts.corTrilha || 'rgba(120,230,255,0.9)';
    ctx.lineWidth = Math.max(1, opts.espessura || Math.round(H / 200));
    ctx.beginPath();
    let iniciou = false;
    const q0 = tr.quadroInicio, q1 = tr.quadroFim;
    for (let q = q0; q >= 0 && q <= q1; q++) {
      const hz = tr.trilha[q];
      if (hz <= 0 || hz > fTopo) { iniciou = false; continue; }
      const x = (q + 0.5) / quadros * W;
      const y = (1 - hz / fTopo) * H;
      if (!iniciou) { ctx.moveTo(x, y); iniciou = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/* frasesDescritores(descritores): os RÓTULOS AMIGÁVEIS (linguagem de gente, não
   "centroide espectral" cru) — a MESMA formatação pra a aba e a bancada. Devolve
   uma lista de { rotulo, valor } pra montar o bloco de leitura. */
export function frasesDescritores(d) {
  const hz = (v) => `${Math.round(v)} Hz`;
  const p = d.pitch;
  const temTom = p.quadroInicio >= 0 && p.inicioHz > 0;
  return [
    { rotulo: 'tom', valor: temTom ? `${hz(p.inicioHz)} → ${hz(p.fimHz)}` : 'sem tom claro' },
    { rotulo: 'faixa', valor: temTom ? `${hz(p.minHz)} – ${hz(p.maxHz)}` : '—' },
    { rotulo: 'brilho', valor: `~${hz(d.brilho.centroideHz)}` },
    { rotulo: 'ataque', valor: `${Math.round(d.envelope.ataqueMs)} ms` },
    { rotulo: 'duração', valor: `${d.duracao.toFixed(2)} s` },
  ];
}
