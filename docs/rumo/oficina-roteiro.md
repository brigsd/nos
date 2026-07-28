# Oficina — o que ainda não existe

Recorte do antigo `docs/oficina.md` com **o que foi projetado e não foi
construído**, mais as decisões de escopo (o que deliberadamente não se constrói:
booleano, UV manual, three.js). Nada aqui é citável como se existisse.

O que vale hoje está em [`docs/uso/oficina-contrato.md`](../uso/oficina-contrato.md);
o registro do que foi feito, em
[`docs/historico/oficina-projeto.md`](../historico/oficina-projeto.md). O roteiro
vigente do projeto é [`PLANO.md`](./PLANO.md) — este arquivo é o acervo de design
da Oficina, não a fila de trabalho.

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

## Booleano

Fora de escopo por decisão. União e subtração robustas de malha são problema de
pesquisa, não de implementação — o Blender usa biblioteca dedicada e ainda falha
em casos ruins. Último item, se um dia for.

---

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

**Já existe hoje (P5 do playground, D-118), sem canvas ainda** —
`tools/bancadas/gabarito.mjs` (`npm run gabarito -- <peça>`): o formato do
contorno de referência é `prototipos/fps/v3/gabaritos/<peça>.js` exportando
`CONTORNOS: {ângulo: [[x,y],...]}` (0..1, a alça de curva reservada no 3º
elemento, a mesma lei fail-closed do `lathe`/`loft`) — hoje escrito à mão
olhando o PNG (o jeito real que uma IA autora sem canvas); o canvas da Aba
Desenho SUBSTITUI a autoria manual sem mudar o formato. A bancada extrai a
silhueta REAL por diferença contra o fundo vazio (peça `_vazio`, o mesmo
céu/chão sem objeto — a única forma confiável de separar objeto de fundo,
já que o céu tem gradiente+estrelas e o chão tem grama com dither, nenhuma
cor fixa separa os dois), filtra o ruído de partículas/vento por componente
conexo pequeno, rasteriza o contorno, mede IoU e devolve VEREDITO calibrado
(`LIMIAR_IOU=0.55`, calibrado pelo método do bench/D-60: 3 traçados bons
0,65–0,88 × 5 errados 0,00–0,44, o vale entre os dois) + evidência em PNG
(silhueta, referência, sobreposição colorida). Limitação registrada: um
`CONTORNOS` é um polígono SIMPLES — sem buraco (uma roda com vão, por
exemplo, mede a silhueta CHEIA).

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

**Trazer objeto de fora já tem lugar previsto.** No `docs/historico/legado/PORTALS_PROTOCOL.md`,
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

