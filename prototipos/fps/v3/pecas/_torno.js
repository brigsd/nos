/* PEÇA-EXEMPLO do P2 do playground: um PEÃO DE XADREZ — o objeto que SÓ o
   `lathe` faz hoje (um perfil 2D `[[raio,y],...]` girado em torno do eixo Y).
   O perfil anda do PÉ (polo, fecha o FUNDO) até o alto da cabeça (polo, fecha
   o TOPO) — FECHADO nas duas pontas, watertight (prova: o teste de manifold
   em tools/oficina/oficina.test.ts — toda aresta dirigida a→b pareada com
   b→a exatamente 1×, como o revisor fez no P1). Nenhuma tampa foi inventada à
   parte: os dois polos JÁ SÃO as tampas, de graça (docs/oficina.md "Lista de
   operações", linha do `lathe`).

   Segue o envelope (docs/oficina.md "Formato do arquivo gerado"): PARAMS/
   TOPO/PASSOS exportados (a Oficina relê a lista pra reabrir), `meta.colisao`
   CALCULADA por colisaoDe no carregamento (sem `solido`, cairia na malha
   toda — aqui marcado explícito, como o `_oficina-toco`), `construir` =
   executar. Cores da PALETA Resurrect64 (motor/tex.js) por FAIXA do perfil —
   o crítico distância-paleta (`npm run auditar`) cobra. `liso` nas faixas de
   ANEL (o corpo arredondado do peão); os dois leques de polo (pé e topo da
   cabeça) ficam CHAPADOS, a mesma convenção das tampas do cilindro/cone.

   Teste: visor.html?peca=_torno · npm run peca -- _torno */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, NÃO alteram a contagem de vértices nem a
   numeração — os passos seguintes seguem apontando pros mesmos pontos. Nomeado
   por SEÇÃO do perfil, de baixo pra cima (a ordem em que o perfil anda). */
export const PARAMS = {
  pesR: 0.42, pesH: 0.06,       // pé: raio da base larga e a altura da parede baixa (reta) dele
  colarR: 0.30, colarY: 0.18,   // colar: afunila do pé pro talo
  taloR: 0.15, taloY: 0.55,     // talo: a cintura fina do peão
  ombroR: 0.32, ombroY: 0.66,   // ombro: alarga de novo, logo abaixo da cabeça
  golaR: 0.21, golaY: 0.76,     // gola: afunila num pescoço curto antes da cabeça
  cabecaR: 0.27, cabecaY: 0.82, // cabeça: alarga pra base da esfera aproximada (o "equador" da cabeça)
  miocR: 0.19, miocY: 1.01,     // meio da cabeça: 2º anel a 45° do arco (cos/sin·cabecaR) — aproxima o arredondado com 2 segmentos retos (sem curva — P2 é só reta)
  topoY: 1.09,                  // topo: altura total do peão (o polo do topo, cabecaY+cabecaR — fecha a cabeça como uma cúpula, não um cone)
};

/* topológico: mudar RECONSTRÓI e pode deixar os passos seguintes órfãos (o
   "vértice 12" vira outro ponto). Por isso fica separado dos PARAMS. */
export const TOPO = { lados: 12 };

/* exportado (não `const` privado): sem isto a Oficina não relê a lista e o
   arquivo nunca mais reabre pra edição. Perfil ORDENADO de baixo (y=0) pra
   cima (y=topoY) — a regra do `lathe` (docs/oficina.md). Cada ponto é
   `[raio, y]`: SEMPRE 2 elementos = SEMPRE um canto RETO (a reserva da alça
   de curva é pra uma rodada futura — ver o comentário da op no núcleo).

   Numeração (a documentada no comentário da op `lathe` em motor/oficina.js):
   10 pontos (2 polos + 8 anéis) × lados=12 -> V = 2 + 8·12 = 98 (b+0..b+97);
   9 segmentos, NENHUM polo-polo adjacente -> F = 9·12 = 108 (b+0..b+107),
   contíguas por segmento na ORDEM do perfil:
     seg0 (polo pé)          -> F 0..11    (leque, a tampa de baixo)
     seg1 (pé: parede reta)  -> F 12..23   (raio CONSTANTE — prova o caso anel<->anel sem afunilar)
     seg2 (pé -> colar)      -> F 24..35
     seg3 (colar -> talo)    -> F 36..47
     seg4 (talo -> ombro)    -> F 48..59
     seg5 (ombro -> gola)    -> F 60..71
     seg6 (gola -> cabeça)   -> F 72..83
     seg7 (cabeça -> mioc)   -> F 84..95
     seg8 (mioc -> polo topo)-> F 96..107  (leque, a tampa de cima) */
export const PASSOS = [
  ['lathe', {
    id: 0,
    lados: 'lados',
    perfil: [
      [0, 0],                   // polo: fecha o FUNDO (o pé)
      ['pesR', 0],               // aresta do pé
      ['pesR', 'pesH'],          // parede do pé (reta, mesmo raio — cilindro baixo)
      ['colarR', 'colarY'],      // afunila do pé
      ['taloR', 'taloY'],        // talo (cintura fina)
      ['ombroR', 'ombroY'],      // alarga pro ombro
      ['golaR', 'golaY'],        // afunila pra gola
      ['cabecaR', 'cabecaY'],    // alarga pra base da cabeça
      ['miocR', 'miocY'],        // 2º anel da cabeça (aproxima o arredondado com 2 segmentos retos)
      [0, 'topoY'],              // polo: fecha o TOPO (o alto da cabeça)
    ],
  }],
  /* Cor por FAIXA (zona do perfil), mas alternando 2 tons POR PARIDADE de id
     dentro de cada zona — não um bloco chapado só. `cols` do atlas (ceil(√108)
     =11) é MENOR que o tamanho de cada zona (24-48 faces), então uma zona
     inteira de UMA cor só faria uma linha do atlas ficar 100% monocromática
     (32px de altura) e o crítico `detector-de-banding` acusa (achado real, não
     falso-positivo — reproduz com `npm run auditar -- _torno`). Mesma manha do
     `_primitivas.js` pra esfera ("alterna dois tons... evita faixa chapada
     gigante no atlas"), só que POR ID (não por faixa inteira): como todo bloco
     de 11 ids CONSECUTIVOS (a largura do atlas) contém as duas paridades, NENHUMA
     linha do atlas pode ficar monocromática — prova por construção, não sorte. */
  // pé + talo: madeira escura, 2 tons (faixas seg0..seg3 -> F 0..47)
  ['pincel', { modo: 'face', faces: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46], cor: '#9e4539' }],
  ['pincel', { modo: 'face', faces: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47], cor: '#7a3045' }],
  // ombro + gola + base da cabeça: madeira média, 2 tons (faixas seg4..seg6 -> F 48..83)
  ['pincel', { modo: 'face', faces: [48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82], cor: '#cd683d' }],
  ['pincel', { modo: 'face', faces: [49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83], cor: '#e6904e' }],
  // cabeça: acento dourado, 2 tons (faixas seg7..seg8 -> F 84..107)
  ['pincel', { modo: 'face', faces: [84, 86, 88, 90, 92, 94, 96, 98, 100, 102, 104, 106], cor: '#f9c22b' }],
  ['pincel', { modo: 'face', faces: [85, 87, 89, 91, 93, 95, 97, 99, 101, 103, 105, 107], cor: '#fbb954' }],
  // sombreado macio no CORPO arredondado (as faixas de anel, F 12..95) — os dois
  // leques de polo (F 0..11 pé, F 96..107 topo) ficam CHAPADOS, como as tampas do cilindro
  ['liso', { faces: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95] }],
  // o peão inteiro entra na colisão (como o _oficina-toco faz com o tronco)
  ['solido', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107] }],
];

export const meta = {
  nome: '_torno',
  tipo: 'objeto',
  desc: 'peão de xadrez torneado — perfil de revolução (lathe), fechado nas duas pontas — peça-exemplo do P2 do playground',
  /* CALCULADA, não guardada: o jogo leria isto no carregamento do módulo, antes
     de `construir()`. colisaoDe roda só a geometria (sem textura/pincel) e
     encaixa o cilindro na malha do peão inteiro (via `solido`). */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
