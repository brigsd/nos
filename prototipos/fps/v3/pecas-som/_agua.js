/* PRESET-SOM _agua (Aba Som, S4) — a LAMBIDA de água (onda na margem) re-expressa como
   GRAFO de evento, com os NÚMEROS do `lambida()` do motor/som.js. Nível FÁCIL do
   vocabulário (D-73): som pronto pra variar, feito COM os blocos do S3 — editável (S3) e
   analisável (S3.5) ao abrir. A lambida é o preset mais BARATO do som.js: uma rajada curta
   de ruído por um passa-BAIXA, com envelope lento — GRAVE e ABAFADA (brilho baixo).

   Números do `lambida()`: ruido (o `noiseBuf` = `makeNoise(5)`, meio-rosa k=0.02, já bem
   escuro, corte ~151 Hz) → passa-baixa em 300..700 Hz (peguei o meio, 500 Hz) → envelope
   com ataque 0.05 s (a subida lenta) e duração 0.15..0.40 s (peguei 0.35). Contra o _passo
   (grão de 1800 Hz, brilho ALTO), a água é o oposto no espectro: centroide BAIXO, sem
   agudo — é o que a análise mede pra discriminar "abafado" de "estalado".

   Determinístico (a semente semeia o `ruido`). O A/B fiel ao som.js é o S5. */

import { somNucleo, duracaoDoGrafo } from '../motor/somnucleo.js';
import { construirGrafo } from '../motor/somweb.js';

export const PARAMS = {
  corte: 420,        // Hz do passa-baixa (som.js lambida: 300 + rand*400 — peguei o lado grave)
  ataque: 0.05,      // s de subida lenta (som.js lambida)
  pico: 0.7,         // ganho de pico
  decaimento: 0.28,  // s de cauda
  duracao: 0.35,     // s (som.js lambida: 0.15 + rand*0.25, ~0.35)
};

export const semente = 77;

/* ruido escuro → passa-baixa → envelope lento. O envelope é o único nó de áudio livre = a
   SAÍDA. Sem `alturaEnv` nem `lfo`: a água é ruído filtrado puro (não-tonal, grave). */
export const PASSOS = [
  ['ruido',    { id: 'agua', cor: 'rosa', k: 0.02 }],
  ['filtro',   { id: 'lp', de: 'agua', tipo: 'passa-baixa', freq: 'corte', q: 1 }],
  ['envelope', { id: 'saida', de: 'lp', ataque: 'ataque', pico: 'pico', decaimento: 'decaimento', duracao: 'duracao' }],
];

export const meta = {
  nome: '_agua',
  tipo: 'som',
  desc: 'lambida de água (ruído grave abafado por passa-baixa) — preset semeado do lambida() do som.js',
  duracao: duracaoDoGrafo(somNucleo(PASSOS, PARAMS, semente)),
};

export function construir(ctx, quando = 0) {
  return construirGrafo(somNucleo(PASSOS, PARAMS, semente), ctx, quando);
}
