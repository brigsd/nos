# Oficina — o contrato vigente

Recorte do antigo `docs/oficina.md` com **o que vale hoje** na Oficina: o formato
salvo, a identidade de vértice, o vocabulário de operações, as camadas do código e
a restrição de como a IA emite peça. É verificável contra o núcleo
(`prototipos/fps/v3/motor/oficina.js`) — a tabela de operações é gateada por
`npm run criar`.

O que ainda NÃO existe está em [`docs/rumo/oficina-roteiro.md`](../rumo/oficina-roteiro.md);
o registro de projeto (por que cada coisa ficou assim, o que já foi construído) em
[`docs/historico/oficina-projeto.md`](../historico/oficina-projeto.md). Pra usar a
ferramenta no dia a dia, [`oficina-referencia.md`](./oficina-referencia.md) é mais
curto que isto.

## O que é

Um editor 3D dentro do próprio jogo. Cena vazia, câmera livre, e você modela
o objeto ali: move vértice, extruda face, pinta, escala, rotaciona. Na hora de
salvar, não sai arquivo de modelo — sai **código**, um arquivo em `pecas/` como
se tivesse sido escrito à mão.

## A decisão que define todo o resto

**O arquivo guarda a lista de passos, não o resultado.**

Não "estes 36 vértices estão nestas posições", e sim:

```
cilindro raio 0.34 altura 1.9
extruda a face 12 em 0.4
move o vértice 7 em (0.1, 0, -0.05)
faces 3,4,5 são verdes
faces 0..11 são sólidas
```

Abrir o objeto é executar a lista.

Isso não limita a liberdade: arrastar um vértice à mão **é** uma operação
gravada, como qualquer outra. Você mexe no que quiser.

## O envelope: um meta-formato pra toda peça

Decisão do ideador (2026-07-20): definir AGORA o que não pode mudar nunca,
pra que todo o resto possa mudar barato depois. Esse mecanismo é o
**envelope** — a anatomia única de toda peça, de qualquer tipo.

O perigo que ele mata: este documento já tem cinco formatos irmãos nascendo
separados — Objeto salva `PASSOS`+`PARAMS`, Som propôs as operações dele,
Desenho vai ter traços, Animação tem `ANIMACOES`, Material tem `MATERIAIS`.
Se cada tipo inventar a própria forma de arquivo, cada peça do túnel —
contrato, descrever, undo, preset, homologação, bancada — custa 5×, e
unificar depois é reescrever tudo.

A regra: **toda peça, de qualquer tipo, tem a mesma anatomia.**

```js
export const FORMATO = { v: 1, tipo: 'objeto' };  // ou 'som', 'desenho', 'efeito'
export const PARAMS = { ... };       // dimensionais, nomeados
export const TOPO   = { ... };       // os que reconstroem (quando o tipo tiver)
export const PASSOS = [ ['op', { ... }], ... ];   // SEMPRE esta forma
export const meta   = { nome, tipo, desc, ... };
export function construir(ctx) { ... }
```

O que muda de tipo pra tipo é **só o vocabulário de operações** — malha tem
`extruda`, som tem `filtro`, desenho tem `pincel`. A gramática, nunca. Com
isso o túnel é construído UMA vez e opera sobre "envelope"; tipo novo herda
undo, replay, contrato, descrever, preset e bancada sem custo. Tipo novo =
vocabulário novo + adaptador, nada mais.

Três regras que fazem parte do envelope, porque também são impossíveis de
consertar depois:

1. **Carimbo de versão desde o primeiro arquivo salvo.** Com a federação,
   peça ESCAPA — fork, outro mundo, repo de terceiro. A ferramenta se
   conserta; os arquivos dos outros, nunca mais. Formato sem versão é
   tatuagem. Compatibilidade: o executor abre qualquer versão antiga;
   versão mais nova do que ele conhece → **recusa explicando**, jamais
   adivinha.
2. **Endereçamento uniforme.** Vértice `7`, `parte:'galho-1'`,
   `material:'casca'`, traço, trilha — toda referência entre coisas segue o
   mesmo esquema de id/nome em todo tipo. É o que deixa o descrever, o diff
   e a detecção de órfão funcionarem iguais em tudo.
3. **Órfão grita, nunca corrompe.** A regra que o `TOPO` já tem ("avisa
   quais passos ficaram órfãos") promovida a lei do envelope: qualquer
   referência pendurada, em qualquer tipo, avisa alto — jamais estraga em
   silêncio.

E o que o envelope compra de sofisticado é o que ele **evita**: não é
preciso acertar hoje o vocabulário do som, os pincéis nem o emissor. Tudo
isso pode nascer errado e ser corrigido — **porque** o envelope segura a
estabilidade. Define-se agora só o irreversível; o resto ganha licença pra
evoluir.

## Decisões de base

- **Cena com um ou vários objetos** — vários.
- **Desenhos em pasta separada**, não junto da peça: o mesmo desenho serve de
  gabarito pra várias peças, e é ele que vai pra IA.
- **A Oficina roda dentro do jogo e isolada.** Carregada sob demanda com
  `import()`, então quem só joga nunca paga o custo dela; o `oficina.html`
  carrega o mesmo módulo direto. Condição: a Oficina **não lê estado do jogo**.
  Ela recebe o que precisa, não busca.
- **1 unidade = 1 metro.** Já era assim sem estar escrito: no `jogo.html`,
  `EYE = 1.7` é altura dos olhos, `SPEED = 5.2` é corrida em metros por segundo,
  `JOGADOR_R = 0.35` dá uns 70cm de ombro a ombro. Escrever fecha a porta pra
  alguém supor outra coisa.
- **Objeto pode ser instanciado com parâmetros diferentes**, e desde o começo.
  O jogo já faz isso por tipo (`VARIANTES` com 4 sementes); o que falta é por
  objeto. Como os parâmetros já têm nome, basta `construir()` aceitar valores
  que substituem os do `PARAMS`.
- **Número tem que ser FINITO; ponto tem que ter 3 elementos** (2º achado
  adversarial do P4, vale pro núcleo INTEIRO). `st.num` recusa `NaN`/`Infinity`
  e `st.vec` recusa qualquer coisa que não seja `[x,y,z]` — throw, a mesma lei
  que o `num` já aplicava pra nome de PARAM inexistente. O motivo é que o
  estrago num TOPO é INVISÍVEL a todo gate: `lados: NaN` -> `NaN|0` = 0 ->
  `Math.max(3, 0)` = 3, então um cilindro de V=16/F=10 vira V=6/F=5 com malha
  LIMPA — a peça salva muda de CONTAGEM e todo id de face dos passos seguintes
  passa a apontar pra outra face, sem nada reclamar. Num valor dimensional o
  estrago é menor (coordenada NaN, que o `lint-de-malha` do `auditar` ainda
  pega a jusante — mas sem dizer QUAL passo errou). Cada op **também** valida
  por conta, pra GRITAR nomeando a seção/ponto (a lei do lathe, D-115): a
  rede central garante que nada vaza, a checagem local dá o diagnóstico.

## Identidade de vértice

Cada vértice ganha um número quando nasce. As operações dizem **"vértice 7"**,
nunca "o sétimo da lista". Sem isso, mexer num passo antigo embaralha a ordem e
desmancha todos os arrastos feitos depois.

Mesma lição que já apareceu no jogo: o ID de objeto (`arvore@-13,8`) sai da
posição e não do índice, então reordenar a lista de árvores não renomeia nada.

## Estrutura por dentro

O motor guarda **triângulos soltos**: cada triângulo carrega seus três cantos
próprios e ninguém sabe que são compartilhados. Um cubo tem 8 cantos e 36
vértices guardados — o canto da frente aparece 6 vezes.

Nesse formato não dá pra editar. Arrastar um canto moveria 1 das 6 cópias e o
cubo abriria um buraco.

O editor guarda **vértices únicos e faces apontando pra eles**, e converte pros
triângulos soltos do motor só na exportação. Aresta não é guardada: sai das
faces, e duas faces vizinhas compartilham uma.

**Cuidado que confunde (e já confundiu):** "cada face tem seus próprios
vértices, não compartilha com a vizinha" É regra — mas **do motor**, o formato
solto que justamente NÃO dá pra editar. No **editor** é o oposto de propósito:
faces vizinhas **compartilham** o vértice, e é isso que deixa arrastar um canto
sem rasgar a malha. Consequência direta pra mescla: **mesclar não abre buraco no
motor.** O motor sempre recebe a versão solta re-gerada na exportação, nunca a
que você editou; mesclar só faz mais faces apontarem pro mesmo vértice, que é
situação normal no editor. O impacto real da mescla não é na forma — é na
identidade dos vértices no histórico (ver a operação `mescla` e a lei "órfão
grita" do envelope).

---

## Formato do arquivo gerado

O arquivo tem que ser uma peça normal do jogo: exporta `meta` e `construir(ctx)`,
igual `arvore3d.js` faz hoje — e segue **o envelope** acima (esta seção é o
envelope encarnado no tipo `objeto`). A diferença é que o corpo dele é **dados**.

```js
/* PEÇA gerada pela Oficina. Editável à mão, mas o caminho normal é reabrir
   na ferramenta — ela lê este mesmo arquivo de volta. */
import { executar, colisaoDe } from '../motor/oficina.js';

/* dimensionais: mudar à vontade, não alteram a contagem de vértices */
export const PARAMS = { troncoR: 0.34, troncoH: 1.9 };
/* topológicos: mudar RECONSTRÓI e pode órfãos os passos seguintes */
export const TOPO = { lados: 8 };

/* exportado, e não `const`: a ferramenta precisa ler a lista de volta pra
   você continuar editando. Sem o export, o arquivo só roda, não reabre. */
export const PASSOS = [
  ['cilindro', { id: 1, raio: 'troncoR', altura: 'troncoH', lados: 'lados' }],
  ['extruda',  { face: 12, dist: 0.4 }],
  ['moveV',    { v: 7, d: [0.1, 0, -0.05] }],
  ['mescla',   { de: [7, 12], para: 31 }],
  ['pincel',   { modo: 'face', faces: [3, 4, 5], cor: '#4a7c3f' }],
  ['solido',   { faces: [0, 1, 2, 3] }],
];

export const meta = {
  nome: 'toco',
  tipo: 'objeto',
  desc: 'toco de árvore',
  /* CALCULADA, não guardada. O jogo lê isto no carregamento do módulo, antes
     de `construir()` rodar, então `colisaoDe` faz só a geometria — sem textura,
     sem pincel. Guardar o número medido recriaria a segunda verdade que já
     tirou a borda da ilha do lugar. */
  colisao: colisaoDe(PASSOS, PARAMS, TOPO),
};

export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
```

Cinco coisas nesse formato merecem atenção.

**Parâmetros têm nome, e os passos citam o nome, não o número.** `raio:
'troncoR'`, não `raio: 0.34`. É isso que faz mudar um valor em `PARAMS`
reconstruir o objeto inteiro. Sem isso o arquivo seria só uma lista de números.

**`PASSOS` é exportado.** Parece detalhe e não é: sem o export, a Oficina não
consegue ler a lista de volta, e o arquivo salvo nunca mais reabre pra edição.

**A colisão é calculada, não guardada.** O `jogo.html` lê `meta.colisao` no
carregamento do módulo, antes de `construir()` rodar. E o raio encaixado sai da
malha final, depois das extrusões — quase nunca é igual a um parâmetro, então
`raio: PARAMS.troncoR` estaria errado no caso geral. Por isso `colisaoDe` roda
só a parte geométrica dos passos, sem textura nem pincel: é barato o bastante
pra rodar no carregamento e mantém um número com um dono só.

**Parâmetros são de dois tipos, e isso não é enfeite.** Raio e altura mudam a
forma sem mudar a contagem de vértices, então os passos seguintes continuam
apontando pros mesmos pontos. Já `lados` muda quantos vértices existem: passar
de 8 pra 12 faz o "vértice 7" de um passo antigo virar outro ponto, e o arrasto
gravado depois vai parar no lugar errado. Por isso `TOPO` fica separado —
mudar algo ali reconstrói, e a ferramenta **avisa quais passos ficaram órfãos**
em vez de estragar em silêncio. O Blender tem exatamente esse problema na pilha
de modificadores dele.

**Mesclar grava `de` e `para`.** Sem isso, refazer a lista quebraria assim que
uma identidade de vértice desaparecesse.

### Numeração dos vértices criados no meio do caminho

Extrudar cria vértices novos, e eles precisam de número **previsível**. Se a
numeração depender de qualquer coisa que varie entre execuções, o `moveV`
gravado depois aponta pro lugar errado ao reabrir.

Regra: o contador de identidade depende só da **posição do passo na lista**.
Passo 4 sempre começa a numerar no mesmo lugar, rodando hoje ou daqui a um ano.

### Salvar: o navegador não escreve arquivo

Uma página web não grava em disco. Ela pode baixar pra pasta de downloads, ou
pedir permissão pra uma pasta com a File System Access API, que só o Chrome tem.

A saída limpa já está meio pronta: o **servidor de desenvolvimento** que passou
a mandar `no-store` (ver `walkthrough_colaborador4.md`) ganha uma rota que
aceita POST e grava o arquivo. Salvar na Oficina escreve direto em `pecas/`,
sem você mover nada de lugar.

Sem o servidor no ar, cai pro download comum — funciona, mas você move o arquivo
à mão.

## Lista de operações

| Status | Operação | Argumentos | Observação |
|---|---|---|---|
| FEITO | `cubo`, `cilindro` | `id`, medidas, `lados` | Ponto de partida. Cria vértices numerados a partir de `id`. |
| FEITO | `esfera` | `id`, `raio`, `aneis` (mín 2), `lados` (mín 3) | FEITO (P1 do playground, só núcleo). UV-sphere apoiada no chão (polo sul em y=0, norte em y=2·raio). `raio` é PARAM; `aneis`/`lados` são TOPO. Numeração travada por teste: polo sul = b+0; anel k, vértice j = b+1+(k−1)·lados+j; polo norte = b+1+(aneis−1)·lados; faces contíguas por faixa (b+k·lados+j): leque sul, quads, leque norte — detalhe no comentário da op. |
| FEITO | `cone` | `id`, `raio`, `altura`, `lados` (mín 3) | FEITO (P1, só núcleo). Anel da base em y=0 (b+0..b+lados−1), ápice em y=altura (b+lados). Faces: laterais b+j (triângulos pra fora) + tampa da base b+lados (mesmo winding do fundo do cilindro, normal −y). |
| FEITO | `plano` | `id`, `largura`, `profundidade`, `seg` (mín 1) | FEITO (P1, só núcleo). Grade (seg+1)² no plano XZ centrada na origem (y=0), linha a linha: b+iz·(seg+1)+ix. Faces: seg² quads b+iz·seg+ix, normal +y (o ciclo da tampa de cima do cubo). |
| FEITO | `loft` | `id`, `secoes: [{pos:[x,y,z], raio}, ...]` (≥2 seções), `lados` (mín 3) | FEITO (P4 do playground, só núcleo). Conecta uma sequência de SEÇÕES ao longo de um CAMINHO 3D arbitrário — o que hoje `galhoSeca` faz à mão em `arvore-cartoon.js`; uma árvore inteira vira um passo só. O `lathe` é o TEMPLATE (mesmo cursor/polo/anel/leque/guarda); a peça nova é o FRAME: como não há mais um eixo fixo (o Y do lathe), cada anel é orientado por TRANSPORTE PARALELO — reimplementado local ao núcleo, byte-equivalente ao `quadro`/`transporta` de `arvore-cartoon.js` (a convenção já provada no `galhoSeca`). Tangente da seção i = direção do único segmento na ponta, ou a média normalizada dos dois segmentos vizinhos no interior; o frame semente sai de `quadro(tangente(0))` e propaga com `transporta` (projeta a base fora da tangente nova e renormaliza — refaz do zero só se degenerar) — é isso que impede o tubo de TORCER numa curva. `pos` é PARAM (via `st.vec`), `raio` é PARAM (via `st.num`); `lados` é TOPO pra toda seção. **`contorno` (P5, FEITO, D-118):** substitui `raio` por `contorno: [[u,w],...]` com EXATAMENTE `lados` pontos no plano LOCAL do anel (os eixos do transporte paralelo) — seção NÃO-circular (estrela, hexágono, retângulo) sem tocar em nada da numeração/faces/overflow, que só enxergam "polo ou anel de `lados` vértices". `raio` e `contorno` são MUTUAMENTE EXCLUSIVOS (os dois juntos, ou nenhum dos dois, GRITA e ABORTA). Cada ponto é `[u,w]` — a alça de curva é RESERVADA no 3º elemento (GRITA e ABORTA, a mesma lei do lathe/D-115); contagem ≠ `lados` GRITA e ABORTA; winding tem que ser CCW (validado por ÁREA COM SINAL — shoelace: CW ou degenerado GRITA e ABORTA, senão produziria normal invertida ou nula silenciosa, a classe do achado do P3). Peça-exemplo `pecas/_viga.js` (viga curva de seção retangular, watertight). Seção malformada (não-objeto, sem `pos`, ou `pos` com aridade ≠ 3) GRITA igual — a aridade do `pos` é a mesma lei do ponto do perfil no lathe (2º achado adversarial do P4: sem ela, `pos:[0,1]` construía com `z` = `undefined` e saíam 12 coordenadas NaN com ZERO órfãos). **Segmento de comprimento zero** (duas seções na mesma `pos`) e **CUSP** (o caminho dobrando ~180°, onde a média dos dois segmentos vizinhos zera): a tangente fica indefinida — GRITA e ABORTA o passo inteiro, verificado ANTES de montar qualquer frame. O cusp foi o 1º achado adversarial do P4 e era um degenerado SILENCIOSO, não-NaN: `norm3` devolve `[0,0,0]` pelo guarda `|| 1`, então `w = cross(u,0) = 0` e o anel do meio COLAPSAVA numa linha (medido: distâncias ao centro 0.3/0.15/0.15 em vez de um círculo) — invisível pro teste de manifold. **Polo vs anel:** idêntico ao lathe — `raio` resolvido `=== 0` vira POLO (1 vértice), `> 0` vira ANEL de `lados` vértices, `< 0` GRITA e o passo não constrói nada. Numeração travada por teste, no mesmo espírito do lathe: seção polo consome 1 id, seção anel consome `lados` ids; faces por segmento consecutivo: anel↔anel = `lados` quads (a faixa da esfera/lathe), polo↔anel/anel↔polo = `lados` triângulos (os leques sul/norte), polo↔polo adjacente GRITA (seção degenerada, sem face nesse segmento) — detalhe exato no comentário da op. **Sem tampas automáticas:** fechar uma ponta é terminar a seção com `raio:0`. Guarda de overflow (D3) por-passo, vértice e face independentes. Peça-exemplo `pecas/_galho.js` (galho curvo, afinando, fechado nas duas pontas — watertight, provado por manifold + volume assinado). |
| FEITO | `inflate` | `id`, `contornoLado: [[z,y],...]` (≥3 pontos, PARAM), `contornoTopo: [[z,x],...]` (idem), `divisoes` (TOPO, mín 2) | FEITO (P6 do playground, D-119, só núcleo). Dois contornos 2D — `contornoLado` no plano z×y, `contornoTopo` no plano z×x, a convenção da Aba Desenho — viram VOLUME 3D: a INTERSEÇÃO de dois prismas (extrusão do lado ao longo de X ∩ extrusão do topo ao longo de Y). Ponto do contorno segue a MESMA lei do `contorno` do loft (D-118): aridade ≠ 2 é a alça de curva RESERVADA, GRITA e ABORTA; <3 pontos GRITA e ABORTA. Z tem que CASAR entre os dois contornos (é o mesmo eixo físico nas duas vistas) — a caixa combinada usa a UNIÃO dos dois intervalos de Z; se os contornos não se cruzam em NENHUM voxel, GRITA e ABORTA o passo inteiro (volume vazio nunca é o que o autor queria). **MÉTODO — GRADE DE VOXEL, não CSG geral** (o motivo é ROBUSTEZ: watertight POR CONSTRUÇÃO, não por sorte de uma malha booleana): um voxel está DENTRO se a projeção (z,y) do seu centro cai no `contornoLado` E a projeção (z,x) cai no `contornoTopo` (par-ímpar por varredura); uma face só é emitida entre um voxel DENTRO e um vizinho FORA — parede interna nunca aparece, então a superfície é sempre um 2-manifold fechado por construção topológica. `divisoes` subdivide o EIXO MAIS LONGO da caixa combinada; os outros dois eixos ganham a MESMA aresta de voxel (cúbico, não distorcido). **Numeração SEM fórmula fechada** (ao contrário de lathe/loft): emerge de um SCAN determinístico — voxels em ordem `ix,iy,iz`; por voxel, as 6 direções de face em ordem fixa `[-x,+x,-y,+y,-z,+z]`; por face, os 4 cantos da grade em ordem CCW vista de fora (tabela fixa, verificada por Newell no teste); cada canto ganha id na PRIMEIRA vez que uma face o referencia. Guarda de overflow (D3): a malha é montada numa estrutura LOCAL — nunca toca o estado do núcleo — até o scan terminar; só então os totais reais (sem fórmula, contados de verdade) são comparados ao bloco de 1000 ids. Guarda de SANIDADE separada (throw, antes do scan): grade com mais de 200.000 voxels. **LIMITAÇÃO HONESTA:** o resultado é BLOCKY (facetado pelos voxels), não suave — a mesma classe do "lathe só reto por enquanto" (D-115); suavizar (ex. marching cubes) fica pra quando o caso real pedir. Vale a largura/altura INDEPENDENTES — nem lathe nem loft-com-`raio` conseguem um corpo mais largo que alto (seção sempre circular); o `inflate` sim. Peça-exemplo `pecas/_corpo.js` (corpo oval achatado, watertight — provado por manifold + volume assinado). |
| FEITO | `lathe` | `id`, `perfil: [[raio, y], ...]` (≥2 pontos), `lados` (mín 3) | FEITO (P2 do playground, só núcleo). Perfil 2D girado em torno do eixo Y — generaliza a esfera (que É um lathe de meia-circunferência: polo→anéis→polo) pra um perfil arbitrário. Cada ponto é `[raio, y]`, e `raio`/`y` são PARAM (podem citar nome); `lados` é TOPO pra todo o perfil. **Reserva de curva (formato salvo, irreversível):** um ponto de 2 elementos é SEMPRE um canto reto, pra sempre — um ponto ≠ 2 elementos — um 3º (a alça de curva, ver "Aba Desenho") ainda não suportado, ou malformado — GRITA e ABORTA o passo (0 vértices/0 faces, fail-closed, como o `raio<0`), pra ser impossível shipar hoje uma peça que renderiza reta e mudaria de figura sozinha no dia em que a curva chegar (D-115). **Polo vs anel:** `raio` resolvido `=== 0` vira POLO (1 vértice no eixo); `raio > 0` vira ANEL de `lados` vértices; `raio < 0` GRITA (não classifica) e o passo não constrói nada. Numeração travada por teste: anda o perfil com um cursor — ponto polo consome 1 id, ponto anel consome `lados` ids; faces por segmento consecutivo: anel↔anel = `lados` quads (a faixa da esfera), polo↔anel/anel↔polo = `lados` triângulos (os leques sul/norte da esfera), polo↔polo adjacente GRITA (perfil degenerado, sem face nesse segmento) — detalhe exato no comentário da op. **Sem tampas automáticas:** fechar uma ponta é terminar o perfil num polo (raio 0) — ex.: coluna com tampas chatas é `[[0,0],[R,0],[R,h],[0,h]]`. Perfil só aberto (polilinha); não fecha loop mesmo se o último ponto == o primeiro (pneu/torus fica fora do escopo do P2). Peça-exemplo `pecas/_torno.js` (peão de xadrez, fechado nas duas pontas). |
| FEITO | `displace` | `sel?` (o formato do `resolverAlvosV`/P8a, default = malha inteira), `amplitude` (PARAM, default 0,1), `frequencia` (PARAM, default 1), `semente` (PARAM, default 0) | FEITO (P8c do playground, D-122, só núcleo). Desloca cada vértice da seleção ao longo da própria NORMAL MÉDIA (a média das normais de Newell de TODAS as faces atuais que o tocam, medida ANTES de mover qualquer uma — como o centroide do `rotaciona`) por uma distância de RUÍDO 3D SEEDADO (`ruido3`, novo utilitário do núcleo — value noise: hash nos 8 cantos do reticulado que envolve o ponto × `frequencia`, interpolado por smoothstep; devolve [0,1), remapeado pra [−amplitude,+amplitude]). **FORMATO SALVO:** a fórmula do ruído (`hash3`/`ruido3`) é o que faz a mesma `semente` reproduzir o mesmo relevo sempre — mudar a fórmula reformaria toda peça que usa `displace`, a mesma classe de "nunca muda depois de shipar" da numeração. Vértice sem NENHUMA face (ex.: sobrou solto de um `apagaFace`) não tem normal pra seguir — GRITA e fica parado, nunca desloca às cegas. Não cria/apaga vértice/face (id-estável puro, como `moveF`/`moveA`) — preserva o manifold de uma malha já fechada (só move posição, nunca topologia). Peça-exemplo `pecas/_pedra.js` (com `chamferBox` abaixo: pedra lascada, relevo orgânico sobre base cantelada). |
| FEITO | `chamferBox` | `id`, `larg`/`alt`/`prof` (ou `lado`, os três — a mesma convenção do `cubo`, chão embaixo: y de 0 a `alt`, x/z centrados), `chanfro` (PARAM, distância do corte) | FEITO (P8b do playground, D-122, só núcleo). Primitiva nova: o `cubo` com CANTOS E ARESTAS chanfrados — um corte FLAT só (não arredonda; suavizar é a mesma classe do "lathe só reto por enquanto", fica pra quando o caso real pedir). **Fórmula fechada, SEM parâmetro TOPO** — a contagem é SEMPRE 24 vértices/26 faces, não importa `larg`/`alt`/`prof`/`chanfro` (bem abaixo do bloco de 1000; sem guarda de overflow, não tem como estourar). **Validade:** `chanfro` precisa ser `> 0` e `< min(larg/2, prof/2, alt/2)` — cortes de PONTAS OPOSTAS da mesma aresta não podem se cruzar (medido: no limite EXATO a malha já degenera — normal zerada, arestas soltas; por isso o teste é estrito). Fora da faixa GRITA e não constrói nada nesse passo (0 V/0 F). **Topologia (a "cantelação"):** cada um dos 8 cantos do cubo reto vira 3 vértices — um por EIXO — porque as 3 faces que se encontravam ali (X/Y/Z) cada uma ENCOLHE por conta própria (o vértice "do eixo X" mora na face X, coordenada X no valor cheio; as outras duas encolhidas `chanfro` pra dentro). Confundir com TRUNCAGEM de canto (um corte só por canto, puxando 1 eixo) dá uma malha que não fecha — provado errado por característica de Euler (V−E+F≠2) ANTES de escrever a op de verdade, a lição de sempre: medir, não recontar de cabeça. 6 faces originais encolhidas (mesmo padrão de canto do `cubo`) + 12 retângulos de aresta (4 por eixo) + 8 triângulos de canto. **Winding:** ao contrário do cilindro/esfera (um giro só resolve tudo), o chanfro não tem simetria rotacional — cada face nasce numa ordem fixa e se AUTO-ORIENTA contra o centro real da caixa (Newell · direção do centro pro centroide; inverte se apontar pra dentro), verificado por teste nas 26 faces, não numa amostra. |
| FEITO | `moveV` | `v`, `d: [x,y,z]` | Move um vértice por deslocamento, nunca por posição absoluta — assim ele acompanha quando a base muda. |
| FEITO | `moveF` | `face`, `d: [x,y,z]` | FEITO (P8a do playground, D-121, só núcleo). Move TODOS os cantos de uma face pelo mesmo delta (`st.vec`, aditivo — a mesma lei do `moveV`). Um canto COMPARTILHADO com outra face move JUNTO (não existe "vértice exclusivo da face" — é o comportamento normal de mover uma face num editor; pra deslocar sem afetar vizinho, use `extruda` antes). Face inexistente GRITA. |
| FEITO | `moveA` | `a`, `b`, `d: [x,y,z]` | FEITO (P8a do playground, D-121, só núcleo). Move as DUAS pontas de uma aresta pelo mesmo delta — açúcar sobre dois `moveV` (uma aresta é UMA ação na lista, não duas). NÃO exige que `a`/`b` estejam de fato ligados por alguma face (mover dois vértices juntos nunca corrompe nada). Ponta inexistente GRITA e é ignorada — a outra ainda move. |
| FEITO | `extruda` | `sel`, `dist` | Puxa a seleção por `dist`. **Vértice** (cria um novo ligado por uma aresta), **aresta** (cria uma aresta nova + uma face) e **face** (paredes laterais; região usa só as arestas de borda — algoritmo acima). As três, não só face. |
| FEITO | `vira` | `face` | FEITO (P8a do playground, D-121, só núcleo — SINGULAR, uma face por passo, não a lista `faces:[ids]` que a linha especulativa citava; virar N faces é N passos). Inverte o winding (reverte `f.vs`, o que vira a normal via Newell). Não cria/apaga vértice/face, só a ORDEM. Face inexistente GRITA. **CARACTERÍSTICA (não bug, medida no teste):** virar uma face JÁ consistente com as vizinhas DESALINHA o pareamento de aresta do teste de manifold (a vizinha continua no sentido antigo) — o uso responsável é o oposto, consertar uma face que já nasceu de costas (aí virar RESTAURA o pareamento). `vira` não valida consistência com vizinhas — é ferramenta pontual, não correção automática de malha inteira (a ideia de "recalcular todas pra fora" da linha antiga do doc não foi construída — fica de fora do escopo do P8a). |
| ROTEIRO | `escala` | `sel`, `fator`, `eixo?` | Sem eixo, uniforme. **Ainda NÃO existe como op de malha** — só existe hoje como CANAL de animação (`ANIMACOES[].trilhas[].canal:'escala'`, `motor/oficina.js` ~linha 850/987: multiplica a escala da PARTE por quadro, não mexe na malha salva). Não confundir os dois: esta linha é roteiro (op de edição, P8); o canal já funciona. |
| FEITO | `espelha` | `eixo` (`'x'\|'y'\|'z'` — a coordenada NEGADA), `pos?` (PARAM, default 0), `sel?` (a seleção uniforme abaixo; ausente = todas as faces) | FEITO (P3; seleção semântica D-129). DUPLICA a seleção refletida no plano `eixo=pos` (`coord' = 2·pos − coord`) — modela metade de um objeto bilateral, o espelho completa o resto. Ids NOVOS saem do BLOCO do passo (formato salvo). **Weld automático:** vértice com a coordenada do eixo EXATAMENTE `pos` é COMPARTILHADO; fora do plano duplica. A face nova sai com os cantos em ordem REVERTIDA (normal para fora) e herda cor/material/parte/liso/solido. `sel:{v}` resolve as faces incidentes e `sel:{regiao}` somente as faces inteiras na caixa; a assinatura antiga `sel:{f:[ids]}` permanece byte-idêntica. Guarda de overflow (D3) independente pra vértice-novo e face-nova. Peça-exemplo `pecas/_espelhado.js` (watertight). |
| FEITO | `rotaciona` | `eixo` (`'x'\|'y'\|'z'`), `graus` (PARAM), `sel?` (`{v:[ids]}` e/ou `{f:[ids]}` e/ou `{regiao:{min,max}}` e/ou `{grupo:'nome'}`, default = a malha inteira), `pivo?` (`[x,y,z]`, default = centroide da seleção) | FEITO (P3 do playground, só núcleo; seleção ampliada no P8a, D-121). Gira a seleção em torno do PIVÔ (`p' = pivo + R_eixo(graus)·(p−pivo)`, a mesma convenção right-handed das matrizes de animação `mRotX/mRotY/mRotZ`). SIMPLES: só desloca posições (`st.V.set` in-place) — NUNCA cria vértice/face nem renumera (o oposto do `espelha` acima). A seleção resolve por `resolverAlvosV` (helper compartilhado, P8a): `regiao` é uma caixa delimitadora INCLUSIVA — `min`/`max` os dois OBRIGATÓRIOS (`st.vec`, sem sentinela `Infinity` — o `st.num` já recusa não-finito por lei, D-118); `grupo` são as faces daquele `f.parte` (reusa a nomeação do passo 13a, D-95) — grupo sem nenhuma face GRITA. Id/grupo inexistente na seleção GRITA, nunca corrompe. |
| FEITO | `transladar` | `d` (`[x,y,z]`, PARAM, default `[0,0,0]`), `sel?` (o MESMO formato do `rotaciona`, default = a malha inteira) | FEITO (D-128, achado pelo experimento do TETO — `docs/historico/TETO.md`; só núcleo). Soma `d` a cada vértice da seleção (`p' = p + d`), ADITIVO como o `moveV` — acompanha a base, então mexer no PARAM remodela sem tocar em passo. SIMPLES: nunca cria vértice/face nem renumera, e NÃO consome o bloco de ids. Sem pivô (translação não depende de pivô). **É O IRMÃO QUE FALTAVA DO `rotaciona`:** dava pra GIRAR a malha inteira mas não pra TRANSLADAR nada maior que uma face (`moveV`=1 vértice, `moveF`=1 face, `moveA`=1 aresta) — e como 7 das 9 primitivas nascem PRESAS à origem (`cubo`/`cilindro`/`esfera`/`cone`/`plano`/`chamferBox` centrados com a base em y=0; `lathe` sempre em torno de Y), posicionar uma delas custava um `moveV` POR VÉRTICE (32+ passos por roda). Medido: a moto do TETO usou 7 das 25 ops e virou 100% `loft` — o único gerador com `pos` por seção. **O jeito de compor:** crie a primitiva, translade no passo seguinte (`sel` ausente = tudo que existe até ali; com geometria anterior no caminho, mire só a nova por `sel:{regiao}`/`{grupo}`). |
| FEITO | `mescla` | `de: [ids]`, `para: id` | Some as faces de área zero que sobrarem. |
| FEITO | `apagaFace` | `face` | FEITO (P8a do playground, D-121, só núcleo). Remove a face de `st.F`. Os VÉRTICES dela continuam existindo (podem estar em uso por outra face, ou não — um vértice sem face nenhuma não é erro, é normal ao abrir um buraco de propósito: porta, janela, ou preparo pra composição manual). Face inexistente GRITA. |
| FEITO | `pincel` | `modo`, `cor`, e o alvo conforme o modo | `modo:'face'` aceita `faces:[ids]` (legado) OU `sel` uniforme. `modo:'livre'` recebe `raio`, `dureza` e `pontos:[{f,a,b}]`, nunca `sel`. |
| FEITO | `liso` | `faces:[ids]` (legado) ou `sel` | Sombreado macio nas faces resolvidas. O padrão é chapado. |
| FEITO | `parte` | `nome`, `faces:[ids]` (legado) ou `sel` | Dá nome às faces resolvidas; é o alvo de animação e de `sel.grupo`. |
| FEITO | `material` | `faces:[ids]` (legado) ou `sel`, `usa` | Aplica um material declarado em `MATERIAIS`. |
| FEITO | `solido` | `faces:[ids]` (legado) ou `sel` | Marca as faces resolvidas que entram na colisão. |
| FEITO | `pesar` | `osso`, `vs?: [ids]` (ou `faces?: [ids]`), `peso` | FEITO (passo 14a, esqueleto/skinning). Soma `peso` de influência do OSSO aos vértices dados (diretamente por `vs` ou por `faces`, resolvidas pros vértices). Acumula por (vértice, osso); vértice sem osso nenhum some ORFÃO, não corrompe a malha. Achado da Rodada 3 da reorganização de docs: a op existe no núcleo (`OPS.pesar`) desde o passo 14a, mas não tinha linha nesta tabela — só prosa em "Passos propostos" mais abaixo (que é sobre outra coisa: esqueleto/hierarquia, não esta op). |

### Seleção uniforme (`sel`) — D-129 / D-131

> **Experimental — não é formato definitivo.** `origemId`, `sel.origem` e
> `ALIASES` são a prova da Fase 2, não uma sintaxe aprovada de produção. Loft e
> cubo validaram a mesma base de identidade; a Fase 3 começa pelo espelhamento.
> Peças antigas continuam no contrato legado e esta seção não autoriza migrar a
> moto nem expor essa sintaxe na interface.

`rotaciona`, `transladar`, `displace`, `espelha` e os atributos por face
(`pincel` no modo `face`, `liso`, `material`, `solido`, `parte`) usam a MESMA
seleção. Os campos presentes se unem, sem duplicar:

```js
sel: { f: [ids] }                         // faces literais
sel: { v: [ids] }                         // vértices literais
sel: { grupo: 'nome-da-parte' }           // faces já nomeadas por `parte`
sel: { regiao: { min:[x,y,z], max:[x,y,z] } }
sel: { origem: { op:'loft', id:1000, faixa:2, lado?:1 } }
sel: { origem: { op:'cubo', id:30, face:'topo' } }
```

Para uma op de VÉRTICE, `f`/`grupo` adicionam os cantos das faces e `regiao`
adiciona cada vértice dentro da caixa inclusiva — é o comportamento histórico de
`rotaciona`/`transladar`. Para uma op de FACE, `v` alcança toda face incidente a
algum vértice citado; `regiao` alcança somente a face cujos **todos** os cantos
estão dentro da caixa. Isso evita pintar/materializar meia face por acidente.

`origemId` identifica uma origem no objeto inteiro e encontra o contrato local
no índice interno reconstruído a cada `nucleo` (nunca no canônico); duplicata,
inclusive entre geradores, grita e permanece ambígua. Em `loft`,
`op:'loft'` + `id:1000` usa `faixa` zero-based (`2` liga as seções 2 e 3) e
`lado` opcional, também zero-based; não há tampas. Em `cubo`,
`op:'cubo'` + `id:30` usa uma única `face` local: `fundo` (-y), `topo` (+y),
`tras` (-z), `direita` (+x), `frente` (+z) ou `esquerda` (-x). Esses nomes são
locais ao cubo e sobrevivem a transformação sem topologia. A identidade
posicional `id` do PASSO permanece como sempre; `origemId` é a identidade
estável aditiva exigida por esta seleção.

`faces:[ids]` permanece para todas as peças salvas e não pode aparecer junto de
`sel` na mesma op: a mistura é ambígua e GRITA. Toda chave de seleção
desconhecida, id/grupo inexistente, região sem `min`/`max` finitos ou invertida,
e seleção sem alvo válido GRITA com a operação, o tipo e a causa; o passo não
corrompe silenciosamente a malha. Não há sucesso silencioso.

Toda operação precisa ser **determinística**: mesma lista, mesmo objeto,
sempre. Nada de aleatório sem semente escrita no passo, senão reabrir o arquivo
dá um objeto diferente. Isso vale também pra numeração dos vértices criados no
meio do caminho, como explicado acima.

## Onde o código mora: três camadas

A separação existe por dois motivos ao mesmo tempo — o jogo não pode carregar o
editor pra desenhar um toco, e outro criador precisa conseguir usar a Oficina no
mundo dele sem copiar o nosso motor junto.

**Núcleo** — sabe o que é vértice e face. Guarda a lista de passos, executa, e
devolve o objeto em números: onde está cada ponto, quais pontos formam cada face,
que cor e que material tem cada uma. **Não sabe desenhar e não precisa.**

**Adaptador** — pega esses números e monta no formato do motor. O nosso monta os
triângulos soltos da v3. Quem usa outro motor escreve o dele, umas vinte linhas.
É a única peça que muda de mundo pra mundo.

**Interface** — a tela: câmera, gizmo, painéis, botões.

O caminho de um arrasto, pra ficar concreto: a **interface** percebe o arrasto e
avisa; o **núcleo** grava a operação e recalcula as posições; o **adaptador**
transforma em malha do motor pra aparecer.

### A decisão de agora

Na versão descuidada, o núcleo montaria a malha da v3 direto. Na organizada, ele
**devolve números** e o adaptador monta. Mesmo resultado, mesmas funções, mesma
velocidade — é arrumação interna, não concessão. **Não se abre mão de nada.**

O efeito colateral é que o adaptador fica trocável.

Custo real: um laço sobre os vértices, uma vez na construção do objeto, não por
quadro. E se um dia a v3 quiser algo que o formato neutro não expressa, o
adaptador é o lugar de acrescentar — ele lê o neutro e põe o nosso por cima.

Pela mesma lógica da lista de passos: barato agora, caro depois.

### Uma cópia, não duas

Foi considerado manter duas versões da Oficina, uma "portátil" e uma nossa,
customizada. **Rejeitado.** Todo defeito viraria dois, as duas divergem em
semanas, e a portátil se deteriora porque ninguém a usa no dia a dia — sobra uma boa
e uma quebrada.

A separação em três camadas existe justamente pra que **uma base só** sirva os
dois casos.

### Nos arquivos

- **`motor/oficina.js`** — núcleo e adaptador da v3: `executar(...)` e
  `colisaoDe(...)`. Pequeno, é o que o jogo carrega. Sem interface, sem edição.
  O `colisaoDe` roda só a geometria, porque é chamado no carregamento do módulo.
- **`oficina.html`** — a interface. Só abre quando se vai modelar, carregada sob
  demanda com `import()`.

**A medir quando existir:** o jogo passa a executar pinceladas ao abrir uma peça.
As peças de hoje já geram textura por código, então o custo deve ser parecido —
mas é suposição, não medição. Se pesar, a saída é guardar a textura pronta em
cache no navegador, sem virar arquivo no repositório.

## Normais: chapado por padrão

O documento não tratava disso e muda muito a aparência. Face chapada usa uma
normal só por face; face lisa usa a média das faces vizinhas em cada vértice.

**Padrão chapado**, que é o que a árvore de hoje faz e o que combina com o
estilo do jogo. Opção de marcar faces como lisas depois, gravada como operação
igual ao resto (`['liso', { faces: [...] }]`).

Sem decidir isso, cada objeto sairia com um sombreado diferente sem ninguém
entender por quê.

### Direção das faces, à vista

Mostrar pra que lado cada face aponta (fora/dentro) é o `--geo=normais` que a
bancada já tem (D-65). Na modelagem isso entra como **camada visível ligável**
— cor por orientação, tipo o azul/vermelho do Blender — pra você achar a face
virada do avesso a olho. É o par visual do `vira` e do lint de malha: um mostra,
o outro conserta/acusa.

## Modos de entrada

O botão 5 do mouse liga e desliga a navegação, e é o que resolve a briga por
teclas. Com o voo LIGADO aparece a mira e WASD, Q e E movem a câmera. Com o voo
DESLIGADO as mesmas teclas viram comando: E extruda, S escalona, R rotaciona.

Uma tecla nunca faz duas coisas no mesmo momento, e o estado é visível na tela —
a mira diz em qual modo você está. Isso é melhor que regra condicional
("Ctrl desce, menos quando você está arrastando"), que funciona mas some da
vista e confunde meses depois.

Efeito colateral bom: como Q e E passaram a subir e descer, o **Ctrl ficou
livre** e o ímã pode usá-lo sem conflito nenhum.

## Abas e espaços de trabalho

Duas coisas diferentes que é fácil confundir.

**Abas** são contextos de verdade separados. Existem três:

- **Desenho** — tela plana, sem câmera, sem 3D.
- **Objeto** — a cena 3D.
- **Som** — sem câmera nem malha, forma de onda e play. Ver "Aba Som".

O **painel de IA** dentro do jogo — marcado mais abaixo como *possível, não
planejado* (ver "IA na criação de peças") — não seria aba nem espaço:
ficaria em cima de qualquer uma das três, sem cena própria. O caminho de IA
que de fato usamos nem é um painel: é a IA soltando a peça no repositório,
descrito na mesma seção.

**Espaços de trabalho** são arranjos de painel sobre a MESMA cena 3D, dentro da
aba Objeto: **Modelar**, **Material** e **Animação**. Trocar de espaço muda quais
painéis aparecem, e nada mais — câmera, seleção e objeto continuam onde estavam.

É a divisão do Blender, onde Shading e Animation são espaços de trabalho e não
programas diferentes. O critério é simples: **precisa da mesma câmera e da mesma
seleção? Então é espaço, não aba.** Virar aba faria perder as duas a cada troca,
atrito sem ganho.

Dentro do espaço Modelar, o `Tab` continua ciclando **objeto → edição →
pintura**.

### Layout da interface (D-73)

Mesmo esqueleto em todas as telas, pra que aprender uma seja saber todas:

- **Cena (ou canvas) no centro**, ocupando a maior parte.
- **Painel de propriedades à direita** — é o único que troca de conteúdo entre
  os espaços: Modelar mostra as ferramentas de malha; Material, os parâmetros;
  Animação abre uma linha do tempo embaixo + a lista de partes.
- **Barra de modos no topo**, **barra de status embaixo** (dimensões, o que
  está selecionado, medida).

Nas abas sem 3D: Desenho é o canvas 2D no centro com as ferramentas à esquerda;
Som é a forma de onda no centro, os blocos à direita e o play embaixo.

### Adicionar forma (P9a do playground, D-123)

Até o P9a, o painel de propriedades só reagia à SELEÇÃO — nenhum bloco criava
geometria nova; abrir a Oficina sem uma peça já escrita à mão (`_vazio.js`, por
exemplo) era um beco sem saída, sem nenhum botão pra colocar o primeiro vértice.
O bloco **Adicionar forma** é o primeiro do painel, e o ÚNICO sempre visível no
espaço Modelar sem depender de seleção nenhuma: um `<select>` com as 6
primitivas de parâmetro ESCALAR do núcleo (`cubo`/`cilindro`/`esfera`/`cone`/
`plano`/`chamferBox`), campos numéricos que trocam conforme o tipo, e um botão
que empurra `[tipo, {...campos}]` no fim de PASSOS. `lathe`/`loft`/`inflate`
ficam de fora de propósito — pedem um PERFIL/CONTORNO (array de pontos), não
campo escalar; isso é a Aba Desenho, ainda por vir.

A forma nova sempre nasce na ORIGEM (a convenção "chão embaixo" de toda
primitiva) e já sai com as PRÓPRIAS faces selecionadas — reposicionar é edição
normal com o vértice/gizmo já existentes (arrastar), não uma feature nova.
Como cada op numera pela PRÓPRIA posição na lista (`baseDoPasso`), adicionar
formas em sequência nunca colide de id, não importa quantas já existem. Um
parâmetro inválido (ex.: `chanfro` fora da faixa do `chamferBox`) GRITA — o
passo entra em PASSOS mas nasce sem face nenhuma — e a UI avisa em vez de
falhar silenciosa; a geometria já existente fica intacta.

### Editar (P9b do playground, D-124)

`moveF`/`moveA`/`vira`/`apagaFace` existiam no núcleo desde o P8a (D-121) sem
NENHUM botão — o bloco **Editar**, por último no painel Modelar, fecha essa
lacuna. Três campos `dX`/`dY`/`dZ` (um delta RELATIVO somado à posição atual,
diferente do painel Vértice acima — que edita um ALVO absoluto por eixo, só
faz sentido pra 1 vértice) + o botão **Mover**, e dois botões só-de-face,
**Inverter** (`vira`) e **Apagar** (`apagaFace`).

Cada op do núcleo aqui é SINGULAR — toma UMA face ou UM par de vértices, nunca
a multi-seleção inteira — então a UI decide o alvo pelo FORMATO da seleção
atual, a mesma convenção do handle de extrude do passo 7 ("a seta extruda só a
ativa" mesmo com várias faces marcadas):

- **Face ativa** selecionada → **Mover** grava `moveF`, **Inverter**/**Apagar**
  ficam disponíveis.
- **Exatamente 2 vértices** selecionados → **Mover** grava `moveA` nas duas
  pontas. Não existe hit-test de aresta novo: o par-de-2 que o Shift+clique do
  passo 8 já monta SERVE de seleção de "aresta" porque o `moveA` do núcleo não
  exige que as duas pontas estejam de fato ligadas por uma face (doc da op).
- Qualquer outro formato (1 vértice, 3+, nada) — o bloco inteiro some.

Guardas: um clique de Mover em voo (arrasto ativo) é ignorado; delta
`[0,0,0]` não grava passo fantasma (D3); um componente além de ±100 é
RECUSADO inteiro, não clampado (D4, o mesmo limite do valor exato do passo
6). Depois de `apagaFace`, o id apagado não existe mais — a seleção zera e o
bloco some, como qualquer edição que invalida o que estava selecionado.

### Ruído + Transformar (P9c do playground, D-125)

Dois blocos, também por último no painel Modelar (a mesma lição de posição
do P9b: nada fica visível ANTES de algo que um clique de coordenada crua
dependa). Aparecem com QUALQUER seleção — vértice(s) OU face(s), o núcleo do
`displace`/`rotaciona` aceita qualquer contagem, ao contrário do par-exato
do bloco Editar.

**Ruído** — painel do `displace` (P8c): campos `amplitude`/`frequência`/
`semente` + o botão Aplicar (o molde do painel Material — parâmetros
persistentes, não deltas que zeram sozinhos). Desloca a seleção atual ao
longo da própria normal por ruído seedado. Campo vazio/lixo cai no DEFAULT
do núcleo; `amplitude` além de ±100 é RECUSADA inteira (D4); `amplitude=0`
é no-op (D3).

**Transformar** — botões pro `espelha` e `rotaciona` (P3, sem UI desde que
existem): Espelhar (eixo + posição do plano) DUPLICA as FACES selecionadas
— fica DESABILITADO sem face (a op só aceita `sel.f`, nunca vértice solto);
depois de espelhar, a seleção pula pras faces NOVAS, o mesmo padrão do
bloco Adicionar forma. Rotacionar (eixo + graus) gira a seleção atual em
torno do CENTROIDE dela (pivô default do núcleo — sem campo de pivô
explícito nesta rodada); `graus` é um giro RELATIVO como o `dX/dY/dZ` do
bloco Editar — o campo volta a `0` num sucesso, e `graus=0` é no-op (D3).

Achado ao rodar a bancada (não hipotético): o round-trip de exportar e
reabrir uma peça com `displace` na lista NÃO bate bit-a-bit entre o
canônico da página (Chromium) e o do Node — diverge na 12ª-13ª casa decimal
(~1e-13). Causa: o ruído (`hash3`) usa `Math.sin`, e o ECMAScript só
garante bit-exatidão pra `+`/`-`/`*`/`/` — funções transcendentais são de
implementação, então builds distintas de V8 (o do Chromium, o do binário
Node) podem divergir por ULPs. Não é bug: dentro do MESMO motor (o caso
real — jogo OU ferramenta, nunca os dois comparados) o resultado é
determinístico; a divergência só aparece nesse cross-check síntético
página↔Node. A bancada compara estrutura EXATA (ids, contagem, winding) e
posição de vértice com epsilon 1e-9 (~4 ordens de grandeza de folga sobre o
ruído medido).

> **CORREÇÃO (D-128, achado pelo experimento do TETO):** o parágrafo acima —
> e o D-125 — descrevem esta exceção como se fosse **do `displace`**. Ela não
> é: vale pra **qualquer op que use `Math.cos`/`Math.sin`**, o que inclui
> TODO gerador circular — `cilindro`, `esfera`, `cone`, `lathe`, `loft` — e o
> `rotaciona`. A moto do TETO divergiu 1 ULP (6.9e-18) num vértice de anel de
> `loft` **sem ter um único `displace`** na lista. Quem lesse a doc ao pé da
> letra concluiria "determinismo REPROVADO" numa peça correta. A régua certa
> (estrutura exata + posição com epsilon `1e-9`) vale pra **classe inteira**,
> não pra uma op.

### Grupo + Região (P9d do playground, D-126)

Dois blocos SEMPRE visíveis no painel Modelar (não dependem de seleção
nenhuma, como Adicionar forma) — os dois SÓ SELECIONAM, nunca gravam passo:
populam `selVertices`/`selFaces` como um clique normal, então todo botão
dos blocos Editar/Ruído/Transformar já funciona em cima do que eles
selecionam, sem mudar nada ali.

**Grupo** — lista as partes nomeadas (`f.parte`, a op `parte` do 13a) como
chips clicáveis, igual à lista de Partes do espaço Animação — porque É a
MESMA fonte (`animCtl.selecionarParte`, reusado, não duplicado). Nomear uma
parte continua sendo ação do espaço Animação (D-96 não muda); Modelar só
LÊ os nomes que já existem e seleciona as faces deles. Sem nenhuma parte
nomeada, mostra o placeholder "nenhuma parte nomeada ainda".

**Região** — seleção por caixa delimitadora, nova (não existia UI nem em
Animação): 6 campos `mín`/`máx` × x/y/z (inclusivos, os dois OBRIGATÓRIOS —
a mesma lei do `resolverAlvosV`, sem sentinela infinita) + o botão
Selecionar região, que varre `neutro.V` com a MESMA regra do núcleo
(`p >= min && p <= max` nos 3 eixos). O botão "usar caixa do objeto"
preenche os 6 campos com o bbox ATUAL — só nesse clique, nunca sozinho (os
campos são uma CONSULTA que a pessoa compõe, não um retrato ao vivo tipo o
painel Vértice; sobrescrever sozinho apagaria o que foi digitado).

Achados reais ao rodar (não hipotéticos): (1) um hook novo
(`gruposDisponiveis`) chamava `partesNomeadas()` direto, mas essa função
vive num escopo aninhado que o objeto `window.__oficina` não enxerga —
`ReferenceError` só na hora de rodar, nunca na leitura do código; consertado
reusando `animCtl.partes()` (que JÁ tem o closure certo, porque é chamado
de dentro do mesmo escopo aninhado). (2) os botões de Grupo/Região não
desabilitavam durante um arrasto, ao contrário de todo outro botão desde o
P9a ("um dono por vez") — consertado antes da bancada formal, não depois.

### Espaço Material (passo 19, D-127)

O chip "Material" da barra existia desde o passo 13b, mas era HTML morto —
sem `id`, sem `addEventListener`. Uma investigação (motivada por "clico e
não acontece nada") confirmou: clicar nele de fato não fazia nada. A spec
(D-73) já prometia um espaço de verdade — "Modelar, Material e Animação",
um seletor de 3 vias, não 2. Este passo cumpre a promessa.

**O estado vira 3 vias.** `animLigado` (booleano) virou `espaco` (string:
`'modelar' | 'material' | 'animacao'`); `setEspacoAnim(on)` virou
`setEspaco(nome)`. A generalização preserva a ordem de efeitos colaterais de
antes (limpar seleção de vértice/pincel ao ENTRAR em Animação, resetar o
preview de animação ao SAIR dela) — só que "sair de Animação" agora é medido
direto (`espaco === 'animacao'` ANTES da troca), não mais inferido do
destino. Por isso uma troca DIRETA de Animação pra Material (sem passar por
Modelar) já reseta o preview corretamente, sem precisar de um caso especial
— a generalização certa isola a regra que importa (saiu de Animação) da
regra que era só coincidência (o único destino possível era Modelar).

**Cor e Material saem do Modelar.** Os blocos `#blocoCor` (passo 9) e
`#blocoMaterial` (12a) trocaram o gate `!modelar` por `espaco !== 'material'`
— antes apareciam em Modelar com uma face selecionada; agora aparecem no
espaço Material. É a mudança de comportamento real deste passo: escolher cor
ou aplicar material passa a exigir trocar de espaço primeiro.

**Pincel fica de fora, de propósito.** Cor/Material moveram; o pincel macio
(passo 11c) não. Ele já era independente do espaço (só depende de
`pincelLigado`, e o clique no chip nunca teve guarda contra Animação — só o
atalho de teclado tinha) e a spec só promete "parâmetros" no espaço Material,
não pintura. Mover o pincel também empilharia risco sem necessidade clara —
fica registrado como ajuste possível se a coluna do Modelar ainda estiver
longa depois deste corte.

**Compatibilidade.** `espacoAnim()`/`ligarAnim()`/`animEstado().animLigado`
mantêm o comportamento externo de antes por fora — viram invólucros finos
sobre `espaco`. `ligarAnim(false)` sempre volta pro Modelar, nunca Material
(o caso que quebraria silenciosamente numa tradução ingênua). Dois hooks
novos: `espaco()` (a string crua) e `ligarMaterial(b)`, espelhando
`ligarAnim`.

Dois achados — e nenhum dos dois veio de RODAR, o que é a diferença desta
rodada em relação às anteriores.

**(1) Na investigação, antes de codar.** Reusar `!animLigado` como "fora de
Modelar" vazaria os blocos exclusivos de Animação pro Material também, já
que uma negação só não separa 3 estados: `atualizarPainel` escondia
`blocoAnim`/`blocoPartes`/`blocoEsqueleto`/`blocoPeso`/`blocoAnims` (+
`blocoChave` e a linha do tempo) com `hidden = modelar` — sob 3 vias isso
teria mostrado esses blocos também em Material. Os 3 pontos que dependiam
dessa leitura viraram testes diretos contra `espaco === 'animacao'`; a
bancada (passo 19) confirma o resultado, não foi o que achou o problema.

**(2) Na revisão adversarial do próprio diff, já com tudo verde.** A dica do
painel Vértice (`pvDica`) dizia, com uma face selecionada, "escolha uma cor
pra pintar" — e ela vive dentro do `blocoVertice`, que é Modelar-only. Com a
Cor mudando de espaço, a dica passou a MENTIR: mandava escolher uma cor
justamente no espaço onde o seletor de cor não existe mais. Nada pegaria
isso: é texto, não comportamento (nenhuma asserção lê `pvDica`), e a
verificação manual também não pegou, porque eu conferi o que tinha MUDADO,
não o que tinha ficado para trás. Reescrita pra apontar o espaço Material e
manter só o que é de fato do Modelar (extrudar pela seta / tecla E). A lição:
mover uma funcionalidade de lugar não é só mover o bloco — é caçar todo texto
que apontava pra ela de onde ela morava.

## Aba Som

O jogo já sintetiza 100% do áudio em código — `motor/som.js`, zero arquivo
de som no repositório, mesma dieta zero-binário da textura (D-30 e D-61). O
problema não é falta de síntese: é que ela é só código de mão, sem audição
ao vivo nem parâmetro nomeado. Mudar o corte de um filtro é editar um
número, salvar, recarregar o jogo e andar até ouvir — o mesmo atrito que a
Oficina já resolveu do lado visual.

**Nem tudo em `som.js` é a mesma coisa, e a distinção decide o escopo.**

- **Evento parametrizado** — um grão de passo, uma bolha, uma rajada de
  vento, um estalo. Constrói uma vez a partir de parâmetros, tem duração
  própria, termina. É o mesmo formato de peça: lista de passos, parâmetros
  com nome, resultado determinístico dado uma semente. Cabe inteiro na
  Oficina.
- **Comportamento contínuo** — quando disparar a próxima rajada, como a
  densidade da água acompanha a distância (`agendarRajada`, `agendarAgua`).
  Isto não constrói um objeto, gira pra sempre reagindo ao jogo. Não é peça,
  é sistema — mais parecido com o que `ANIMACOES` já é pro espaço Animação
  (valores ao longo do tempo, dirigido por trilha) do que com uma malha.

**Proposta: a Aba Som cobre só o primeiro grupo.** Gera e edita o evento —
osciladores, ruído, filtro, envelope, ganho — com forma de onda na tela e
play imediato, do mesmo jeito que o visor mostra o objeto 3D. O agendamento
(quando tocar, com que densidade) continua código de jogo comum, que CHAMA
o evento gerado — a mesma separação que já existe entre a peça e o lugar
onde ela é plantada no mapa.

Contraponto que vale debater: dava pra tentar cobrir o comportamento
contínuo também, com uma "trilha de eventos" parecida com `ANIMACOES`. Não
recomendo agora — `agendarRajada`/`agendarAgua` têm lógica condicional real
(espera de cauda longa, limiar de proximidade) que forçar em trilha
declarativa provavelmente complica mais do que ajuda. Fica pra depois, se o
padrão "trilha reage a estado do jogo" aparecer de novo em outro lugar e
compensar generalizar.

### Passos propostos

| Operação | Argumentos | Observação |
|---|---|---|
| `oscilador` | `id`, `tipo` (`seno`/`quadrada`/`triangular`/`serra`), `freq` | Fonte tonal. |
| `ruido` | `id`, `cor` (`branco`/`rosa`, parâmetro `k` como em `makeNoise`) | Fonte não-tonal. |
| `filtro` | `de: id`, `tipo` (`passa-baixa`/`passa-alta`/`passa-banda`), `freq`, `q` | Um `BiquadFilterNode`. |
| `envelope` | `de: id`, `ataque`, `pico`, `decaimento`, `duracao` | Perfil de ganho no tempo. |
| `ganho` | `de: id`, `valor` | Mistura e volume. |
| `soma` | `de: [ids]` | Combina caminhos, como o `mixerG` de hoje. |

Mesma regra da geometria vale aqui: **determinístico dado uma semente**, ou
reabrir o arquivo muda o som. `Math.random()` cru no meio de um passo é
proibido pela mesma razão de sempre.

`motor/som.js` de hoje **não é jogado fora** — os parâmetros já tunados
(`PISOS.grama`, a rajada de vento, a bolha) viram o catálogo inicial de
eventos, e o arquivo continua sendo o adaptador que liga os eventos gerados
ao Web Audio, no mesmo papel que `motor/oficina.js` tem pro lado visual.

### Dois níveis de vocabulário (D-73)

Decisão do ideador: a Aba Som tem os **dois** níveis, não um só —
- **blocos pequenos** (oscilador, ruído, filtro, envelope, ganho): flexível,
  monta qualquer som do zero;
- **presets maiores** (vento, passo, bolha): fáceis, um som pronto pra variar.

Os presets são feitos com os blocos por baixo, então não são sistemas
concorrentes — o preset é o ponto de partida, o bloco é a liberdade (é a mesma
relação de "partir de algo pronto" dos Presets de objeto). `[FEITO (S4/D-103): o
catálogo é `_passo`/`_vento`/`_bolha`/`_agua`, semeados do `som.js`; nível fácil = preset, nível livre = blocos.]`

Ordem de construção da Aba Som (paralela à da Oficina; estado `[x]/[~]/[ ]`):

- S1 `[x]` **Núcleo do evento + adaptador Web Audio + bancada de replay** (D-99): `somnucleo.js` (grafo em dados, determinístico, `oscilador`/`ruido`/`filtro`/`envelope`/`ganho`/`soma` + `lfo` + `alturaEnv`, órfão/ciclo gritam, `somCanonico`) + `somweb.js` (grafo→Web Audio, `renderarOffline`) + a bancada `sintetizar` (replay byte-a-byte) + o evento-exemplo `_bolha`. O `som.js` do jogo intocado.
- S2 `[x]` **Casca da aba Som** (D-100): a página nova `som.html` (forma de onda no centro + Play/loop/espaço), carrega e toca um evento (`_bolha`); desenha a onda de `renderarOffline` (determinística) e liga o grafo vivo no Play. O chip "Som" do editor navega pra cá. `som.js` do jogo intocado.
- S3 `[x]` **Blocos ao vivo** (D-101): o painel direito virou o EDITOR — cada nó um card com sliders/dropdowns, adicionar/ligar/remover blocos, e editar re-renderiza a onda na hora (o Play toca a versão editada). Validação surfada sem quebrar. Só `som.html`.
- S3.5 `[x]` **Análise — o "ouvido"** (D-102): `somanalise.js` (espectrograma STFT + descritores: tom/brilho/ataque/duração) na aba (ao lado da onda, em linguagem de gente) + na bancada. Como a IA não escuta, som se prova por medida+imagem — seno vira linha reta, filtro derruba o brilho, tudo determinístico. Só `som.html` + módulo novo.
- S4 `[x]` **Presets** (D-103): o catálogo curado de sons prontos, cada um semeado dos números já tunados do `som.js` e FEITO com os blocos do S3 — ao abrir já é editável (editor) e analisável (ouvido), peça inicial e não engrenagem à parte. `_passo` (grão de impacto + corpo grave), `_vento` (ruído filtrado largo/sustentado/ondulando), `_bolha` (glissando tonal), `_agua` (ruído grave abafado); o seletor lista o catálogo com nomes amigáveis (Passo/Vento/Bolha/Água). Provado PELO OUVIDO (S3.5), com duas medições que concordam: passo agudo/largo (brilho ~2994 Hz, estalo curto), vento sustentado 4.53 s com ondulação 2 Hz, bolha tonal (varre ~450→660), água grave (~352 Hz). Jóia `som.js` + `oficina.html` diff VAZIO. O A/B fiel byte-a-byte contra o `som.js` é o S5.
- S5a `[x]` **Exportar** (D-104): a aba SALVA o evento num `.js` que REABRE bit-a-bit (o análogo sonoro do passo 10). `motor/somexport.js` (`serializarEvento` puro/headless) + botão "Exportar" em `som.html` → `POST /som/salvar` grava em `pecas-som/` (rota-irmã no `servir.mjs`; o `/oficina/salvar` do passo 10 fica intocado), com download como fallback. Número via `String(double)`, nunca arredondado — reabre exato (a lição do passo 10). Provado: os 4 presets round-trip bit-a-bit (página==Node), a neutralização `toFixed` diverge. Jóia `som.js` + `oficina.html` diff VAZIO.
- S5b `[x]` **Amarrar no jogo + o A/B** (D-105): o `som.js` ganhou `tocarEvento` (ponte ADITIVA — 24 linhas, 0 removidas; monta o evento pelo núcleo+adaptador e liga no `eventosG`, jogo byte-idêntico quando off) e a bancada `somab` renderiza o passo REAL offline (N=20, isolado com `ambiente=0`) pra comparar com o `_passo` PELO OUVIDO: **dentro em 4/5 eixos** (brilho/ataque/pico/achatamento), só a **duração ~4× menor** (a simplificação, agora medida). **Fecha a aba Som — e o roteiro inteiro da Oficina (Objeto 0–14 + Som).** O A/B fiel (trocar um som do jogo por um evento) fica como decisão por-som do ideador, ouvindo — não um atacado.

## Espaço Material

Material é como a superfície responde à luz. Hoje existe **um** shader de cena:
textura, difusa lambertiana, sombra, névoa e contorno.

### Parâmetros, não grafo de nós

O Blender usa grafo de nós. Recomendo **não** copiar isso agora: grafo significa
gerar shader em tempo de execução, o que é um sistema inteiro e caro.

O caminho barato que cobre quase tudo é **um shader só com parâmetros por lote**,
e já existe precedente disso no motor — o `uRim` é exatamente um parâmetro por
lote. Acrescentar mais alguns é seguir o que está lá.

Parâmetros propostos:

| Parâmetro | O que faz |
|---|---|
| `cor` | multiplica a textura |
| `emissivo` | brilha sozinho, ignora luz e sombra — portal, brasa, janela acesa |
| `contorno` | o `uRim` que já existe, agora por material |
| `aspereza` | quão espalhado é o brilho especular |
| `semLuz` | superfície chapada, sem sombreamento — útil pra céu, símbolo, interface no mundo |
| `mistura` | `opaco`, `recorte` (o de hoje) ou `transparente` |

O `transparente` é o único que pede trabalho de motor: uma passada extra depois
dos opacos, ordenada de trás pra frente. É também o que destrava vidro, fumaça e
água com profundidade, que hoje são impossíveis. O campo `mistura` já está
reservado no formato, então a peça pode declarar `transparente` desde já; a
passada de render é **acréscimo**, não reescrita, e depende da ordenação por
profundidade — mais um motivo pra o WebGL 2 (com textura de profundidade de
verdade) vir antes.

### No arquivo

```js
export const MATERIAIS = {
  casca:  { cor: '#6b4a2f', aspereza: 0.9 },
  brasa:  { cor: '#ff7326', emissivo: 1.4, semLuz: true },
};
```

E a operação que aplica:

```js
['material', { faces: [0, 1, 2], usa: 'casca' }],
```

Material por **nome**, não por face solta: assim mudar a casca muda toda a casca
do objeto de uma vez. É a mesma regra de um número com um dono só que vale pra
`PARAMS` e pra colisão.

## O contrato com a IA

Aqui tem uma armadilha que precisa ficar escrita, porque ela atinge justamente o
caso que motivou tudo isto.

**A Oficina só abre lista de passos.** Ela não interpreta código procedural. O
`arvore3d.js` de hoje é JavaScript escrito à mão, com laços e condições — abrir
aquilo exigiria executar código arbitrário e adivinhar o que virou o quê.

Então, pra você conseguir auditar visualmente o que a IA gerar, **a IA tem que
emitir lista de passos**, não código livre. Isso não é limitação, é o que torna
o objeto inspecionável, editável e paramétrico. Código livre continua valendo
pra peça escrita à mão; ele só não passa pela Oficina.

O que a IA emite bem, e o que emite mal, já está medido no `nos-Craft` e está
escrito no `silhouette.js` de lá: autorar coordenada 3D crua usa a IA na
fraqueza dela; raciocinar sobre forma em 2D usa a força. Consequência prática
pro nosso formato: **`moveV v:7 d:[0.1,0,-0.05]` é operação pra humano
arrastando, não pra IA gerando.** Os passos que a IA deve usar são os
descritivos — `loft`, `inflate`, `lathe` e as primitivas.

Por isso os tipos de nó do `nos-Craft` entram como operações da lista, e não
como formato concorrente: um objeto que a IA escreveu abre na Oficina e você
refina à mão; o que você modelou continua legível pra ela. Um formato, dois
caminhos de autoria. Sem isso o jogo termina com dois sistemas de objeto
paralelos.

O `nos-Craft` **segue existindo em paralelo** — decisão do ideador. O que vem de
lá são algoritmos e ideias, não dependência.

### O que transfere de lá, e o que não

Transfere bem, porque o acoplamento com three.js é raso — `Vector3`, `Color` e
`BufferGeometry` só nas bordas, e a matemática no meio é pura:

- **`loft`** e **`inflate`** — os dois mais valiosos: uma árvore inteira vira um
  passo só.
- **`lathe`**, **`displace`**, **`chamferBox`** — pequenos e diretos.
- O padrão do **`validateModelData`**: validar antes de renderizar, com mensagem
  que diz onde está o erro.
- O **`forja.mjs`** com folhas de contato 360° — é a bancada sem interface que
  este documento pedia, só que já escrita e melhor, porque **renderiza**. A IA
  consegue ver o que fez em vez de adivinhar.

Não transfere sem mexer no motor:

- **`countershade`, `paintVerts`, AO falso** — dependem de cor por vértice, e o
  formato de vértice da v3 não tem esse espaço. No `nos-Craft` é o principal
  recurso de iluminação; aqui o equivalente é a textura com projeção em caixa.
  **Objeto trazido de lá vai parecer diferente até isso ser resolvido**, e é o
  descompasso mais visível entre os dois projetos.

## Trazer e levar do repositório

A Oficina precisa dos dois sentidos: abrir o que a IA gerou pra você auditar, e
mandar de volta o que você fez.

Os dois passam pelo mesmo lugar — o **servidor de desenvolvimento** que já
precisa existir pra gravar arquivo (a página web não escreve em disco). Três
rotas pequenas resolvem tudo:

```
GET  /pecas/            lista os arquivos da pasta
GET  /pecas/<nome>.js   devolve o conteúdo
POST /pecas/<nome>.js   grava
```

Com isso a ferramenta ganha um navegador de pastas igual ao do editor de código:
você vê o que existe, abre, inspeciona, mexe, salva. Sem baixar nada, sem mover
arquivo à mão.

Sem o servidor no ar, sobra abrir por arrastar-e-soltar e salvar por download.
Funciona, mas é o modo desconfortável.

