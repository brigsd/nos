/* PEÇA-EXEMPLO da OFICINA (passo 14a): ESQUELETO com DEFORMAÇÃO SUAVE (linear blend
   skinning). Uma CORRENTE/tentáculo de 3 segmentos (4 anéis de vértices) que DOBRA
   SUAVE nas juntas — não articula em bloco (isso é o 13a). O esqueleto tem 3 ossos
   ENCADEADOS (b0 raiz na base, b1 e b2 filhos nas juntas); os anéis das juntas ganham
   peso MISTO 50/50 pros dois ossos vizinhos, então ao girar os ossos-filhos (a trilha
   `ondular`) a malha CURVA na junta em vez de quebrar. b2 é filho de b1: a rotação
   compõe pela hierarquia -> a PONTA (acesa) curva mais que o meio (o caráter de
   tentáculo). Segue o envelope: PARAMS/TOPO/MATERIAIS/ANIMACOES/ESQUELETO/PASSOS
   exportados, `meta.colisao` por colisaoDe, `construir` = executar.
   Teste: visor.html?peca=_oficina-esqueleto · npm run peca -- _oficina-esqueleto */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar NÃO renumera (identidade posicional). `seg` = altura de um
   segmento; `seg2` = 2·seg (a altura da 2ª junta) — derivado de SEG pra ficar coerente. */
const SEG = 0.42;
export const PARAMS = { larg: 0.34, seg: SEG, seg2: SEG * 2 };

/* topológico: a corrente é sempre 4 lados (cubo). Fica em TOPO por convenção do envelope. */
export const TOPO = {};

/* MATERIAIS (12a): o corpo é uma "pele" fosca; a PONTA é uma marca ACESA (semLuz),
   pra a curva saltar aos olhos quando o tentáculo ondula — o material COMPÕE com o
   skinning (o lote skinado passa pelos mesmos uniforms de material). */
export const MATERIAIS = {
  pele:  { cor: '#4fb0a2', aspereza: 0.7 },
  ponta: { cor: '#ffd24a', emissivo: 1.25, semLuz: true },
};

/* ESQUELETO (14a): 3 ossos encadeados. `pivo` = a cabeça do osso no espaço do modelo
   (passa por `vec`, então cita PARAM); o bind (repouso) é a identidade no pivô. b0 é a
   RAIZ (base, pivo default [0,0,0]); b1/b2 são as JUNTAS (nas alturas seg e seg2), cada
   um filho do anterior -> a rotação de b2 herda a de b1 (curva composta). */
export const ESQUELETO = {
  ossos: [
    { nome: 'b0' },                                 // raiz na base
    { nome: 'b1', pai: 'b0', pivo: [0, 'seg', 0] },  // 1ª junta
    { nome: 'b2', pai: 'b1', pivo: [0, 'seg2', 0] }, // 2ª junta (filha de b1)
  ],
};

/* corpo: um cubo (segmento 0) + 2 extrusões pra cima (segmentos 1 e 2) -> 4 anéis de
   vértices nas alturas 0, seg, 2·seg, 3·seg. As extrusões usam `dist:'seg'` -> tudo
   dirigido por SEG. Anéis (ids): base 0..3 · junta1 4..7 · junta2 1000..1003 · ponta
   2000..2003 (o bloco 1000/2000 vem da POSIÇÃO do passo de extruda, D-77). */
export const PASSOS = [
  ['cubo',    { id: 0, larg: 'larg', alt: 'seg', prof: 'larg' }],   // segmento 0: base 0..3 (y=0), anel 4..7 (y=seg); faces 0..5
  ['extruda', { face: 1, dist: 'seg' }],                            // segmento 1: anel 1000..1003 (y=2·seg); a tampa (face 1) sobe
  ['extruda', { face: 1, dist: 'seg' }],                            // segmento 2: anel 2000..2003 (y=3·seg); a tampa (face 1) sobe

  /* PESO por vértice (a op `pesar`, ACUMULA; o adaptador normaliza + top-4). Cada anel
     de JUNTA leva 50/50 dos dois ossos que o cercam -> a malha cai ENTRE as duas poses
     (combinação convexa = curva suave). Anel da base 100% b0; anel da ponta 100% b2. */
  ['pesar', { osso: 'b0', vs: [0, 1, 2, 3], peso: 1 }],                       // base -> raiz
  ['pesar', { osso: 'b0', vs: [4, 5, 6, 7], peso: 0.5 }],                     // junta1: metade raiz...
  ['pesar', { osso: 'b1', vs: [4, 5, 6, 7], peso: 0.5 }],                     //         ...metade b1 (MISTO)
  ['pesar', { osso: 'b1', vs: [1000, 1001, 1002, 1003], peso: 0.5 }],         // junta2: metade b1...
  ['pesar', { osso: 'b2', vs: [1000, 1001, 1002, 1003], peso: 0.5 }],         //         ...metade b2 (MISTO)
  ['pesar', { osso: 'b2', vs: [2000, 2001, 2002, 2003], peso: 1 }],           // ponta -> b2

  /* materiais: corpo (paredes + fundo) na pele; a tampa da ponta (face 1) acesa. */
  ['material', { faces: [0, 2, 3, 4, 5, 1000, 1001, 1002, 1003, 2000, 2001, 2002, 2003], usa: 'pele' }],
  ['material', { faces: [1], usa: 'ponta' }],

  ['solido', { faces: [0, 2, 3, 4, 5] }],   // colisão: o segmento da base (a corrente ondula, mas a colisão é o toco fixo)
];

export const ANIMACOES = {
  /* laço ambiente: os dois ossos-filhos giram em rotZ e voltam. b2 gira um tico mais e,
     por ser FILHO de b1, herda a rotação dele -> a ponta descreve um arco maior (curva
     composta, cara de tentáculo). A trilha mira um NOME DE OSSO (b1/b2) — o animador
     resolve osso×parte: alvo no ESQUELETO vira matriz de osso (skinning), não parte. */
  ondular: {
    duracao: 3, repete: true,
    trilhas: [
      { parte: 'b1', canal: 'rotZ', chaves: [[0, 0], [1.5, 0.6], [3, 0]] },
      { parte: 'b2', canal: 'rotZ', chaves: [[0, 0], [1.5, 0.7], [3, 0]] },
    ],
  },
};

export const meta = {
  nome: '_oficina-esqueleto',
  tipo: 'objeto',
  desc: 'tentáculo de 3 segmentos que dobra SUAVE nas juntas (linear blend skinning) — peça-exemplo do esqueleto (14a)',
  /* CALCULADA por colisaoDe (só geometria — esqueleto/peso não muda colisão); recebe
     MATERIAIS pra a op `material` não gritar à toa. Esqueleto NÃO entra na colisão. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS),
};

export function construir(ctx) {
  const obj = executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS, ANIMACOES, ESQUELETO);
  obj.particulas = false;   // sem pólen: a ÚNICA coisa T-dependente no visor é a deformação (isola a prova de movimento)
  return obj;
}
