# Comunicação ideador ↔ coder — identificação de objetos e áreas (D-33)

> O problema que isto resolve: "essa área que tem uma árvore à esquerda do
> rio" exige adivinhação. Com IDs visíveis e setores no mapa, um pedido vira
> uma frase exata — e o coder acha o objeto no código na primeira busca.

## As duas teclas

- **`I`** — liga/desliga as **tags de identificação**: cada objeto próximo
  (até ~9 tiles, os 22 mais perto) ganha uma etiqueta flutuante com seu ID.
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

## Ideias futuras (não implementadas)

- **Modo foto (F2?)**: salvar screenshot já com `?cam=` carimbado no canto.
- **Clique pega ID**: clicar num objeto copia o ID (ray-picking).
- **Tags por setor no mapa grande**: contagem de objetos por célula.
