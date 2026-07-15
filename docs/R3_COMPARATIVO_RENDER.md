# R3 — Comparativo canvas 2D vs. PixiJS (WebGL) + protótipo de janela WebGL

> Trilho R3 do coder (D-24). Meta: decidir a janela de renderização futura do NÓS com EVIDÊNCIA, mirando luz
> estilo Eastward/Octopath Traveler sobre a nossa arte pixel 16×16 Resurrect-64 (D-25e), sem tocar o contrato
> de mundo (`world/heart.json`, `engine/schema/`) — a janela é descartável, o mundo não.

## O que foi construído

Um protótipo isolado em `site/gl/` (próprio `index.html`, próprio `vite.config` — `site/gl.vite.config.ts` —,
não entra no build/typecheck do site ao vivo) que renderiza **o mesmo `world/heart.json`** (cópia local, o
mesmo arquivo que `scripts/copy-data.mjs` já publica em `site/public/world/`) de duas formas alternáveis em
tempo real, sem recarregar a página:

- **(a) Canvas 2D** — cópia adaptada de `site/src/renderer.ts` (tiles, margem d'água, Núcleo pulsante,
  Nativos, jogadores), com uma camada de luz nova por cima: tint ambiente dia/noite (`multiply`), brilho
  quente no amanhecer/anoitecer, luz pontual e um *bloom* de um único sprite via `ctx.filter = 'blur()'`.
- **(b) PixiJS v8 (WebGL)** — cena equivalente com *sprite batching* nativo do Pixi, luz ambiente + pontual
  pulsando com o Núcleo, ciclo dia/noite dirigido por `world.meta.worldTime`, *shimmer* de água via shader
  GLSL customizado (distorção de UV + faixa especular), e um *pass* opcional de CRT/scanline + bloom
  (`BlurFilter` do próprio core do Pixi, sem dependência extra).
- Escala em pixel-perfect (`nearest`/sem suavização) nos dois lados.
- Um modo de **estresse sintético determinístico** (`gl/stress.ts`) — posições geradas por hash
  (`gl/hash.ts`, mesmo mixer do `site/src/hash.ts`), **sem `Math.random`** — para medir 1.000/5.000/10.000
  sprites de forma reprodutível.
- `window.glProto`: API exposta pelo protótipo para automação (Playwright troca renderer/cena/contagem/hora
  do dia sem recarregar a página e lê FPS/heap diretamente).

Arquivos principais: `site/gl/main.ts` (orquestração), `site/gl/canvas-world.ts` +
`site/gl/canvas-stress.ts` (lado Canvas2D), `site/gl/pixi-world.ts` + `site/gl/pixi-stress.ts` +
`site/gl/pixi-filters.ts` (lado PixiJS), `site/gl/daynight.ts` (curva dia/noite compartilhada pelos dois
lados — nenhum dos dois ganha uma curva mais fácil), `site/gl/qa/bench-and-screens.mjs` (FPS/memória/
screenshots) + `site/gl/qa/bundle-pixi-isolated.mjs` (peso isolado do PixiJS tree-shaken).

## Metodologia (leia antes dos números)

- **Ambiente sem GPU real.** O sandbox onde isto rodou não tem GPU; o Chromium headless
  (`/opt/pw-browsers/chromium`, versão 141.0.7390.37) usa **SwiftShader** — `ANGLE (Google, Vulkan 1.3.0
  (SwiftShader Device (Subzero)), SwiftShader driver)` —, ou seja, o WebGL inteiro é emulado por software na
  CPU (4 vCPUs disponíveis). Isso muda o caráter do teste: numa GPU de verdade, o Pixi paraleliza
  *batching*/shaders no hardware; aqui, ele paga o *overhead* da API WebGL **e** ainda faz raster por
  software — uma combinação que não existe em produção. Os números absolutos abaixo são um **piso
  conservador para o PixiJS**, não uma previsão de desempenho em dispositivo real. Ver "O que isto não prova"
  mais abaixo.
- **Amostragem robusta.** Uma janela única de medição (ex.: 3s) mostrou-se frágil neste sandbox — uma única
  pausa de GC em qualquer ponto derruba a média inteira e chegou a produzir números não-monotônicos (10.000
  sprites "mais rápido" que 5.000, fisicamente sem sentido). Corrigido: cada cenário faz 1,5s de aquecimento
  (descartado) + **6 janelas de 1s**, e o número reportado é a **mediana** dessas 6 (p95 reportado é o pior
  valor observado entre as 6 janelas, não a mediana — é a cauda que importa para "engasgo perceptível").
- **Sem rede externa.** Servidor estático local (`site/gl/qa/bench-and-screens.mjs` sobe um `http.Server` em
  `127.0.0.1`) servindo o build de produção (`npm run build:gl`); o protótipo só busca
  `./world/heart.json` local (`gl/world-load.ts`), nunca `raw.githubusercontent.com`.
- **Bug real encontrado e corrigido durante a medição** (documentado porque é sinal de que os números vieram
  de teste de verdade, não de suposição): a primeira versão media o Pixi com a luz do Núcleo praticamente
  invisível à noite — a camada de tint ambiente (`multiply`) estava sendo desenhada **depois** da camada de
  brilho aditivo no `stageRoot`, apagando a luz que deveria "furar" o escuro. Reordenado (`gl/pixi-world.ts`,
  ver comentário no construtor de `PixiWorldScene`) para bater com a ordem do Canvas: cena base → tint →
  brilho quente → luz aditiva → bloom. Também foi encontrado e corrigido um bug de CSS
  (`.status[hidden]` faltando — o mesmo padrão que `site/src/style.css` já tinha) que fazia os screenshots
  saírem em branco mesmo com o canvas desenhando corretamente por baixo.

## Números

### FPS — estresse sintético (1k/5k/10k sprites, hash-determinístico)

| Sprites | Canvas 2D — fps (méd./p95 ms) | PixiJS (`ParticleContainer`) — fps (méd./p95 ms) |
|---:|---|---|
| 1.000  | **60,7** fps (16,5 / 33,2 ms) | 60,8 fps (16,4 / 16,8 ms) |
| 5.000  | **45,6** fps (21,9 / 33,4 ms) | 31,1 fps (32,2 / 50,0 ms) |
| 10.000 | **24,7** fps (40,5 / 66,7 ms) | 18,8 fps (53,2 / 83,3 ms) |

Neste sandbox (software-GL), o Canvas 2D venceu em throughput bruto de sprites em todas as contagens — o
oposto do que a literatura/benchmarks do próprio PixiJS mostram em GPU real. Ver a ressalva de metodologia:
o `ParticleContainer` reenvia um buffer de posições à GPU a cada frame, e sob rasterização por software esse
upload custa mais do que o simples `drawImage` do Canvas2D — que os navegadores otimizam há 15+ anos.

### FPS — cena real (mapa 64×64 d'O Coração + Nativos + jogador, luz completa)

| Cena | fps (méd./p95 ms) |
|---|---|
| Canvas · dia | **20,0** fps (50,1 / 83,4 ms) |
| Canvas · noite | **21,2** fps (47,2 / 100,0 ms) |
| PixiJS · dia | 11,0 fps (90,7 / 133,3 ms) |
| PixiJS · noite | 11,5 fps (86,6 / 133,4 ms) |
| PixiJS · noite + CRT | 9,8 fps (102,1 / 150,0 ms) |

Mesma leitura: neste ambiente, a pilha de filtros do Pixi (blur do bloom + shader de água + CRT opcional)
custa caro sob raster por software (cada filtro é um *render-to-texture* extra). O mapa real d'O Coração tem
só 4.096 tiles e hoje ~4 entidades em tela (1 jogador + 3 Nativos) — muito abaixo da escala em que
batching costuma compensar.

### Memória (heap JS usado, `CDP Performance.getMetrics`)

| Momento | Canvas 2D | PixiJS |
|---|---|---|
| Baseline (recém-carregado) | 9,5 MB | 9,5 MB |
| Estresse 1.000 | 9,1 MB | 10,6 MB |
| Estresse 5.000 | 11,2 MB | 10,3 MB |
| Estresse 10.000 | 16,3 MB | 11,5 MB |
| Mundo real · dia | 11,5 MB | 13,6 MB |
| Mundo real · noite | 11,5 MB | 14,2 MB |

PixiJS carrega ~2–4 MB a mais de estruturas internas (texturas GPU-side, buffers de partícula, cache de
shader) mesmo em cenas pequenas — custo esperado de qualquer motor WebGL. Nenhum dos dois mostrou sinal de
vazamento crescente entre 1k→10k (a variação é ruído de GC, não uma curva monotônica clara; no Canvas2D a
alta em 10k reflete o array de 10 mil objetos `StressSprite` em si, não um vazamento).

> Números regenerados em 2026-07-15 após o merge de `origin/main` (R2 login GitHub + batidas #38/#39) para
> dentro deste branch — rodar `node gl/qa/bench-and-screens.mjs` de novo produz variação de ruído de
> ±10–15% (natural neste sandbox sem GPU, ver metodologia), não uma mudança de leitura qualitativa: Canvas2D
> segue à frente em throughput bruto neste ambiente em toda a bateria, por uma margem parecida.

### Carregamento e bundle

| Métrica | Valor |
|---|---|
| Tempo até interativo (`window.glProto.ready`), servidor estático local | **828 ms** (uma medição; inclui fetch do `world/heart.json`, decode de todos os PNGs dos dois renderers, init do `Application`/contexto WebGL) |
| `site/gl/` build de produção completo (os dois renderers + todos os efeitos + os *hooks* de automação, `npm run build:gl`) | 595,5 kB bruto / **177,7 kB gzip** (15 chunks — o próprio Pixi separa sua árvore de extensões) |
| PixiJS v8 isolado — só as exportações que este protótipo importa (`Application`, `Assets`, `BlurFilter`, `Container`, `Filter`, `GlProgram`, `Graphics`, `Particle`, `ParticleContainer`, `Rectangle`, `Sprite`, `Text`, `TextStyle`, `Texture`), *tree-shaken*, build de biblioteca ES module minificado (`gl/qa/bundle-pixi-isolated.mjs`) | 304,2 kB bruto / **75,8 kB gzip** |
| Canvas2D — não precisa de biblioteca nenhuma: é API nativa do navegador | **0 kB**, sempre (o que `site/gl/canvas-world.ts` etc. pesam é código de aplicação normal, não uma dependência) |
| Para contexto: bundle JS do site ao vivo hoje (`site/src`, `npm run build` em `site/`, já com R2/login GitHub mesclado) | 29,5 kB bruto / **10,4 kB gzip** |

Duas leituras de "taxa do PixiJS", conforme o cenário:
- **Se o protótipo inteiro fosse publicado como está** (os dois renderers, carregados juntos, sem *code-split*):
  177,7 kB gzip − 10,4 kB gzip do site atual ≈ **+167 kB gzip**, ~17× o peso de hoje. Este NÃO é o cenário
  recomendado (ver plano de migração) — está aqui só como o piso "sem nenhuma otimização".
- **Cenário realista do plano de migração** (`import()` dinâmico, só a árvore do Pixi carrega, só quando o
  jogador liga a janela WebGL): **~76 kB gzip**, medido isolando exatamente os símbolos usados (tabela acima)
  num build de biblioteca ES module — o mesmo formato de chunk que uma `import()` dinâmica gera de verdade
  num build Vite, ao contrário de um teste IIFE avulso (a primeira tentativa deste teste, descartada, media
  ~58 kB gzip em IIFE — o formato ES preserva mais estrutura de módulo e é o número que corresponde ao que
  o navegador de fato baixaria).

Um download de ~76 kB gzip é real, mas é **único e cacheável** (o navegador baixa uma vez, não por
batida/sessão) e **opt-in** (quem nunca liga a janela WebGL nunca paga nada) — bem diferente de multiplicar
o peso do site inteiro por 17× para todo mundo.

## Screenshots

Lado a lado, mesma cena (`world/heart.json` ao vivo, batida #39), 1280×800, em
[`site/qa/r3/`](../site/qa/r3/):

| | Dia | Noite |
|---|---|---|
| **Canvas 2D** | [`canvas-day.png`](../site/qa/r3/canvas-day.png) | [`canvas-night.png`](../site/qa/r3/canvas-night.png) |
| **PixiJS (WebGL)** | [`pixi-day.png`](../site/qa/r3/pixi-day.png) | [`pixi-night.png`](../site/qa/r3/pixi-night.png) |

Bônus — PixiJS à noite com o *pass* de CRT/scanline ligado (mostra a pilha completa de efeitos):
[`pixi-night-crt.png`](../site/qa/r3/pixi-night-crt.png).

O que dá pra ver comparando:
- **Luz pontual + ambiente**: os dois ficam bem parecidos — Canvas2D consegue aproximar isso razoavelmente
  bem com gradiente radial + `globalCompositeOperation`. Essa parte **não** é um diferencial forte do Pixi.
- **Água**: no PixiJS há faixas especulares diagonais nitidamente animadas (o shader de *shimmer*
  distorcendo UV + destaque móvel) — no Canvas2D a água é só o *flipbook* de 2 frames que já existia
  (`agua_ondula_2frames.png`), sem distorção nenhuma. Essa é a diferença mais visível dos dois.
- **Bloom/CRT**: o Canvas2D consegue um bloom pobre-mas-honesto num único sprite (o Núcleo) via
  `ctx.filter = 'blur()'`; **não dá pra generalizar isso** para várias fontes de brilho sem pagar um
  `blur()` por fonte. O CRT/scanline nem foi tentado no Canvas2D — exigiria reler e reescrever os pixels do
  frame inteiro a cada frame (`getImageData`/`putImageData`), o que é proibitivamente caro pelo que se ganha.
  No PixiJS os dois são *passes* de shader de custo fixo, independente de quantos objetos existem na cena.

## Prós e contras

### Canvas 2D (atual)

**Prós**
- Já está em produção, testado, zero dependência nova, bundle mínimo (10,4 kB gzip de JS hoje).
- Mais rápido *neste ambiente de teste* em toda a bateria (mas leia a ressalva — GPU real provavelmente
  inverte isso em cenas com muitos sprites).
- API simples, qualquer contribuidor lê `drawImage`/`fillRect` sem curva de aprendizado.
- Consegue aproximar luz ambiente + pontual de forma decente (gradientes + composite operations).

**Contras**
- Sem shader de verdade: água com distorção real, CRT/scanline e bloom-em-várias-fontes não são
  praticáveis sem reler pixels manualmente — caro e mal-encaixado na API.
- Sem *scene graph*/*batching* nativo: cada sprite é uma chamada `drawImage` própria; culling manual
  (`tileMinX..tileMaxX`) é responsabilidade do código do renderer, não do motor.
- `ctx.filter = 'blur()'` (usado aqui para o bloom) tem custo por chamada que não escala bem para várias
  fontes de brilho simultâneas.

### PixiJS v8 (WebGL)

**Prós**
- Shaders GLSL customizados de verdade (água, CRT) a custo fixo por *pass*, independente da contagem de
  objetos — o único jeito prático de chegar à luz "Eastward/Octopath" que é a meta visual do R3.
- *Scene graph* com transformação de câmera única (`Container.scale`/`.position`) em vez de recalcular
  coordenadas de tela por tile a cada frame — menos código de "cola" no renderer.
- *Batching* automático de sprites que compartilham textura; `ParticleContainer` dedicado para contagens
  grandes de sprites dinâmicos.
- Filtros prontos no próprio core (`BlurFilter`, `ColorMatrixFilter`, `NoiseFilter`) sem dependência extra
  além do `pixi.js` em si.
- Ecossistema maduro (v8 é API estável, TypeScript nativo, documentação extensa) — não é uma aposta em
  ferramenta nova/frágil.

**Contras**
- ~76 kB gzip a mais no bundle no cenário realista de `import()` dinâmico (medido, ver tabela) — um baque
  real para um site que hoje pesa 10,4 kB gzip, mesmo sendo *opt-in* e cacheável.
- Mais lento *neste sandbox de teste* em toda a bateria — precisa de validação em dispositivo real antes de
  virar a recomendação padrão (ver "O que isto não prova").
- Mais uma dependência externa (ainda que popular e madura) — contra a filosofia "o mais enxuto possível"
  do projeto, embora não viole D-03 (continua rodando 100% no navegador do jogador, sem servidor).
- Curva de aprendizado extra: `Filter`/`GlProgram`/GLSL, `ParticleContainer` vs. `Container` normal,
  *blend modes* — não é tão direto quanto `drawImage`.

## O que isto não prova (leia antes de decidir)

1. **Este sandbox não tem GPU.** O resultado "Canvas2D mais rápido que PixiJS" é bem provavelmente um
   artefato do SwiftShader (raster por software) somado ao overhead da própria API WebGL — em qualquer
   desktop ou celular com GPU real (mesmo integrada, mesmo um celular médio de 2020+), o consenso da
   indústria e os próprios benchmarks do PixiJS mostram o oposto a partir de milhares de sprites. **Não
   tenho como confirmar isso empiricamente aqui.** Recomendo 5 minutos de teste manual num navegador de
   verdade (`cd site && npm run build:gl && npm run preview -- --outDir dist-gl`, ou servir `dist-gl/`
   direto) antes de qualquer decisão que dependa do argumento de performance.
2. **A escala real d'O Coração hoje é pequena.** ~4 entidades em tela, mapa fixo de 4.096 tiles. Nem
   Canvas2D nem PixiJS têm dificuldade nenhuma nessa escala — o argumento de FPS praticamente não se aplica
   *hoje*. Ele passa a importar se/quando o jogo crescer (mais jogadores simultâneos, partículas de
   fabricação — D-23/R4, efeitos de portal — R6).

## Recomendação

**Adotar a janela PixiJS — mas como upgrade opt-in/lazy-loaded, com o Canvas2D permanecendo o padrão e o
fallback permanente**, não uma troca completa imediata.

Por quê:
- O argumento decisivo **não é performance** (os números daqui não a sustentam, e a razão é conhecida — ver
  acima). O argumento decisivo é **visual**: a meta explícita do R3 é luz "Eastward/Octopath" sobre a arte
  atual, e a diferença que mais aparece nos screenshots (água com movimento real, bloom que generaliza, CRT
  como *pass* de custo fixo) só é praticável com shaders — ou seja, só com WebGL. Ambiente e luz pontual o
  Canvas2D já resolve razoavelmente; é exatamente a parte que os screenshots mostram como **mais parecida**
  entre os dois.
- O custo de bundle (~76 kB gzip no cenário realista de `import()` dinâmico, ver tabela) é real mas
  administrável: é *um* download cacheável, não um custo por batida/tick, e só é pago por quem liga a janela
  WebGL (ver plano abaixo) — quem nunca liga nunca baixa nada a mais.
- Manter o Canvas2D como padrão evita apostar a experiência de TODOS os jogadores (incluindo celulares mais
  fracos/mais antigos) numa mudança cuja vantagem de performance não pôde ser confirmada neste ambiente.

## Esboço do plano de migração (incremental, atrás do mesmo contrato de mundo)

O contrato (`World` de `engine/types.ts`, `world/heart.json`) não muda em nenhuma etapa — é exatamente o que
o R3 pediu para proteger. Passos, cada um shippable e revertível sozinho:

1. **Extrair uma interface `Renderer`** em `site/src/` (`drawFrame(world, camera, ...)`) que
   `renderer.ts` atual já implementa implicitamente — só nomear o contrato, sem mudar comportamento.
   PR pequeno, zero risco visual.
2. **Portar a cena Pixi já validada aqui** (`gl/pixi-world.ts` + `gl/pixi-filters.ts`) para
   `site/src/renderer-webgl.ts`, implementando a mesma interface. `pixi.js` entra como dependência de
   produção do `site/`, mas **importado via `import()` dinâmico** dentro de `main.ts` — só baixado quando o
   jogador liga a janela WebGL, nunca no carregamento padrão.
3. **Flag de jogador**, não decisão do código: um toggle "gráficos" persistido em `localStorage` (mesmo
   padrão do `nos_login`/`nos_username` já usado em `site/src/player.ts`), com Canvas2D como valor padrão.
   Sem *login*/conta nenhuma envolvida — é só uma preferência local de cliente.
4. **Validar em dispositivo real** antes de considerar trocar o padrão: abrir em um desktop e um celular de
   verdade, comparar FPS/bateria/estabilidade de contexto WebGL (perda de contexto ao minimizar é um risco
   conhecido em Android mais fraco). Só depois disso reavaliar se o padrão muda de Canvas2D para PixiJS.
5. **Água, luz e bloom entram primeiro**; CRT/scanline fica opcional/configurável (é o efeito mais "de
   gosto", menos ligado à meta de luz em si).
6. Nenhuma etapa acima toca `engine/`, `world/heart.json` ou os workflows — só `site/`.

## Reproduzir

```bash
cd site
npm install                            # instala pixi.js (pinned 8.19.0) além das deps existentes
npm run build:gl                       # build de produção do protótipo em site/dist-gl/
node gl/qa/bench-and-screens.mjs       # bateria de FPS + memória + screenshots, escreve site/qa/r3/
node gl/qa/bundle-pixi-isolated.mjs    # mede o peso isolado do PixiJS tree-shaken (linha da tabela acima)
```

Requer Chromium em `/opt/pw-browsers/chromium` (o mesmo usado por `site/qa/screenshot.mjs`). Nenhum dos dois
scripts faz chamada de rede externa — `bench-and-screens.mjs` serve `site/dist-gl/` localmente e só lê a
cópia local de `world/heart.json`; `bundle-pixi-isolated.mjs` só invoca a API de build do Vite já instalado
localmente.

Os números acima (FPS, memória, bundle) foram regenerados em 2026-07-15, já com o branch atualizado a partir
de `origin/main` (ver histórico de commits) — rodar de novo neste ou em outro ambiente vai variar (sobretudo
os números absolutos de FPS, por causa do sandbox sem GPU — ver metodologia), mas a comparação relativa
Canvas2D vs. PixiJS deve se manter na mesma direção enquanto rodar em CPU/software-GL.
