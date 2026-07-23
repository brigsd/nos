/* Vitest do módulo de ANÁLISE do som (S3.5), SEM browser: prova o "ouvido"
   (motor/somanalise.js) em sinais SINTÉTICOS gerados aqui na mão (Math.sin), sem
   Web Audio — a análise é PURA (Float32Array → medida), então roda direto no
   vitest. Cobre o que discrimina: seno puro vira uma LINHA horizontal na sua
   frequência (o eixo de freq está certo), o centroide (brilho) segue a frequência
   e sobe com energia aguda, a trilha de tom sobe num sweep, o envelope acha o pico
   cedo, e a análise é DETERMINÍSTICA (mesmas amostras → mesmo espectrograma e
   mesmos descritores; amostras diferentes → mudam). O A/B contra eventos REAIS
   (renderarOffline no browser) é a bancada `analisar.mjs`; aqui é a matemática. */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — módulo .js do motor v3 (sem tipos; roda puro no vitest/esbuild)
import { analisar, frasesDescritores } from '../../prototipos/fps/v3/motor/somanalise.js';

const SR = 44100;

/* seno puro de amplitude constante */
function seno(f: number, dur: number, amp = 1): Float32Array {
  const n = Math.round(dur * SR);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin(2 * Math.PI * f * i / SR);
  return a;
}
/* sweep linear de frequência f0→f1 (fase = integral da frequência) */
function sweep(f0: number, f1: number, dur: number): Float32Array {
  const n = Math.round(dur * SR);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; const fase = 2 * Math.PI * (f0 * t + (f1 - f0) * t * t / (2 * dur)); a[i] = Math.sin(fase); }
  return a;
}
/* média/desvio de um pedaço de trilha */
function faixaTrilha(tr: Float32Array, q0: number, q1: number) {
  let mn = Infinity, mx = -Infinity, s = 0, n = 0;
  for (let q = q0; q <= q1; q++) { const v = tr[q]; if (v < mn) mn = v; if (v > mx) mx = v; s += v; n++; }
  return { min: mn, max: mx, media: s / Math.max(1, n) };
}

describe('espectrograma: o eixo de frequência está certo (seno → linha)', () => {
  it('um seno 440 é uma LINHA horizontal em ~440 Hz (bin de pico constante no tempo)', () => {
    const { espectrograma, descritores } = analisar(seno(440, 0.4), SR);
    expect(espectrograma.quadros).toBeGreaterThan(10);
    // a trilha de tom é ~constante em ~440 (uma linha reta), com desvio mínimo
    const p = descritores.pitch;
    const fx = faixaTrilha(p.trilha, p.quadroInicio, p.quadroFim);
    expect(fx.media).toBeGreaterThan(430);
    expect(fx.media).toBeLessThan(450);
    expect(fx.max - fx.min).toBeLessThan(3);        // reta: quase sem variação
    expect(p.inicioHz).toBeCloseTo(p.fimHz, 0);     // começa e termina no mesmo tom
  });

  it('um seno 880 SOBE a linha e o centroide (o eixo discrimina 440 de 880)', () => {
    const c440 = analisar(seno(440, 0.4), SR).descritores.brilho.centroideHz;
    const c880 = analisar(seno(880, 0.4), SR).descritores.brilho.centroideHz;
    expect(c440).toBeGreaterThan(415); expect(c440).toBeLessThan(465);
    expect(c880).toBeGreaterThan(840); expect(c880).toBeLessThan(920);
    expect(c880).toBeGreaterThan(c440 * 1.7);       // 880 ~= 2x 440, bem separado
  });
});

describe('brilho (centroide): mais energia aguda = mais brilho', () => {
  it('somar um agudo (300 + 2000) puxa o centroide PRA CIMA vs só o grave (300)', () => {
    const grave = seno(300, 0.4, 1);
    const misto = new Float32Array(grave.length);
    const agudo = seno(2000, 0.4, 1);
    for (let i = 0; i < misto.length; i++) misto[i] = 0.6 * grave[i] + 0.6 * agudo[i];
    const cGrave = analisar(grave, SR).descritores.brilho.centroideHz;
    const cMisto = analisar(misto, SR).descritores.brilho.centroideHz;
    expect(cGrave).toBeLessThan(360);
    expect(cMisto).toBeGreaterThan(cGrave * 2);      // o agudo levanta o brilho
  });
});

describe('tom no tempo: um sweep sobe', () => {
  it('um sweep 300→1200 tem pitch fim > início e a faixa cobre a subida', () => {
    const { descritores } = analisar(sweep(300, 1200, 0.4), SR);
    const p = descritores.pitch;
    expect(p.fimHz).toBeGreaterThan(p.inicioHz + 300);
    expect(p.inicioHz).toBeGreaterThan(230); expect(p.inicioHz).toBeLessThan(430);
    expect(p.maxHz).toBeGreaterThan(1050);           // a faixa alta chega perto do topo (1200)
    expect(p.minHz).toBeLessThan(430);
  });
});

describe('envelope: acha o pico e quando', () => {
  it('um seno que decai desde t=0 tem o pico CEDO (ataque < 35 ms, quadro 0)', () => {
    const n = Math.round(0.3 * SR);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; a[i] = Math.exp(-t / 0.03) * Math.sin(2 * Math.PI * 500 * i / SR); }
    const { descritores } = analisar(a, SR);
    expect(descritores.envelope.picoQuadro).toBe(0);
    expect(descritores.envelope.ataqueMs).toBeLessThan(35);
    expect(descritores.envelope.picoRms).toBeGreaterThan(0.1);
  });

  it('duração = amostras / sr', () => {
    const { descritores } = analisar(seno(440, 0.25), SR);
    expect(descritores.duracao).toBeCloseTo(0.25, 2);
  });
});

describe('determinismo: mesmo sinal → mesma medida; diferente → muda', () => {
  it('o MESMO sinal dá o MESMO espectrograma (byte-a-byte) e os MESMOS descritores', () => {
    const a = seno(440, 0.3);
    const A = analisar(a, SR), B = analisar(a, SR);
    // espectrograma idêntico (delta máx de dB = 0)
    let maxD = 0;
    for (let i = 0; i < A.espectrograma.db.length; i++) maxD = Math.max(maxD, Math.abs(A.espectrograma.db[i] - B.espectrograma.db[i]));
    expect(maxD).toBe(0);
    expect(A.descritores.brilho.centroideHz).toBe(B.descritores.brilho.centroideHz);
    expect(A.descritores.envelope.picoT).toBe(B.descritores.envelope.picoT);
    expect(A.descritores.pitch.inicioHz).toBe(B.descritores.pitch.inicioHz);
  });

  it('sinal DIFERENTE muda o espectrograma e o centroide', () => {
    const A = analisar(seno(440, 0.3), SR);
    const C = analisar(seno(660, 0.3), SR);
    let dif = 0;
    for (let i = 0; i < A.espectrograma.db.length; i++) if (A.espectrograma.db[i] !== C.espectrograma.db[i]) { dif++; }
    expect(dif).toBeGreaterThan(0);
    expect(A.descritores.brilho.centroideHz).not.toBe(C.descritores.brilho.centroideHz);
  });
});

describe('rótulos amigáveis', () => {
  it('frasesDescritores devolve leitura de gente (tom/faixa/brilho/ataque/duração)', () => {
    const { descritores } = analisar(seno(440, 0.3), SR);
    const fr = frasesDescritores(descritores);
    const rotulos = fr.map((x: any) => x.rotulo);
    expect(rotulos).toEqual(['tom', 'faixa', 'brilho', 'ataque', 'duração']);
    expect(fr.find((x: any) => x.rotulo === 'brilho').valor).toMatch(/Hz/);
    expect(fr.find((x: any) => x.rotulo === 'duração').valor).toMatch(/s$/);
  });
});
