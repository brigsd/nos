/* PRESET-SOM _vento (Aba Som, S4) — a RAJADA de vento re-expressa como GRAFO de evento,
   com os NÚMEROS tunados do vento do motor/som.js. Nível FÁCIL do vocabulário (D-73): um
   som pronto pra variar, feito COM os blocos do S3 — ao abrir já é editável (S3) e
   analisável (S3.5). Vento é LARGO (ruído filtrado, não-tonal), SUSTENTADO (dura) e com
   ONDULAÇÃO (o tremor da turbulência).

   A cadeia do vento no som.js é multi-caminho; aqui vai a versão FIEL-MAS-MAIS-SIMPLES (o
   A/B exato é o S5). O que foi mantido, com os números de lá:
     - ruido meio-rosa k=0.12  (o `makeNoise(3, 0.12)` do vento, corte ~866 Hz)
     - passa-alta 150 Hz Q 0.5 (o `wHP` — tira o ronco grave)
     - caminho 1: passa-BAIXA 1200 Hz Q 0.5, ganho 0.6 (o `wLP`+`gainLP` — a base LARGA)
     - caminho 2: passa-BANDA 600 Hz Q 1.8, ganho 0.3 (o `bp1`+`gainBP1` — a ressonância),
       com a frequência DERIVANDO num LFO lento de 0.07 Hz, ±180 Hz (o `lfoBP1`+`lfoBP1Amt`)
     - soma dos dois caminhos (o `mixerG`)
     - TREMOR de amplitude: um LFO no ganho, ±0.35 (a `turbulência`, `turbProf` 0.35, que no
       som.js MULTIPLICA o volume em 0.65..1.35) — é a ONDULAÇÃO que a análise mede
     - envelope da RAJADA (sobe-segura-cai): ataque/platô/queda (o meio-cosseno do `rajada()`)

   SIMPLIFICAÇÕES anotadas (S5 faz o A/B fiel): dropei o 3º caminho (bp2 900 Hz), o assobio
   (bandpass Q 14) e a calibração absoluta do `windG` (0.067) — não mudam o CARÁTER. A
   turbulência do som.js é uma SOMA de senoides (0.25–7 Hz, um buffer em laço); aqui vira UM
   seno representativo a 2 Hz (dentro dessa banda) — assim a ondulação é AUDÍVEL e MEDÍVEL
   num clipe curto (a 0.25 Hz mal completaria um ciclo). A deriva do bandpass fica FIEL a
   0.07 Hz (lenta, timbral). Determinístico. */

import { somNucleo, duracaoDoGrafo } from '../motor/somnucleo.js';
import { construirGrafo } from '../motor/somweb.js';

export const PARAMS = {
  corteHP: 150,       // Hz do passa-alta (som.js wHP)
  corteBase: 1200,    // Hz do passa-baixa da base larga (som.js wLP)
  ganhoBase: 0.6,     // contribuição da base (som.js gainLP)
  freqResson: 600,    // Hz do bandpass ressonante (som.js bp1)
  qResson: 1.8,       // Q do bandpass (som.js bp1.Q)
  ganhoResson: 0.3,   // contribuição da ressonância (som.js gainBP1)
  derivaFreq: 0.07,   // Hz do LFO lento da deriva (som.js lfoBP1.frequency)
  derivaAmt: 180,     // Hz de profundidade da deriva (som.js lfoBP1Amt)
  turbFreq: 2.0,      // Hz do tremor (representa a turbulência 0.25–7 Hz do som.js)
  turbProf: 0.35,     // profundidade do tremor (som.js turbProf 0.35 — 0.65..1.35 do volume)
  // envelope da rajada (som.js rajada(): subida ~1.2 s, platô, queda ~2.2 s)
  ataque: 1.2,        // s de subida
  pico: 0.8,          // ganho de pico
  decaimento: 2.2,    // s de queda (vento sumindo NUNCA de estalo)
  duracao: 4.5,       // s da rajada inteira (SUSTENTADO)
};

export const semente = 4242;

/* dois caminhos de ruído filtrado (base larga + ressonância que deriva), somados,
   com tremor de amplitude e o envelope da rajada. A `soma` alimenta o ganho→envelope;
   o envelope é o único nó de áudio livre = a SAÍDA. Os LFOs são moduladores (não somam
   áudio): `deriva` varre a freq do bandpass, `turbulencia` treme o ganho. */
export const PASSOS = [
  ['ruido',    { id: 'ar', cor: 'rosa', k: 0.12 }],
  ['filtro',   { id: 'hp', de: 'ar', tipo: 'passa-alta', freq: 'corteHP', q: 0.5 }],
  // caminho 1 — a base LARGA (passa-baixa)
  ['filtro',   { id: 'base', de: 'hp', tipo: 'passa-baixa', freq: 'corteBase', q: 0.5 }],
  ['ganho',    { id: 'gBase', de: 'base', valor: 'ganhoBase' }],
  // caminho 2 — a RESSONÂNCIA (passa-banda) com a freq derivando
  ['filtro',   { id: 'resson', de: 'hp', tipo: 'passa-banda', freq: 'freqResson', q: 'qResson' }],
  ['lfo',      { id: 'deriva', tipo: 'seno', freq: 'derivaFreq', profundidade: 'derivaAmt', alvo: { no: 'resson', param: 'freq' } }],
  ['ganho',    { id: 'gResson', de: 'resson', valor: 'ganhoResson' }],
  // mistura + tremor da turbulência + envelope da rajada
  ['soma',     { id: 'mix', de: ['gBase', 'gResson'] }],
  ['ganho',    { id: 'tremor', de: 'mix', valor: 1 }],
  ['lfo',      { id: 'turbulencia', tipo: 'seno', freq: 'turbFreq', profundidade: 'turbProf', alvo: { no: 'tremor', param: 'ganho' } }],
  ['envelope', { id: 'rajada', de: 'tremor', ataque: 'ataque', pico: 'pico', decaimento: 'decaimento', duracao: 'duracao' }],
];

export const meta = {
  nome: '_vento',
  tipo: 'som',
  desc: 'rajada de vento (ruído filtrado, base larga + ressonância + tremor) — preset semeado do som.js',
  duracao: duracaoDoGrafo(somNucleo(PASSOS, PARAMS, semente)),
};

export function construir(ctx, quando = 0) {
  return construirGrafo(somNucleo(PASSOS, PARAMS, semente), ctx, quando);
}
