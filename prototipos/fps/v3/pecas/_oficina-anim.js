/* PEÇA-EXEMPLO da OFICINA (passo 13a): ANIMAÇÃO RÍGIDA POR PARTE (em laço). Prova o
   motor novo com movimento ÓBVIO no visor: uma ENGRENAGEM (`roda`) gira em torno do
   PRÓPRIO centro (rotY, pivô = CENTROIDE default — sem `pivo` no arquivo) e um BRAÇO
   (`braco`) balança em torno de uma base FIXA (rotZ, pivô EXPLÍCITO na base — prova o
   override). A op `parte` nomeia os conjuntos de faces; a seção `ANIMACOES` (como
   MATERIAIS) dirige as trilhas; `repete:true` = laço ambiente. Segue o envelope:
   PARAMS/TOPO/MATERIAIS/ANIMACOES/PASSOS exportados, `meta.colisao` por colisaoDe,
   `construir` = executar. Teste: visor.html?peca=_oficina-anim · npm run peca -- _oficina-anim */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar NÃO renumera (a identidade é posicional). */
export const PARAMS = {
  rodaR: 0.42, rodaH: 0.34, dente: 0.16,   // engrenagem: raio, espessura, saliência do dente
  bracoW: 0.14, bracoH: 0.95, bracoX: 1.05, // braço: largura, altura, deslocamento pro lado da engrenagem
};

/* topológico: `lados` muda a CONTAGEM de faces da engrenagem (renumera). */
export const TOPO = { lados: 8 };

/* MATERIAIS (12a): a engrenagem é METAL fosco com um DENTE que BRILHA (marca acesa,
   pra a rotação saltar aos olhos); o braço é MADEIRA. */
export const MATERIAIS = {
  metal:   { cor: '#8a94a6', aspereza: 0.5 },
  marca:   { cor: '#ff7326', emissivo: 1.3, semLuz: true },
  madeira: { cor: '#7a5230', aspereza: 0.85 },
};

/* ANIMACOES (13a): seção própria da peça (não constrói geometria). Cada animação tem
   `duracao`, `repete` e `trilhas` — e cada trilha amarra um CANAL de uma PARTE a chaves
   `[tempo, valor]` (interpolação SUAVE por padrão). `roda` gira 360° em 4s; `braco`
   balança de −0.5 a +0.5 rad e volta em 3s. */
export const ANIMACOES = {
  girar: {
    duracao: 4, repete: true,
    trilhas: [{ parte: 'roda', canal: 'rotY', chaves: [[0, 0], [2, Math.PI], [4, Math.PI * 2]] }],
  },
  balancar: {
    duracao: 3, repete: true,
    trilhas: [{ parte: 'braco', canal: 'rotZ', chaves: [[0, -0.5], [1.5, 0.5], [3, -0.5]] }],
  },
};

/* engrenagem (passo 0) + dente por extrusão (passo 1) + braço (passo 2) deslocado pro
   lado (passos 3..10) + nomes de parte + materiais + colisão. O braço nasce na origem
   como todo cubo, então 8 moveV o levam pra bracoX (gerados em laço — a LISTA salva é a
   expansão concreta; nada de aleatório). */
const ARM_BASE = 2000;
const moverBraco = [];
for (let k = 0; k < 8; k++) moverBraco.push(['moveV', { v: ARM_BASE + k, d: ['bracoX', 0, 0] }]);

export const PASSOS = [
  ['cilindro', { id: 0, raio: 'rodaR', altura: 'rodaH', lados: 'lados' }],   // engrenagem (lados 0..7, fundo 8, topo 9)
  ['extruda',  { face: 0, dist: 'dente' }],                                   // DENTE: puxa a face lateral 0 (cap vira face 0; paredes 1000..1003)
  ['cubo',     { id: 2000, larg: 'bracoW', alt: 'bracoH', prof: 'bracoW' }],  // braço (faces 2000..2005) na origem
  ...moverBraco,                                                             // desloca o braço pro lado da engrenagem
  /* NOMEIA as partes. `roda` SEM pivo -> o adaptador usa o CENTROIDE (gira no lugar).
     `braco` COM pivo na BASE (bracoX,0,0) -> balança pendurado pela base (override). */
  ['parte',    { nome: 'roda', faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1000, 1001, 1002, 1003] }],
  ['parte',    { nome: 'braco', faces: [2000, 2001, 2002, 2003, 2004, 2005], pivo: ['bracoX', 0, 0] }],
  ['material', { faces: [0, 1000, 1001, 1002, 1003], usa: 'marca' }],         // o dente aceso
  ['material', { faces: [1, 2, 3, 4, 5, 6, 7, 8, 9], usa: 'metal' }],         // o corpo da engrenagem
  ['material', { faces: [2000, 2001, 2002, 2003, 2004, 2005], usa: 'madeira' }], // o braço
  ['solido',   { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }],                    // colisão: o corpo da engrenagem
];

export const meta = {
  nome: '_oficina-anim',
  tipo: 'objeto',
  desc: 'engrenagem girando (pivô centroide) + braço balançando (pivô explícito) — peça-exemplo da animação rígida por parte (13a)',
  /* CALCULADA por colisaoDe (só geometria — parte/animação não muda colisão); recebe
     MATERIAIS pra a op `material` não gritar à toa. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS),
};

export function construir(ctx) {
  const obj = executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS, ANIMACOES);
  obj.particulas = false;   // sem pólen: no visor a ÚNICA coisa T-dependente é a animação (isola a prova de movimento)
  return obj;
}
