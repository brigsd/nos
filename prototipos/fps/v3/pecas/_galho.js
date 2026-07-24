/* PEÇA-EXEMPLO do P4 do playground: um GALHO — o objeto que SÓ o `loft` faz
   hoje (uma sequência de SEÇÕES circulares encadeada ao longo de um CAMINHO
   3D). É o caso que `docs/oficina.md` cita como motivação do `loft`: "uma
   árvore inteira vira um passo só" — aqui é só um galho, mas o mesmo passo
   serve pro tronco de uma árvore inteira, trocando o perfil.

   O CAMINHO — 5 seções ANEL (`s1`..`s5` afinando, mais um COTOVELO em `s3`
   onde a curva muda de eixo dominante: cresce em Y até ali, depois passa a
   crescer em Z) entre dois POLOS (`raio:0`): a base (a origem — onde o galho
   "nasceria" do tronco) e a ponta (fecha sozinha, de graça, o mesmo truque
   dos dois polos do `_torno.js`). O caminho curva em X **e** Z enquanto sobe
   em Y — não-planar de propósito, pra estressar o TRANSPORTE PARALELO do
   frame (o comentário da op `loft` em motor/oficina.js): sem ele, o cotovelo
   em `s3` torceria o tubo (quad "borboleta" — as normais dos dois triângulos
   do quad apontariam pra lados opostos); com ele, o pior produto-escalar
   entre os dois triângulos de um mesmo quad (medido em
   tools/oficina/oficina.test.ts) fica bem positivo — sem torção visível.

   FECHADO nas duas pontas (base E ponta em `raio:0`) -> WATERTIGHT, provado
   por manifold (toda aresta dirigida pareada 1×, o mesmo método do
   `_torno.js`/`_espelhado.js`) + volume assinado > 0 (nenhuma face
   invertida) no teste.

   Segue o envelope (docs/oficina.md "Formato do arquivo gerado"): PARAMS/
   TOPO/PASSOS exportados (a Oficina relê a lista pra reabrir), `meta.colisao`
   CALCULADA por colisaoDe no carregamento (`solido` marca o galho inteiro,
   como o `_torno.js`), `construir` = executar. Cores da PALETA Resurrect64
   (motor/tex.js) em 2 ZONAS (base grossa escura / metade fina clara),
   alternando por PARIDADE de id DENTRO de cada zona — a mesma manha do
   `_torno.js` contra o `detector-de-banding` (uma zona inteira de UMA cor só
   renderizaria uma faixa monocromática no atlas). `liso` só nos 4 segmentos de
   ANEL (o corpo arredondado); os dois leques de polo (base e ponta) ficam
   CHAPADOS, a mesma convenção das tampas do cilindro/cone/torno.

   Teste: visor.html?peca=_galho · npm run peca -- _galho */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, NÃO altera a contagem de vértices/faces nem
   a numeração — os passos seguintes seguem apontando pros mesmos pontos.
   Nomeado por SEÇÃO do caminho, da base (s1, mais grossa) pra ponta (s5, bem
   fina); `s3` é o COTOVELO (a curva muda de eixo dominante: Y->Z). */
export const PARAMS = {
  s1X: 0.04, s1Y: 0.18, s1Z: 0.02, s1R: 0.150,
  s2X: 0.10, s2Y: 0.38, s2Z: 0.10, s2R: 0.118,
  s3X: 0.16, s3Y: 0.56, s3Z: 0.30, s3R: 0.086,   // o COTOVELO: Z acelera bem mais forte, Y desacelera
  s4X: 0.14, s4Y: 0.68, s4Z: 0.56, s4R: 0.056,
  s5X: 0.06, s5Y: 0.76, s5Z: 0.78, s5R: 0.032,
  pontaX: -0.04, pontaY: 0.82, pontaZ: 0.96,     // polo da ponta — fecha watertight
};

/* topológico: mudar RECONSTRÓI (renumera todos os ids do passo). O galho é
   sempre 1 caminho de 7 seções, não tem TOPO próprio além de `lados`. */
export const TOPO = { lados: 10 };

/* exportado (não `const`): sem isto a Oficina não relê a lista.
   NUMERAÇÃO (a documentada no comentário da op `loft` em motor/oficina.js):
   7 seções (2 polos + 5 anéis) × lados=10 -> V = 2 + 5·10 = 52 (b+0..b+51);
   6 segmentos, NENHUM polo-polo adjacente -> F = 6·10 = 60 (b+0..b+59),
   contíguas por segmento na ORDEM do caminho:
     seg0 (polo base -> anel s1) -> F 0..9    (leque, a tampa da base)
     seg1 (s1 -> s2)              -> F 10..19  (quads — ainda reto, sobe em Y)
     seg2 (s2 -> s3, o cotovelo)  -> F 20..29  (quads — a curva mais forte)
     seg3 (s3 -> s4)              -> F 30..39  (quads — já crescendo em Z)
     seg4 (s4 -> s5)              -> F 40..49  (quads — afinando bem fino)
     seg5 (s5 -> polo ponta)      -> F 50..59  (leque, a tampa da ponta) */
export const PASSOS = [
  ['loft', {
    id: 0,
    lados: 'lados',
    secoes: [
      { pos: [0, 0, 0], raio: 0 },                        // polo: fecha a BASE (onde o galho nasceria do tronco)
      { pos: ['s1X', 's1Y', 's1Z'], raio: 's1R' },
      { pos: ['s2X', 's2Y', 's2Z'], raio: 's2R' },
      { pos: ['s3X', 's3Y', 's3Z'], raio: 's3R' },         // o cotovelo
      { pos: ['s4X', 's4Y', 's4Z'], raio: 's4R' },
      { pos: ['s5X', 's5Y', 's5Z'], raio: 's5R' },
      { pos: ['pontaX', 'pontaY', 'pontaZ'], raio: 0 },    // polo: fecha a PONTA
    ],
  }],

  /* Cor por ZONA (metade grossa/escura, metade fina/clara), alternando 2 tons
     POR PARIDADE de id DENTRO de cada zona — não um bloco chapado só. `cols`
     do atlas (ceil(√60)=8) é MENOR que o tamanho de cada zona (30 faces),
     então uma zona inteira de UMA cor só faria uma faixa do atlas ficar
     monocromática e o crítico `detector-de-banding` acusa (a mesma manha do
     `_torno.js`/`_espelhado.js`: como todo bloco de 8 ids CONSECUTIVOS — a
     largura do atlas — contém as duas paridades, NENHUMA linha do atlas pode
     ficar monocromática — prova por construção, não sorte). */
  // zona A (base grossa: leque da base + 2 primeiros segmentos de anel -> F 0..29): casca escura, 2 tons
  ['pincel', { modo: 'face', faces: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28], cor: '#9e4539' }],
  ['pincel', { modo: 'face', faces: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29], cor: '#7a3045' }],
  // zona B (metade fina: 2 últimos segmentos de anel + leque da ponta -> F 30..59): casca clara, 2 tons
  ['pincel', { modo: 'face', faces: [30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58], cor: '#cd683d' }],
  ['pincel', { modo: 'face', faces: [31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59], cor: '#e6904e' }],
  // sombreado macio só no CORPO arredondado (os 4 segmentos de anel, F 10..49) — os dois
  // leques de polo (F 0..9 base, F 50..59 ponta) ficam CHAPADOS, como as tampas do cilindro/torno
  ['liso', { faces: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49] }],
  // o galho inteiro entra na colisão (como o tronco do _oficina-toco e o corpo do _torno)
  ['solido', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59] }],
];

export const meta = {
  nome: '_galho',
  tipo: 'objeto',
  desc: 'galho curvo, afinando e fechado nas duas pontas — loft ao longo de um caminho 3D não-planar — peça-exemplo do P4 do playground',
  /* CALCULADA, não guardada: colisaoDe roda só a geometria (sem textura/pincel)
     e encaixa o cilindro no galho inteiro (via `solido`). Diferente do
     `_torno.js` (um lathe centrado no eixo Y), o caminho do galho DERIVA do
     eixo -> o raio encaixado não é analiticamente igual a nenhum `sXR` (é a
     distância do eixo Y até o ponto mais afastado da malha, medida, não um
     parâmetro só). */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
