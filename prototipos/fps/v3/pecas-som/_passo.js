/* PRESET-SOM _passo (Aba Som, S4) — a PISADA re-expressa como GRAFO de evento, com os
   NÚMEROS já tunados do `passo()`/`PISOS.grama` do motor/som.js. É o nível FÁCIL do
   vocabulário (docs/oficina.md "Dois níveis de vocabulário", D-73): um som PRONTO que o
   usuário carrega e só varia — feito COM os mesmos blocos do S3 (PARAMS+PASSOS+semente),
   então ao abrir já é editável no editor (S3) e analisável no ouvido (S3.5).

   O passo do jogo é síntese GRANULAR (muitos grãos de ruído filtrado + um corpo grave), o
   que não cabe num grafo estático de um disparo só. O preset captura o CARÁTER com dois
   caminhos somados — o mesmo par do `passo()`:
     - CORPO grave: ruido → passa-baixa (o `corpo()` do som.js, PISOS.grama.corpoFreq=120 Hz,
       lowpass Q 1.2, corpoAtaque=0.008 s, corpoDur=0.08 s) — o "peso" da pisada.
     - GRÃO de impacto: ruido → passa-banda (o `grao()`, PISOS.grama.filtro='bandpass',
       freq=1800 Hz, q=0.7) com envelope curto (ataque≈0.015, dur=0.06 s do PISOS.grama).
   Um passo é um ESTALO curto e LARGO (não-tonal): energia espalhada no espectro, brilho
   alto-ish (o grão de 1800 Hz domina), ataque bem cedo, e acaba rápido.

   SIMPLIFICAÇÕES (o A/B fiel é o S5): o granular (16 grãos + raspagem + variação por pé/
   gesto/sprint + acentuação) vira UM grão representativo + o corpo. O grão usa ruído
   MEIO-ROSA com k=0.10 (mais claro que o buffer k=0.02 do som.js): com um só grão preciso
   do brilho que 16 grãos empilhados dão no jogo — a freq (1800 Hz) e o Q (0.7) do bandpass
   ficam FIÉIS ao PISOS.grama. Determinístico: `sementeDe` separa os dois `ruido`. */

import { somNucleo, duracaoDoGrafo } from '../motor/somnucleo.js';
import { construirGrafo } from '../motor/somweb.js';

/* dimensionais nomeados — variar a pisada sem tocar na estrutura. Os números saem do
   PISOS.grama do som.js (o corpo grave + o grão de impacto). */
export const PARAMS = {
  // CORPO grave (o `corpo()` do som.js — PISOS.grama)
  corpoFreq: 130,     // Hz do lowpass (~PISOS.grama.corpoFreq 120 — o "peso" grave)
  corpoPico: 0.5,     // ganho do corpo (equilibra o grão pra o brilho ficar footstep-like, não hiss)
  corpoAtaque: 0.008, // s (PISOS.grama.corpoAtaque)
  corpoDecai: 0.06,   // s de cauda
  corpoDur: 0.08,     // s (PISOS.grama.corpoDur)
  // GRÃO de impacto (o `grao()` do som.js — PISOS.grama)
  graoFreq: 1800,     // Hz central do bandpass (PISOS.grama.freq — FIEL)
  graoQ: 0.7,         // largura do bandpass (PISOS.grama.q — FIEL; Q baixo = BANDA LARGA)
  graoPico: 0.6,      // ganho do grão de impacto
  graoAtaque: 0.015,  // s (~PISOS.grama.ataque 0.018)
  graoDecai: 0.045,   // s de cauda
  graoDur: 0.06,      // s (PISOS.grama.dur)
};

/* semente do RNG: o passo TEM ruido (dois), então a semente importa — reabrir com a
   mesma semente reproduz o mesmo estalo (determinismo, lei do envelope). */
export const semente = 1337;

/* os passos citam o NOME do parâmetro. Dois caminhos (corpo grave + grão de impacto)
   somados: a `soma` é o único nó de áudio livre = a SAÍDA. */
export const PASSOS = [
  ['ruido',    { id: 'ruidoCorpo', cor: 'branco', k: 0.02 }],
  ['filtro',   { id: 'corpo', de: 'ruidoCorpo', tipo: 'passa-baixa', freq: 'corpoFreq', q: 1.2 }],
  ['envelope', { id: 'envCorpo', de: 'corpo', ataque: 'corpoAtaque', pico: 'corpoPico', decaimento: 'corpoDecai', duracao: 'corpoDur' }],
  ['ruido',    { id: 'ruidoGrao', cor: 'rosa', k: 0.10 }],
  ['filtro',   { id: 'grao', de: 'ruidoGrao', tipo: 'passa-banda', freq: 'graoFreq', q: 'graoQ' }],
  ['envelope', { id: 'envGrao', de: 'grao', ataque: 'graoAtaque', pico: 'graoPico', decaimento: 'graoDecai', duracao: 'graoDur' }],
  ['soma',     { id: 'saida', de: ['envCorpo', 'envGrao'] }],
];

export const meta = {
  nome: '_passo',
  tipo: 'som',
  desc: 'passo/pisada (grão de impacto + corpo grave) — preset semeado do PISOS.grama do som.js',
  duracao: duracaoDoGrafo(somNucleo(PASSOS, PARAMS, semente)),
};

export function construir(ctx, quando = 0) {
  return construirGrafo(somNucleo(PASSOS, PARAMS, semente), ctx, quando);
}
