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

## Sprite do Portal (R6 fase 1 — Portais, D-17)

`portal_2frames.json`: marco do Salão de Portais, 16×16, 2 quadros, paleta Resurrect 64, **original**, gerado por código (`genPortalFrame` em `tools/author-portal.cjs`, mesma técnica de `author-sprites.cjs`/`author-nativos.cjs` — gradientes com dithering ordenado sobre formas geométricas). Nenhum pack CC0 externo foi adaptado.

Um arco de pedra antigo (tons plum/cinza da família da `ruina.json` — liga o portal a "algo antigo que sempre esteve aqui", não a um gadget futurista) emoldurando um vazio giratório índigo/azul — uma família de cor que nenhum outro sprite usa (o Núcleo é violeta/carmesim, a oficina d'A Fábrica é violeta, a água é ciano/teal), então o portal nunca é confundido com "outro Núcleo" ou "uma poça" à primeira vista. Um único pixel violeta-claro no topo (a "pedra-chave") liga o marco ao acento do HUD (`--nos-accent`), o mesmo tipo de rima visual que a `oficina.json` já faz com o Núcleo. 2 quadros: os braços em espiral do vazio giram meia-volta e os pontos de luz à deriva mudam de lugar — um zumbido lento (~700ms, `PORTAL_FRAME_MS` em `site/src/renderer.ts`) deliberadamente distinto da batida de 350ms do Núcleo e do brilho de 1000ms da água, para os três nunca sincronizarem visualmente.

Desenhado uma única vez no mapa (posição fixa `PORTAL_MARKER_POSITION` em `site/src/main.ts`, ver `docs/PORTALS_PROTOCOL.md` para a escolha do local) — landmark do cliente, nunca estado do motor (`world.machines`/`world.natives` não o conhecem).

## Kit da Cidade (R8 — `docs/CITY_PLAN.md`)

Oito sprites novos, 16×16, paleta Resurrect 64, **originais**, gerados por código (`tools/author-city.cjs`, mesma técnica dos demais `author-*.cjs`; achados do self-audit de arte registrados em comentários "R1-"/"R2-" no próprio gerador). Nenhum pack CC0 externo foi adaptado.

- `laje_praca.json` / `laje_praca_b.json` — piso de lajes da praça/largos (deco `plaza`): *crazy paving* por mapa de regiões (cada letra = uma laje; junta rebaixada onde as letras mudam), sem junta na borda do tile (tiles vizinhos se fundem em calçamento orgânico, mesmo raciocínio das variantes de campina). Tons plum/cinza **da mesma família da `ruina.json`** — decisão de tema (atemporal mítico-tecnológico): a cidade e as ruínas são a mesma arquitetura. Musgo retomando juntas + uma laje afundada mostrando terra (só na variante a).
- `calcada_veia.json` / `calcada_veia_b.json` — pavimento da avenida (deco `pavement`): fiadas retangulares em aparelho corrido (lê-se como estrada CONSTRUÍDA, vs. as lajes orgânicas da praça), meio-passo mais escuro que a praça (achado R2-3: os dois pisos não podem borrar numa massa cinza só). A variante b carrega o nó de veia: luz violeta empoçada nas juntas, rampa do próprio Núcleo (darkIndigo→violet→lightViolet→paleLavender). O renderer espalha a b por hash posicional (~1/3 dos tiles).
- `pilar_pulso_4frames.json` — pilar de luz (deco `pylon`): estela de pedra com veia entalhada que respira **no mesmo relógio de 4 quadros do Núcleo** (`CORE_FRAME_MS` no renderer) — o pico (f2) enrubesce carmesim como a batida do Núcleo. Um Pulso, uma cidade.
- `arco_desperto.json` — arco desperto do Salão (deco `arch`): arco completo de pedra, lintel em ARCO (achado R1-1: ombros quadrados brigavam com o oval do marco vivo do portal), véu índigo pontilhado no vão (achado R2-9: motes soltos sumiam contra a laje) + pedra-chave violeta — a mesma rima de acento do marco do portal e da `oficina.json`.
- `arco_semente.json` — arco-semente adormecido (deco `arch_dormant`): tocos quebrados nas MESMAS colunas do arco desperto (a relação antes/depois é arquitetural, achado R1-2), lintel caído em dois blocos com junta visível, musgo, **zero pixels de luz** de propósito. Fica sobre grama nua além da borda do piso (achado R2-11: o chão chega quando o mundo chegar).
- `pedra_mural.json` — pedra do mural (deco `mural_stone`): estela de topo arredondado com fileiras entalhadas de riscos coloridos de comprimento irregular (paleCyan/gold/lightPink/paleYellow) — as vozes dos Nós (`/dizer`) feitas pedra.

`tools/city-mock.cjs` (novo): irmão em escala de cidade do `map-mock.cjs` — renderiza REGIÕES de um world.json real (biomas + `Tile.deco` + máquinas + Nativos + jogadores) espelhando as regras de desenho do `site/src/renderer.ts` (mesmo `hashTile`, mesmos salts de variante, mesma base de laje sob objetos de cidade, grama nua sob `arch_dormant`), para o loop de auto-auditoria de composição sem navegador.

## Ferramentas

`tools/` (encoder PNG manual + compositor) é código original deste projeto, sem dependências externas (só `fs`, `path`, `zlib` do Node). `tools/author-nativos.cjs` e `tools/contact-sheet-nativos.cjs` (issue #23) seguem a mesma regra. `tools/author-portal.cjs` (R6 fase 1) idem. `tools/author-city.cjs` e `tools/city-mock.cjs` (R8) idem.
