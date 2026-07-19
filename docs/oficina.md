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
  sistema separado.
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

## Funções, e o que cada uma exige resolver

| Função | O que faz | Problemas a resolver |
|---|---|---|
| **Ctrl+Z / Ctrl+Y**, 15 níveis | Desfaz e refaz. | Arrastar gera centenas de eventos de mouse — todos têm que virar **um** passo, fechado ao soltar o botão. Refazer precisa de pilha própria, apagada quando você faz algo novo. O navegador rouba o Ctrl+Z: `preventDefault`. |
| **Indicador de eixo X/Y/Z** | Bússola no canto com a orientação. | O motor desenha uma cena só por quadro. Resolver como desenho 2D por cima, com a matemática do `visor.projetar`. Não mexe no render. |
| **Gizmo de mover** | Clica no elemento, aparecem as setas X/Y/Z, arrasta uma. | O motor não tem clique-em-objeto 3D. Resolve projetando as setas pra tela e medindo distância do cursor em 2D. Setas precisam de tamanho fixo na tela, senão somem de longe — escalar pela distância. Arrastar exige converter movimento do mouse em distância ao longo do eixo 3D: sai projetando base e ponta da seta. |
| **R + eixo + graus + Enter** | Rotaciona digitando o valor, número visível no canto. | Precisa de estado "digitando", senão as teclas viram comando. O `mat4.js` só tem rotação em Y — falta escrever X e Z. Definir o pivô: centro do objeto ou cursor. |
| **S para escalonar** | Redimensiona. | Escala desigual estraga a iluminação: as normais deixam de ser perpendiculares e o sombreamento sai errado. Resolve gravando a escala nos vértices ao salvar, em vez de guardar como matriz. |
| **Tab: objeto ↔ edição** | Alterna entre o objeto todo e as partes. | Tab troca o foco no navegador: `preventDefault`. Cada modo tem seu conjunto de teclas; os dois não podem escutar ao mesmo tempo. |
| **Ver vértices / arestas / faces** (1, 2, 3) | Mostra e seleciona as partes. | Desenhar por cima sem receber sombra nem névoa. **Já existe canal pra isso**: `visor.depurar`, feito pro debug de colisão, fica fora do passe de sombra e serve direto. Decidir se ponto atrás da superfície some ou aparece apagado. |
| **E para extrudar** | Puxa a face, já com as setas. | Extrudar duas faces vizinhas ao mesmo tempo cria parede interna na aresta compartilhada. V1: uma face por vez. Manter a orientação das faces novas, senão o objeto vira do avesso. |
| **Painel lateral** | Posição, rotação, dimensão e detalhes, editáveis. | "Dimensão" exige recalcular a caixa do objeto — guardar e refazer só quando muda, não a cada quadro. Digitar no painel e arrastar o gizmo brigam; um trava o outro. |
| **Ímã (Ctrl segurado)** | Cola no vértice ou face mais próximo durante o arrasto. | Procurar o alvo mais próximo varre a cena a cada movimento; com muitos objetos precisa dividir o espaço em células. Colar em face é projetar o ponto no plano e prender dentro do triângulo. |
| **Mesclar vértices** | Arrasta um sobre o outro e viram um. | Mexe no coração do sistema: as operações falam "vértice 7", e mesclar apaga identidades. Tem que gravar **"7 e 12 viraram 31"**, senão refazer a lista quebra. Apagar as faces que ficaram com dois cantos iguais (área zero). |
| **Arestas** | Selecionar e mover. | Deduzida das faces, não guardada. Precisa de chave estável pros dois vértices em qualquer ordem, senão a mesma aresta vira duas. |
| **Pintar** | Cor na malha. | Face criada por extrusão **não tem coordenada de textura**. Pintar textura exigiria desdobrar a malha — problema grande. Resolve com **cor por face**: sem coordenada nenhuma, cada face guarda sua cor e a textura gerada vira paleta. Pincel de degradê fica pra depois. |
| **Modo navegação (botão 5 do mouse)** | Liga e desliga o voo. Ligado, aparece a mira e WASD + Q/E movem a câmera. Desligado, as mesmas teclas voltam a ser comandos de edição. | Botão 5 é `e.button === 4` no navegador, e ele dispara o "avançar" do histórico — precisa de `preventDefault` no `mousedown` e no `auxclick`. Mouse sem botão lateral precisa de tecla alternativa. Com o voo desligado, olhar em volta fica no arrastar do botão do meio. |
| **Câmera livre** | WASD anda, Q sobe, E desce, scroll muda a velocidade. | O `render.js` já tem `freeCam` com posição, yaw e pitch — a base existe. |
| **Salvar como código** | Gera o arquivo em `pecas/`. | Nome e identidade combinando com o `arvore@-13,8` do protocolo (ver `COMUNICACAO.md`). |
| **Colisão automática** | Encaixa cilindro, caixa ou esfera. | Só nas faces marcadas como sólidas — sem isso a copa da árvore vira parede, que é o erro que a colisão de hoje evita de propósito. Sem marcação, usa o objeto inteiro. |

| **Botão de configurações** | Abre os ajustes da própria ferramenta. | Reusa o painel de abas que o jogo já tem (`.painelConfig`, `.abas`). Conteúdo: tamanho da grade e do ímã, velocidade da câmera, tamanho do gizmo na tela, salvamento automático, e a tecla alternativa pro modo navegação. Guardar em `localStorage` com chave própria (`nos3_oficina`), separada da do jogo. |

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

**1. Mesclagem contra as identidades.** Resolvida no papel (a mesclagem grava as
identidades que colapsaram), mas é a interação mais delicada do sistema e merece
ser a primeira coisa testada de verdade.

**2. Cor por face no lugar de textura pintada.** Contorna o desdobramento de
malha inteiro. O custo é não ter degradê nem pincel macio. Aceitável agora,
mas é uma porta que fecha um pouco.

---

## Formato do arquivo gerado

O arquivo tem que ser uma peça normal do jogo: exporta `meta` e `construir(ctx)`,
igual `arvore3d.js` faz hoje. A diferença é que o corpo dele é **dados**.

```js
/* PEÇA gerada pela Oficina. Editável à mão, mas o caminho normal é reabrir
   na ferramenta — ela lê este mesmo arquivo de volta. */

export const PARAMS = { troncoR: 0.34, troncoH: 1.9, lados: 8 };

const PASSOS = [
  ['cilindro', { id: 1, raio: 'troncoR', altura: 'troncoH', lados: 'lados' }],
  ['extruda',  { face: 12, dist: 0.4 }],
  ['moveV',    { v: 7, d: [0.1, 0, -0.05] }],
  ['mescla',   { de: [7, 12], para: 31 }],
  ['cor',      { faces: [3, 4, 5], cor: '#4a7c3f' }],
  ['solido',   { faces: [0, 1, 2, 3] }],
];

export const meta = {
  nome: 'toco',
  tipo: 'objeto',
  desc: 'toco de árvore',
  /* lê o MESMO número que a geometria. Colisor declarado à parte vira segunda
     verdade — foi assim que a borda da ilha saiu do lugar. */
  colisao: { forma: 'cilindro', raio: PARAMS.troncoR, altura: PARAMS.troncoH },
};

export function construir(ctx) { return executar(PASSOS, PARAMS, ctx); }
```

Três coisas nesse formato merecem atenção.

**Parâmetros têm nome, e os passos citam o nome, não o número.** `raio:
'troncoR'`, não `raio: 0.34`. É isso que faz mudar um valor em `PARAMS`
reconstruir o objeto inteiro. Sem isso o arquivo seria só uma lista de números.

**`meta.colisao` lê de `PARAMS`.** Mesma regra da árvore de hoje: um número, um
dono. A ferramenta calcula a forma ao salvar, mas escreve a referência, não a
cópia.

**Mesclar grava `de` e `para`.** Sem isso, refazer a lista quebraria assim que
uma identidade de vértice desaparecesse.

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
| `cor` | `faces: [ids]`, `cor` | Cor por face; vira paleta na textura gerada. |
| `solido` | `faces: [ids]` | Marca o que entra na colisão. |

Toda operação precisa ser **determinística**: mesma lista, mesmo objeto,
sempre. Nada de aleatório sem semente escrita no passo, senão reabrir o arquivo
dá um objeto diferente.

## Onde o código mora

Duas metades, e separar importa:

- **`motor/oficina.js`** — só o `executar(PASSOS, PARAMS, ctx)`. Pequeno, é o
  que o jogo carrega pra abrir uma peça. Sem interface, sem edição.
- **`oficina.html`** — a ferramenta: câmera, gizmos, seleção, painéis. Só abre
  quando você vai modelar.

Se o replay morasse dentro da ferramenta, o jogo teria que carregar o editor
inteiro pra desenhar um toco.

## Ordem de construção

1. Estrutura de dados (vértices únicos, faces, identidades) e a lista de passos.
2. Câmera do editor com cursor livre.
3. Ver vértices e faces por cima da malha, via `visor.depurar`.
4. Selecionar e arrastar **um** vértice, gravado como operação.
5. Desfazer e refazer em cima disso.
6. Gizmo de eixos e o painel lateral.
7. Extrudar.
8. Mesclar e ímã.
9. Cor por face.
10. Exportar código e colisão automática.

Os passos 1 e 4 são o teste da ideia inteira. Quando arrastar um vértice
funcionar e o arquivo de passos refizer o objeto igual, o resto é trabalho
conhecido.

---

## O que este documento assume do motor

- `visor.projetar` — mundo → tela, já existe (feito pras etiquetas de ID).
- `visor.depurar` — camada fora do passe de sombra, já existe (debug de colisão).
- `freeCam` no `render.js` — câmera livre, já existe.
- `mat4.js` — falta rotação em X e Z.
- Formato de vértice: posição, coordenada de textura e normal. **Não tem cor** —
  daí a cor por face virar paleta na textura gerada, em vez de mexer no
  `render.js`, que é território de quem cuida de gráficos.
