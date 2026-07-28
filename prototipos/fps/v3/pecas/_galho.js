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
    origemId: 0,   // registra a origem estrutural do loft — é o que permite endereçar por faixa/lado abaixo (sel.origem só existe pra `loft`/`cubo`, não pra `lathe` — ver _torno.js)
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
     POR PARIDADE DE LADO dentro de cada faixa — não um bloco chapado só (o
     crítico `detector-de-banding` cobra, ver nota original abaixo). Endereçado
     por `sel.origem`: cada faixa (0=leque base, 1..4=anéis, 5=leque ponta) é
     um passo do CAMINHO do loft, e `lado:{passo:2,fase}` é a paridade DENTRO
     da faixa — nenhum id de face escrito à mão. Zona A = faixas 0..2 (F 0..29,
     base grossa); zona B = faixas 3..5 (F 30..59, metade fina). */
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 0, lado: { passo: 2, fase: 0 } } }, cor: '#9e4539' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 0, lado: { passo: 2, fase: 1 } } }, cor: '#7a3045' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 1, lado: { passo: 2, fase: 0 } } }, cor: '#9e4539' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 1, lado: { passo: 2, fase: 1 } } }, cor: '#7a3045' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 2, lado: { passo: 2, fase: 0 } } }, cor: '#9e4539' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 2, lado: { passo: 2, fase: 1 } } }, cor: '#7a3045' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 3, lado: { passo: 2, fase: 0 } } }, cor: '#cd683d' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 3, lado: { passo: 2, fase: 1 } } }, cor: '#e6904e' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 4, lado: { passo: 2, fase: 0 } } }, cor: '#cd683d' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 4, lado: { passo: 2, fase: 1 } } }, cor: '#e6904e' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 5, lado: { passo: 2, fase: 0 } } }, cor: '#cd683d' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 0, faixa: 5, lado: { passo: 2, fase: 1 } } }, cor: '#e6904e' }],
  // sombreado macio só no CORPO arredondado — as faixas 1..4 (os 4 segmentos de anel), uma por
  // passo (não há filtro de progressão que pegue {1,2,3,4} de dentro de 0..5 — é um INTERVALO, não
  // uma paridade; o vocabulário só declara paridade sobre índice, não faixa/até). Os dois leques de
  // polo (faixa 0 = base, faixa 5 = ponta) ficam CHAPADOS, como as tampas do cilindro/torno.
  ['liso', { sel: { origem: { op: 'loft', id: 0, faixa: 1 } } }],
  ['liso', { sel: { origem: { op: 'loft', id: 0, faixa: 2 } } }],
  ['liso', { sel: { origem: { op: 'loft', id: 0, faixa: 3 } } }],
  ['liso', { sel: { origem: { op: 'loft', id: 0, faixa: 4 } } }],
  // o galho inteiro entra na colisão (como o tronco do _oficina-toco e o corpo do _torno)
  ['solido', { sel: { tudo: true } }],
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
