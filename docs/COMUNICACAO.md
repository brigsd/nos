# Comunicação ideador ↔ coder — identificação de objetos e áreas (D-33)

> O problema que isto resolve: "essa área que tem uma árvore à esquerda do
> rio" exige adivinhação. Com IDs visíveis e setores no mapa, um pedido vira
> uma frase exata — e o coder acha o objeto no código na primeira busca.

## As duas teclas

- **`I`** — liga/desliga as **tags de identificação**: cada objeto próximo
  (até ~5 tiles, os 12 mais perto, com oclusão — parede na frente esconde a
  tag) ganha uma etiqueta flutuante ancorada no tronco/corpo do objeto.
  O HUD passa a mostrar `setor x,y · mira setor x,y · ?cam=…`. A escolha
  fica salva (localStorage) — é uma mecânica permanente, ligue quando quiser
  apontar algo e desligue pra jogar limpo.
- **`M`** — cicla o mapa: minimapa → **mapa grande com setores** → sem mapa.

## IDs de objeto

Formato: `tipo-XxY`, onde `X,Y` é o **tile de origem** do objeto — o mesmo
tile que o gerador determinístico usa. Tipos genéricos:

| tipo | o que é |
|---|---|
| `arvore-38x12` | árvore (scatter da floresta ou fileira do carreiro) |
| `tufo-50x15` | graminha balançando |
| `flor-59x32` | flor avulsa |
| `arbusto-30x11` | arbusto |
| `rocha-22x41` | pedrinha/seixo |
| `arco-51x15` | arco do Hall de Portais |
| `fumaca-49x12` | fumaça da chaminé da Forja |

Nomeados usam o próprio nome: `forja`, `cozinha`, `bancada`, `estaleiro`,
`gota`, `raiz`, `cinza`, `portais`, e jogadores pelo login.

**Correlação com o código** (`prototipos/fps/nos-fps.html`): o mundo é
gerado por posição, então o ID leva direto ao lugar certo —
árvores/tufos/flores/seixos nascem no scatter por tile (busque `hash2(tx`,
com `tx,ty` = os números do ID); fileiras do carreiro no bloco "fileiras do
carreiro"; arcos/fumaça no bloco "A CLAREIRA"; construções no `CITY` map.

## Setores (localização macro)

A ilha 64×64 é dividida em **8×8 setores de 8×8 tiles**: colunas `A`–`H`
(oeste→leste), linhas `1`–`8` (norte→sul). `A1` = canto NW, `H8` = canto SE.
No mapa grande (M, 2º toque) a grade aparece com os rótulos e o setor atual
destacado. Referências úteis: spawn/carreiro ≈ `D2`, **A Clareira ≈ F2**,
praça do Núcleo ≈ `E5`, portal 2D ≈ `H4`.

Em código: `secOf(x, y)` no FPS; a conta é `coluna = x/8`, `linha = y/8`.

## Ponto de vista exato

O HUD (com tags ligadas) mostra `?cam=x,y,a`. Cole na URL do jogo —
`…/fps/?cam=45.5,15.6,0.10` — e a câmera nasce exatamente ali. Serve pra
dizer "olha isto AQUI" com zero ambiguidade: manda o link, o coder abre o
mesmo enquadramento.

## Como pedir mudanças (exemplos)

- "remove a `arvore-38x12`" — objeto exato, sem descrição.
- "a textura da `rocha-22x41` tá estranha, muda" — idem.
- "no setor `C2`, quero mais flores perto do carreiro" — área macro + contexto.
- "`?cam=45.5,15.6,0.10` — essa banca aí tá torta" — enquadramento exato.

---

# No FPS v3 (`prototipos/fps/v3/jogo.html`)

A v3 é motor novo e nasceu sem nada disto. O que já foi portado usa a **mesma
notação** de propósito — duas notações pra mesma coisa seria, na documentação,
o mesmo erro que já custou caro no código.

## O que já existe na v3

- **Setores `A1`–`H8`**, iguais aos da v2: colunas de oeste a leste, linhas de
  norte a sul, `E5` no centro da ilha. A grade sai da **extensão declarada pela
  peça** (`ilhaChao.EXTENSAO`, hoje 28), dando setor de 7 unidades. Se a ilha
  mudar de tamanho, os setores acompanham sozinhos.
- **HUD sempre visível** no topo ao centro (na v2 dependia da tecla `I`):
  `setor E5 · x -19.0 · z 0.0 · raio 19.0/24.3 · grama`.
  O `raio` é a distância ao centro contra o limite de colisão **naquela
  direção** — a borda da ilha é irregular, então o 2º número muda conforme se
  anda.
- **`?cam=x,z,yaw,pitch`** — quatro números, não três. A v2 é plana (`x,y,a`);
  a v3 tem altura de olhar, daí o `pitch` a mais. O `z` da v3 corresponde ao
  `y` da v2, e o `yaw` ao `a`.
- **Tecla `=` copia o link pronto** pra área de transferência — a URL inteira,
  não só os números. Aperta e cola. (Na v2 era digitar à mão.)
- **Tecla `I` liga as etiquetas de ID**, como na v2: os 12 objetos mais
  próximos (até 14 unidades) ganham etiqueta ancorada no topo do tronco, e
  objeto tapado por outro não mostra etiqueta.
- **Tecla `M` cicla o mapa**, como na v2: minimapa → mapa grande com a grade de
  setores e o setor atual em destaque → nenhum.
  As cores do terreno saem de `superficieEm`, a mesma função que escolhe o som
  do passo — superfície nova aparece no mapa sozinha.
- **Tecla `O`** liga e desliga a visualização das áreas de colisão.
- **Tecla `=`** copia o link da vista atual.

A aba **HUD** das configurações escolhe em qual dos quatro cantos o minimapa
fica (ou nenhum) e oculta os textos da tela. O minimapa vem ligado por padrão
no canto de baixo à esquerda. Os textos ficam por cima do mapa: são pequenos, e
por baixo sumiriam no canto onde o minimapa estivesse.

## IDs de objeto na v3

Formato **`arvore@-13,8`** — tipo, arroba, e a posição no mundo.

Difere do `tipo-XxY` da v2 de propósito: lá o mundo era uma grade de tiles
sempre positivos, aqui são unidades com sinal, e `arvore--13x8` seria ilegível.
O que importa preservar não é o formato, é a propriedade: **o ID sai da posição**,
então reordenar a lista de árvores não renomeia nada e o nome leva direto ao
lugar. Os números são os MESMOS que o HUD mostra — dois sistemas de número pra
mesma coisa é exatamente o que já causou bug aqui.

Em código, as árvores de hoje estão em `ARVORE_POS` no `jogo.html`; quando
virarem geração por posição, o ID continua valendo sem mudar nada.

O protocolo da v2 está portado por inteiro.

## Ideias futuras (não implementadas)

- **Modo foto (F2?)**: salvar screenshot já com `?cam=` carimbado no canto.
- **Clique pega ID**: clicar num objeto copia o ID (ray-picking).
- **Tags por setor no mapa grande**: contagem de objetos por célula.
