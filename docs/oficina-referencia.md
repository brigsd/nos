# Oficina — referência de como cada coisa funciona

Manual plano do que já está pronto na Oficina (o editor de objetos in-game), pra
entender rápido cada elemento sem ler o spec de design inteiro. O **porquê** de
cada escolha está no [`DECISIONS.md`](./DECISIONS.md) (D-77…D-83); o **design
detalhado** no [`oficina.md`](./oficina.md); aqui é só o "o que é / como funciona".

Regra que vale pra tudo: **o objeto É a lista de passos.** Uma peça é uma lista de
operações (`PASSOS`); mexer nela e re-executar refaz o objeto. Editar = adicionar
ou mudar uma operação na lista — nada é guardado "de fora" da lista.

## Os números dos vértices (a identidade)

Cada vértice tem um número — é o **endereço estável** dele, não uma contagem. As
operações dizem "vértice 7", nunca "o sétimo da lista".

O esquema é **um bloco de 1000 números por passo da lista**: o passo de índice `i`
é dono dos números `[i×1000, i×1000+1000)`. Por isso, no toco de exemplo:

- o **cilindro** é o 1º passo → seus 16 vértices são **0–15** (8 do aro de baixo + 8 do de cima);
- a **extrusão do galho** vem depois (passo de índice 1) → os vértices novos dela começam em 1×1000 = **1000** (1000, 1001, 1002, 1003).

**Por que blocos separados** (e não 16, 17, 18…): pra mexer num passo não
renumerar os outros — "vértice 7" continua sendo o mesmo ponto faça o que fizer
em volta. É isso que faz o desfazer, o replay e a edição da lista funcionarem.

**Número que some:** se um vértice é **mesclado** em outro, o número dele se
aposenta e ninguém reusa — por isso você vê 1000, 1002, 1003 mas **não** o 1001 (o
1001 foi fundido no 1002). A lei é "referência pendurada GRITA, nunca corrompe em
silêncio".

**Dois tipos de valor** mudam a numeração de formas diferentes: mudar um
**dimensional** (raio, altura) NÃO renumera nada; mudar um **topológico** (nº de
lados) muda quantos vértices existem e renumera — a ferramenta avisa quais passos
ficaram "órfãos".

## As operações (o vocabulário da lista)

Cada item da lista é `['operação', {argumentos}]`. As que já existem:

| Operação | O que faz |
|---|---|
| `cubo`, `cilindro` | Cria a forma inicial (vértices + faces). `cilindro.lados` é topológico. |
| `moveV` | Move um vértice por deslocamento (é o que o arrasto grava). |
| `extruda` | Puxa uma face, criando vértices e paredes novas (o galho do toco). |
| `mescla` | Funde vértices num só; some com as faces que viraram área zero. |
| `pincel` | Pinta a cor de faces (modo `face`). |
| `solido` | Marca as faces que entram na colisão do objeto no jogo. |
| `liso` | Sombreado macio nessas faces (o padrão é chapado). |

A tabela completa, incluindo as operações ainda por construir, está no
`oficina.md` → "Lista de operações".

## Os controles (o que você faz na tela)

- **Câmera:** arrastar no vazio gira; botão direito ou shift+arrastar move (pan); roda dá zoom. Toque: 1 dedo gira, 2 dedos pinça/arrasta. O cursor fica **livre** (não some), pra você conseguir clicar nas coisas.
- **Selecionar + arrastar vértice:** clicar num ponto o seleciona; arrastar o move (grava um `moveV`). O objeto deforma ao vivo.
- **Gizmo (as setas X/Y/Z):** aparecem no vértice selecionado; arrastar uma seta move **travado naquele eixo** só. Seta apontando quase pra câmera fica apagada (não dá pra arrastar direito).
- **Painel da direita:** mostra o vértice selecionado (número + posição x,y,z) e o tamanho do objeto (largura/altura/profundidade). Dá pra **digitar um valor exato** num campo pra mover o vértice pra ali. Fica só de leitura enquanto você arrasta.
- **Desfazer / refazer:** `Ctrl+Z` desfaz, `Ctrl+Y` (ou `Ctrl+Shift+Z`) refaz. Desfaz só o que você editou na sessão — nunca "desmonta" a peça que você abriu.

## O arquivo de uma peça (o "envelope")

Toda peça, de qualquer tipo, tem a mesma anatomia:

- **`FORMATO`** — tipo + versão (a versão viaja com o arquivo pra sempre).
- **`PARAMS`** — valores dimensionais nomeados (raio, altura); mudar reconstrói sem renumerar.
- **`TOPO`** — valores topológicos (nº de lados); mudar renumera.
- **`PASSOS`** — a lista de operações (o corpo do objeto).
- **`meta`** — nome, descrição, e a colisão (calculada na hora, não guardada).
- **`construir`** — roda os passos e devolve o objeto pro motor.

Os passos citam os parâmetros por **nome** (`raio: 'troncoR'`, não `raio: 0.34`) —
é isso que faz mudar um valor em `PARAMS` reconstruir o objeto inteiro.

## Onde está o resto

- [`docs/oficina.md`](./oficina.md) — o design completo e o roteiro ("Ordem de construção").
- [`docs/DECISIONS.md`](./DECISIONS.md) — o porquê de cada passo (D-77 núcleo · D-78 câmera · D-79 lente · D-80 overlay · D-81 arrasto · D-82 undo · D-83 gizmo+painel).
- [`docs/MAPA.md`](./MAPA.md) — a árvore de arquivos do repo.

> Mantido no fecho de cada passo, junto com a decisão e o checklist. Enxuto de
> propósito: aponta pro spec e pro código quando você quiser o fundo.
