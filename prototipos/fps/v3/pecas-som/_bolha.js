/* PEÇA-SOM exemplo da Aba Som (passo 1): a BOLHA da água re-expressa como GRAFO
   de evento — prova que o vocabulário (oscilador + alturaEnv + envelope) faz um
   som REAL do jogo, não só passa nos testes. É o mesmo som que o `bolha()` do
   motor/som.js sintetiza à mão (glissando ascendente de seno + envelope rápido),
   agora como DADO: PARAMS nomeados, PASSOS que citam os nomes, `semente`, `meta` e
   `construir` — o mesmo envelope de uma peça-objeto (docs/oficina.md "Aba Som").
   Reabrir dá o mesmo som (determinístico). Diretório novo `pecas-som/`: o análogo
   sonoro de `pecas/` (peças-objeto), separado porque é outra ABA — sem malha, sem
   câmera. Renderizar/ouvir: tools/bancadas/sintetizar.mjs. */

import { somNucleo, duracaoDoGrafo } from '../motor/somnucleo.js';
import { construirGrafo } from '../motor/somweb.js';

/* dimensionais nomeados — mexer varia a bolha sem tocar na estrutura dos passos.
   freqBase->freqTopo é a subida do glissando; a bolha real sobe ~2.6x. */
export const PARAMS = {
  freqBase: 380,     // Hz onde a bolha começa
  freqTopo: 1000,    // Hz onde termina o sweep (~2.6x — a "subida" da bolha)
  tempoSweep: 0.10,  // s do glissando
  ataque: 0.006,     // s até o pico (bem rápido — o "ploc")
  pico: 0.9,         // ganho de pico
  decaimento: 0.16,  // s de cauda
  duracao: 0.18,     // s do evento inteiro
};

/* semente do RNG: a bolha é 100% tonal (sem `ruido`), então não tem
   aleatoriedade — a semente fica inerte aqui de propósito, mas faz parte do
   envelope (um evento com `ruido` a usaria; ver o grão de água na bancada). */
export const semente = 0;

/* os passos citam o NOME do parâmetro (como na geometria). A saída é o único nó de
   áudio livre = o `envelope` (o oscilador é consumido por ele; o alturaEnv é
   modulador, não conta). O `alturaEnv` varre a frequência do oscilador 'corpo'. */
export const PASSOS = [
  ['oscilador', { id: 'corpo', tipo: 'seno', freq: 'freqBase' }],
  ['alturaEnv', { id: 'sweep', de: 'corpo', freq0: 'freqBase', freq1: 'freqTopo', tempo: 'tempoSweep' }],
  ['envelope',  { id: 'saida', de: 'corpo', ataque: 'ataque', pico: 'pico', decaimento: 'decaimento', duracao: 'duracao' }],
];

export const meta = {
  nome: '_bolha',
  tipo: 'som',
  desc: 'bolha de água descrita por PASSOS — peça-exemplo do núcleo da Aba Som',
  /* CALCULADA como o meta.colisao da peça-objeto: a duração implícita do grafo,
     lida no carregamento (a bancada dimensiona o render offline por ela). */
  duracao: duracaoDoGrafo(somNucleo(PASSOS, PARAMS, semente)),
};

/* constrói o evento num contexto de áudio (vivo OU offline) — o análogo do
   `construir(ctx)` da peça-objeto: núcleo (dados) -> adaptador (Web Audio). */
export function construir(ctx, quando = 0) {
  return construirGrafo(somNucleo(PASSOS, PARAMS, semente), ctx, quando);
}
