/* PEÇA-EXEMPLO da OFICINA (passo 12b): MATERIAL TRANSPARENTE. Um relicário — um
   NÚCLEO opaco que BRILHA (brasa: emissivo + semLuz) dentro de uma CASCA de VIDRO
   (mistura:'transparente', opacidade < 1). Prova a passada de transparência: o vidro
   é desenhado DEPOIS dos opacos, de trás pra frente, misturando alpha — então o
   núcleo aceso aparece ATRAVÉS da casca. Segue o envelope: PARAMS/TOPO/MATERIAIS/
   PASSOS exportados, `meta.colisao` CALCULADA por colisaoDe, `construir` = executar.
   Teste: visor.html?peca=_oficina-transp · npm run peca -- _oficina-transp */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: o núcleo cabe dentro da casca; mudar não renumera. */
export const PARAMS = { nucleo: 0.44, casca: 0.92 };

export const TOPO = {};

/* MATERIAIS (12a/12b): `brasa` é OPACA e acesa (emissivo + semLuz); `vidro` é
   TRANSPARENTE — `mistura:'transparente'` manda o lote pra passada extra e
   `opacidade` (0..1) é o quanto ele cobre o que está atrás. */
export const MATERIAIS = {
  brasa: { cor: '#ff7326', emissivo: 1.2, semLuz: true },
  vidro: { cor: '#7fdfff', mistura: 'transparente', opacidade: 0.42 },
};

/* dois cubos concêntricos: passo 0 = núcleo (faces 0..5), passo 1 = casca (1000..1005). */
export const PASSOS = [
  ['cubo',     { id: 0, lado: 'nucleo' }],
  ['cubo',     { id: 1000, lado: 'casca' }],
  ['material', { faces: [0, 1, 2, 3, 4, 5], usa: 'brasa' }],                       // núcleo aceso, opaco
  ['material', { faces: [1000, 1001, 1002, 1003, 1004, 1005], usa: 'vidro' }],     // casca de vidro, transparente
  ['solido',   { faces: [1000, 1001, 1002, 1003, 1004, 1005] }],                   // a casca é a parede de colisão
];

export const meta = {
  nome: '_oficina-transp',
  tipo: 'objeto',
  desc: 'relicário de vidro — peça-exemplo da MISTURA transparente (12b): núcleo aceso visto através da casca',
  /* CALCULADA no load por colisaoDe (só geometria — material/mistura não muda colisão);
     recebe MATERIAIS pra a op `material` não gritar à toa. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS); }
