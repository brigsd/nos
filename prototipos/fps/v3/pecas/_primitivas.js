/* PEÇA-EXEMPLO do P1 do playground: as TRÊS primitivas novas lado a lado —
   `plano` como chão, `esfera` apoiada no centro e `cone` deslocado pra +x por
   moveV (prova que a numeração documentada das ops novas é usável na edição).
   Segue o envelope (docs/oficina.md "Formato do arquivo gerado"): PARAMS/TOPO/
   PASSOS exportados (a ferramenta relê a lista pra reabrir), `meta.colisao`
   CALCULADA por colisaoDe no carregamento, `construir` = executar. Os leques dos
   polos da esfera e a tampa do cone ganham cor própria (pincel) pra numeração de
   face saltar aos olhos. Teste: visor.html?peca=_primitivas ·
   npm run peca -- _primitivas */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, NÃO alteram a contagem de vértices nem a
   numeração — os passos seguintes seguem apontando pros mesmos pontos. */
export const PARAMS = { esferaR: 0.5, coneR: 0.35, coneAlt: 0.85, chaoL: 3.0, chaoP: 2.0 };

/* topológicos: mudar RECONSTRÓI e pode deixar os passos seguintes órfãos (o
   "vértice 12" vira outro ponto). Por isso ficam separados dos PARAMS. */
export const TOPO = { esferaAneis: 6, esferaLados: 10, coneLados: 8, chaoSeg: 4 };

/* exportado (não `const` privado): sem isto a Oficina não relê a lista e o
   arquivo nunca mais reabre pra edição. Os passos citam o NOME do parâmetro.
   Numeração (a documentada em cada op do motor/oficina.js):
     passo 0 (plano, seg 4)          -> vértices 0..24, faces 0..15
     passo 1 (esfera, 6 anéis × 10)  -> vértices 1000..1051, faces 1000..1059
                                        (leque sul 1000..1009, faixas 1010..1049, leque norte 1050..1059)
     passo 2 (cone, 8 lados)         -> vértices 2000..2008 (ápice 2008), faces 2000..2008 (tampa 2008) */
export const PASSOS = [
  ['plano',  { id: 0, largura: 'chaoL', profundidade: 'chaoP', seg: 'chaoSeg' }],
  ['esfera', { id: 1000, raio: 'esferaR', aneis: 'esferaAneis', lados: 'esferaLados' }],
  ['cone',   { id: 2000, raio: 'coneR', altura: 'coneAlt', lados: 'coneLados' }],
  /* desloca o cone inteiro pra +x, vértice a vértice (ainda não existe mover-objeto):
     anel da base 2000..2007 + ápice 2008 — os ids saem DIRETO da numeração da op. */
  ['moveV', { v: 2000, d: [1.0, 0, 0] }],
  ['moveV', { v: 2001, d: [1.0, 0, 0] }],
  ['moveV', { v: 2002, d: [1.0, 0, 0] }],
  ['moveV', { v: 2003, d: [1.0, 0, 0] }],
  ['moveV', { v: 2004, d: [1.0, 0, 0] }],
  ['moveV', { v: 2005, d: [1.0, 0, 0] }],
  ['moveV', { v: 2006, d: [1.0, 0, 0] }],
  ['moveV', { v: 2007, d: [1.0, 0, 0] }],
  ['moveV', { v: 2008, d: [1.0, 0, 0] }],
  /* cores DA PALETA Resurrect64 (motor/tex.js) — o crítico distancia-paleta cobra.
     As 4 faixas da esfera alternam dois tons: mostra a numeração POR FAIXA
     (b + k·lados + j) e evita faixa chapada gigante no atlas (detector-de-banding). */
  ['pincel', { modo: 'face', faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], cor: '#547e64' }],   // chão
  ['pincel', { modo: 'face', faces: [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009], cor: '#9e4539' }], // leque do polo sul
  ['pincel', { modo: 'face', faces: [1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019], cor: '#cd683d' }], // faixa k=1
  ['pincel', { modo: 'face', faces: [1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029], cor: '#e6904e' }], // faixa k=2
  ['pincel', { modo: 'face', faces: [1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039], cor: '#cd683d' }], // faixa k=3
  ['pincel', { modo: 'face', faces: [1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049], cor: '#e6904e' }], // faixa k=4
  ['pincel', { modo: 'face', faces: [1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058, 1059], cor: '#fbb954' }], // leque do polo norte
  ['pincel', { modo: 'face', faces: [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007], cor: '#4d9be6' }],             // laterais do cone
  ['pincel', { modo: 'face', faces: [2008], cor: '#323353' }],                                                       // tampa da base do cone
  ['solido', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }],   // o chão é o que entra na colisão
];

export const meta = {
  nome: '_primitivas',
  tipo: 'objeto',
  desc: 'esfera + cone sobre um plano-chão — peça-exemplo das primitivas do P1',
  /* CALCULADA, não guardada: colisaoDe roda só a geometria e encaixa o cilindro
     nas faces `solido` (o chão) — raio = meia-diagonal do plano, altura 0. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

/* palco:false = o plano DESTA peça é o chão (como ilha-chao.js) — sem isso o
   palco de grama padrão do visor briga em z com o plano em y=0 (mesma altura). */
export function construir(ctx) { return { ...executar(PASSOS, PARAMS, TOPO, ctx), palco: false }; }
