/* CAIXA-FERRAMENTAS — peça nova (medição da linguagem da Oficina hoje, sessão
   de agente limpo): objeto pequeno de segurar na mão — corpo, tampa, alça em
   arco, par de dobradiças, par de rebites e um fecho central. Corpo e tampa
   são `chamferBox` (caixa cantelada — tira a cara de caixote cru sem virar
   redonda); a alça é um `loft` de 7 seções (2 polos + 5 anéis) traçando um
   semicírculo acima da tampa, a mesma técnica do `_galho.js` (caminho
   arbitrário), aqui planar; dobradiças e rebites são `cilindro` deitado
   (`rotaciona`) e completados em par por `espelha` (eixo x) — modela um lado
   só, o espelho faz o outro, como `_espelhado.js`.

   Segue o envelope (docs/uso/oficina-contrato.md): PARAMS/TOPO/PASSOS
   exportados (a Oficina relê a lista pra reabrir), `meta.colisao` CALCULADA
   por `colisaoDe` no carregamento, `construir` = executar.

   Comentários `BLOQUEADO:` marcam onde o vocabulário documentado hoje
   (docs/uso/oficina-contrato.md + este cabeçalho da op em motor/oficina.js)
   não teve uma palavra pro que eu queria dizer — são o produto desta rodada,
   não um defeito da peça.

   Teste: npm run peca -- caixa-ferramentas */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, NÃO alteram a contagem de vértices/faces
   nem a numeração dos passos seguintes (chamferBox não tem TOPO — contagem
   sempre 24V/26F; cilindro/loft têm TOPO próprio, abaixo).
   Vários PARAMS aqui são EXPRESSÕES JS sobre os outros (`tampaTopoY`,
   `dobradicaX/Z`, `rebiteX/Y/Z`, `fechoY/Z`) — JS puro no MÓDULO, não um
   recurso da Oficina: um campo de PASSO só aceita um número literal OU UM
   nome de PARAM (`st.num`), nunca uma expressão combinando dois nomes. Ver
   o BLOQUEADO no passo que empilha a tampa em cima do corpo. */
const corpoLarg = 0.40, corpoAlt = 0.22, corpoProf = 0.20, corpoChanfro = 0.025;
const tampaAlt = 0.05, tampaChanfro = 0.012;
const tampaTopoY = corpoAlt + tampaAlt;                 // topo da tampa já empilhada sobre o corpo
const alcaRaioArco = 0.15, alcaEspessura = 0.012;
const dobradicaLados = 8, dobradicaRaio = 0.018, dobradicaAlt = 0.03;
const dobradicaX = corpoLarg / 2 - 0.05, dobradicaZ = -corpoProf / 2;
const rebiteLados = 8, rebiteRaio = 0.010, rebiteAlt = 0.012;
const rebiteX = corpoLarg / 4, rebiteY = corpoAlt / 2, rebiteZ = corpoProf / 2;
const fechoLarg = 0.06, fechoAlt = 0.05, fechoProf = 0.03, fechoChanfro = 0.008;
const fechoY = corpoAlt - fechoAlt / 2, fechoZ = corpoProf / 2;
const alcaLados = 8;

export const PARAMS = {
  corpoLarg, corpoAlt, corpoProf, corpoChanfro,
  tampaAlt, tampaChanfro, tampaTopoY,
  alcaRaioArco, alcaEspessura,
  dobradicaRaio, dobradicaAlt, dobradicaX, dobradicaZ,
  rebiteRaio, rebiteAlt, rebiteX, rebiteY, rebiteZ,
  fechoLarg, fechoAlt, fechoProf, fechoChanfro, fechoY, fechoZ,
};

/* topológicos: mudar RECONSTRÓI e pode deixar os passos seguintes órfãos —
   os índices calculados abaixo (Array.from) dependem destes três números;
   mudar um deles exige recalcular os comprimentos junto (a mesma advertência
   que TOPO já carrega no contrato). */
export const TOPO = { dobradicaLados, rebiteLados, alcaLados };

/* ARCO da alça: 7 seções (2 polos + 5 anéis) — a técnica do `_galho.js`
   (loft ao longo de um caminho arbitrário), aqui um semicírculo PLANAR (x,y
   variam, z fixo em 0), calculado por trigonometria comum a partir dos
   PARAMS acima. Não é vocabulário novo — é JS puro escolhendo os PONTOS que
   o `loft` pede; não existe um combinador "arco" no vocabulário, só `loft`
   com seções que EU informo. */
const ALCA_SECOES = Array.from({ length: 7 }, (_, k) => {
  const t = Math.PI * (k / 6);                          // 0 (direita) .. π (esquerda)
  const pos = [Math.cos(t) * alcaRaioArco, tampaTopoY + Math.sin(t) * alcaRaioArco, 0];
  return { pos, raio: (k === 0 || k === 6) ? 0 : alcaEspessura };
});

/* exportado (não `const`): sem isto a Oficina não relê a lista.
   NUMERAÇÃO (formato salvo, pela fórmula documentada de cada op em
   motor/oficina.js — não recontada no olho).

   BLOQUEADO: eu tinha ESCOLHIDO os blocos de id (0, 1000, 3000, 4000, 2000,
   5000...) pelo TIPO da peça (corpo/tampa/dobradiça/rebite/alça/fecho), do
   jeito que `_primitivas.js` faz. `npm run auditar` rejeitou com "id 4000 ≠
   base da posição 10000 — a posição manda": o bloco NÃO é escolhido por mim,
   é `índice-do-passo × 1000` (a regra "Identidade por bloco" do
   docs/uso/criar-peca SKILL — eu tinha lido, mas ao INTERCALAR passos de
   apoio (rotaciona/transladar/pincel/liso/espelha) entre as primitivas, o
   índice de cada primitiva deixou de ser um múltiplo redondo que eu
   adivinhasse de cabeça sem contar a lista inteira. Só descobri rodando o
   gate — não existe validação nem cálculo "qual vai ser o próximo bloco
   livre" ANTES de escrever o passo; tive que CONTAR posições na lista à mão
   (0-based) pra saber que o cilindro do rebite ia nascer em 10000 (passo
   10), o loft da alça em 17000 (passo 17) e o chamferBox do fecho em 21000
   (passo 21) — e re-contar de novo toda vez que inseri um passo antes deles.
     passo 0  chamferBox (corpo)            -> V 0..23 (24), F 0..25 (26) [fixo, sem TOPO]
     passo 1  chamferBox (tampa)            -> V 1000..1023 (24), F 1000..1025 (26)
     passo 2  transladar (tampa pro topo do corpo)
     passo 3  cilindro (dobradiça, lados 8) -> V 3000..3015 (16), F 3000..3007 lateral, 3008 fundo, 3009 topo
     passo 4  rotaciona (deita a dobradiça: eixo Y -> eixo X)
     passo 5  transladar (posiciona na quina de trás, lado direito)
     passos 6-8  pincel×2 + liso (cor/macio ANTES do espelho — a cópia HERDA)
     passo 9  espelha (eixo x, pos 0) -> par de dobradiças
     passo 10 cilindro (rebite, lados 8)    -> V 10000..10015 (16), F 10000..10007 lateral, 10008 fundo, 10009 topo
     passo 11 rotaciona (deita o rebite: eixo Y -> eixo Z, aponta pra fora da frente)
     passo 12 transladar (posiciona na frente, lado direito)
     passos 13-15 pincel×2 + liso
     passo 16 espelha (eixo x, pos 0) -> par de rebites
     passo 17 loft (alça, 7 seções × 8 lados) -> V 17000..17041 (42), F 17000..17047 (48)
     passos 18-20 pincel×2 + liso (só os 4 segmentos de anel, F 17008..17039 — os 2 leques das pontas ficam chapados)
     passo 21 chamferBox (fecho)            -> V 21000..21023 (24), F 21000..21025 (26)
     passo 22 transladar (fecho pra frente, no meio da costura)
     passos 23-28 pincel×6 (fecho + corpo + tampa, 2 tons cada)
     passos 29-31 parte (corpo/tampa/alça, pra animação futura — ex. abrir a tampa)
     passos 32-33 solido (corpo + tampa entram na colisão) */
export const PASSOS = [
  ['chamferBox', { id: 0, larg: 'corpoLarg', alt: 'corpoAlt', prof: 'corpoProf', chanfro: 'corpoChanfro' }],

  ['chamferBox', { id: 1000, larg: 'corpoLarg', alt: 'tampaAlt', prof: 'corpoProf', chanfro: 'tampaChanfro' }],
  /* BLOQUEADO: eu queria dizer "encaixa a tampa encostada na face de cima do
     corpo" — não existe operação de posicionamento relativo entre peças (um
     "empilha em cima de" / "encosta na face X de Y"). Toda primitiva nasce
     PRESA na origem (docs/uso/oficina-contrato.md, seção do `transladar`) e
     eu tive que saber, por conta própria, que o chão da tampa (y=0) encontra
     o topo do corpo em y=corpoAlt só porque conheço a convenção "toda
     primitiva nasce com y=0 embaixo". Também tive que compor `corpoAlt +
     tampaAlt` (dois PARAMS somados) FORA da lista de passos, como
     `tampaTopoY` no topo do arquivo — um campo de PASSO só aceita um número
     ou UM nome de PARAM, nunca uma expressão entre dois. Se o corpo um dia
     virasse outra primitiva (ex.: `lathe`, cujo topo não é necessariamente
     um PARAM só), esse número teria que ser recalculado à mão de novo. */
  ['transladar', { d: [0, 'corpoAlt', 0], sel: { v: Array.from({ length: 24 }, (_, k) => 1000 + k) } }],

  ['cilindro', { id: 3000, raio: 'dobradicaRaio', altura: 'dobradicaAlt', lados: 'dobradicaLados' }],
  ['rotaciona', { eixo: 'z', graus: -90, sel: { v: Array.from({ length: 2 * dobradicaLados }, (_, k) => 3000 + k) } }],
  ['transladar', { d: ['dobradicaX', 'corpoAlt', 'dobradicaZ'], sel: { v: Array.from({ length: 2 * dobradicaLados }, (_, k) => 3000 + k) } }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 5 }, (_, k) => 3000 + k * 2), cor: '#625565' }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 5 }, (_, k) => 3001 + k * 2), cor: '#7f708a' }],
  ['liso', { faces: Array.from({ length: dobradicaLados }, (_, k) => 3000 + k) }],
  ['espelha', { eixo: 'x', pos: 0, sel: { v: Array.from({ length: 2 * dobradicaLados }, (_, k) => 3000 + k) } }],

  ['cilindro', { id: 10000, raio: 'rebiteRaio', altura: 'rebiteAlt', lados: 'rebiteLados' }],
  ['rotaciona', { eixo: 'x', graus: 90, sel: { v: Array.from({ length: 2 * rebiteLados }, (_, k) => 10000 + k) } }],
  ['transladar', { d: ['rebiteX', 'rebiteY', 'rebiteZ'], sel: { v: Array.from({ length: 2 * rebiteLados }, (_, k) => 10000 + k) } }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 5 }, (_, k) => 10000 + k * 2), cor: '#9babb2' }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 5 }, (_, k) => 10001 + k * 2), cor: '#c7dcd0' }],
  ['liso', { faces: Array.from({ length: rebiteLados }, (_, k) => 10000 + k) }],
  ['espelha', { eixo: 'x', pos: 0, sel: { v: Array.from({ length: 2 * rebiteLados }, (_, k) => 10000 + k) } }],

  ['loft', { id: 17000, lados: 'alcaLados', secoes: ALCA_SECOES }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 3 * alcaLados }, (_, k) => 17000 + k * 2), cor: '#ab947a' }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 3 * alcaLados }, (_, k) => 17000 + k * 2 + 1), cor: '#966c6c' }],
  ['liso', { faces: Array.from({ length: 4 * alcaLados }, (_, k) => 17000 + alcaLados + k) }],   // só os 4 segmentos de anel — os 2 leques das pontas ficam chapados

  ['chamferBox', { id: 21000, larg: 'fechoLarg', alt: 'fechoAlt', prof: 'fechoProf', chanfro: 'fechoChanfro' }],
  ['transladar', { d: [0, 'fechoY', 'fechoZ'], sel: { v: Array.from({ length: 24 }, (_, k) => 21000 + k) } }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => 21000 + k * 2), cor: '#f9c22b' }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => 21000 + k * 2 + 1), cor: '#fbb954' }],
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => k * 2), cor: '#374e4a' }],           // corpo, ids pares
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => k * 2 + 1), cor: '#547e64' }],       // corpo, ids ímpares
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => 1000 + k * 2), cor: '#313638' }],    // tampa, ids pares
  ['pincel', { modo: 'face', faces: Array.from({ length: 13 }, (_, k) => 1000 + k * 2 + 1), cor: '#374e4a' }], // tampa, ids ímpares

  ['parte', { nome: 'corpo', sel: { v: Array.from({ length: 24 }, (_, k) => k) } }],
  ['parte', { nome: 'tampa', sel: { v: Array.from({ length: 24 }, (_, k) => 1000 + k) } }],
  ['parte', { nome: 'alca', sel: { v: Array.from({ length: 2 + 5 * alcaLados }, (_, k) => 17000 + k) } }],

  ['solido', { faces: Array.from({ length: 26 }, (_, k) => k) }],
  ['solido', { faces: Array.from({ length: 26 }, (_, k) => 1000 + k) }],
];

export const meta = {
  nome: 'caixa-ferramentas',
  tipo: 'objeto',
  desc: 'caixa de ferramentas — corpo + tampa (chamferBox), alça em arco (loft), dobradiças e rebites (cilindro + espelha), fecho central',
  /* CALCULADA, não guardada: colisaoDe roda só a geometria (sem
     textura/pincel) e encaixa o cilindro nas faces `solido` — corpo+tampa. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
