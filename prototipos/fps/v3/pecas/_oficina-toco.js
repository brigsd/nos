/* PEÇA-EXEMPLO da OFICINA (passo 1): um toco de árvore descrito 100% como lista
   de PASSOS e reconstruído por `executar` — prova a cadeia inteira núcleo ->
   adaptador -> motor WebGL 2 -> tela. Segue o envelope (docs/oficina.md
   "Formato do arquivo gerado"): PARAMS/TOPO/PASSOS exportados (a ferramenta
   relê a lista pra reabrir), `meta.colisao` CALCULADA por colisaoDe no
   carregamento, `construir` = executar. Cilindro (corpo) + extruda (toco de
   galho) + moveV + mescla (solda) + pincel (cor por face via textura-amostra) +
   liso (barril macio) + solido (colisão). Teste: visor.html?peca=_oficina-toco
   · npm run peca -- _oficina-toco */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, NÃO alteram a contagem de vértices nem a
   numeração — os passos seguintes seguem apontando pros mesmos pontos. */
export const PARAMS = { troncoR: 0.34, troncoH: 0.55 };

/* topológico: mudar RECONSTRÓI e pode deixar os passos seguintes órfãos (o
   "vértice 12" vira outro ponto). Por isso fica separado dos PARAMS. */
export const TOPO = { lados: 8 };

/* exportado (não `const` privado): sem isto a Oficina não relê a lista e o
   arquivo nunca mais reabre pra edição. Os passos citam o NOME do parâmetro. */
export const PASSOS = [
  ['cilindro', { id: 0, raio: 'troncoR', altura: 'troncoH', lados: 'lados' }],
  ['extruda',  { face: 0, dist: 0.14 }],                 // toco de galho: puxa a face lateral 0
  ['moveV',    { v: 2, d: [0.05, 0, 0.04] }],            // raiz: empurra um canto ORIGINAL da base (id estável)
  ['mescla',   { de: [1001], para: 1002 }],              // solda dois cantos NOVOS do galho (de/para gravados)
  ['pincel',   { modo: 'face', faces: [1, 2, 3, 4, 5, 6, 7], cor: '#6b4a2f' }], // casca
  ['pincel',   { modo: 'face', faces: [9], cor: '#c39a5e' }],                    // topo cortado (anéis)
  ['pincel',   { modo: 'face', faces: [8], cor: '#3a2a1c' }],                    // fundo, sombra
  ['pincel',   { modo: 'face', faces: [0, 1000, 1001, 1002, 1003], cor: '#7a5230' }], // galho
  ['liso',     { faces: [1, 2, 3, 4, 5, 6, 7] }],        // barril macio (padrão é chapado)
  ['solido',   { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }], // o que entra na colisão
];

export const meta = {
  nome: '_oficina-toco',
  tipo: 'objeto',
  desc: 'toco de árvore descrito por PASSOS — peça-exemplo do núcleo da Oficina',
  /* CALCULADA, não guardada: o jogo lê isto no carregamento do módulo, antes de
     `construir()`. colisaoDe roda só a geometria (sem textura/pincel) e encaixa
     o cilindro na malha FINAL, depois da extrusão. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
