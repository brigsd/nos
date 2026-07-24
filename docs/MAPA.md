# MAPA — a árvore do NÓS, arquivo por arquivo

> **GERADO** por `npm run mapa` — não edite à mão. O resumo de cada arquivo
> mora no próprio arquivo (primeiro comentário; H1 nos `.md`); isto é a
> projeção. `npm run mapa:check` (CI) falha se isto estiver velho ou se
> algum arquivo-fonte estiver sem cabeçalho.

212 arquivos (código `.js .mjs .cjs .ts .tsx .html` + docs `.md`).

## (raiz)

- `CLAUDE.md` — NÓS — Harness do Projeto
- `README.md` — NÓS
- `vitest.config.ts` — Config do Vitest: cobre engine/** e tools/** — o gate npm test.

## .claude/agents/

- `game-builder.md` — Constrói features do cliente v3 (o motor GPU, a Oficina, o som, a animação, a interface do jogo). Recebe um brief fechado do orquestrador e entrega numa bran…
- `revisor-adversarial.md` — Revisor adversarial POR RISCO do v3 — tenta QUEBRAR a mudança sob estresse antes do merge, com foco em fundação, formato salvo (irreversível) e conta de julg…

## .claude/skills/auditar-peca/

- `SKILL.md` — Gate de senso crítico [cpu] pra peças do motor v3 (prototipos/fps/v3/pecas/*.js). Roda os críticos validados por benchmark (geometria, paleta, costura, bandi…

## .claude/skills/estruturas/

- `SKILL.md` — LEGADO (frente Miragem — o FPS v2 raycaster de `prototipos/fps/nos-fps.html`, em manutenção). Fluxo de criar/auditar estruturas ALI: prancheta de topo, colis…

## .claude/skills/nos-fluxo/

- `SKILL.md` — O fluxo pra construir e entregar QUALQUER feature no repo NÓS — orquestrar subagentes (coder + revisor adversarial por risco), verificar por medição, o cuida…

## .claude/skills/oficina/

- `SKILL.md` — A Oficina — o editor de objetos in-game do NÓS (arquitetura, ciclo de construção, verificação, armadilhas). Use SEMPRE que for construir/continuar um passo d…

## assets/

- `CREDITS.md` — Créditos — assets/

## assets/tools/

- `README.md` — assets/tools — a pipeline de sprites
- `author-brasa-pessoa.cjs` — author-brasa-pessoa.cjs — v2 da brasa, "pessoa do ofício" (D-44, teste). Fiel à lore: brasa é A FERREIRA, uma pessoa — não um elemental de brasa. Então: cabe…
- `author-brasa.cjs` — author-brasa.cjs — "programa o pintor": compõe o avatar da BRASA (Habitante da Forja) por código e grava o sprite-src. Rode, OLHE o PNG, ajuste os parâmetros…
- `author-brasa64.cjs` — author-brasa64.cjs — teste de resolução (D-44): a brasa "pessoa do ofício" em 64×64. Hipótese: com 16× mais pixel, um Habitante-herói ganha alma (rosto que e…
- `author-nativos.cjs` — One-off (but re-runnable) authoring script for the 3 Nativos of O Coração (issue #23, Fase B — sprites only; map rendering lands in a later branch once engin…
- `author-portal.cjs` — One-off (but re-runnable) authoring script for the Portal marker sprite (R6 fase 1 — Portais, D-17). Kept separate from author-sprites.cjs and author-nativos…
- `author-sprites.cjs` — One-off (but re-runnable) authoring script that generates the initial pixel-index matrices for every T7 sprite and writes them as the "source of truth" JSON …
- `author-tree-res.cjs` — author-tree-res.cjs — experimento A do D-44: A MESMA árvore autorada em 16×16, 64×64 e 128×128 (formas em coordenadas normalizadas, detalhe — grão, salpicado…
- `build.cjs` — Single entry point for the art pipeline: 1. render every assets/sprites/src/*.json -> assets/sprites/*.png (+ _8x) 2. build the T7 kit contact sheet (tiles/o…
- `contact-sheet-nativos.cjs` — Builds a small contact-sheet PNG with the 3 Nativos (issue #23) plus the player avatar, laid out side by side at 8x on a neutral background - the art-reviewe…
- `contact-sheet.cjs` — Builds a single contact-sheet PNG with every rendered sprite (and every frame of the animated ones) laid out at 8x, numbered, on a neutral background — for t…
- `lint-sprites.js` — lint-sprites: valida os PNGs de assets/sprites contra os .json de src — o gate de arte do CI (npm run lint:sprites).
- `map-mock.cjs` — Composes an 8x8-tile mock of O Coração's meadow — campina, a small copse, a river hugging the east edge, a mossy ruin, a dirt path leading to the Núcleo (pla…
- `render.cjs` — Render tool for T7 art assets. Self-contained: only Node built-ins (fs, path, zlib) — no npm dependencies, no package.json.

## assets/tools/lib/

- `canvas.cjs` — Tiny in-memory RGBA canvas used by the render pipeline. No dependencies. /
- `dither.cjs` — Ordered (Bayer) dithering helpers, used to fake smooth multi-tone gradients/falloffs on a fixed palette without introducing random noise (which would read as…
- `font3x5.cjs` — Tiny 3x5 pixel digit font, used only for dev-tool labels (contact sheet numbering / map-mock ruler). Not part of any in-game sprite. /
- `grid.cjs` — Basic 2D palette-index grid helpers shared by sprite authoring code.
- `palette-names.cjs` — Semantic names for Resurrect 64 indices (see assets/palette.json), so sprite-authoring code reads as intent ("PAL.moss") instead of magic numbers. Index orde…
- `png.cjs` — Minimal, dependency-free PNG encoder.
- `spritesrc.cjs` — Load/save sprite "source of truth" files: JSON matrices of palette indices under assets/sprites/src/. -1 = transparent pixel.

## docs/

- `ARCHITECTURE.md` — Arquitetura — NÓS
- `AUDIO_E_CENAS.md` — Áudio e cenas — música, voz e cutscenes (direção)
- `CIDADE.md` — A Clareira — a cidade d'O Coração
- `CODER.md` — A Bancada do Coder — ferramentas, limites e o método (D-35)
- `COMUNICACAO.md` — Comunicação ideador ↔ coder — identificação de objetos e áreas (D-33)
- `CONTINUITY.md` — Continuidade — onde paramos
- `DECISIONS-ARCHIVE.md` — Arquivo de Decisões — NÓS (D-01…D-54)
- `DECISIONS.md` — Registro de Decisões — NÓS
- `FERRAMENTAS.md` — FERRAMENTAS — o plano da potência (D-56)
- `GDD.md` — Game Design Document — NÓS
- `HABITANTES.md` — Os Habitantes — mentes que JOGAM o jogo (proposta)
- `IMPLEMENTATION_PLAN.md` — Plano de Implementação — NÓS
- `LORE.md` — Lore — a bíblia do NÓS
- `PORTALS_PROTOCOL.md` — Protocolo dos Portais — R6
- `RECURSOS.md` — Recursos do coder — o índice único
- `VISION.md` — Visão — NÓS
- `oficina-referencia.md` — Oficina — referência de como cada coisa funciona
- `oficina.md` — A Oficina — editor de objetos dentro do jogo
- `walkthrough_colaborador2.md` — Resumo de Alterações — Colaborador 2 (T5, T6, T8, T9)
- `walkthrough_colaborador4.md` — Resumo de Alterações — Colaborador 4 (branch `colaborador4`)

## engine/

- `behavior.test.ts` — Vitest de engine/behavior: comportamento dos nativos (rotina, humor, deslocamento).
- `behavior.ts` — engine/behavior.ts
- `commands.test.ts` — Vitest de engine/commands: parse e efeito dos comandos vindos de issues.
- `commands.ts` — engine/commands.ts
- `economy.test.ts` — Vitest de engine/economy: produção, troca e estoque das máquinas.
- `economy.ts` — engine/economy.ts
- `fabrication.test.ts` — Vitest de engine/fabrication: receitas e fabricação de itens.
- `fabrication.ts` — engine/fabrication.ts
- `mapgen.test.ts` — Vitest de engine/mapgen: geração determinística do mapa (biomas, água, núcleo).
- `mapgen.ts` — engine/mapgen.ts
- `natives.test.ts` — Vitest de engine/natives: nascimento e estado dos nativos.
- `natives.ts` — engine/natives.ts
- `rng.test.ts` — Vitest de engine/rng: o gerador determinístico com semente (mesma semente, mesma sequência).
- `rng.ts` — engine/rng.ts
- `serialize.test.ts` — Vitest de engine/serialize: ida-e-volta do estado do mundo pro JSON sem perda.
- `serialize.ts` — engine/serialize.ts
- `tick.test.ts` — Vitest de engine/tick: a batida do mundo (avanço de estado a cada tick).
- `tick.ts` — engine/tick.ts
- `types.test.ts` — Vitest de engine/types: invariantes dos tipos centrais do mundo.
- `types.ts` — engine/types.ts
- `validate.test.ts` — Vitest de engine/validate: o validador do estado do mundo pega corrupção conhecida.
- `validate.ts` — engine/validate.ts

## engine/scripts/

- `genworld.ts` — Generates world/heart.json from scratch via the deterministic mapgen pipeline, validates it against the schema, and writes it to disk.
- `mapascii.ts` — Prints an ASCII rendition of world/heart.json - one character per tile - so the biome distribution can be eyeballed (river continuity, meadow clearing around…
- `validate-world.ts` — validate-world: carrega world/heart.json e roda assertValidWorld — o gate de sanidade do estado do mundo.

## prototipos/estudio/

- `tree-studio.html` — Estúdio de Árvores: bancada visual standalone (navegador) pra iterar o gerador de árvores.

## prototipos/fps/

- `README.md` — O Coração em primeira pessoa — o cliente OFICIAL
- `build-data.mjs` — Gera data.js: mundo compacto + sprites base64 para a demo raycaster.
- `data.js` — data.js — snapshot do mundo pro dev local do v2: abre nos-fps.html direto do disco sem build (no Pages, o build-fps inline os dados no lugar da tag).
- `nos-fps.html` — Cliente FPS v2 (raycaster por software, 320×180): o cliente oficial publicado em /fps/. Fonte única — o build (build-fps.mjs) inline os dados do mundo aqui.
- `tree-core.js` — NÓS — gerador de árvores (L-system / ramificação recursiva + copa por campo de densidade). Determinístico por seed. Saída: buffer de índices da paleta Resurr…
- `tree3d-core.js` — NÓS — árvores 3D (v2). A árvore cresce UMA vez como esqueleto 3D de verdade (ramificação recursiva com frames ortonormais) + copa em lobos 3D + nuvem de FOLH…

## prototipos/fps/bake/

- `bake-gi.mjs` — bake-gi.mjs — o path tracer do Actions (D-36, passe A dos "gráficos que ninguém fez"): ilumina o mundo de verdade, offline, e entrega o resultado como uma te…

## prototipos/fps/gpu/

- `gpu-beauty.html` — teto de beleza GPU (D-54): variante do protótipo WebGL pra medir o máximo visual antes do v3.
- `gpu-proto.html` — protótipo GPU (D-54): renderizador WebGL 320×180 com upscale — publicado em /fps/gpu.html pra sentir a perf no celular.

## prototipos/fps/v3/

- `README.md` — v3 — o cliente GPU e A OFICINA (D-55)
- `jogo.html` — jogo.html — o alicerce jogável v3 (D-61): câmera livre, som, tiers de gráfico e menu, em cima do motor ES modules.
- `oficina.html` — oficina.html — a INTERFACE da Oficina (passos 2-4, D-73): esqueleto de painéis (cena no centro, propriedades à direita, modos no topo, status embaixo) + a CÂ…
- `som.html` — som.html — a ABA SOM. S2 (D-100) foi a CASCA: carregar um evento de pecas-som, DESENHAR a onda e TOCAR ao vivo. S3 transforma o painel direito no EDITOR ao v…
- `visor.html` — visor.html — visor de peças da OFICINA (D-55): abre qualquer peça de pecas/ isolada no ambiente padrão (?peca=nome).

## prototipos/fps/v3/motor/

- `arvore-cartoon.js` — NÓS v3 — CONSTRUTOR de árvores CARTOON (D-63), o "carimbo" plantável. Porta o elenco aprovado no mostruário _arvformas pra uma fábrica reutilizável: criarArv…
- `arvore.js` — motor/arvore.js — GERADOR DE ÁRVORES portado FIEL da V2 (D-59). growTree + dependências extraídos LITERALMENTE de nos-fps.html (não redigitados). Inclui a ha…
- `geo.js` — helpers de GEOMETRIA do motor v3 (D-55): malha = lista chata de vértices (pos xyz, uv, normal) — 8 floats por vértice, triângulos soltos.
- `input.js` — input.js — teclado/mouse (desktop) + joystick touch, pro alicerce jogável do v3 (D-61). Os joysticks portam FIEL as 3 correções pagas caro na v2 (D-47/48/49)…
- `mat4.js` — mat4 mínimo do motor v3 (D-55) — colunas-major, como o WebGL espera
- `oficina.js` — oficina.js — NÚCLEO + ADAPTADOR v3 da OFICINA (passo 1). Executa a lista de PASSOS de uma peça-objeto e devolve o objeto pronto pro visor. Duas camadas nítid…
- `render.js` — O VISOR do motor v3 (D-55) — o ambiente PADRÃO onde toda peça é criada e auditada: framebuffer fixo (?res) com upscale NEAREST (pixel art, custo independente…
- `som.js` — som.js — áudio 100% sintetizado pro v3 (D-61, porta o D-40/41 da v2: Web Audio pura, zero arquivo no repo — dieta D-30 vale pra áudio também). Dois canais in…
- `somanalise.js` — somanalise.js — a ANÁLISE do som (passo S3.5 da Aba Som): o "ouvido" que faltava. A IA e o usuário não-especialista não ESCUTAM, então o som se prova por MED…
- `somexport.js` — somexport.js — o EXPORTADOR da ABA SOM (S5a, o análogo do passo 10 / D-89 do 3D). Serializa o evento atual do editor ({meta, PARAMS, PASSOS, semente}) numa S…
- `somnucleo.js` — somnucleo.js — NÚCLEO do EVENTO de som (passo 1 da Aba Som). Resolve uma lista de PASSOS (ops do grafo de sinal) num GRAFO em DADOS — nós + arestas + params …
- `somweb.js` — somweb.js — ADAPTADOR do grafo de som -> Web Audio (passo 1 da Aba Som). O par do `adaptarV3` da Oficina: pega o GRAFO em dados que o `somNucleo` resolveu e …
- `tex.js` — helpers de TEXTURA do motor v3 (D-55) — paleta Resurrect64, ruído, dither e o gerador de canvas. Uma peça pode devolver índice da paleta OU [r,g,b] direto (m…
- `vegetacao-cartoon.js` — NÓS v3 — CONSTRUTOR de VEGETAÇÃO CARTOON (D-64), irmão do arvore-cartoon.js. criarVegetacao(ctx) monta as texturas UMA vez e devolve arbusto/flor/tufo, cada …

## prototipos/fps/v3/pecas/

- `_arvformas-mosqueado.js` — scratch: variações de FORMATO de árvore (não versionar/publicar). Builder paramétrico: tronco + copa (oval / cone / multi-blob), rampa de cor por espécie. 6 …
- `_arvformas.js` — scratch: variações de FORMATO de árvore (não versionar/publicar). Builder paramétrico: tronco + copa (oval / cone / multi-blob), rampa de cor por espécie. 6 …
- `_elenco.js` — scratch: ELENCO completo do carimbo — uma de cada espécie em fila, pro ideador ver tudo.
- `_frondosa.js` — scratch: prova de 'seca'/'raiz' (malhas separadas, afiadas) + 'frondosa' (copa fundida). Fila: seca | raiz | 4× frondosa.
- `_modelo.js` — _modelo — o "olá mundo" da OFICINA (D-55): copie este arquivo pra criar uma peça nova. Mostra o contrato inteiro: textura procedural, geometria e ANIMAÇÃO (m…
- `_oficina-anim.js` — PEÇA-EXEMPLO da OFICINA (passo 13a): ANIMAÇÃO RÍGIDA POR PARTE (em laço). Prova o motor novo com movimento ÓBVIO no visor: uma ENGRENAGEM (`roda`) gira em to…
- `_oficina-esqueleto.js` — PEÇA-EXEMPLO da OFICINA (passo 14a): ESQUELETO com DEFORMAÇÃO SUAVE (linear blend skinning). Uma CORRENTE/tentáculo de 3 segmentos (4 anéis de vértices) que …
- `_oficina-materiais.js` — PEÇA-EXEMPLO da OFICINA (passo 12a): MATERIAIS OPACOS. Um toco com BRASA — um cilindro de casca (cor + aspereza) e o topo como brasa que BRILHA (emissivo + s…
- `_oficina-toco.js` — PEÇA-EXEMPLO da OFICINA (passo 1): um toco de árvore descrito 100% como lista de PASSOS e reconstruído por `executar` — prova a cadeia inteira núcleo -> adap…
- `_oficina-transp.js` — PEÇA-EXEMPLO da OFICINA (passo 12b): MATERIAL TRANSPARENTE. Um relicário — um NÚCLEO opaco que BRILHA (brasa: emissivo + semLuz) dentro de uma CASCA de VIDRO…
- `_pinheiros.js` — scratch: variações do PINHEIRO (não versionar/publicar). Mesmo padrão que o ideador aprovou no _arvformas — saias empilhadas (escada) + agulha verde escuro "…
- `_raiz1.js` — scratch: close da RAIZ — tronco ranhurado + pé de raízes liso com sombra (malhas separadas).
- `arco.js` — PEÇA: arco — o ARCO DE ENTRADA reconstruído com GEOMETRIA DE VERDADE (D-62→). No v2 ele era um billboard chapado com PROFUNDIDADE FALSA (b.depth: até 40 fati…
- `arvore-cartoon.js` — PEÇA: arvore-cartoon — a PROVA do carimbo plantável (D-63). Usa o construtor motor/arvore-cartoon.js pra montar um POOL pequeno de variantes (espécie×seed) e…
- `arvore.js` — PEÇA: arvore — o port das ÁRVORES da V2 pro v3 (D-59). O gerador growTree foi trazido FIEL pra motor/arvore.js (extraído, não redigitado). Aqui cada árvore v…
- `arvore3d.js` — PEÇA: arvore3d — experimento "3D-ish" da árvore (D-59→): tronco de verdade (prisma afunilado com casca) + copa feita de VÁRIOS cartões de folhagem agrupados …
- `casa-toras.js` — PEÇA: casa-toras — a cabana de toras aprovada pelo ideador (D-54f). Toras VERTICAIS castanho-mel (tons reais, D-54f), janelas-ABERTURA com moldura+cruzeta+du…
- `ilha-chao.js` — PEÇA: ilha-chao — o primeiro retalho de CHÃO do v3 (port da natureza v2). Ilha flutuante NA ESCALA DA V2 (o mundo é uma grade 64×64 tiles; a ilha tem ~56 uni…
- `vegetacao-cartoon.js` — PEÇA: vegetacao-cartoon — a PROVA da vegetação plantável (D-64). Planta um PRADO cartoon: tufos de grama (assados numa malha por variante -> poucos draws), f…

## prototipos/fps/v3/pecas-som/

- `_agua.js` — PRESET-SOM _agua (Aba Som, S4) — a LAMBIDA de água (onda na margem) re-expressa como GRAFO de evento, com os NÚMEROS do `lambida()` do motor/som.js. Nível FÁ…
- `_bolha.js` — PEÇA-SOM exemplo da Aba Som (passo 1): a BOLHA da água re-expressa como GRAFO de evento — prova que o vocabulário (oscilador + alturaEnv + envelope) faz um s…
- `_passo.js` — PRESET-SOM _passo (Aba Som, S4) — a PISADA re-expressa como GRAFO de evento, com os NÚMEROS já tunados do `passo()`/`PISOS.grama` do motor/som.js. É o nível …
- `_vento.js` — PRESET-SOM _vento (Aba Som, S4) — a RAJADA de vento re-expressa como GRAFO de evento, com os NÚMEROS tunados do vento do motor/som.js. Nível FÁCIL do vocabul…

## scripts/

- `respond-issues.ts` — scripts/respond-issues.ts
- `tick.ts` — scripts/tick.ts
- `validate-worlds.ts` — scripts/validate-worlds.ts

## site/

- `README.md` — Cliente do NÓS — O Coração
- `index.html` — .ts. --> <html lang="pt-BR"> <head>
- `vite.config.ts` — Relative base so the built assets resolve correctly when served from a subpath (https://brigsd.github.io/nos/) as well as from the filesystem root used by `v…

## site/qa/

- `live-check.html` — QA harness do live.ts (R5): checagem manual da atualização ao vivo do mundo no cliente 2D.
- `live-check.mjs` — site/qa/live-check.mjs
- `live-indicator-screenshot.mjs` — site/qa/live-indicator-screenshot.mjs
- `live-indicator-states.html` — Preview dos estados do live-indicator (R5, QA): cada estado do indicador renderizado estático.
- `oficinas-screenshot.mjs` — site/qa/oficinas-screenshot.mjs
- `p2p-screenshot.mjs` — site/qa/p2p-screenshot.mjs
- `portals-screenshot.mjs` — site/qa/portals-screenshot.mjs
- `screenshot.mjs` — site/qa/screenshot.mjs
- `zoom-screenshot.mjs` — site/qa/zoom-screenshot.mjs

## site/scripts/

- `build-fps.mjs` — scripts/build-fps.mjs
- `copy-data.mjs` — scripts/copy-data.mjs

## site/src/

- `auth-ui.ts` — src/auth-ui.ts
- `auth.ts` — src/auth.ts
- `camera.ts` — src/camera.ts
- `config.ts` — src/config.ts
- `hash.ts` — src/hash.ts
- `input.ts` — src/input.ts
- `live-indicator.ts` — src/live-indicator.ts
- `live.ts` — src/live.ts
- `main.ts` — src/main.ts
- `meu-no.ts` — src/meu-no.ts
- `mural.ts` — src/mural.ts
- `nativos.ts` — src/nativos.ts
- `oficinas.ts` — src/oficinas.ts
- `p2p-signaling.ts` — src/p2p-signaling.ts
- `p2p-ui.ts` — src/p2p-ui.ts
- `p2p.ts` — src/p2p.ts
- `player.ts` — LocalPlayer: estado e interpolação do avatar local no cliente 2D (tile + posição visual).
- `portals.ts` — src/portals.ts
- `renderer-webgl.ts` — src/renderer-webgl.ts
- `renderer.ts` — src/renderer.ts
- `sprites.ts` — src/sprites.ts
- `trade.ts` — src/trade.ts
- `world.ts` — src/world.ts

## tools/

- `README.md` — tools/ — as ferramentas do coder (o lar unificado)
- `servir.mjs` — servir.mjs — servidor de DESENVOLVIMENTO da Oficina (passo 10). Faz duas coisas: (1) serve `prototipos/fps/v3/` ESTÁTICO com `Cache-Control: no-store` — mata…

## tools/art-mcp/

- `README.md` — art-mcp — estúdio de arte sistematizado do NÓS
- `art-toolkit.test.ts` — Vitest do art-toolkit (tools/art-mcp): a lib do estúdio de arte (paleta, camadas, export).
- `cli.cjs` — CLI fallback for the art toolkit — same functions as the MCP server, for shells and CI. Usage:
- `server.cjs` — Minimal MCP (Model Context Protocol) server over stdio — zero npm deps, same constraint as the rest of assets/tools. Speaks JSON-RPC 2.0, one message per lin…
- `toolkit.cjs` — The toolkit facade: every capability as a plain function taking/returning JSON-able values + file paths. Both the CLI and the MCP server are thin wrappers ov…

## tools/art-mcp/lib/

- `font.cjs` — 3x5 alphanumeric dev-label font for audit views (extends the digits-only assets/tools/lib/font3x5.cjs idea to A-Z). Tool labels only, never in-game. /
- `lints.cjs` — Algorithmic pixel-art critic: the formalizable rules of the discipline, run against sprite-src matrices (palette indices). Each check returns findings {level…
- `noise.cjs` — Deterministic, dependency-free noise primitives for the parametric texture generators. Everything is seeded by string — same seed, same texture, forever (the…
- `preview3d.cjs` — In-engine preview: renders candidate FPS art exactly as the raycaster prototype would show it (prototipos/fps/nos-fps.html on branch claude/fps-prototipo). T…
- `texgen.cjs` — Parametric, tileable FPS wall-texture generators ("program the painter").
- `turntable.cjs` — 8-direction turnaround proxies: model a character as a handful of axis- aligned boxes ("boneco de caixas" — proportion and pose only), rasterize it from 8 ya…
- `views.cjs` — Audit views: renders meant for a multimodal reviewer's eyes. All output is PNG via the project's zero-dep encoder.

## tools/bancadas/

- `analisar.mjs` — analisar.mjs — a bancada do OUVIDO da Aba Som (passo S3.5): o "cmp de medida do som". O par do `sintetizar.mjs` (que prova o REPLAY), mas aqui a prova é a AN…
- `auditar.mjs` — auditar.mjs — o GATE de senso crítico [cpu] numa peça REAL (D-60). Roda os críticos validados pelo benchmark (lint-de-malha, distancia-paleta, seam, banding,…
- `executar.mjs` — executar.mjs — a bancada do REPLAY da OFICINA (passo 1), sem browser. Roda a lista de PASSOS de uma peça, serializa a lista, re-parseia e re-executa, e afirm…
- `jogar.mjs` — jogar.mjs — o olho do ALICERCE jogável do v3 (D-61).
- `oficina.mjs` — oficina.mjs — a bancada da CÂMERA DO EDITOR + OVERLAY DA MALHA + ARRASTO DE VÉRTICE (Oficina, passos 2-4).
- `olhar-peca.mjs` — olhar-peca.mjs — o olho da OFICINA (D-55).
- `olhar.mjs` — olhar.mjs — o olho do coder (D-35).
- `ouvir.mjs` — ouvir.mjs — os ouvidos do coder (D-40).
- `porteiro.mjs` — porteiro.mjs — o GATE de render da OFICINA (D-60). Renderiza peça(s) do v3 e FALHA (exit≠0) se: houve pageerror, window.__ready ≠ true, ou o frame é DEGENERA…
- `prancheta.mjs` — prancheta.mjs — a câmera de topo do coder (D-50, pedido do ideador).
- `res-bench.mjs` — res-bench.mjs — experimento B do D-44: o custo real de subir a resolução INTERNA do render (a alavanca ?res=). Para cada degrau, mede o FPS de verdade (conta…
- `sintetizar.mjs` — sintetizar.mjs — a bancada do REPLAY da ABA SOM (passo 1), o "cmp de pixel do som". O par do `executar.mjs` (que prova o replay da Oficina em Node), mas aqui…
- `somab.mjs` — somab.mjs — o A/B do SOM (S5b, o FECHO do ouvido da Aba Som): compara o passo REAL do jogo (a síntese granular do motor/som.js) com o preset `_passo` (pecas-…
- `somexportar.mjs` — somexportar.mjs — a bancada do EXPORTAR da ABA SOM (S5a), o análogo sonoro do passo 10 do 3D. Sobe o `som.html` num Chromium headless (Playwright, gestos REA…
- `somtela.mjs` — somtela.mjs — a bancada da ABA SOM. Sobe o `som.html` num Chromium headless (Playwright) e PROVA, com números, o que dá pra verificar sem alto-falante. Cobri…

## tools/bancadas/bench/

- `benchmark.mjs` — benchmark.mjs — mede QUAIS ferramentas de senso crítico ajudam (D-60). Casos = peças reais × (limpo + cada defeito plantado). Separa NÚCLEO (defeito real/óbv…
- `mutacoes.mjs` — mutacoes.mjs — DEFEITOS PLANTADOS pro benchmark de senso crítico (D-60). Cada mutação injeta UM defeito de UM domínio numa peça recém-construída (aplicada em…
- `pngstats.mjs` — pngstats.mjs — decodifica um PNG (8-bit, colortype 2/6) via zlib e devolve estatística barata do frame: nº de cores distintas (amostradas), fração da cor dom…
- `sandbox.mjs` — sandbox.mjs — roda o construir() de uma peça v3 em NODE PURO, sem browser. Um canvas-stub mínimo cobre o texCanvas/bufToCanvas (só usam createImageData/ put/…

## tools/bancadas/bench/tools/

- `contador-de-pixels-orfaos.mjs` — contador-de-pixels-orfaos [orfaos] — caça pixel ÓRFÃO na textura: componente conexo de 1px (sem vizinho igual em 8-viz), de uma cor RARA no tile, que destoa …
- `detector-de-banding.mjs` — detector-de-banding [banding] — dois defeitos de textura que o olho pega mas nenhuma checagem de malha vê: (a) FAIXA CHAPADA — uma faixa horizontal de UMA co…
- `detector-de-seam.mjs` — detector-de-seam [seam] — numa textura que LADRILHA, a borda oposta deve casar (wrap): direita↔esquerda, topo↔base. O defeito plantado troca uma LINHA/COLUNA…
- `distancia-paleta.mjs` — distancia-paleta [paleta] — conformidade de cor à Resurrect64 em espaço perceptual (CIEDE2000 offline, sem libs). Cada pixel deve estar perto de alguma cor d…
- `lint-malha.mjs` — lint-de-malha [malha] — checagem-CPU da geometria antes do render: triângulo degenerado, vértice NaN/Inf/gigante, normal zero/não-unitária, stride/contagem e…

## tools/mapa/

- `mapa.mjs` — mapa.mjs — gera docs/MAPA.md: a árvore do repositório com o resumo de cada arquivo. O resumo NÃO mora aqui: mora no PRÓPRIO arquivo (primeiro comentário de c…
- `toc.mjs` — toc.mjs — gera o índice (sumário) de um doc ENTRE os marcadores <!-- TOC --> e <!-- /TOC -->, a partir dos títulos `##` dele. Mesma filosofia do mapa: o índi…

## tools/oficina/

- `oficina.test.ts` — Vitest do NÚCLEO da OFICINA (passo 1): prova os invariantes de identidade — numeração determinística e POSICIONAL (re-rodar dá ids idênticos), identidade est…

## tools/som/

- `som.test.ts` — Vitest do NÚCLEO da ABA SOM (passo 1), SEM browser: prova os invariantes do grafo de som em dados — resolução de nome->número por PARAMS, identidade por `id`…
- `somanalise.test.ts` — Vitest do módulo de ANÁLISE do som (S3.5), SEM browser: prova o "ouvido" (motor/somanalise.js) em sinais SINTÉTICOS gerados aqui na mão (Math.sin), sem Web A…
- `somexport.test.ts` — Vitest do EXPORTADOR da ABA SOM (S5a), SEM browser: prova a camada de DADOS da serialização — que a STRING .js de um evento-som REABRE o MESMO grafo (somCano…
