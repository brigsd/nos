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
| **Tab: objeto → edição → pintura** | Cicla os modos dentro da aba Objeto. | `preventDefault` no Tab. Uma variável de modo decide qual mapa de teclas escuta; nunca dois ao mesmo tempo. Pintura é modo e não aba, pra não perder câmera e seleção a cada troca. |
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

## As duas abas

**Desenho** e **Objeto**. Duas, não três.

Desenho é contexto de verdade diferente: tela plana, sem câmera, sem 3D.

Pintura **não** é aba. Você pinta em cima do modelo, no mesmo visor, com a mesma
câmera e a mesma seleção — virar aba faria perder as duas a cada troca, atrito
sem ganho. Ela entra como terceiro modo do Tab, junto com objeto e edição. É a
mesma divisão do Blender, onde pintar é modo e o editor de imagem é janela
separada, e pelo mesmo motivo.

Então: `Tab` cicla **objeto → edição → pintura** dentro da aba Objeto.

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

## Ainda a combinar

Nada aqui bloqueia começar, mas nenhuma destas está decidida:

- Quantos objetos por arquivo — um só, ou uma cena com vários?
- Onde ficam os desenhos: junto da peça, ou numa pasta de referência como o
  `qa/ref/silhuetas.json` do `nos-Craft`?
- A Oficina roda dentro do `jogo.html` ou em página própria (`oficina.html`)?
  Este documento assume página própria.
- Unidade e escala: a silhueta de referência é o jogador, mas falta fixar quanto
  vale uma unidade em metros.
- Se um objeto da Oficina pode ser instanciado várias vezes com parâmetros
  diferentes, como as árvores de hoje fazem com `seed`.

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
| `moveV` | `v`, `d: [x,y,z]` | Move um vértice por deslocamento, nunca por posição absoluta — assim ele acompanha quando a base muda. |
| `moveA`, `moveF` | `a` / `f`, `d` | Aresta e face, mesma regra. |
| `extruda` | `face`, `dist` | Cria os vértices novos e as paredes laterais. |
| `escala` | `sel`, `fator`, `eixo?` | Sem eixo, uniforme. |
| `rotaciona` | `sel`, `eixo`, `graus` | Pivô é o centro da seleção. |
| `mescla` | `de: [ids]`, `para: id` | Some as faces de área zero que sobrarem. |
| `apagaFace` | `f` | — |
| `pincel` | `modo`, `cor`, e o alvo conforme o modo | `modo: 'face'` preenche faces inteiras. `modo: 'livre'` recebe `raio`, `dureza` e `pontos: [{ f, a, b }]` — face e posição DENTRO dela, não coordenada de textura crua. Assim mover um vértice depois leva a tinta junto, em vez de deslizar. |
| `liso` | `faces: [ids]` | Sombreado macio nessas faces. O padrão é chapado. |
| `solido` | `faces: [ids]` | Marca o que entra na colisão. |

Toda operação precisa ser **determinística**: mesma lista, mesmo objeto,
sempre. Nada de aleatório sem semente escrita no passo, senão reabrir o arquivo
dá um objeto diferente. Isso vale também pra numeração dos vértices criados no
meio do caminho, como explicado acima.

## Onde o código mora

Duas metades, e separar importa:

- **`motor/oficina.js`** — `executar(PASSOS, PARAMS, TOPO, ctx)` e
  `colisaoDe(...)`. Pequeno, é o que o jogo carrega pra abrir uma peça. Sem
  interface, sem edição. O `colisaoDe` roda só a geometria, porque é chamado no
  carregamento do módulo.
- **`oficina.html`** — a ferramenta: câmera, gizmos, seleção, painéis. Só abre
  quando você vai modelar.

Se o replay morasse dentro da ferramenta, o jogo teria que carregar o editor
inteiro pra desenhar um toco.

**A medir quando existir:** o jogo passa a executar pinceladas na hora de abrir
uma peça. As peças de hoje já geram textura por código, então o custo deve ser
parecido — mas é suposição, não medição. Se uma floresta de objetos pintados
pesar no carregamento, a saída é guardar a textura pronta em cache no navegador,
sem virar arquivo no repositório.

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

A **aba Desenho** não depende de nada disso e pode ser construída a qualquer
momento, inclusive primeiro: é polígono em canvas 2D, sem malha e sem
identidades. Mesmo sem a modelagem pronta, ela já paga sozinha — você passa a
mandar contorno exato pra IA em vez de imagem pra ser traçada.

A bancada sem interface do `executar` entra junto com o passo 1, não no fim:
ela é o que deixa provar que o replay está certo antes de existir tela pra
olhar.

Os passos 1 e 4 são o teste da ideia inteira. Quando arrastar um vértice
funcionar e o arquivo de passos refizer o objeto igual, o resto é trabalho
conhecido.

---

## O que este documento assume do motor

- `visor.projetar` — mundo → tela, já existe (feito pras etiquetas de ID).
- `visor.depurar` — existe, mas **não serve pro editor**: o `draw` do render usa
  `gl.TRIANGLES` fixo, então não desenha ponto nem linha. Vértices e arestas vão
  pra um canvas 2D por cima. Continua útil se um dia quisermos volume sólido de
  depuração, como o colisor.
- `freeCam` no `render.js` — câmera livre, já existe.
- `mat4.js` — falta rotação em X e Z (escritas neste documento, prontas).
- **Servidor de desenvolvimento com rota de gravação** — não existe ainda. É o
  que permite salvar em `pecas/` sem passar pela pasta de downloads. O servidor
  `no-store` da investigação de cache é a base.
- Formato de vértice: posição, coordenada de textura e normal. **Não tem cor** —
  daí a pintura ir pra textura gerada por objeto, em vez de mexer no
  `render.js`, que é território de quem cuida de gráficos.
