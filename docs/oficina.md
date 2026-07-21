# A Oficina — editor de objetos dentro do jogo

Documento de projeto. Nada disso está construído ainda; serve pra decidir antes
de escrever código, e pra registrar POR QUE cada coisa é como é.

<!-- TOC -->

**Índice** — gerado por `npm run docs:toc`, não edite à mão:

- [O que é](#o-que-é)
- [A decisão que define todo o resto](#a-decisão-que-define-todo-o-resto)
- [Pra quem é isto](#pra-quem-é-isto)
- [O envelope: um meta-formato pra toda peça](#o-envelope-um-meta-formato-pra-toda-peça)
- [Decisões de base](#decisões-de-base)
- [Decisões abertas](#decisões-abertas)
- [Identidade de vértice](#identidade-de-vértice)
- [Estrutura por dentro](#estrutura-por-dentro)
- [Formato do arquivo gerado](#formato-do-arquivo-gerado)
- [Lista de operações](#lista-de-operações)
- [Onde o código mora: três camadas](#onde-o-código-mora-três-camadas)
- [Normais: chapado por padrão](#normais-chapado-por-padrão)
- [Funções e soluções](#funções-e-soluções)
- [Soluções detalhadas](#soluções-detalhadas)
- [Booleano](#booleano)
- [Modos de entrada](#modos-de-entrada)
- [Abas e espaços de trabalho](#abas-e-espaços-de-trabalho)
- [Editar objeto de dentro do jogo](#editar-objeto-de-dentro-do-jogo)
- [Aba Desenho](#aba-desenho)
- [Desenho livre (pintura)](#desenho-livre-pintura)
- [Aba Som](#aba-som)
- [Espaço Animação](#espaço-animação)
- [Espaço Material](#espaço-material)
- [Partículas e fluidos](#partículas-e-fluidos)
- [Mapeamento de UV: fora de escopo (a projeção-em-caixa fica)](#mapeamento-de-uv-fora-de-escopo-a-projeção-em-caixa-fica)
- [A IA opera tudo (o túnel pra IA)](#a-ia-opera-tudo-o-túnel-pra-ia)
- [O contrato com a IA](#o-contrato-com-a-ia)
- [IA na criação de peças](#ia-na-criação-de-peças)
- [Modo texto](#modo-texto)
- [Presets: partir de algo pronto, não do zero](#presets-partir-de-algo-pronto-não-do-zero)
- [O que preparar no motor agora](#o-que-preparar-no-motor-agora)
- [Sobre three.js e híbrido](#sobre-threejs-e-híbrido)
- [WebGL 2](#webgl-2)
- [Trazer e levar do repositório](#trazer-e-levar-do-repositório)
- [Conforto que evita retrabalho](#conforto-que-evita-retrabalho)
- [Ordem de construção](#ordem-de-construção)
- [O que este documento assume do motor](#o-que-este-documento-assume-do-motor)

<!-- /TOC -->

---

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

## Pra quem é isto

Decisão do ideador (2026-07-20): a Oficina mira primeiro **o ideador e o
coder**, não um público externo. O critério de "vale construir X" é "isso
nos ajuda a fazer o jogo mais rápido e melhor", não "isso atrai contribuidor
de fora". Fazer o mais completa possível dentro desse critério é o objetivo;
ficar simples de propósito, pra ser mais fácil de portar pra outro projeto,
não é.

Efeito colateral bem-vindo, não meta: por ser aberta e em texto simples,
quem gostar de uma peça — o gerador de som, o painel de IA, um espaço
específico — pode pegar só aquele pedaço pro projeto dela. Isso é
consequência da separação em camadas (núcleo/adaptador/interface, ver
"Onde o código mora") já escolhida por outro motivo, não um requisito novo
que muda alguma decisão de design.

O que se ganha com essa escolha, sem trabalho extra nenhum:

- **Objeto continua paramétrico.** Muda o `0.34` do primeiro passo, a lista roda
  de novo, e os arrastos manuais acompanham. É o que a árvore de hoje faz, onde
  mudar a espessura move a colisão junto. Uma lista de vértices perderia isso.
- **Desfazer sai sem custo.** Apagar o último passo e reexecutar. Não precisa de
  sistema separado. Pra Ctrl+Z seguido não travar, o executor guarda uma cópia
  do estado a cada 10 passos e reexecuta a partir da cópia mais próxima, em vez
  de refazer tudo desde o começo.
- **O histórico é editável.** Dá pra voltar num passo do meio, mudar, e o resto
  se refaz sozinho.

**Isto é decisão de começo, não de evolução.** Gravar receita depois, numa
ferramenta que só guardava vértices, é reescrever ela. Já trocar o gerador de
colisão depois é uma tarde de trabalho.

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

## Decisões abertas

Nenhuma. As três que este documento carregava foram fechadas:

- **Conflito do Ctrl** — Q e E assumiram subir e descer, então o Ctrl ficou livre
  pro ímã.
- **Mesclagem contra as identidades de vértice** — a operação grava `de` e
  `para`. Resolvida, mas segue sendo a interação mais delicada do sistema, e é a
  primeira que deve ganhar teste de verdade.
- **Cor por face contra textura pintada** — deixou de ser escolha. Com projeção
  em caixa, cor por face é um modo do pincel, não um sistema concorrente.

---

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

| Operação | Argumentos | Observação |
|---|---|---|
| `cubo`, `cilindro`, `esfera`, `plano`, `cone` | `id`, medidas, `lados` | Ponto de partida. Cria vértices numerados a partir de `id`. |
| `loft` | `id`, `perfis: [{pos, raio ou secao}]`, `lados` | Conecta uma sequência de anéis/seções ao longo de um caminho — o que hoje `galhoSeca` faz à mão em `arvore-cartoon.js`. Uma árvore inteira vira um passo só. Argumentos a confirmar contra o `nos-Craft` quando for portado (fora do alcance desta sessão) — a forma aqui é a leitura de "O que transfere de lá", não o código-fonte de lá. |
| `inflate` | `id`, `contornoLado`, `contornoTopo` | Dois contornos 2D (lado e topo, ver Aba Desenho) viram volume 3D. Mesma ressalva de origem do `loft`. |
| `lathe` | `id`, `perfil: [[raio, y]]`, `lados` | Perfil rotacionado em torno de um eixo — vaso, coluna. |
| `displace` | `de: id`, `mapa` ou `funcao` | Desloca vértices por uma função ou textura de ruído. |
| `chamferBox` | `id`, medidas, `chanfro` | Caixa com quinas suavizadas. |
| `moveV` | `v`, `d: [x,y,z]` | Move um vértice por deslocamento, nunca por posição absoluta — assim ele acompanha quando a base muda. |
| `moveA`, `moveF` | `a` / `f`, `d` | Aresta e face, mesma regra. |
| `extruda` | `sel`, `dist` | Puxa a seleção por `dist`. **Vértice** (cria um novo ligado por uma aresta), **aresta** (cria uma aresta nova + uma face) e **face** (paredes laterais; região usa só as arestas de borda — algoritmo acima). As três, não só face. |
| `vira` | `faces: [ids]` | Inverte a direção das faces selecionadas (troca a ordem dos cantos) — barato e seguro. "Recalcular todas pra fora" é só ajudante de **melhor esforço**, conferido no mostrador de direção — nunca confiado cego (em malha ambígua até o Blender erra). |
| `escala` | `sel`, `fator`, `eixo?` | Sem eixo, uniforme. |
| `rotaciona` | `sel`, `eixo`, `graus` | Pivô é o centro da seleção. |
| `mescla` | `de: [ids]`, `para: id` | Some as faces de área zero que sobrarem. |
| `apagaFace` | `f` | — |
| `pincel` | `modo`, `cor`, e o alvo conforme o modo | `modo: 'face'` preenche faces inteiras. `modo: 'livre'` recebe `raio`, `dureza` e `pontos: [{ f, a, b }]` — face e posição DENTRO dela, não coordenada de textura crua. Assim mover um vértice depois leva a tinta junto, em vez de deslizar. |
| `liso` | `faces: [ids]` | Sombreado macio nessas faces. O padrão é chapado. |
| `parte` | `nome`, `faces: [ids]` | Dá nome a um conjunto. É o que animação e material usam como alvo. |
| `material` | `faces` ou `parte`, `usa` | Aplica um material declarado em `MATERIAIS`. |
| `solido` | `faces: [ids]` | Marca o que entra na colisão. |

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

## Funções e soluções

Cada problema levantado foi resolvido antes de virar código. As linhas marcadas
com asterisco têm a solução detalhada logo abaixo da tabela.

| Função | O que faz | Solução |
|---|---|---|
| **Ctrl+Z / Ctrl+Y**, 15 níveis | Desfaz e refaz. | Desfazer é apagar o último passo e reexecutar a lista; refazer usa pilha própria, apagada ao fazer algo novo. O arrasto vira **um** passo só: marca no `mousedown`, aplica visualmente durante o movimento, emite a operação com o total no `mouseup`. `preventDefault` no Ctrl+Z, que o navegador rouba. |
| **Indicador de eixo X/Y/Z** | Bússola no canto. | Canvas 2D por cima, com `visor.projetar`. Não toca no WebGL. |
| **Gizmo de mover** * | Setas X/Y/Z arrastáveis. | Seleção e arrasto resolvidos em 2D, projetando base e ponta da seta. Fórmula abaixo. |
| **R + eixo + graus + Enter** | Rotaciona digitando o valor. | Estado explícito `digitando`, que desvia as teclas antes de virarem comando. `rotX` e `rotZ` escritos abaixo, prontos pra colar. Pivô no centro da seleção. |
| **S para escalonar** | Redimensiona. | A escala é aplicada **nos vértices**, não guardada como matriz. As normais são recalculadas junto, então escala desigual não quebra a iluminação. |
| **Tab: objeto → edição → pintura** | Cicla os modos dentro do espaço Modelar. | `preventDefault` no Tab. Uma variável de modo decide qual mapa de teclas escuta; nunca dois ao mesmo tempo. Material e Animação são **espaços de trabalho** sobre a mesma cena, não abas — trocar não perde câmera nem seleção. |
| **Ver vértices / arestas / faces** (1, 2, 3) * | Mostra e seleciona as partes. | **Canvas 2D por cima, não WebGL.** O `visor.depurar` não serve: o `draw` do render usa `gl.TRIANGLES` fixo e não desenha ponto nem linha. Detalhe abaixo. |
| **E para extrudar** * | Puxa a face. | Extrusão de região: só as arestas de **borda** da seleção ganham parede. Resolve o caso de duas faces vizinhas sem precisar restringir a uma por vez. Algoritmo abaixo. |
| **Painel lateral** | Posição, rotação, dimensão. | A caixa do objeto fica guardada e só é refeita quando a malha muda. Enquanto o gizmo arrasta, os campos ficam de leitura — um dono por vez. |
| **Ímã (Ctrl segurado)** | Cola no vértice ou face mais próximo. | **Varredura linear, sem estrutura espacial.** 10 mil vértices a 60 quadros por segundo dá 600 mil comparações por segundo, que é barato. Só dividir o espaço em células se passar de uns 100 mil vértices. Colar em face é projetar no plano e prender dentro do triângulo. |
| **Mesclar vértices** | Dois viram um. | Grava `['mescla', { de: [7,12], para: 31 }]`, então o replay sobrevive à troca de identidade. Depois da mesclagem, apaga toda face que ficou com dois cantos iguais, de área zero. **O lint de malha roda logo depois** — mesclar pode criar aresta usada por 3+ faces ou face invertida, e é aí que aparece. |
| **Arestas** | Selecionar e mover. | Chave canônica `min(a,b) + ':' + max(a,b)`, então a mesma aresta nunca vira duas. Deduzida das faces a cada mudança de malha, não guardada. |
| **Pintar** * | Cor e pincel na malha. | **Projeção em caixa** gera a coordenada de textura sozinha, sem desdobrar malha. Cor por face é o primeiro modo do pincel, não um sistema à parte — assim o pincel macio entra depois sem jogar nada fora. Detalhe abaixo. |
| **Modo navegação (botão 5)** | Liga e desliga o voo. | `e.button === 4`, com `preventDefault` no `mousedown` e no `auxclick` pra não disparar o "avançar" do navegador. Tecla alternativa configurável pra mouse sem botão lateral. Com o voo desligado, olhar em volta fica no arrastar do botão do meio. |
| **Câmera livre** | WASD anda, Q sobe, E desce, scroll acelera. | O `freeCam` do `render.js` já entrega posição, yaw e pitch. |
| **Salvar e abrir do repositório** | Navegador de pastas dentro da ferramenta. | Três rotas no servidor de desenvolvimento: listar, ler e gravar. A página web não escreve em disco sozinha. Sem servidor, cai pra arrastar-e-soltar e download. |
| **Colisão automática** * | Encaixa cilindro, caixa ou esfera. | Calculada só das faces marcadas como sólidas. Fórmula abaixo. |
| **Botão de configurações** | Ajustes da ferramenta. | Reusa `.painelConfig` e `.abas` do jogo. Grade e ímã, velocidade da câmera, tamanho do gizmo, salvamento automático, tecla alternativa do modo navegação. `localStorage` em `nos3_oficina`, separado da chave do jogo. |

---

### Funções adicionais (D-73)

Além das da tabela, decididas nesta rodada.

Ajudam quem modela à mão:
- **Valor exato** — mover/girar/escalar digitando o número, não só arrastando.
- **Espelho/simetria** — modela um lado, o outro acompanha (objeto simétrico).
- **Duplicar** uma seleção.
- **Medir** a distância entre dois pontos.
- **Esconder/isolar** uma parte, pra focar no que edita.

Ajudam a IA (que não clica, descreve uma regra):
- **Selecionar por critério** — "todas as faces viradas pra cima", "as de tal
  material", "as acima de tal tamanho". É a função de modelagem que mais ajuda a
  IA: ela raciocina sobre propriedade, não sobre clique. Vira uma operação como
  as outras (`['selecionar', { onde: 'normal.y > 0.7' }]`).

## Soluções detalhadas

### Vértices e arestas na tela: canvas 2D, não WebGL

O caminho que este documento propunha antes estava errado, e vale registrar por
quê. O `draw` do `render.js` chama `gl.drawArrays(gl.TRIANGLES, ...)` fixo, então
o `visor.depurar` só desenha triângulos. Ponto e linha não passam por ali.

A saída é melhor que a proposta original. Um canvas 2D por cima, como o minimapa
e as etiquetas de ID já fazem: projeta cada vértice com `visor.projetar` e
desenha um quadradinho. Vêm sem custo três coisas que no WebGL dariam trabalho —
tamanho constante na tela, destaque de seleção, e o traço das arestas.

O que se perde é a oclusão: vértice atrás da superfície continua aparecendo.
Isso vira **opção "ver através"**, que é como o Blender trata com o raio-X dele.
Pra esconder de verdade mais tarde, o `tapado()` das etiquetas já resolve.

### Gizmo: seleção e arrasto

Selecionar a seta é projetar base e ponta e medir a distância do cursor até esse
segmento, em 2D. Nenhum raycast.

Arrastar é a parte que parece difícil e não é:

```js
const o2 = visor.projetar(origem);               // base da seta
const a2 = visor.projetar(soma(origem, eixo));   // ponta, 1 unidade adiante
const dx = a2.x - o2.x, dy = a2.y - o2.y;
const compr = Math.hypot(dx, dy);                // px que 1 unidade ocupa na tela
const dir = [dx / compr, dy / compr];
// mx, my = movimento do mouse em px neste quadro
const avanco = (mx * dir[0] + my * dir[1]) / compr;   // em unidades do mundo
```

Quando a seta aponta quase pra câmera, `compr` tende a zero e o arrasto dispara
pro infinito. Trava: com `compr` abaixo de 12px, a seta fica apagada e não
aceita arrasto.

Tamanho constante na tela: escala o gizmo por `dist / 8`, então ele ocupa os
mesmos pixels de perto e de longe.

### Rotação em X e Z

Falta no `mat4.js`. Colunas-major, no mesmo estilo do `rotY` que já existe:

```js
rotX(a) { const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
rotZ(a) { const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); },
```

### Extrudar uma região de faces

O problema era a parede interna aparecendo entre duas faces vizinhas extrudadas
juntas. A solução padrão resolve sem restringir nada:

1. Junta os vértices usados pelas faces selecionadas e duplica cada um,
   deslocado por `dist` na direção da normal média.
2. Religa as faces selecionadas aos vértices novos.
3. Acha as **arestas de borda** — as usadas por exatamente **uma** face da
   seleção. Só elas ganham parede lateral.

Aresta interna, usada por duas faces selecionadas, não ganha parede. É
exatamente o caso que estava travando a extrusão em uma face por vez.

A orientação da parede sai da ordem da aresta na face de origem, então as faces
novas nascem viradas pro lado certo sem cálculo extra.

### Pintura: projeção em caixa desde o começo

Pintar numa textura exige saber qual pedaço da imagem cada ponto do objeto usa.
Este documento chegou a tratar isso como bloqueio, dizendo que exigiria
desdobrar a malha à mão. **Está errado, e a correção mudou o plano.**

A coordenada sai sozinha por **projeção em caixa**: pra cada face, vê pra qual
eixo a normal dela mais aponta e usa as outras duas coordenadas do mundo. Face
virada pra cima usa X e Z, face virada pro lado usa Y e Z. Dez linhas, nenhum
algoritmo de desdobramento, nenhuma costura pra resolver na mão. É o que se usa
em terreno e rocha há décadas, e pelo mesmo motivo.

Ela cobra emenda visível onde a face troca de eixo dominante, e distorção em
face muito inclinada. Em formas retas e orgânicas, que é o caso do jogo, quase
não aparece.

**Por que já nascer assim, e não depois.** A versão anterior deste documento
recomendava cor por face primeiro e pincel depois. Os dois usariam sistemas
diferentes por baixo, então a segunda etapa descartaria a paleta e a geração
de coordenada da primeira. Retrabalho de verdade.

Com a projeção em caixa desde o início, **cor por face vira só o primeiro modo
do pincel** — um "preenche esta face com esta cor", pintado na mesma textura que
o pincel macio vai usar depois. Mesmo sistema, mesma operação gravada. Raio,
suavidade e degradê entram como modos novos, sem desmanchar nada.

**As pinceladas são operações como qualquer outra.** O arquivo grava
`['pincel', { modo, cor, raio, pontos: [...] }]` e a textura é gerada ao abrir.
Continua sem nenhum arquivo de imagem, o Ctrl+Z desfaz pincelada igual desfaz o
resto, e a regra de zero arquivo do jogo segue de pé.

### Encaixe automático da colisão

Das faces marcadas como sólidas, pega os vértices e calcula:

```
centro = média de x e de z
raio   = maior hipotenusa(x - centroX, z - centroZ)
altura = maiorY - menorY
```

Isso dá o cilindro em pé, que é a forma que a colisão do jogo usa hoje. Caixa e
esfera saem dos mesmos números. A ferramenta sugere a de menor volume
desperdiçado e você confirma ou troca.

Sem nenhuma face marcada, usa o objeto inteiro — e é aí que a copa da árvore
viraria parede, que é o erro que a colisão de hoje evita de propósito. Por isso
a marcação aparece em destaque na hora de salvar, e não escondida num canto.

## Booleano

Fora de escopo por decisão. União e subtração robustas de malha são problema de
pesquisa, não de implementação — o Blender usa biblioteca dedicada e ainda falha
em casos ruins. Último item, se um dia for.

---

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

## Editar objeto de dentro do jogo

O caminho principal de uso, decidido pelo ideador.

### Duas portas, dois papéis

Duas formas de entrar na Oficina, pra duas intenções diferentes:

- **Abrir a ferramenta** — tecla **`U`** ou o item **Oficina** no menu do
  jogo. Abre em cena vazia (criar algo novo) ou no último objeto que você
  editava. Não depende de estar mirando em nada. O **menu é a porta
  oficial** — quem não sabe que a Oficina existe descobre ali; o **`U` é só
  um atalho pra MESMA ação**, não uma segunda implementação, então as duas
  nunca divergem. Abrir **solta o cursor travado**, senão não dá pra clicar
  em nada. `U` porque está livre: `WASD`, `Q`, `E` e `I` já são teclas do
  jogo.
- **Editar o objeto que você está vendo** — mirar e clicar na etiqueta,
  detalhado logo abaixo. Abre já com aquele objeto carregado.

O `U`/menu **não** vira um jeito de escolher objeto do mundo pra editar —
isso é o mirar-e-clicar. Cada porta com um trabalho, sem sobrepor.

### Abrir outro objeto com um já aberto

Se você já está editando A e abre B (pela etiqueta, ou pelo navegador de
peças da própria ferramenta), **B substitui A** — a Oficina passa a mostrar
só o B. O A **não se perde**: o auto-save grava o arquivo dele antes da
troca (a mesma regra de salvamento automático que este documento já adota),
e você reabre quando quiser. Sem pergunta de "descartar alterações?", porque
o auto-save já resolveu.

Isso não briga com "cena com um ou vários objetos": ter A e B juntos é um
gesto **explícito** — "trazer pra cena como referência", pra ter escala e
encaixe — e aí só um é o **ativo** (editável e salvável) e o outro é
contexto visível. O clicar-na-etiqueta sozinho não empilha objeto, senão a
cena encheria sem você pedir.

### O objeto mirado

Jogando, você aperta `I` pra ver as etiquetas, mira num objeto e clica. Aparece
**"Abrir objeto na oficina?"** com sim e não. Dizendo sim, a Oficina abre já com
aquele objeto carregado. Você mexe, e clica em **"Aplicar para o jogo"**.

Aí vem a pergunta que importa:

> Há mais de um objeto do mesmo tipo. Escolha:
> 1. Aplicar só no objeto desta etiqueta
> 2. Aplicar em todos do mesmo tipo
> 3. Mostrar lista

A lista é rolável, uma linha por objeto, com botão de aplicar em cada uma. Ao
lado dela, o **mapa do mapa atual** com as etiquetas: clicar no mapa destaca a
linha na lista, clicar na linha destaca no mapa. Os dois sentidos.

Quando existir mais de um mapa, aparecem os botões de anterior e próximo pra
percorrer. **Enquanto só houver um, eles ficam ocultos** — botão que não faz
nada ensina errado.

### As três opções são três arquivos

Por baixo, a escolha do aviso é sobre **qual arquivo escrever**, e enxergar isso
evita confusão depois:

- **Todos do mesmo tipo** reescreve a peça, `pecas/toco.js`.
- **Só este** escreve na entrada individual daquele objeto, que não pode morar
  na peça — se morasse, viraria outro tipo.
- **Lista** é só a interface pra escolher quais entradas individuais recebem.

### Três coisas que isso exige e hoje não existem

**Objeto plantado precisa poder ter valores próprios.** Hoje `arvore3d.js` é uma
peça só, `ARVORE_POS` é uma lista de posições, e quatro variantes nascem de
sementes diferentes — nenhuma árvore tem dado próprio. Pra "aplicar só nesta",
cada objeto plantado precisa carregar valores que substituem os do `PARAMS`.

**O mapa precisa virar dado.** As posições estão escritas à mão dentro do
`jogo.html`. Pra Oficina listar, marcar no mapa e gravar alteração em uma
árvore, isso vira arquivo de posicionamento: posição, tipo e os valores próprios
de cada objeto. É o `props.js` do `nos-Craft`. E é o que faz os botões de mapa
anterior e próximo terem sentido — cada mapa é um desses arquivos.

**Clicar na etiqueta com o ponteiro travado.** As etiquetas de hoje têm
`pointer-events: none` e o jogo trava o cursor, então não há seta pra clicar.
Solução sem quebrar o controle: a etiqueta mais próxima do centro da tela se
destaca e o clique esquerdo abre o aviso. **Você mira, não aponta** — coerente
com o resto do jogo, e o ponteiro continua travado.

### Ao aplicar, refazer a colisão

O `COLISORES` do jogo sai de `meta.colisao`. Mudar a espessura de um tronco sem
recalcular deixaria você esbarrando no ar, ou atravessando madeira. A aplicação
ao vivo refaz malha, textura **e** colisão. O `visor.aplicarTiers` já é
precedente de troca ao vivo sem recarregar.

## Aba Desenho

Canvas 2D pra traçar contornos fechados: clicar põe ponto, arrastar move,
fechar o polígono termina. Nada de malha, nada de identidade de vértice — é o
subsistema mais independente da ferramenta inteira. **Reservar agora:** cada
ponto do contorno pode ter uma alça de curva opcional (não usada no começo — só
reta). Sem isso, adicionar curva suave depois muda o formato de todo contorno.

Serve a três coisas, e é por isso que vale construir cedo.

**Mandar contorno pra IA.** O `nos-Craft` já tem o canal: `forja trace <img>`
converte desenho ou foto em polígono. Só que ele adivinha os pontos a partir de
pixels. Desenhando aqui você produz o polígono exato, com os pontos onde quer, e
arrasta cada um depois. Pula uma etapa que perde informação.

**Virar volume direto.** Dois contornos — o de lado (z×y) e o de cima (z×x) —
alimentam o `inflate` e viram corpo 3D na aba Objeto. Você desenha, vira massa,
e refina à mão a partir dali. Convenção igual à do `nos-Craft`, senão vira
tradução na cabeça: y pra cima, lado é z×y, cima é z×x, frente é x×y.

**Servir de gabarito ao vivo.** O `nos-Craft` mede silhueta renderizada contra
polígono de referência e devolve o IoU, a fração de área que as duas dividem.
A mesma conta roda aqui **enquanto você modela**, com a porcentagem na tela.
Sai de "acho que ficou parecido" pra um número.

## Desenho livre (pintura)

A Aba Desenho acima é **vetor** — contorno de pontos, pra silhueta e gabarito.
Isto é o outro modo da mesma aba: **pintar**, com paleta, pincel e borracha.
Pedido do ideador, e cabe sem quebrar a dieta zero-arquivo pela mesma manha do
resto: **salva o traço, não a imagem.** Cada pincelada é `{cor, raio, dureza,
pontos}` (o `pincel modo:'livre'` que a Lista de operações já prevê), e a
imagem é rasterizada ao abrir — versionável, Ctrl+Z por pincelada, diff legível
no PR.

Dois usos, uma máquina:

- **Pintar a superfície de um objeto** (casca, rosto, enfeite) — é o modo
  pintura do espaço Modelar, já previsto. Paleta, pincel e borracha encaixam no
  `pincel`: borracha = pintar com o fundo, paleta = as cores.
- **Arte livre 2D** (concept, rabisco, ideia pra IA) — o canvas da Aba Desenho
  no modo pintura, mesmo esquema traço-como-dado.

**O teto é o motor de pincel, não o formato.** Traço-como-dado não é o pincel
duro e nada além: o carimbo pode ser uma função procedural com semente (ruído,
cerdas → pincel texturizado), e a pincelada pode **ler o canvas acumulado**
(esfumar, aquarela — o mesmo princípio do `extruda`/`mescla`, que já leem a
geometria acumulada). Cada comportamento novo é motor a mais pra escrever,
então o teto é "até onde se constrói o pincel" — espectro, não parede. Um
pincel = parâmetros + semente; uma biblioteca de pincéis = **presets** (com
homologação).

**Paleta = a do jogo.** As texturas já usam índices de uma paleta fixa. Pintar
nessa paleta faz a arte sair no estilo do jogo em vez de destoar, e é a paleta
que o ideador edita e estende.

As duas únicas bordas onde código não ganha, e viram exceção consciente:

- **Importar uma foto e mantê-la** — foto não tem descrição procedural; vira
  referência/rascunho não-commitado, ou é decisão separada de aceitar bitmap no
  repo (com o custo do diff binário que a federação por PR paga caro).
- **Pixel a pixel sem estrutura** — aí o dado fica do tamanho da imagem e vira
  bitmap disfarçado. Raro no estilo chapado do jogo.

### Ferramentas e resolução (D-73)

Decididas nesta rodada.

**Cor livre.** Como a arte ainda não está fechada numa paleta, a cor é livre
(roda de cores + RGB). A paleta do jogo aparece como sugestão, **não como
trava**. Se um dia a arte fechar numa paleta, aí entra um botão opcional de
"encaixar na paleta".

**Resolução.** O canvas tem resolução em pixels ajustável, e — o equivalente
real do "DPI" em 3D — a **densidade de texel** (quantos pixels de textura cobrem
um metro de superfície), que é o que evita textura borrada em objeto grande.

**Pincéis, na ordem de construção:** duro → macio → texturizado → esfumar (do
mais simples ao que lê o canvas). Mais ferramentas: **Shift = linha reta**,
conta-gotas (pega cor já pintada), balde (preenche área), **simetria de pintura**
(pinta um lado, espelha no outro), gradiente, estabilizador de traço (suaviza a
tremida da mão) e ver ao vivo na malha 3D enquanto pinta. Camadas ficam pra
depois — úteis, mas adicionam complexidade. **Reservar agora (pra não ser
retrabalho):** cada pincelada nasce com um campo `camada` opcional (padrão
`'base'`), mesmo com uma camada só na interface. Sem isso, adicionar camadas
depois obriga a alterar toda pincelada já gravada.

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
relação de "partir de algo pronto" dos Presets de objeto). `[PENDENTE: o
catálogo exato de cada nível — fechar quando a Aba Som for construída]`

## Espaço Animação

### O que existe hoje

Na prática, o jogador vê **uma** animação: o vento (o `WIND` do `render.js`,
procedural no vertex shader, gate por-lote — chão e prédio não balançam).
Existe também um gancho geral, `animar(t, lotes)`, que uma peça pode usar pra
mexer nos próprios lotes por código a cada quadro (uma roda **giraria** por
ele hoje) — mas nenhuma peça do jogo usa ainda, e é código cru, não sistema
autorável. Ponto de partida honesto: **só natureza, e um escape hatch.**

### Dois eixos pra não se perder

"Personagem", "roda" e "vento" misturam duas perguntas diferentes. Separá-las
organiza o resto.

**Eixo 1 — COMO deforma (técnica):**

- **Procedural no shader** — vento, água, pulsar, respirar. Tempo + posição,
  sem estado. Barato. O `WIND` já é isto.
- **Rígido por parte** — roda, porta, pistão, moinho, alavanca, asa batendo
  como peça sólida. Move sub-partes por matriz, sem deformar malha. Já
  possível hoje (abaixo).
- **Esqueleto / skinning** — personagem andando, bicho flexionando: a malha
  **dobra** nas juntas. A única camada cara (abaixo).
- **Textura animada** — esteira, lava, água rolando, pulso emissivo. Barato:
  UV rolando ou troca de quadro.
- *(Morph / squash-and-stretch — misturar duas posições de vértice. Fora de
  escopo cedo: pesa no formato de vértice.)*

**Eixo 2 — O QUE dispara (fonte):**

- **Ambiente / laço** — sempre ligado: vento, tocha, portal. O `ANIMACOES`
  com `repete:true` (abaixo) já cobre.
- **Gatilho / uma vez** — em evento: porta abre, baú abre, pulo, ataque.
  **Ainda não está no formato.**
- **Dirigido por estado** — locomoção: a velocidade da corrida controla o
  ciclo de passo; o giro da roda ∝ velocidade do veículo. **Ainda não está no
  formato.**
- **Reativo / físico** — pano, corda, rabo seguindo o corpo. Pesado; finge-se
  com mola simples. Fora de escopo cedo.

**A leitura que importa:** quase tudo cai na parte barata (rígido +
procedural + textura); só personagem/animal dobrando de verdade precisa do
esqueleto. E a lacuna real é do **formato**, não do motor — falta gatilho e
dirigido-por-estado, só o laço está previsto.

### As duas camadas que dobram a malha

Do Eixo 1, só duas técnicas precisam de motor novo — o rígido e o esqueleto;
procedural e textura já existem ou são triviais. E a primeira cobre mais do
que parece.

### Animação rígida por parte

Girar um galho, balançar uma perna como peça sólida. **Já é possível com o motor
de hoje**, porque cada parte é um lote com matriz própria — é o que o
`nos-Craft` faz com `group`, `children` e mapa de partes por nome.

Para animação de criatura em estilo low-poly, isso resolve a maioria dos casos.

### Esqueleto com deformação suave

Malha que dobra em vez de articular em pedaços. Precisa de peso e índice de osso
por vértice, e das matrizes de osso no shader. É mudança no formato de vértice,
como a cor — e por isso as duas devem entrar **na mesma passada**, não em duas.

O WebGL 2 ajuda direto aqui, por causa do limite maior de uniformes.

### O que isso exige do formato de passos

Aqui tem uma consequência que muda o que já foi decidido, e é bom encarar agora:
**a lista de passos é plana, e animação precisa de partes com nome.**

Solução que não desmancha nada: uma operação que **nomeia** um conjunto.

```js
['parte', { nome: 'galho-1', faces: [12, 13, 14] }],
```

A partir daí, `'galho-1'` pode ser alvo de transformação, de material e de
animação. Nada da lista existente muda; ganha um jeito de dar nome ao que já
está lá. E casa com o `name` que o `nos-Craft` já usa.

As animações não entram na lista de passos — elas não constroem geometria. Vão
numa seção própria do arquivo:

```js
export const ANIMACOES = {
  balanco: {
    duracao: 2.4, repete: true,
    trilhas: [
      { parte: 'galho-1', canal: 'rotZ', chaves: [[0, 0], [1.2, 0.08], [2.4, 0]] },
    ],
  },
};
```

Chave é `[tempo, valor]`. Interpolação suave por padrão.

### Gatilho e dirigido por estado (D-73, decidido)

O `ANIMACOES` acima só sabe **laço** (`repete: true`). Decidido nesta rodada
como as outras duas fontes do Eixo 2 (que a movimentação e os personagens vão
exigir) entram — as duas na própria seção `ANIMACOES`, sem tocar na geometria:

- **Gatilho / uma vez.** `modo: 'uma-vez'` toca a animação num evento — porta
  abre, baú abre, pulo, ataque — e para no fim, sem repetir. Quem dispara é o
  código do jogo (a camada de comportamento), com `tocar('abrir')`, não a peça.
- **Dirigido por estado.** Uma trilha com `entrada: 'velocidade'` amarra o tempo
  da animação a um valor do jogo em vez do relógio: o ciclo de passo acelera com
  a corrida, a roda gira conforme a velocidade do veículo.

```js
export const ANIMACOES = {
  abrir: { modo: 'uma-vez', trilhas: [/* ... */] },        // disparada por tocar('abrir')
  andar: { entrada: 'velocidade', trilhas: [/* ... */] },  // o tempo vem do jogo
};
```

Ficam pra quando a movimentação chegar; hoje só o laço (ambiente) está usado, e
é o bastante pro vento e afins.

### Comportamento não é animação

Alerta pra não confundir camada. "Parado → anda → ataca" **não** é o sistema
de animação — é o **cérebro** (IA / máquina de estados) que **decide qual**
animação disparar. O sistema de animação é o vocabulário (as trilhas, o
gatilho); o comportamento é quem consome esse vocabulário.

Mesma separação que o `som.js` (a síntese) tem do código do jogo que chama
`passo()` na hora certa. Misturar os dois faria a peça carregar lógica de
jogo, e a Oficina deixaria de ser só sobre a FORMA da coisa. O comportamento
mora no código do mundo, não na peça.

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

## Partículas e fluidos

Terreno novo — nada disto está no formato de passos ainda. Partícula e fluido
são **sistema** (parâmetros + atualização por quadro), não geometria de
vértice — mesma distinção que separou o "comportamento contínuo" na Aba Som.

### O que o motor já tem

Um sistema de partículas só: o **pólen** ambiente (`render.js`). Pontinhos que
derivam, sobem em laço e piscam, animados 100% no vertex shader a partir de
sementes fixas — o buffer sobe uma vez, o tempo faz o resto. Contagem por tier
(80/320/800), blend aditivo, desligável com `particulas:false` em paisagem.
Barato e elegante, mas é UM efeito fixo, não um emissor configurável. De
fluido, o motor não tem nada visual: a água hoje vive só no `som.js` (bolhas e
lambidas); na tela é o chão chapado.

### Partículas: generalizar o pólen num emissor

O caminho é estender o que já existe, não tecnologia nova. Um **emissor** com
parâmetros: taxa de emissão, vida, velocidade e direção, gravidade, tamanho e
cor ao longo da vida, textura. Determinístico com semente, como todo o resto.
Na Oficina é um **painel de parâmetros com preview ao vivo** (igual o
Material), não edição de vértice — e pode ser peça de efeito própria ou
grudada numa `parte` do objeto (fumaça saindo da chaminé). O WebGL 2 +
instanciamento que já está no plano é exatamente o que um emissor quer.

### Fluidos: fingir, não simular

Simulação de fluido de verdade fica **fora de escopo**, mesma categoria do
booleano — grau de pesquisa, cara, falha em caso ruim. Num jogo estilizado se
finge, e o bom é que fluido se decompõe em coisas que este documento já
planeja:

- **superfície de água** = malha com onda no vértice (o `WIND` do `render.js`
  já é esse truque: deslocamento senoidal no vertex shader) + textura rolando;
- **profundidade/transparência** = o modo `transparente` do espaço Material;
- **respingo, gota, spray** = partícula (o emissor acima);
- **rio** = textura rolando na malha + spray nas corredeiras.

Fluido não é subsistema novo — é onda-no-vértice + material transparente +
textura animada + spray de partícula.

## Mapeamento de UV: fora de escopo (a projeção-em-caixa fica)

Decisão do ideador (2026-07-20): **não construir UV manual** — desdobrar a
malha à mão em ilhas, resolver costuras e empacotar é um subsistema inteiro e
penoso (o que mais dói no Blender). A **projeção-em-caixa** já resolve a
coordenada de textura sozinha, sem desdobramento, e é a escolha. O preço dela
(emenda onde a face troca de eixo, distorção em face muito inclinada) é
aceitável no estilo chapado do jogo. Revisitar só sob dor real — se um dia
precisar colocar textura num lugar exato que a caixa não acerta.

## A IA opera tudo (o túnel pra IA)

Consequência direta de "Pra quem é isto": se a Oficina é pra o ideador **e** a
IA como par, então **tudo que o humano faz por gesto, a IA tem que fazer por
dado.** Não é gentileza — é requisito, e vale pra toda função nova.

A regra que garante isso: **nada de função só-gesto.** Todo clique e arrasto
**reduz a uma operação gravada** (a lista de passos já faz isso pro arrasto).
No instante em que uma função "só acontece" quando você clica, sem deixar
rastro de dado, ela some pra IA — a IA só alcança o que é expressável como
dado. Por isso a lista de passos não é só pra desfazer e reabrir: é o **túnel**
por onde a IA cria e edita igual a você.

Isso a IA já faz bem, e escala, porque é texto — foi assim que quase tudo do
jogo foi gerado. **Onde a dificuldade cresce com a complexidade não é criar —
é VER.** Um objeto parado a bancada já renderiza num PNG que a IA olha
(`olhar-peca`); um som, uma animação no tempo, um sistema de partícula, um
desenho — desses a IA ainda cria quase às cegas. Por isso o túnel tem **três
canais**, e todo tipo novo precisa dos três:

1. **Dado** — ler e escrever a lista (passos, traços, trilhas, parâmetros)
   direto. É a criação e a edição. Já existe.
2. **Render sem interface** — os olhos da IA. Cada tipo precisa de um caminho
   headless que mostra o que ficou: PNG (objeto), tira de quadros (animação,
   partícula), forma de onda e espectro (som), render dos traços (desenho).
   Existe pro objeto; **estender pros outros é o trabalho concreto que este
   princípio cobra.**
3. **Métrica numérica** — o julgamento da IA. Onde o humano bate o olho, a IA
   precisa de número: IoU de silhueta (já existe), casamento de espectro, perf.
   Sem isso ela diz "acho que ficou bom" em vez de medir.

Pra ser um **tradutor de mão dupla** de verdade (decisão do ideador: estrutura
robusta pra IA desde o começo, não adaptada depois), dois canais a mais, ambos
requisitos do **núcleo**, não módulo "de IA" à parte:

4. **Contrato formal** — o vocabulário carrega a própria definição. Cada
   operação tem esquema formal (argumentos, tipos, faixas válidas, invariantes)
   e **um exemplo executável**. Qualquer IA — uma sessão nova sem memória, outro
   modelo no painel BYOK — lê o esquema e opera, sem depender de tribo. Bônus:
   os exemplos executáveis são também os testes de regressão do núcleo. Um
   artefato, dois usos.
5. **Canal descrever** — a ferramenta narra. O núcleo devolve, em linguagem e
   números, o que uma peça É e o que MUDOU entre duas versões ("tronco 1.9m,
   15 lados, 3 galhos; da versão A pra B: raio +20%, 2 pinceladas na copa").
   Sem isso, ler uma lista de 80 passos crus obriga a IA a reconstruir a peça
   na cabeça; com isso, custa três linhas. Serve o humano igual: é o resumo do
   histórico e o texto de PR que se escreve sozinho.

Escrever (1) + ler de volta (5) + saber a língua (4) + ver (2) + medir (3) —
esse é o tradutor completo. O que NÃO entra: cérebro dentro da Oficina
(orquestração, agente embutido, memória de IA). O cérebro a IA traz; a
ferramenta robusta é a que tem contrato completo, boca que narra, olhos e
régua.

### Como as ferramentas da IA devem ser

Quatro qualidades, tiradas de fricção real de trabalho (e alinhadas com o
plano FERRAMENTAS/D-56):

- **Ciclo rápido** — editar→ver em segundos. Pra IA, cada rodada de render é o
  equivalente do "salvar, recarregar o jogo e andar até ouvir".
- **Resposta, não despejo** — a necessidade que só a IA tem: contexto é
  finito. Folha de contato (8 ângulos numa imagem), diff visual ("mudou só a
  copa, 3% dos pixels"), métrica antes de imagem ("IoU 87%"). Ferramenta boa
  responde uma pergunta em poucas linhas.
- **Erro que diz por quê** — o padrão `validateModelData`: "passo 3 órfão:
  vértice 7 não existe" vale dez renders às cegas. Todo executor nasce com
  validador falante.
- **Portão de regressão** — baseline + comparação automática ("2 peças
  mudaram, eis os recortes"), pra mexer no motor compartilhado sem re-olhar
  tudo à mão. O braço automático disso é o CI — papel do robô fechado em
  `FERRAMENTAS.md` §7 (D-71): a ronda-da-oficina (porteiro + replay 2× +
  órfãos + exemplos do contrato) nasce junto com o núcleo.

Sem andaime especulativo: ferramenta boa nasce contra uso real (foi assim com
os ângulos do `olhar-peca`). A regra é: quando um tipo novo entrar, a
ferramenta dele nasce junto, no formato resposta-e-não-despejo — e refina na
primeira dor.

E os **controles** que facilitam o trabalho do ideador facilitam o da IA pelo
mesmo mecanismo: o slider que se arrasta é o **parâmetro nomeado** que a IA
seta. Um sistema só, dois rostos — não se constrói controle pra humano e um
canal separado pra IA.

O custo, honesto: isso **proíbe conveniência só-gesto** e obriga cada tipo novo
a nascer com render headless e métrica, não só com tela bonita. É esforço por
feature — mas é a mesma disciplina da lista de passos, e é o preço de a IA ser
co-worker de verdade, não um gerador cego.

**Checklist de toda função nova da Oficina:** (1) tem operação de dado? (2) dá
pra renderizar sem abrir a tela? (3) tem uma métrica pra a IA se conferir? As
três respostas "sim" = a IA opera aquilo igual ao ideador.

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

## IA na criação de peças

Tem duas formas de IA entrar, e são MUITO diferentes em quem paga, quando
funcionam e se estão no roadmap. Misturar as duas foi o que embananou esta
parte antes — a distinção que desfaz o nó é ONDE a Oficina está rodando.

### O caminho real: o repositório é o ponto de encontro (assinatura)

O jeito principal, e que já funciona hoje sem nenhuma feature nova. O
ideador trabalha com uma IA por assinatura (Claude Code) em tempo real, do
lado de FORA do navegador; a IA cria ou edita a peça e **publica no
repositório** — hoje como peça de rascunho (as com prefixo `_` em `pecas/`,
tipo `_raiz1.js` e `_elenco.js`), por PR ou direto na main. O ideador então
abre essa peça na Oficina e refina no mouse. O repositório é a caixa
compartilhada entre os dois: a IA solta o arquivo lá, o ideador pega —
inclusive de dentro do jogo, é só republicar e recarregar.

**Isso não é uma feature da Oficina, e é por isso que é robusto.** Cai de
graça de duas coisas que já existem por outro motivo: o formato de lista de
passos (a IA escreve, a Oficina lê o mesmo arquivo de volta) e as peças
morarem no repositório. Sem chave de API, sem custo por token, sem nada pra
plugar — a IA fica na bancada, e só o resultado entra, pela porta que já
existe.

O limite honesto, pra não vender demais: não é a IA mexendo com o cursor ao
vivo dentro da aba do jogo publicado. É a IA soltando o arquivo e o ideador
pegando. Perto o suficiente pra trabalhar junto de verdade, sem nenhuma das
complicações do caminho de baixo.

### O painel dentro do jogo (API/BYOK) — POSSÍVEL, fora do roadmap

Um painel de IA rodando dentro do jogo publicado, pra qualquer jogador —
sem Claude Code, sem repositório — pedir uma peça. Esse **só** funciona por
chamada direta do navegador com chave de API própria (BYOK: bring your own
key): a assinatura não alcança um navegador qualquer, é regra da Anthropic,
o login por assinatura vale só pros apps nativos dela. Cada um plugaria a
própria chave, guardada só no `localStorage`, **zero chave no repositório**;
o custo por token cai na conta de cada um, e o limite de requisição também é
por chave — ninguém disputa a cota do outro.

**Decisão do ideador (2026-07-20): fica como POSSÍVEL, não entra no
roadmap.** A API é cara pro uso ocasional, então nem o ideador vai depender
disso, nem nenhum jogador é obrigado a ter chave. E por causa da separação
em camadas (núcleo/adaptador/interface), dá pra encaixar isso depois como
rosto fino sobre o mesmo núcleo, a custo baixo — então deixar pra "se um
dia" não cria dívida nenhuma. Só não se constrói apostando nele.

Detalhe de implementação pra quando/se for: existe um jeito de habilitar
CORS direto do cliente (a Anthropic tem um cabeçalho específico; conferir o
nome na hora, isto é de memória). O "perigoso" que aparece no nome desse
tipo de opção é sobre expor chave COMPARTILHADA — aqui não tem uma, é a
chave de cada um, risco só dela. Modelo-agnóstico de bônus: o vocabulário
que sai daqui é o mesmo texto de operações do resto do documento, então
qualquer LLM decente entende sem integração por modelo.

### O que os dois pedem do formato (isto sim, cedo)

Seja eu soltando arquivo pelo repositório, seja um painel BYOK, **qualquer
IA gera peça melhor com os passos descritivos** — `loft`, `inflate`,
`lathe` — do que empilhando `moveV` vértice por vértice. É o que "O contrato
com a IA" já exige. Relendo o documento achei que a "Lista de operações" não
tinha esses passos, embora o contrato os pedisse: lacuna real, fechada nesta
rodada (ver as linhas novas lá). Vale pros dois caminhos, e é a única parte
que compensa garantir agora — o resto encaixa quando quiser.

## Modo texto

A Oficina só abre lista de passos — decisão já tomada acima, em "O contrato
com a IA". Isto não é sobre reabrir aquilo: é sobre uma SEGUNDA forma de
editar a MESMA lista, texto em vez de clique.

`PASSOS` já é um array literal (ver "Formato do arquivo gerado", mais
abaixo). Um painel de texto — realce de sintaxe, sem executar nada
arbitrário, só faz o parse da mesma forma que o núcleo já entende — deixa
escrever ou colar passos direto, e a cena 3D reage ao vivo, do mesmo jeito
que arrastar o gizmo reage. "Editor de código" aqui significa **editor da
lista, em texto**, não um IDE genérico pra JavaScript solto — isso
violaria o próprio contrato com a IA que este documento defende.

Pra quem serve, na prática: pouco pra mim (Claude já edita o arquivo direto
pelas ferramentas de código, fora do navegador) e pouco pro ideador editar à
mão (a proposta original da Oficina já era não precisar programar). Quem
precisaria de verdade é o **painel de IA dentro do jogo** logo abaixo — uma
IA rodando só no navegador, sem acesso a disco, só teria esse caminho pra
propor ou mostrar uma lista de passos. Como esse painel ficou **possível,
fora do roadmap** (ver "IA na criação de peças"), o Modo texto vai junto:
possível, não planejado. Não é bloqueio de nada — o caminho de IA que
usamos de fato (a IA soltando peça no repositório) não precisa dele.

As rotas `GET/POST /pecas/<nome>.js`, já descritas em "Trazer e levar do
repositório", servem os dois usos: abrir o texto de uma peça existente, e
gravar o resultado editado.

## Presets: partir de algo pronto, não do zero

Pedido do ideador, e é a coisa certa: como o cubo padrão do Blender, a Oficina
deve **vir com um exemplar pronto de cada natureza** — um de cada tipo de
partícula (fumaça, faísca, poeira, respingo, brilho), um objeto-base, um
material-base, um som-base — pra você **variar em cima** com controles, em vez
de criar do zero.

Por que isto é natural, e não enfeite:

- **É como o jogo já funciona.** As árvores nascem de espécie + semente
  (`VARIANTES`); os passos pisam em `PISOS` (grama, areia, madeira, pedra); os
  materiais rascunhados são `MATERIAIS` (casca, brasa). Isso **já são
  presets** — o ideador já trabalha variando o que existe. Esta seção só
  promove o padrão a princípio geral.
- **Não é mecanismo novo.** Um preset é só uma **peça inicial** no formato de
  sempre (lista de passos + `PARAMS`). "Abrir e variar" é literalmente como
  toda a Oficina funciona; o preset é o ponto de partida, não uma engrenagem à
  parte.
- **Os controles saem sem custo.** Como os parâmetros já têm nome, a interface
  mostra **um controle por parâmetro** sozinha. Faz o painel genérico uma vez,
  e todo preset ganha controle automaticamente — não se desenha controle
  preset por preset.

Duas regras pra não virar armadilha:

- **Preset é ponto de partida que você DONO, não gabarito trancado.** Ao abrir,
  ele vira sua peça — dá pra mexer nos controles e também **descer abaixo
  deles**, pros parâmetros crus ou pra própria lista de passos. Preset que só
  deixa girar três botões e nada além é beco sem saída; este não é.
- **Abrir um preset HOMOLOGADO é copiar, não mutar o original.** Salva como
  peça sua; o preset abençoado fica intacto pro próximo uso. Mesma lógica do
  "abrir e refinar" já decidida. (Vale só depois de homologado — ver abaixo.)

### Rascunho e homologado

O copiar-não-mutar acima vale pro preset **homologado**, não pro rascunho —
preset tem duas fases:

- **Rascunho (candidato).** A IA gera, o ideador customiza e itera. Aqui mexer
  no próprio preset **é o processo, não a violação** — é pra ser lapidado até
  prestar. Nada é abençoado ainda.
- **Homologado.** O ideador aprova — "esse é um molde homologado" — e só então
  a regra entra: virou ponto de partida oficial, e mexer nele passa a ser tirar
  cópia, não sobrescrever.

Homologar é o **sign-off do ideador**, a mesma divisão de sempre: ele decide o
que é oficial. É como já trabalhamos — a IA solta o rascunho, o ideador aprova
ou manda ajustar. "Homologado" só dá nome a esse aval.

Onde moram: **rascunho** no scratch (prefixo `_`, onde a IA solta hoje);
**homologado** na pasta de presets oficial. O trabalho real aqui **não é o
mecanismo** — é **curar o conjunto certo**: um punhado de arquétipos que cobrem
o espaço sem inchar. Poucos demais deixam buraco; muitos viram manutenção. Essa
é decisão de gosto e cobertura, e é onde o esforço vai.

## O que preparar no motor agora

Estas são baratas hoje e caras depois. A ordem é por quanto doeria adiar.

### 0. Migrar pra WebGL 2, antes de tudo

Decidido. Seção própria mais abaixo. Vem primeiro porque gizmo, animação e
material construídos em cima do WebGL 1 nasceriam em cima do que vai mudar.

### 1. Espaço pra cor E peso de osso no formato de vértice

O formato tem posição, coordenada de textura e normal — 32 bytes, sem cor. Isso
já bloqueou coisa três vezes neste documento: o `countershade`, o `paintVerts` e
o AO falso do `nos-Craft`, que são o principal recurso de iluminação de lá.

Acrescentar agora é uma mudança de stride, uma linha no shader e um atributo.
Acrescentar depois é mexer em toda peça existente, no `geo.js`, no `render.js` e
em cada shader ao mesmo tempo.

Ganho direto: os objetos vindos do `nos-Craft` passam a **parecer os mesmos**, em
vez de perder o sombreado. E o pincel ganha um caminho a mais, mais barato que
textura pra detalhe suave.

**Custo real:** 12 bytes por vértice e uma multiplicação no shader.

**Faça junto com o peso de osso.** O esqueleto da animação também precisa de
atributos novos (índice e peso). Mudar o formato de vértice duas vezes é pagar a
migração duas vezes — decida os dois de uma vez, mesmo que o esqueleto só seja
usado meses depois. O espaço reservado não custa nada; a segunda migração custa.

Isto encosta no `render.js`, que é território de quem cuida de gráficos —
precisa ser combinado, não feito por cima.

### 2. `draw` aceitar o tipo de primitiva

Hoje é `gl.drawArrays(gl.TRIANGLES, ...)` fixo. Trocar por
`L.modo ?? gl.TRIANGLES` é uma linha e destrava linha e ponto pra sempre —
gizmo em 3D, contorno, grade, depuração. Foi exatamente isso que obrigou os
vértices do editor a irem pra canvas 2D.

### 3. Posicionamento como dado, já

Enquanto são 12 árvores escritas à mão, mover pra arquivo é uma tarde. Depois de
três mapas povoados, é uma migração.

### 4. Tensão entre valores próprios e instanciamento

Vale saber antes de esbarrar: desenhar muitos objetos iguais de uma vez
(instanciamento) exige que sejam **iguais**. Se cada árvore tiver valores
próprios, cada uma vira uma malha distinta e o ganho evapora.

Resolução: valores próprios são exceção, não regra. O jogo agrupa por assinatura
— quem não tem alteração cai no grupo do tipo e desenha junto; quem tem sai do
grupo. Basta a estrutura de dados permitir esse agrupamento desde o começo.

## Sobre three.js e híbrido

Pergunta do ideador: usar three.js junto, ou um conversor, traria ganho?

**Como motor, não.** Adotar significaria reescrever o render, e os objetos
passariam a ser desenhados com a iluminação e os shaders de lá — o que você
modela deixa de se parecer com o que aparece no jogo. Num jogo onde o visual
estilizado é o ponto, isso custa mais do que entrega. As funcionalidades que
viriam sem custo, na maioria, são coisas que ainda não precisamos.

**Como conversor em tempo de execução, também não.** Converter a saída do
`nos-Craft` no navegador significa carregar o three.js junto com o jogo, e o
projeto inteiro é construído em cima de não ter dependência.

**Como fonte de algoritmo, sim, e muito.** O acoplamento com three.js lá é raso:
`Vector3`, `Color` e `BufferGeometry` só nas bordas, com matemática pura no meio.
Portar `loft`, `inflate`, `lathe` e `displace` é trocar vetor por arranjo — umas
centenas de linhas, sem dependência nova.

Sobre outras linguagens (WebAssembly e afins): não neste tamanho. As operações de
malha aqui são milhares de vértices, não milhões, e JavaScript dá conta com
folga. Seria complexidade paga sem retorno.

**A limitação real do motor hoje não é a linguagem nem a biblioteca** — é o
formato de vértice sem cor, o `draw` preso em triângulos e o WebGL 1. Os três
itens acima. Resolvidos, some quase todo o motivo que faria alguém querer trocar.

**Decisão do ideador: WebGL 2, sem three.js.** Nada do que foi pedido —
materiais, animação, esqueleto — é impossível no motor próprio. É trabalho, não
barreira. O renderizador é a parte pequena do que se está construindo; o grande
é a Oficina, o formato de passos e a federação, e nada disso muda conforme quem
desenha o triângulo.

### Dois mal-entendidos que não devem voltar

**three.js não exige arquivo.** Ele é biblioteca de renderização; dá pra usar
gerando tudo por código, zero arquivo, como o Nós faz. Os carregadores de `.glb`
e afins são capacidade disponível, não obrigação. A frase "precisaríamos do
three.js pra trazer coisa de fora" era condicional, e a condição não se aplica.

**Trazer objeto de fora já tem lugar previsto.** No `docs/PORTALS_PROTOCOL.md`,
o campo `clientHint` existe pra um mundo federado avisar que precisa de outro
cliente ou tem mecânica própria. Como cada repositório é um planeta com o
cliente dele, **nosso renderizador nunca carrega `.glb` de estranho**.

### O sinal pra reconsiderar

Se daqui a alguns meses o tempo estiver indo todo pra infraestrutura de
renderizador em vez de pro mundo, trocar passa a valer. Enquanto o motor não for
o gargalo, ele não é o problema.

### Por que o formato em texto importa aqui

A colaboração no metaverso passa por Pull Request: cada repositório é um mundo,
e quem quiser ajudar bifurca e propõe. **Lista de passos em texto mostra
exatamente o que mudou numa revisão. Um `.glb` binário não mostra nada.**

Isso não foi projetado de propósito — surgiu sozinho por causa da federação por
repositório — mas é um argumento forte a favor do formato escolhido.

## WebGL 2

Decisão do ideador: migrar, sem adotar three.js.

A troca é pequena e mecânica: criar o contexto com `webgl2`, e nos shaders subir
pra `#version 300 es` — `attribute` vira `in`, `varying` vira `in`/`out`,
`gl_FragColor` vira uma saída declarada, `texture2D` vira `texture`. As peças não
são tocadas: elas geram arranjos de vértice e não sabem de shader.

O que destrava, e é bastante:

- **Instanciamento nativo** (`drawArraysInstanced`). Hoje cada árvore plantada é
  um desenho próprio; uma floresta de 500 viraria mil desenhos por quadro. Com
  instanciamento, viram um.
- **Textura de profundidade de verdade** na sombra. Hoje o motor empacota a
  profundidade em RGBA e desempacota no shader (o `PACK` do `render.js`). Some o
  truque, some a perda de precisão.
- **Vários alvos de render** de uma vez, que é o que uma passada de transparência
  ou de efeito precisa.
- **Texturas de tamanho livre** com repetição e mipmap, sem a regra de potência
  de dois do WebGL 1.
- Mais uniformes disponíveis, o que importa direto pro esqueleto da animação.

Suporte é universal hoje. O risco da migração é baixo e o retorno é alto — e ela
deve vir **antes** da Oficina, não depois, senão gizmo, animação e material
nascem em cima do que vai mudar.

WebGPU (a tecnologia gráfica acima do WebGL 2 — mais objeto na tela sem travar,
e a placa de vídeo pra cálculo pesado) fica pra depois, por um motivo concreto:
hoje ainda falta em cerca de um quinto dos aparelhos (mais antigos, Firefox no
Android), e "qualquer um entra, PC ou celular, sem instalar" é a alma do NÓS —
excluir um quinto dos jogadores não vale. Mas ele não é abandonado: o motor
nasce com o **renderizador trocável** (uma camada fina que separa *o que
desenhar* de *com qual tecnologia desenhar*), então o WebGPU fica reservado na
arquitetura. Quando o suporte dele chegar perto de universal — o que deve vir
junto com o momento em que o mundo fica grande o bastante pra precisar do teto
dele —, plugá-lo é acréscimo, não reescrita. A abstração em si não é construída
agora (com um só renderizador seria prematura); o que nasce cedo é a decisão de
deixar a porta pronta, o mesmo princípio do envelope. Decisão registrada em
D-75.

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

## Conforto que evita retrabalho

Três coisas baratas que economizam dor mais tarde:

**Silhueta de referência na cena, ligada por padrão.** Um contorno com a altura
do jogador. Modelar sem referência de escala é desenhar sem régua — o erro só
aparece quando o objeto é plantado no jogo e está do tamanho errado.

**Salvamento automático em `localStorage`.** Como o arquivo é só a lista de
passos, guardar a cada mudança é quase sem custo, e a aba caindo deixa de custar
o trabalho todo.

**Bancada sem interface pro `executar`.** O projeto já tem `tools/bancadas/`.
Uma bancada que roda uma lista de passos e confere o resultado testa o replay —
que é o coração de tudo — sem precisar abrir o editor nem clicar em nada.

## Ordem de construção

> Estado por milestone: `[x]` feito · `[~]` em andamento · `[ ]` a fazer. O
> quebra-fino de cada milestone (as subtarefas em curso) vive na lista de
> tarefas da sessão, não aqui — aqui é o mapa, não o diário.

0. `[x]` **Migrar o motor pra WebGL 2** — feito (D-76): troca pura, contexto
   `webgl2` + os 7 programas de shader em `#version 300 es`, saída
   **byte-idêntica** à anterior (20 renders conferidos por `cmp`). O espaço de
   vértice pra cor e peso de osso ficou **reservado** como acréscimo (somar um
   atributo depois é aditivo, não re-migra shader), não embutido — mesmo
   princípio da reserva do WebGPU (D-75).
1. `[ ]` Estrutura de dados (vértices únicos, faces, identidades) e a lista de passos.
2. `[ ]` Câmera do editor com cursor livre.
3. `[ ]` Ver vértices e faces por cima da malha, em canvas 2D.
4. `[ ]` Selecionar e arrastar **um** vértice, gravado como operação.
5. `[ ]` Desfazer e refazer em cima disso.
6. `[ ]` Gizmo de eixos e o painel lateral.
7. `[ ]` Extrudar.
8. `[ ]` Mesclar e ímã.
9. `[ ]` Textura por objeto com projeção em caixa, e o pincel no modo "face".
10. `[ ]` Exportar código pelo servidor de desenvolvimento, e colisão automática.
11. `[ ]` Modos livres do pincel: raio, dureza, degradê. Acrescenta, não substitui.
12. `[ ]` Espaço Material: parâmetros por lote no shader, e a passada de transparência.
13. `[ ]` Espaço Animação: `parte` com nome, trilhas de chave, animação rígida.
14. `[ ]` Esqueleto com deformação suave — adiciona ao formato de vértice os
    atributos de peso/índice de osso (o acréscimo reservado no 0, feito quando
    o esqueleto finalmente os consome).

A **aba Desenho** não depende de nada disso e pode ser construída a qualquer
momento, inclusive primeiro: é polígono em canvas 2D, sem malha e sem
identidades. Mesmo sem a modelagem pronta, ela já paga sozinha — você passa a
mandar contorno exato pra IA em vez de imagem pra ser traçada.

A **Aba Som** também não depende do resto: é Web Audio puro, sem malha e sem
identidade de vértice. Pode nascer em paralelo a qualquer ponto da lista
acima — `motor/som.js` já prova que a síntese funciona, falta só a
interface e o formato de passos por cima.

A **IA na criação de peças** (os dois caminhos) depende de uma coisa só do
formato: a Lista de operações ter os passos descritivos que o contrato
promete (`loft`, `inflate`, `lathe` — já fechados nesta rodada). O painel
BYOK dentro do jogo em si está fora do roadmap (possível, não planejado); o
caminho por assinatura — a IA soltando peça no repositório — já funciona e
não espera nada desta lista de construção.

A bancada sem interface do `executar` entra junto com o passo 1, não no fim:
ela é o que deixa provar que o replay está certo antes de existir tela pra
olhar.

Os passos 1 e 4 são o teste da ideia inteira. Quando arrastar um vértice
funcionar e o arquivo de passos refizer o objeto igual, o resto é trabalho
conhecido.

---

## O que este documento assume do motor

- `visor.projetar` — mundo → tela, já existe (feito pras etiquetas de ID).
- `visor.depurar` — existe, mas hoje **não serve pro editor**: o `draw` usa
  `gl.TRIANGLES` fixo, então não desenha ponto nem linha. Vértices e arestas vão
  pra canvas 2D por cima. Ver "O que preparar no motor agora": uma linha resolve.
- `freeCam` no `render.js` — câmera livre, já existe.
- `mat4.js` — falta rotação em X e Z (escritas neste documento, prontas).
- **Servidor de desenvolvimento com rota de gravação** — não existe ainda. É o
  que permite salvar em `pecas/` sem passar pela pasta de downloads. O servidor
  `no-store` da investigação de cache é a base.
- Formato de vértice: posição, coordenada de textura e normal. **Não tem cor** —
  é a limitação nº 1 a resolver (ver "O que preparar no motor agora"). Enquanto
  não for, a pintura vive na textura gerada por objeto. Mexer nisso é território
  de quem cuida de gráficos, então precisa ser combinado, não feito por cima.
