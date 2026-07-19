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
| **Tab: objeto ↔ edição** | Alterna os modos. | `preventDefault` no Tab. Uma variável de modo decide qual mapa de teclas escuta; nunca os dois ao mesmo tempo. |
| **Ver vértices / arestas / faces** (1, 2, 3) * | Mostra e seleciona as partes. | **Canvas 2D por cima, não WebGL.** O `visor.depurar` não serve: o `draw` do render usa `gl.TRIANGLES` fixo e não desenha ponto nem linha. Detalhe abaixo. |
| **E para extrudar** * | Puxa a face. | Extrusão de região: só as arestas de **borda** da seleção ganham parede. Resolve o caso de duas faces vizinhas sem precisar restringir a uma por vez. Algoritmo abaixo. |
| **Painel lateral** | Posição, rotação, dimensão. | A caixa do objeto fica guardada e só é refeita quando a malha muda. Enquanto o gizmo arrasta, os campos ficam de leitura — um dono por vez. |
| **Ímã (Ctrl segurado)** | Cola no vértice ou face mais próximo. | **Varredura linear, sem estrutura espacial.** 10 mil vértices a 60 quadros por segundo dá 600 mil comparações por segundo, que é barato. Só dividir o espaço em células se passar de uns 100 mil vértices. Colar em face é projetar no plano e prender dentro do triângulo. |
| **Mesclar vértices** | Dois viram um. | Grava `['mescla', { de: [7,12], para: 31 }]`, então o replay sobrevive à troca de identidade. Depois da mesclagem, apaga toda face que ficou com dois cantos iguais, de área zero. |
| **Arestas** | Selecionar e mover. | Chave canônica `min(a,b) + ':' + max(a,b)`, então a mesma aresta nunca vira duas. Deduzida das faces a cada mudança de malha, não guardada. |
| **Pintar** * | Cor na malha. | Paleta em textura: os três cantos da face recebem a **mesma** coordenada, apontando pro centro da célula de cor. Sem desdobrar malha e sem risco de vazar a cor vizinha. Detalhe abaixo. |
| **Modo navegação (botão 5)** | Liga e desliga o voo. | `e.button === 4`, com `preventDefault` no `mousedown` e no `auxclick` pra não disparar o "avançar" do navegador. Tecla alternativa configurável pra mouse sem botão lateral. Com o voo desligado, olhar em volta fica no arrastar do botão do meio. |
| **Câmera livre** | WASD anda, Q sobe, E desce, scroll acelera. | O `freeCam` do `render.js` já entrega posição, yaw e pitch. |
| **Salvar como código** | Gera o arquivo em `pecas/`. | Nome vindo do campo do painel, identidade no formato do `COMUNICACAO.md`. |
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

### Cor por face sem desdobrar a malha

A paleta é uma textura gerada com as cores em células. Cada face recebe a
**mesma coordenada nos três cantos**, apontando pro centro da sua célula.

Como os três cantos são iguais, a coordenada interpolada é constante em toda a
face. Ela nunca chega perto da borda da célula, então o filtro linear não tem
como puxar a cor vizinha. O vazamento de cor, que é o problema clássico de
paleta em textura, não pode acontecer nem em teoria.

O custo é não ter degradê nem pincel macio: cada face é de uma cor só.

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

Sobrou uma. A mesclagem contra as identidades de vértice está resolvida — grava
`de` e `para` — mas segue sendo a interação mais delicada do sistema, e é a
primeira que deve ganhar teste de verdade.

**Cor por face no lugar de textura pintada.** Contorna o desdobramento de
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
- `visor.depurar` — existe, mas **não serve pro editor**: o `draw` do render usa
  `gl.TRIANGLES` fixo, então não desenha ponto nem linha. Vértices e arestas vão
  pra um canvas 2D por cima. Continua útil se um dia quisermos volume sólido de
  depuração, como o colisor.
- `freeCam` no `render.js` — câmera livre, já existe.
- `mat4.js` — falta rotação em X e Z.
- Formato de vértice: posição, coordenada de textura e normal. **Não tem cor** —
  daí a cor por face virar paleta na textura gerada, em vez de mexer no
  `render.js`, que é território de quem cuida de gráficos.
