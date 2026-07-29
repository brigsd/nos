/* PEÇA: uma LANTERNA DE MÃO — corpo cilíndrico (cabo), cabeça mais larga, lente
   (material emissivo), um interruptor (cubo embutido na lateral) e uma alça de
   pendurar (cubo fino sob o cabo, um brinco/lug pra correia — não um anel
   fechado; ver o BLOQUEADO sobre torus mais abaixo). Só primitivas
   (`cilindro`/`cubo`) + `transladar` + seleção por `regiao`/`tudo`/`origem` —
   NENHUM passo escreve `id:` de vértice ou de face à mão. Segue o envelope
   (docs/uso/oficina-contrato.md "Formato do arquivo gerado"): PARAMS/TOPO/
   PASSOS exportados, `meta.colisao` CALCULADA por colisaoDe, `construir` =
   executar. Teste: npm run peca -- lanterna

   Fase 4 (drone/torno/lanterna, três medições cegas no mesmo lugar): cabeça e
   cabo declaram `origemId` no `cilindro` e endereçam a lateral e as tampas por
   `sel.origem` — `{}` (nem lado nem tampa) = só as LATERAIS, sem tampa (resolve
   o BLOQUEADO do `liso`); `{lado:{passo:2,fase:0|1}}` = paridade alternada de
   lado (resolve o BLOQUEADO do `detector-de-banding`); `{tampa:'fundo'|'topo'}`
   = a tampa nominal. Nenhum id de face escrito à mão nos dois cilindros. */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, NÃO alteram a contagem de vértices nem a
   numeração — os passos seguintes seguem apontando pros mesmos pontos.
   Nomeado por PARTE da lanterna. `cabecaY`/`lenteY`/`interrX`/`alcaY` são
   OFFSETS de posição (onde o `transladar` de cada parte a leva) — como o
   vocabulário não soma dois PARAMS num passo (só cita um nome por vez), o
   offset já-somado ganha o próprio nome, igual `taloY`/`ombroY` do `_torno`
   já fazem para o perfil do lathe. */
export const PARAMS = {
  corpoR: 0.09, corpoH: 0.60,                          // cabo: cilindro fino, a parte que a mão segura
  cabecaR: 0.14, cabecaH: 0.10, cabecaY: 0.60,          // cabeça: mais larga, empilhada em cima do cabo (cabecaY = corpoH)
  lenteR: 0.125, lenteH: 0.015, lenteY: 0.70,           // lente: disco fino no topo da cabeça (lenteY = cabecaY+cabecaH)
  interrLarg: 0.03, interrAlt: 0.04, interrProf: 0.02,  // interruptor: cubo pequeno
  interrX: 0.09, interrY: 0.28,                         // embutido na lateral do cabo, meia-altura (interrX = corpoR)
  alcaLarg: 0.05, alcaAlt: 0.03, alcaProf: 0.018,       // alça/lug: cubo fino
  alcaY: 0.02, alcaZ: -0.09,                            // embutida na TRASEIRA do cabo, perto da base (alcaZ = -corpoR)
};

/* topológico: `lados` muda a CONTAGEM dos três cilindros (cabo/cabeça/lente) —
   os três reusam o mesmo valor, então mudar aqui reconstrói os três juntos. */
export const TOPO = { lados: 8 };

/* exportado (não `const` privado): sem isto a Oficina não relê a lista e o
   arquivo nunca mais reabre pra edição.

   ORDEM DELIBERADA (é o que evita escrever id à mão): cada `cilindro`/`cubo`
   nasce PRESO à origem (docs/uso/oficina-contrato.md, `transladar`), então uma
   peça nova SEMPRE aparece no (0,0,0) antes de mover. Pra selecionar "só a
   peça que acabei de criar" por `sel.regiao` sem listar vértice/face, cada
   parte é criada, TRANSLADADA e PINTADA antes da PRÓXIMA parte nascer — assim
   a caixa de seleção de uma parte nunca cruza com o que já existe alhures
   (cabeça/lente saem da origem ANTES do cabo existir; o cabo nasce por
   último na origem, mas nada mais está lá quando ele chega). Verificado por
   RAIO: o cabo tem raio 0.09, e a caixa de qualquer outra parte na origem
   (interruptor, alça) tem meia-diagonal bem menor que 0.09 — nenhuma delas
   alcança o anel do cabo mesmo sobrepondo a mesma caixa Y. */
export const PASSOS = [
  // cabeça: nasce na origem, sobe pra cima de onde o cabo vai ficar (nada mais existe ainda).
  // origemId 100 — a op declara, a caixa de translada continua por regiao (a mesma ordem de sempre).
  ['cilindro', { raio: 'cabecaR', altura: 'cabecaH', lados: 'lados', origemId: 100 }],
  ['transladar', { d: [0, 'cabecaY', 0], sel: { regiao: { min: [-0.14, 0, -0.14], max: [0.14, 0.10, 0.14] } } }],
  // lateral em paridade alternada de LADO (resolve o BLOQUEADO do detector-de-banding, sem id à mão)
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 100, lado: { passo: 2, fase: 0 } } }, cor: '#9babb2' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 100, lado: { passo: 2, fase: 1 } } }, cor: '#7f708a' }],
  // as duas tampas (fundo/topo nominais, sem cruzar com a lateral)
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 100, tampa: 'fundo' } }, cor: '#9babb2' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 100, tampa: 'topo' } }, cor: '#9babb2' }],
  // sombreado macio só na lateral — `{}` (nem lado nem tampa) é "todas as laterais, sem tampa" (resolve o BLOQUEADO do `liso`)
  ['liso', { sel: { origem: { op: 'cilindro', id: 100 } } }],

  // lente: idem, sobe pro topo da cabeça (a cabeça já saiu da origem)
  ['cilindro', { raio: 'lenteR', altura: 'lenteH', lados: 'lados' }],
  ['transladar', { d: [0, 'lenteY', 0], sel: { regiao: { min: [-0.125, 0, -0.125], max: [0.125, 0.015, 0.125] } } }],
  ['material', { sel: { regiao: { min: [-0.125, 0.70, -0.125], max: [0.125, 0.715, 0.125] } }, usa: 'lente' }],

  // cabo: nasce na origem por ÚLTIMO entre as partes empilhadas — fica ali mesmo (é a base). origemId 200.
  ['cilindro', { raio: 'corpoR', altura: 'corpoH', lados: 'lados', origemId: 200 }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 200, lado: { passo: 2, fase: 0 } } }, cor: '#3e3546' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 200, lado: { passo: 2, fase: 1 } } }, cor: '#625565' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 200, tampa: 'fundo' } }, cor: '#3e3546' }],
  ['pincel', { modo: 'face', sel: { origem: { op: 'cilindro', id: 200, tampa: 'topo' } }, cor: '#3e3546' }],
  ['liso', { sel: { origem: { op: 'cilindro', id: 200 } } }],

  // interruptor: cubo pequeno, embutido na lateral do cabo (metade dentro, metade pra fora)
  ['cubo', { larg: 'interrLarg', alt: 'interrAlt', prof: 'interrProf' }],
  ['transladar', { d: ['interrX', 'interrY', 0], sel: { regiao: { min: [-0.015, 0, -0.01], max: [0.015, 0.04, 0.01] } } }],
  ['pincel', { modo: 'face', sel: { regiao: { min: [0.075, 0.28, -0.01], max: [0.105, 0.32, 0.01] } }, cor: '#c32454' }],

  // alça/lug: cubo fino, embutido na traseira do cabo perto da base (metade dentro, metade pra fora — acima do chão, não embaixo)
  ['cubo', { larg: 'alcaLarg', alt: 'alcaAlt', prof: 'alcaProf' }],
  ['transladar', { d: [0, 'alcaY', 'alcaZ'], sel: { regiao: { min: [-0.025, 0, -0.009], max: [0.025, 0.03, 0.009] } } }],
  ['pincel', { modo: 'face', sel: { regiao: { min: [-0.025, 0.02, -0.099], max: [0.025, 0.05, -0.081] } }, cor: '#2e222f' }],

  // a peça inteira entra na colisão (o mesmo `tudo:true` do _torno) — cabo, cabeça, lente,
  // interruptor e alça juntos; colisaoDe encaixa um cilindro na malha final
  ['solido', { sel: { tudo: true } }],
];

/* material da lente: emissivo + semLuz, pra parecer que acende (a mesma
   convenção da `brasa` do _oficina-materiais). */
export const MATERIAIS = {
  lente: { cor: '#ffffff', emissivo: 1.2, semLuz: true },
};

// RESOLVIDO (Fase 4): os dois BLOQUEADO abaixo — "não dá pra separar lateral de
// tampa pra `liso`" e "banding exige paridade sem `sel.origem` pra `cilindro`" —
// eram o MESMO buraco visto de dois ângulos: `cilindro` não declarava origem
// (CONTRATOS_ORIGEM só tinha `loft`/`cubo`). Agora `cilindro` aceita `origemId`
// e dois eixos em `sel.origem`: `lado` (numérico, sobre as L laterais, aceita
// filtro {passo,fase}) e `tampa` (nominal, 'fundo'/'topo'); nenhum dos dois
// presentes = só as laterais, sem tampa. Ver os passos de pincel/liso acima.

// BLOQUEADO: eu queria um ANEL de pendurar de verdade (um laço fechado, tipo
// argola) em vez do lug/cubo. `lathe`/`loft` giram ou percorrem um PERFIL
// ABERTO (uma polilinha) em torno de um eixo ou caminho — não fecham o próprio
// perfil num laço (a "reserva de curva" do lathe é só canto reto vs. curvo por
// PONTO, não fechamento de loop). O próprio contrato documenta isso
// explicitamente (docs/uso/oficina-contrato.md, linha do `lathe`: "não fecha
// loop mesmo se o último ponto == o primeiro (pneu/torus fica fora do
// escopo)"). Não existe hoje uma op que feche um torus/argola — troquei por
// um cubo fino (lug), que É uma alça honesta (a tarefa aceitava "alça OU
// anel"), mas não é o anel fechado que eu tentei primeiro.

export const meta = {
  nome: 'lanterna',
  tipo: 'objeto',
  desc: 'lanterna de mão — cabo cilíndrico, cabeça mais larga, lente emissiva, interruptor e alça de pendurar',
  /* CALCULADA, não guardada: colisaoDe roda só a geometria (sem pincel/material)
     e encaixa o cilindro de colisão na malha inteira (via `solido` com `tudo`). */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO, MATERIAIS),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx, MATERIAIS); }
