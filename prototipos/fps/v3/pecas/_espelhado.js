/* PEÇA-EXEMPLO do P3 do playground: uma CABEÇA com um PAR DE CHIFRES — o
   objeto BILATERAL modelado só de UM chifre e completado pela op `espelha`
   NOVA, watertight (a costura soldada prova o weld). A cabeça (esfera) é
   radialmente simétrica sozinha — não precisa de espelho; só o CHIFRE precisa,
   e é nele que a prova mora.

   O CHIFRE — passo a passo (ids conferidos em tools/oficina/oficina.test.ts):
   um quadrado-semente (`plano`, que nasce deitado no chão, y=0) é reposicionado
   por QUATRO `moveV` pra virar de pé exatamente no plano x=0 — a base do chifre
   (`extruda` puxa um chifre OCO, aberto do lado da base: a extrusão SÓ tampa a
   ponta distante, o lado da base nunca ganha face — o mesmo truque do lathe
   sem tampa automática). `mescla` solda o anel distante num ponto só (a ponta
   vira pirâmide de 4 triângulos), `rotaciona` inclina SÓ a ponta (seleção por
   vértice) pra dar a curva do chifre, e `espelha` (eixo x, pos 0) duplica os 4
   triângulos pro lado esquerdo — os 4 vértices da base, EXATAMENTE em x=0,
   soldam sozinhos (id compartilhado, sem cópia); só a ponta ganha id novo. O
   resultado: um par de chifres inteiro, sem costura visível, provado por
   MANIFOLD (toda aresta dirigida pareada 1×, teste abaixo).

   CUIDADO DE PONTO-FLUTUANTE (documentado, não é acidente): os 4 `moveV` que
   levam a base pro plano x=0 usam DELTAS LITERAIS (±0.08), não uma rotação —
   `Math.cos(90°)` não é EXATAMENTE 0 em ponto-flutuante (só ~6e-17), e uma
   base "quase zero" NÃO solda (a regra do núcleo: só EXATO solda). ±0.08 é
   EXATAMENTE metade de `chifreAltura` (0.16) — mudar `chifreAltura` sem
   recalcular os 4 deltas (e as 4 componentes Y, 0.52/0.68) quebra a solda
   (o chifre não corrompe — só para de fechar sozinho; ver o comentário do
   `espelha` no núcleo).

   Segue o envelope (docs/oficina.md "Formato do arquivo gerado"): PARAMS/
   TOPO/PASSOS exportados, `meta.colisao` CALCULADA por colisaoDe no
   carregamento, `construir` = executar. Cores da PALETA Resurrect64
   (motor/tex.js), alternando por PARIDADE de id (a manha do `_torno.js`
   contra o detector-de-banding). `liso` na cabeça (redonda); os chifres
   ficam CHAPADOS (facetados, como as tampas do cone). Teste:
   visor.html?peca=_espelhado · npm run peca -- _espelhado */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade NÃO altera a contagem de vértices/faces nem a
   numeração — EXCETO `chifreAltura`/`chifreProf`, que exigem recalcular os 4
   `moveV` da base do chifre à mão (ver o AVISO acima; são literais, não citam
   PARAM, de propósito — a exatidão da solda não pode depender de ninguém
   digitar `chifreAltura/2` igual duas vezes). */
export const PARAMS = {
  cabecaRaio: 0.42,
  chifreComprimento: 0.50,   // quanto o chifre se estende a partir da base (x=0)
  chifreAltura: 0.16,        // extensão da base do chifre no eixo que veio a virar Y (± 0.08 nos moveV)
  chifreProf: 0.14,          // extensão da base no eixo Z (não precisa solda exata — livre)
  chifreTiltGraus: -25,      // inclinação da ponta (rotaciona, eixo Z) — chifre curvando pra cima/trás
};

/* topológico: mudar RECONSTRÓI (a esfera renumera; o chifre é sempre 1
   quadrado + 1 ponta, não tem TOPO próprio). */
export const TOPO = { cabecaAneis: 6, cabecaLados: 10 };

/* exportado (não `const`): sem isto a Oficina não relê a lista.
   NUMERAÇÃO (formato salvo, travada por teste):
     passo 0  esfera  (aneis 6 × lados 10) -> V 0..51 (52), F 0..59 (60)
     passo 1  plano   (o quadrado-semente, y=0)          -> V 1000..1003 (4), F 1000 (1)
     passos 2-5  moveV (reposiciona os 4 cantos pra x=0, deltas LITERAIS — ver aviso acima)
     passo 6  extruda (face 1000, dist chifreComprimento) -> V 6000..6003 (4), F 6000..6003 (4 paredes); F1000 (a tampa) SOBE pro anel distante
     passo 7  mescla  (de:[6001,6002,6003] -> para:6000)  -> a tampa 1000 vira área-zero e SOME; as 4 paredes viram TRIÂNGULOS (a ponta comum = 6000)
     passo 8  moveV   (centraliza a ponta 6000 na média dos 4 cantos do anel distante original)
     passo 9  rotaciona (só a ponta 6000, ao redor da base) -> inclina o chifre
     passos 10-13  pincel/liso/parte (cor+atributo ANTES do espelho, pra herdar)
     passo 14  espelha (eixo x, pos 0, sel = as 4 faces do chifre: 6000..6003)
               -> a base (1000..1003) SOLDA (x===0 exato, sem id novo); a ponta
                  6000 (fora do plano) ganha 1 id novo = b+0 = 10000; as 4 faces
                  novas nascem em 10000..10003 (cantos revertidos, normal pra fora)
     passo 15  solido (a cabeça entra na colisão) */
export const PASSOS = [
  ['esfera', { id: 0, raio: 'cabecaRaio', aneis: 'cabecaAneis', lados: 'cabecaLados' }],

  ['plano', { id: 1000, largura: 'chifreAltura', profundidade: 'chifreProf', seg: 1 }],
  /* reposiciona o quadrado deitado (y=0, cantos em x=±0.08,z=±0.07) pra ficar
     de pé, encostado EXATO em x=0, com y variando 0.52..0.68 (perto do topo
     da cabeça — a esfera vai de y=0 a y=2·cabecaRaio=0.84) — a "troca" de
     eixo (o que era X vira Y) é feita por SOMA, nunca por rotação (rotação
     usaria cos/sen de 90°, que não é exato — ver o AVISO no cabeçalho). */
  ['moveV', { v: 1000, d: [0.08, 0.52, 0] }],    // era (-0.08, 0, -0.07) -> (0, 0.52, -0.07)
  ['moveV', { v: 1001, d: [-0.08, 0.68, 0] }],   // era (0.08, 0, -0.07)  -> (0, 0.68, -0.07)
  ['moveV', { v: 1002, d: [0.08, 0.52, 0] }],    // era (-0.08, 0, 0.07)  -> (0, 0.52, 0.07)
  ['moveV', { v: 1003, d: [-0.08, 0.68, 0] }],   // era (0.08, 0, 0.07)   -> (0, 0.68, 0.07)

  /* extruda: o quadrado (agora de pé em x=0) puxa um chifre OCO — só a ponta
     ganha tampa (o lado da base, em x=0, fica ABERTO: extruda nunca tampa a
     origem, só o lado novo). É essa abertura que o `espelha` solda depois. */
  ['extruda', { face: 1000, dist: 'chifreComprimento' }],

  /* solda o anel distante (4 cantos) num ponto só -> a ponta do chifre. A
     tampa 1000 (agora nesse anel) vira área-zero e SOME sozinha (o doc do
     `mescla` prevê); as 4 paredes colapsam de quad pra triângulo. */
  ['mescla', { de: [6001, 6002, 6003], para: 6000 }],
  ['moveV', { v: 6000, d: [0, 0.08, 0.07] }],   // centraliza a ponta na média dos 4 cantos originais do anel

  /* rotaciona SÓ a ponta (seleção por vértice — não a base, que tem que
     continuar EXATA em x=0 pro espelho soldar) ao redor de um pivô perto da
     base -> inclina o chifre pra cima/trás, a curva típica de chifre. */
  ['rotaciona', { eixo: 'z', graus: 'chifreTiltGraus', pivo: [0, 0.6, 0], sel: { v: [6000] } }],

  /* cor ANTES do espelho — a face espelhada HERDA cor/liso/parte/solido do
     original (copiados no núcleo), não precisa pintar os dois lados. */
  ['pincel', { modo: 'face', faces: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58], cor: '#625565' }],   // cabeça, ids PARES
  ['pincel', { modo: 'face', faces: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59], cor: '#7f708a' }],   // cabeça, ids ÍMPARES (paridade evita faixa chapada no atlas — a manha do _torno.js)
  ['pincel', { modo: 'face', faces: [6000, 6001, 6002, 6003], cor: '#ab947a' }],   // chifre (osso) — só o lado direito; o espelho HERDA
  ['liso', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59] }],   // cabeça redonda macia
  ['parte', { nome: 'chifres', faces: [6000, 6001, 6002, 6003] }],   // nomeia o chifre (o espelho HERDA a parte também)

  /* o passo do playground: duplica o chifre espelhado em x=0 — a base solda
     (weld), a ponta ganha id novo, winding revertido pra normal pra fora. */
  ['espelha', { eixo: 'x', pos: 0, sel: { f: [6000, 6001, 6002, 6003] } }],

  ['solido', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59] }],   // a cabeça entra na colisão (como o corpo do _torno)
];

export const meta = {
  nome: '_espelhado',
  tipo: 'objeto',
  desc: 'cabeça com par de chifres — um chifre modelado, o outro por espelha (weld provado) — peça-exemplo do P3 do playground',
  /* CALCULADA, não guardada: colisaoDe roda só a geometria (sem textura/pincel)
     e encaixa o cilindro nas faces `solido` (a cabeça). */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
