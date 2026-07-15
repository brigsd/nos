# Créditos — assets/

## Paleta

- **Resurrect 64** por Kerrie Lake — <https://lospec.com/palette-list/resurrect-64>. Licença: CC0 (conforme a listagem no Lospec). Os 64 hex codes estão em `palette.json`, obtidos via WebFetch da página do Lospec e conferidos de forma independente contra `https://lospec.com/palette-list/resurrect-64.json` (API bruta) — as duas fontes bateram exatamente, então os valores foram tratados como confirmados, não incertos.

## Sprites (T7 — kit visual da v1)

Todos os sprites em `sprites/src/*.json` (campina, flores de campina, floresta, água, ruína, caminho de terra, Núcleo) são **originais**, desenhados como código (matrizes de índices de paleta) pelo pixel-artist deste projeto — nenhum pack CC0 externo (Kenney ou similar) foi adaptado nesta leva. Nenhum outro asset externo foi usado.

## Refinos de arte (T7.1 — issue #12)

- `campina_3.json`: terceira variação sutil de campina, mesma técnica e mesmo pixel-artist das duas primeiras (`genCampina3` em `tools/author-sprites.cjs`).
- `margem_agua_4dir.json`: rim arenoso/molhado para a transição campina→água. Original, código próprio; 4 quadros são só rotações de 90° de uma única borda desenhada à mão (`rotateGridCW`), não 4 desenhos separados.
- Nenhum asset externo foi usado nestes dois sprites.

## Sprites dos Nativos (issue #23 — Fase B, parte "sprites")

Fatia de arte da issue #23: os 3 Nativos de O Coração — **gota**, **raiz**, **cinza** — 16×16, paleta Resurrect 64, **originais**, desenhados como código pelo pixel-artist (`genGota`/`genRaiz`/`genCinza` em `tools/author-nativos.cjs`, mesma técnica de `author-sprites.cjs`). Nenhum pack CC0 externo foi adaptado. O render deles no mapa (`site/src/renderer.ts`) fica para uma branch posterior, pois depende do tipo `Native` do motor (Fase A da mesma issue).

Contexto de personagem foi lido em `engine/behavior.ts` e `engine/natives.ts` de `origin/colaborador2/v2` (diálogos, `NPC_HOMES`, facções): gota é *wanderer* (água/orvalho, fala lore do mundo), raiz é *merchant* (floresta/terra, negocia madeira), cinza é *guardian* (ruínas/fim, avisa sobre o Detached Head, HP mais alto). Cada um usa uma família de cor e uma silhueta diferentes entre si e do avatar do jogador (`no_avatar.json`, robe roxo/violeta de silhueta lisa em arco): gota é um "gota d'água" em ciano/azul com ponta única e brilho especular; raiz é um ser de raiz/muda, tronco casca marrom-esverdeada com botões florais rosa e 3 raízes de comprimento assimétrico; cinza é um sentinela de pedra em cinza-ameixa, silhueta blocada "ampulheta" com topo achatado, olhos em brasa vermelha e pés partidos.

**Parecer do art-reviewer — APROVADO** (2 rodadas; ver `tools/author-nativos.cjs` para o histórico de achados "Round 1" em comentário, e o PR para o parecer completo):
- Rodada 1 encontrou 3 problemas reais, todos com correção registrada no código: (1) os brotos/folhas de `raiz` usavam os mesmos índices de paleta (36/37) do próprio tile `campina_1.json` — desapareciam contra a grama real; trocados por rosa/malva (55/56), sem colisão com nenhum tile de bioma. (2) duas raízes de `raiz` só encostavam no corpo na diagonal (pixel órfão) — a base fechada foi alargada para conectar todas as raízes ortogonalmente. (3) o "rachado" de `cinza` era 1px de diferença de tom na mesma família de cor — ilegível, lido como ruído; removido. O afinamento de cintura de `cinza` também foi esticado de 1 para 2 linhas para a silhueta "ampulheta" ficar inequívoca.
- Rodada 2 confirmou as 3 correções (inspecionando os PNGs 8x e um compósito de teste sobre `campina_1`/`floresta` reais) e não achou novos bloqueadores: leitura clara em tamanho real, 100% Resurrect 64, contraste bom contra os biomas de grama, mesma luz topo-esquerda/peso de contorno/escala dos demais sprites, nenhum pixel órfão remanescente.

## Sprite d'A Fábrica (R4 — painel Oficinas até a tela)

`oficina.json`: console-sintetizador genérico, 16×16, paleta Resurrect 64, **original**, desenhado como código à mão (matriz de índices direto no JSON, sem gerador `.cjs` dedicado — sprite único, não valeu a pena um `author-*.cjs` novo). Nenhum pack CC0 externo foi adaptado.

Usado 4x (Forja/Cozinha/Bancada/Estaleiro) com o nome de cada oficina desenhado ao lado via `drawPlayerName` (`site/src/renderer.ts`) — mesmo padrão dos Nativos. Não é economia de escopo disfarçada: D-25a já fixa a estética "sintetizador atemporal" (o estilo do produto vem da receita/material, nunca de uma máquina duplicada), então UM arquétipo de console lido 4x com rótulo é a leitura fiel da decisão de design, não só a mais barata. Console metálico atarracado, tampo achatado, base tipo bigorna alargada, luz topo-esquerda (mesma convenção do `no_avatar`/Nativos); a janela de brilho no corpo usa o mesmo par violeta/carmesim do Núcleo e do acento do HUD (`--nos-accent`/`--nos-pulse`) — rima visual: as oficinas correm no mesmo Pulso que o Núcleo respira.

## Ferramentas

`tools/` (encoder PNG manual + compositor) é código original deste projeto, sem dependências externas (só `fs`, `path`, `zlib` do Node). `tools/author-nativos.cjs` e `tools/contact-sheet-nativos.cjs` (issue #23) seguem a mesma regra.
