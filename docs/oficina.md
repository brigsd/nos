# A Oficina — editor de objetos dentro do jogo

Documento de projeto. Nada disso está construído ainda; serve pra decidir antes
de escrever código, e pra registrar POR QUE cada coisa é como é.

---

## O que é

Um editor 3D dentro do próprio jogo. Cena vazia, câmera que voa, e você modela
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
- **Desfazer sai de graça.** Apagar o último passo e reexecutar. Não precisa de
  sistema separado. Pra Ctrl+Z seguido não engasgar, o executor guarda uma cópia
  do estado a cada 10 passos e reexecuta a partir da cópia mais próxima, em vez
  de refazer tudo desde o começo.
- **O histórico é editável.** Dá pra voltar num passo do meio, mudar, e o resto
  se refaz sozinho.

**Isto é decisão de começo, não de evolução.** Gravar receita depois, numa
ferramenta que só guardava vértices, é reescrever ela. Já trocar o gerador de
colisão depois é uma tarde de trabalho.

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

---

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
| **Mesclar vértices** | Dois viram um. | Grava `['mescla', { de: [7,12], para: 31 }]`, então o replay sobrevive à troca de identidade. Depois da mesclagem, apaga toda face que ficou com dois cantos iguais, de área zero. |
| **Arestas** | Selecionar e mover. | Chave canônica `min(a,b) + ':' + max(a,b)`, então a mesma aresta nunca vira duas. Deduzida das faces a cada mudança de malha, não guardada. |
| **Pintar** * | Cor e pincel na malha. | **Projeção em caixa** gera a coordenada de textura sozinha, sem desdobrar malha. Cor por face é o primeiro modo do pincel, não um sistema à parte — assim o pincel macio entra depois sem jogar nada fora. Detalhe abaixo. |
| **Modo navegação (botão 5)** | Liga e desliga o voo. | `e.button === 4`, com `preventDefault` no `mousedown` e no `auxclick` pra não disparar o "avançar" do navegador. Tecla alternativa configurável pra mouse sem botão lateral. Com o voo desligado, olhar em volta fica no arrastar do botão do meio. |
| **Câmera livre** | WASD anda, Q sobe, E desce, scroll acelera. | O `freeCam` do `render.js` já entrega posição, yaw e pitch. |
| **Salvar e abrir do repositório** | Navegador de pastas dentro da ferramenta. | Três rotas no servidor de desenvolvimento: listar, ler e gravar. A página web não escreve em disco sozinha. Sem servidor, cai pra arrastar-e-soltar e download. |
| **Colisão automática** * | Encaixa cilindro, caixa ou esfera. | Calculada só das faces marcadas como sólidas. Fórmula abaixo. |
| **Botão de configurações** | Ajustes da ferramenta. | Reusa `.painelConfig` e `.abas` do jogo. Grade e ímã, velocidade da câmera, tamanho do gizmo, salvamento automático, tecla alternativa do modo navegação. `localStorage` em `nos3_oficina`, separado da chave do jogo. |

---

## Soluções detalhadas

### Vértices e arestas na tela: canvas 2D, não WebGL

O caminho que este documento propunha antes estava errado, e vale registrar por
quê. O `draw` do `render.js` chama `gl.drawArrays(gl.TRIANGLES, ...)` fixo, então
o `visor.depurar` só desenha triângulos. Ponto e linha não passam por ali.

A saída é melhor que a proposta original. Um canvas 2D por cima, como o minimapa
e as etiquetas de ID já fazem: projeta cada vértice com `visor.projetar` e
desenha um quadradinho. Vêm de graça três coisas que no WebGL dariam trabalho —
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
diferentes por baixo, então a segunda etapa jogaria fora a paleta e a geração
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

## Abas e espaços de trabalho

Duas coisas diferentes que é fácil confundir.

**Abas** são contextos de verdade separados. Existem três:

- **Desenho** — tela plana, sem câmera, sem 3D.
- **Objeto** — a cena 3D.
- **Som** — sem câmera nem malha, forma de onda e play. Ver "Aba Som".

O **painel de IA** (seção própria mais abaixo) não é aba nem espaço: não tem
cena própria, fica disponível em cima de qualquer uma das três acima e age
sobre o que estiver aberto ali.

**Espaços de trabalho** são arranjos de painel sobre a MESMA cena 3D, dentro da
aba Objeto: **Modelar**, **Material** e **Animação**. Trocar de espaço muda quais
painéis aparecem, e nada mais — câmera, seleção e objeto continuam onde estavam.

É a divisão do Blender, onde Shading e Animation são espaços de trabalho e não
programas diferentes. O critério é simples: **precisa da mesma câmera e da mesma
seleção? Então é espaço, não aba.** Virar aba faria perder as duas a cada troca,
atrito sem ganho.

Dentro do espaço Modelar, o `Tab` continua ciclando **objeto → edição →
pintura**.

## Aba Desenho

Canvas 2D pra traçar contornos fechados: clicar põe ponto, arrastar move,
fechar o polígono termina. Nada de malha, nada de identidade de vértice — é o
subsistema mais independente da ferramenta inteira.

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

## O contrato com a IA

Aqui tem uma armadilha que precisa ficar escrita, porque ela morde justamente no
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
precisa de verdade é o **painel de IA** logo abaixo — uma IA rodando só no
navegador, sem acesso a disco, só tem esse caminho pra propor ou mostrar
uma lista de passos que ainda não tem gesto de mouse equivalente. Nasce
como parte do painel de IA, não como recurso solto.

As rotas `GET/POST /pecas/<nome>.js`, já descritas em "Trazer e levar do
repositório", servem os dois usos: abrir o texto de uma peça existente, e
gravar o resultado editado.

## Painel de IA (BYOK)

Decisão já tomada em conversa com o ideador; registrada aqui agora. Não é
aba nem espaço no sentido de "Abas e espaços de trabalho" — não tem câmera
nem cena própria. É um painel disponível em cima de qualquer aba, que age
sobre o que está aberto ali.

**Bring your own key: cada um paga a própria conta.** Cada pessoa cola a
própria chave de API do provedor que quiser — Anthropic ou outro — no
navegador dela. **Zero chave de API no repositório**, em qualquer commit ou
branch. A chave mora só em `localStorage`, e só sai de lá pra API do
provedor escolhido.

Isso evita um problema que chave compartilhada teria: custo de quem mantém
o repositório crescendo junto com o número de gente usando, e rate limit de
um brigando com o de todo mundo. Com BYOK, assinatura é conta de cada um, e
o limite de requisição também é por chave — ninguém disputa cota de
ninguém.

**Modelo-agnóstico por contrato, não por acaso.** O painel manda pro
provedor escolhido o mesmo vocabulário de operações que este documento já
define — `loft`, `inflate`, `cilindro`, `oscilador`, o que for — e esse
vocabulário é texto simples, então qualquer LLM decente entende sem
integração especial por modelo. Trocar de provedor é trocar URL e formato
de chamada, não reescrever prompt.

**Chamada direto do navegador, sem backend.** Página estática no GitHub
Pages não tem servidor pra intermediar. As APIs relevantes preveem esse
caso — existe um jeito de habilitar CORS direto do cliente (a Anthropic tem
um cabeçalho específico pra isso; conferir o nome exato na hora de
implementar, isto veio de memória, não foi checado numa fonte agora). O
aviso de "perigoso" nesse tipo de opção é sobre expor chave COMPARTILHADA;
aqui não existe uma — é a chave de cada um, digitada por ela, e o risco é
só dela.

**O que a IA pode fazer:** ler o objeto ou som aberto (a lista de passos já
é o formato que ela entende, sem tradução), propor passos novos, e — usando
o Modo texto acima — mostrar ou editar a lista em texto quando ainda não
existe gesto de mouse equivalente. Não escreve arquivo direto: o "Aplicar"
final continua sendo confirmação humana, igual ao resto da Oficina.

### O que falta pra isso funcionar de verdade

A "Lista de operações" (mais abaixo) hoje não tem `loft`, `inflate` nem
`lathe` — só as primitivas e as edições manuais (`moveV`, `extruda`...).
Mas "O contrato com a IA", algumas seções acima, já diz que são exatamente
esses os passos que a IA deve preferir. **Lacuna real, achada relendo o
próprio documento**: o vocabulário que o contrato promete não estava na
tabela que o núcleo de fato implementaria. Fechado nesta rodada — ver as
linhas novas na Lista de operações. Sem isso o painel nasceria raso,
emitindo `moveV` por vértice, exatamente o que o contrato queria evitar.

## Decidido nesta rodada

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

## Editar objeto de dentro do jogo

O caminho principal de uso, decidido pelo ideador.

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
viriam de graça, na maioria, são coisas que ainda não precisamos.

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

Se daqui a alguns meses o tempo estiver indo todo pra encanamento de
renderizador em vez de pro mundo, trocar passa a valer. Enquanto o motor não for
o gargalo, ele não é o problema.

### Por que o formato em texto importa aqui

A colaboração no metaverso passa por Pull Request: cada repositório é um mundo,
e quem quiser ajudar bifurca e propõe. **Lista de passos em texto mostra
exatamente o que mudou numa revisão. Um `.glb` binário não mostra nada.**

Isso não foi projetado de propósito — caiu no colo por causa da federação por
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

WebGPU fica pra depois, e não muda nada agora: é o passo seguinte quando fizer
sentido, não um concorrente do WebGL 2.

## Espaço Animação

Duas camadas, e a primeira cobre mais do que parece.

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
água com profundidade, que hoje são impossíveis.

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

## Formato do arquivo gerado

O arquivo tem que ser uma peça normal do jogo: exporta `meta` e `construir(ctx)`,
igual `arvore3d.js` faz hoje. A diferença é que o corpo dele é **dados**.

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

**Parâmetros são de dois tipos, e isso não é firula.** Raio e altura mudam a
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
| `extruda` | `face`, `dist` | Cria os vértices novos e as paredes laterais. |
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
semanas, e a portátil apodrece porque ninguém a usa no dia a dia — sobra uma boa
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

## Conforto que evita retrabalho

Três coisas baratas que economizam dor mais tarde:

**Silhueta de referência na cena, ligada por padrão.** Um contorno com a altura
do jogador. Modelar sem referência de escala é desenhar sem régua — o erro só
aparece quando o objeto é plantado no jogo e está do tamanho errado.

**Salvamento automático em `localStorage`.** Como o arquivo é só a lista de
passos, guardar a cada mudança é quase de graça, e a aba caindo deixa de custar
o trabalho todo.

**Bancada sem interface pro `executar`.** O projeto já tem `tools/bancadas/`.
Uma bancada que roda uma lista de passos e confere o resultado testa o replay —
que é o coração de tudo — sem precisar abrir o editor nem clicar em nada.

## Ordem de construção

0. **Migrar o motor pra WebGL 2**, e na mesma passada abrir espaço no formato de
   vértice pra cor e peso de osso. Antes de tudo — o resto nasce em cima disto.
1. Estrutura de dados (vértices únicos, faces, identidades) e a lista de passos.
2. Câmera do editor com cursor livre.
3. Ver vértices e faces por cima da malha, em canvas 2D.
4. Selecionar e arrastar **um** vértice, gravado como operação.
5. Desfazer e refazer em cima disso.
6. Gizmo de eixos e o painel lateral.
7. Extrudar.
8. Mesclar e ímã.
9. Textura por objeto com projeção em caixa, e o pincel no modo "face".
10. Exportar código pelo servidor de desenvolvimento, e colisão automática.
11. Modos livres do pincel: raio, dureza, degradê. Acrescenta, não substitui.
12. Espaço Material: parâmetros por lote no shader, e a passada de transparência.
13. Espaço Animação: `parte` com nome, trilhas de chave, animação rígida.
14. Esqueleto com deformação suave — usa o espaço de vértice já reservado no 0.

A **aba Desenho** não depende de nada disso e pode ser construída a qualquer
momento, inclusive primeiro: é polígono em canvas 2D, sem malha e sem
identidades. Mesmo sem a modelagem pronta, ela já paga sozinha — você passa a
mandar contorno exato pra IA em vez de imagem pra ser traçada.

A **Aba Som** também não depende do resto: é Web Audio puro, sem malha e sem
identidade de vértice. Pode nascer em paralelo a qualquer ponto da lista
acima — `motor/som.js` já prova que a síntese funciona, falta só a
interface e o formato de passos por cima.

O **painel de IA** depende de uma coisa só: a Lista de operações precisa ter
os passos descritivos que o contrato promete (`loft`, `inflate`, `lathe` —
já fechados nesta rodada). Sem isso o painel nasceria raso, emitindo
`moveV` por vértice.

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
