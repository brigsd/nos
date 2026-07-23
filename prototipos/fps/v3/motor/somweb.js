/* somweb.js — ADAPTADOR do grafo de som -> Web Audio (passo 1 da Aba Som). O par
   do `adaptarV3` da Oficina: pega o GRAFO em dados que o `somNucleo` resolveu e
   monta os nós reais de Web Audio. `construirGrafo(grafo, ctx, quando)` funciona
   igual com `AudioContext` (tocar ao vivo, pro passo da UI) e com
   `OfflineAudioContext` (renderizar pra buffer — a prova do replay). Cada op vira
   o nó certo: oscilador->OscillatorNode, ruido->BufferSource com buffer semeado
   (a matemática do som.js, mas via rng determinístico), filtro->BiquadFilter,
   envelope/ganho/soma->GainNode. `alturaEnv` e `lfo` NÃO viram nó de áudio: viram
   AUTOMAÇÃO num AudioParam de outro nó — alturaEnv agenda o sweep na .frequency do
   `de`; lfo liga seu oscilador (via um ganho = profundidade) direto no AudioParam
   do alvo (o tremor). Todo acesso a Web Audio mora DENTRO das funções, então o
   módulo importa headless (vitest) sem tocar em globais de browser. Ver somnucleo.js. */

import { somNucleo, rng, sementeDe, ruidoAmostras, duracaoDoGrafo } from './somnucleo.js';

/* tradução dos enums do vocabulário (pt-BR, dado da peça) pros nomes do Web Audio */
const OSC_WEB = { seno: 'sine', quadrada: 'square', triangular: 'triangle', serra: 'sawtooth' };
const FILTRO_WEB = { 'passa-baixa': 'lowpass', 'passa-alta': 'highpass', 'passa-banda': 'bandpass' };

/* ----------------------------------------------------------------------------
   construirGrafo(grafo, ctx, quando=0): cria e liga os nós; agenda os envelopes,
   sweeps e o tremor do lfo; dispara as fontes em `quando`; devolve o nó de SAÍDA
   (o chamador liga em ctx.destination) + a duração e o mapa de nós montados.
   Dois passos: (A) cria cada nó e registra os AudioParams moduláveis; (B) liga as
   arestas de áudio, pluga a modulação e agenda as automações.
---------------------------------------------------------------------------- */
export function construirGrafo(grafo, ctx, quando = 0) {
  const dur = duracaoDoGrafo(grafo);
  const sr = ctx.sampleRate;
  const fimFontes = quando + dur + 0.03;   // cauda curta pra o decaimento fechar
  const montados = new Map();               // id -> { entrada, saida, params:{freq,ganho,q}, fontes:[], controle }

  /* ---- passo A: cria os nós de áudio e as fontes ---- */
  for (const no of grafo.nos) {
    const p = no.params;
    switch (no.tipo) {
      case 'oscilador': {
        const osc = ctx.createOscillator();
        osc.type = OSC_WEB[p.tipo] || 'sine';
        osc.frequency.value = p.freq;
        montados.set(no.id, { entrada: null, saida: osc, params: { freq: osc.frequency }, fontes: [osc] });
        break;
      }
      case 'ruido': {
        const n = Math.max(1, Math.floor(sr * (p.dur || dur)));
        const buf = ctx.createBuffer(1, n, sr);
        const amostras = ruidoAmostras(n, p.cor, p.k, rng(sementeDe(grafo.semente, no.id)));
        buf.getChannelData(0).set(amostras);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = false;
        montados.set(no.id, { entrada: null, saida: src, params: {}, fontes: [src] });
        break;
      }
      case 'lfo': {
        const osc = ctx.createOscillator();
        osc.type = OSC_WEB[p.tipo] || 'sine';
        osc.frequency.value = p.freq;
        const prof = ctx.createGain();
        prof.gain.value = p.profundidade;      // profundidade nas UNIDADES do param alvo
        osc.connect(prof);
        montados.set(no.id, { entrada: null, saida: null, params: { freq: osc.frequency }, fontes: [osc], controle: prof });
        break;
      }
      case 'filtro': {
        const f = ctx.createBiquadFilter();
        f.type = FILTRO_WEB[p.tipo] || 'lowpass';
        f.frequency.value = p.freq; f.Q.value = p.q;
        montados.set(no.id, { entrada: f, saida: f, params: { freq: f.frequency, q: f.Q }, fontes: [] });
        break;
      }
      case 'envelope': {
        const g = ctx.createGain();
        g.gain.value = 0;   // agendado no passo B
        montados.set(no.id, { entrada: g, saida: g, params: { ganho: g.gain }, fontes: [], env: p });
        break;
      }
      case 'ganho': {
        const g = ctx.createGain();
        g.gain.value = p.valor;
        montados.set(no.id, { entrada: g, saida: g, params: { ganho: g.gain }, fontes: [] });
        break;
      }
      case 'soma': {
        const g = ctx.createGain();
        g.gain.value = 1;
        montados.set(no.id, { entrada: g, saida: g, params: { ganho: g.gain }, fontes: [] });
        break;
      }
      case 'alturaEnv':
      default:
        break;   // modulador sem nó próprio; resolvido no passo B
    }
  }

  /* ---- passo B: liga arestas de áudio + pluga modulação + agenda automações ---- */
  for (const no of grafo.nos) {
    const m = montados.get(no.id);
    // áudio: cada `de` entra na entrada deste nó (soma mixa somando no mesmo GainNode)
    if (m && m.entrada) for (const d of no.de) { const src = montados.get(d); if (src && src.saida) src.saida.connect(m.entrada); }

    if (no.tipo === 'envelope' && m) agendarEnvelope(m.params.ganho, no.params, quando);

    if (no.tipo === 'alturaEnv' && no.alvo) {   // sweep de frequência do alvo
      const alvo = montados.get(no.alvo.no);
      if (alvo && alvo.params.freq) agendarSweep(alvo.params.freq, no.params, quando);
    }
    if (no.tipo === 'lfo' && no.alvo && m && m.controle) {   // tremor: ganho-do-lfo -> AudioParam do alvo
      const alvo = montados.get(no.alvo.no);
      const par = alvo && alvo.params[no.alvo.param];
      if (par) m.controle.connect(par);
    }
  }

  /* dispara todas as fontes (osciladores, ruído, lfos) em `quando` e as encerra
     na cauda — necessário pra tocar ao vivo; no offline o comprimento do contexto
     já corta, mas o stop explícito mantém o determinismo idêntico nos dois. */
  for (const m of montados.values()) for (const f of m.fontes) { f.start(quando); try { f.stop(fimFontes); } catch { /* já parado */ } }

  const saida = grafo.saida ? (montados.get(grafo.saida)?.saida ?? null) : null;
  return { saida, dur, montados };
}

/* envelope de GANHO no tempo: sobe a `pico` em `ataque` (linear), segura, e cai a
   ~0 até `duracao` (exponencial — a cara natural de decaimento; setValueAtTime(0)
   depois zera de verdade). O pico fica em t0+ataque: a "forma" que a bancada mede. */
function agendarEnvelope(gain, { ataque, pico, decaimento, duracao }, t0) {
  gain.cancelScheduledValues(t0);
  gain.setValueAtTime(0, t0);
  const tPico = t0 + Math.max(0, ataque);
  gain.linearRampToValueAtTime(Math.max(0, pico), tPico);
  const tDecai = t0 + Math.max(ataque, duracao - decaimento);
  if (pico > 0) {
    gain.setValueAtTime(pico, tDecai);            // segura no platô até o decaimento
    gain.exponentialRampToValueAtTime(Math.max(1e-4, pico * 1e-4), t0 + duracao);
  }
  gain.setValueAtTime(0, t0 + duracao);
}

/* sweep de ALTURA (o glissando da bolha): a frequência do alvo varre freq0->freq1
   em `tempo`, exponencial (como o `exponentialRampToValueAtTime` do `bolha` do
   som.js — a curva que soa como bolha subindo). Frequências são positivas, então
   a exponencial é válida. */
function agendarSweep(freqParam, { freq0, freq1, tempo }, t0) {
  freqParam.cancelScheduledValues(t0);
  freqParam.setValueAtTime(Math.max(1e-4, freq0), t0);
  freqParam.exponentialRampToValueAtTime(Math.max(1e-4, freq1), t0 + Math.max(1e-4, tempo));
}

/* ----------------------------------------------------------------------------
   renderarOffline(evento, opts): renderiza um evento pra Float32Array de amostras
   via OfflineAudioContext (roda no browser — é a "câmera" do som, o análogo do
   visor que renderiza o objeto). Determinístico no mesmo chromium: o MESMO evento
   sai byte-a-byte igual (a prova do replay). `evento` = { PASSOS, PARAMS, semente }
   (uma peça-som serve direto). opts.semente sobrescreve (pra provar que a semente
   discrimina); opts.dur/sampleRate/cauda ajustam a janela.
---------------------------------------------------------------------------- */
export async function renderarOffline(evento, opts = {}) {
  const semente = opts.semente ?? evento.semente ?? 0;
  const grafo = somNucleo(evento.PASSOS, evento.PARAMS ?? {}, semente);
  const sr = opts.sampleRate ?? 44100;
  const cauda = opts.cauda ?? 0.03;
  const dur = opts.dur ?? duracaoDoGrafo(grafo);
  const total = Math.max(1, Math.ceil(sr * (dur + cauda)));
  const Off = (typeof OfflineAudioContext !== 'undefined') ? OfflineAudioContext : globalThis.webkitOfflineAudioContext;
  const ctx = new Off(1, total, sr);
  const { saida } = construirGrafo(grafo, ctx, 0);
  if (saida) saida.connect(ctx.destination);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

/* tocarEvento(evento, ctx, quando): monta o evento num AudioContext AO VIVO e liga
   na saída — o caminho que o passo da UI vai usar pra dar play imediato. Devolve o
   nó de saída e a duração; o chamador pode `parar()` (encerra o contexto se for
   dedicado). Mesma máquina do offline, só que num contexto que toca. */
export function tocarEvento(evento, ctx, quando) {
  const t0 = quando ?? ctx.currentTime;
  const grafo = somNucleo(evento.PASSOS, evento.PARAMS ?? {}, evento.semente ?? 0);
  const { saida, dur, montados } = construirGrafo(grafo, ctx, t0);
  if (saida) saida.connect(ctx.destination);
  return { saida, dur, montados, grafo };
}
