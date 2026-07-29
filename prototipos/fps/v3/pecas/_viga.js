/* PEÇA-EXEMPLO do P5 do playground: uma VIGA — o objeto que só a chave
   `contorno` do `loft` faz hoje (uma seção RETANGULAR, não circular, no lugar
   do `raio`). É o caso que `docs/oficina.md` cita como motivação: estrela,
   hexágono, perfil de I — aqui é um retângulo, mas o mesmo mecanismo serve
   pra qualquer seção com o número certo de pontos.

   O CAMINHO — 3 seções ANEL (`s1`/`s2`/`s3`, todas com o MESMO retângulo, só
   a posição muda) entre dois POLOS (`raio:0`) que fecham as pontas — curva em
   X **e** Z enquanto sobe em Y (não-planar, como o `_galho.js` do P4), pra
   provar que o TRANSPORTE PARALELO do frame não torce uma seção ANGULAR do
   mesmo jeito que já não torce uma redonda: o pior produto-escalar entre os
   dois triângulos de um mesmo quad (medido em tools/oficina/oficina.test.ts)
   fica bem positivo — as quinas do retângulo continuam retas e alinhadas de
   ponta a ponta, sem girar em torno do próprio eixo.

   FECHADO nas duas pontas -> WATERTIGHT, provado por manifold (toda aresta
   dirigida pareada 1×) + volume assinado > 0 (nenhuma face invertida).

   SEM `liso`, ao contrário do `_galho.js`: a seção é ANGULAR de propósito —
   suavizar sombreado esconderia as quinas retas que são o ponto inteiro do
   `contorno` (o corpo inteiro fica CHAPADO, como as tampas do cilindro/torno,
   só que aqui é a peça INTEIRA que é "tampa").

   Segue o envelope (docs/oficina.md "Formato do arquivo gerado"): PARAMS/
   TOPO/PASSOS exportados (a Oficina relê a lista pra reabrir), `meta.colisao`
   CALCULADA por colisaoDe no carregamento (`solido` marca a viga inteira,
   como o `_torno.js`/`_galho.js`), `construir` = executar. Cores da PALETA
   Resurrect64 (motor/tex.js), 2 tons de madeira clara alternando por
   PARIDADE de id (a mesma manha do `_torno.js`/`_galho.js` contra o
   `detector-de-banding` — nenhuma cor em bloco).

   Teste: visor.html?peca=_viga · npm run peca -- _viga */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, NÃO altera a contagem de vértices/faces nem
   a numeração — os passos seguintes seguem apontando pros mesmos pontos.
   `vigaL`/`vigaA` são a meia-largura e a meia-altura da seção retangular; o
   `contorno` não aceita `-nome` (só literal ou nome de PARAM), por isso o
   sinal negativo também é um PARAM à parte — mudar `vigaL` sem mudar
   `vigaLneg` (ou vice-versa) desalinha a seção, então os dois andam juntos. */
export const PARAMS = {
  vigaL: 0.16, vigaLneg: -0.16,
  vigaA: 0.08, vigaAneg: -0.08,
  s1X: 0, s1Y: 0.20, s1Z: 0.05,
  s2X: 0.05, s2Y: 0.45, s2Z: 0.25,   // o COTOVELO: X e Z aceleram, a curva muda de força aqui
  s3X: 0.05, s3Y: 0.70, s3Z: 0.50,
  pontaX: 0.05, pontaY: 0.85, pontaZ: 0.55,   // polo da ponta — fecha watertight
};

/* topológico: mudar RECONSTRÓI (renumera todos os ids do passo). `lados:4`
   porque a seção é um RETÂNGULO — 4 pontos, um por canto. */
export const TOPO = { lados: 4 };

/* o retângulo em si: 4 pontos [u,w] no plano LOCAL do anel, CCW (a mesma
   convenção do círculo — ângulo crescente é CCW; aqui é canto a canto na
   mesma volta). Reusado nas 3 seções-anel: a FORMA não muda ao longo do
   caminho, só a posição. */
const RETANGULO = [
  ['vigaL', 'vigaA'], ['vigaLneg', 'vigaA'], ['vigaLneg', 'vigaAneg'], ['vigaL', 'vigaAneg'],
];

/* exportado (não `const`): sem isto a Oficina não relê a lista.
   NUMERAÇÃO (a documentada no comentário da op `loft` em motor/oficina.js —
   `contorno` não muda em NADA a contagem, só a origem da coordenada):
   5 seções (2 polos + 3 anéis) × lados=4 -> V = 2 + 3·4 = 14 (b+0..b+13);
   4 segmentos, NENHUM polo-polo adjacente -> F = 4·4 = 16 (b+0..b+15),
   contíguas por segmento na ORDEM do caminho:
     seg0 (polo base -> anel s1) -> F 0..3   (leque, a tampa da base)
     seg1 (s1 -> s2, o cotovelo)  -> F 4..7   (quads — a curva mais forte)
     seg2 (s2 -> s3)              -> F 8..11  (quads — já reto de novo)
     seg3 (s3 -> polo ponta)      -> F 12..15 (leque, a tampa da ponta) */
export const PASSOS = [
  ['loft', {
    lados: 'lados',
    secoes: [
      { pos: [0, 0, 0], raio: 0 },                       // polo: fecha a BASE
      { pos: ['s1X', 's1Y', 's1Z'], contorno: RETANGULO },
      { pos: ['s2X', 's2Y', 's2Z'], contorno: RETANGULO }, // o cotovelo
      { pos: ['s3X', 's3Y', 's3Z'], contorno: RETANGULO },
      { pos: ['pontaX', 'pontaY', 'pontaZ'], raio: 0 },  // polo: fecha a PONTA
    ],
  }],

  /* 2 tons de madeira clara, alternando por PARIDADE de id — não um bloco
     chapado só (o crítico `detector-de-banding` cobra). SEM `liso`: a seção é
     angular de propósito, ver o comentário do cabeçalho. */
  ['pincel', { modo: 'face', faces: [0, 2, 4, 6, 8, 10, 12, 14], cor: '#ab947a' }],
  ['pincel', { modo: 'face', faces: [1, 3, 5, 7, 9, 11, 13, 15], cor: '#966c6c' }],
  // a viga inteira entra na colisão (como o corpo do _torno.js/_galho.js)
  ['solido', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }],
];

export const meta = {
  nome: '_viga',
  tipo: 'objeto',
  desc: 'viga curva de seção retangular — loft com contorno explícito (não-circular), fechada nas duas pontas — peça-exemplo do P5 do playground',
  /* CALCULADA, não guardada: colisaoDe roda só a geometria (sem textura/
     pincel) e encaixa o cilindro na viga inteira (via `solido`), igual ao
     `_galho.js` — o raio encaixado é MEDIDO (distância do eixo Y até o ponto
     mais afastado), não um parâmetro só. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
