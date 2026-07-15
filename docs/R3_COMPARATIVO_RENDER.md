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
lados — nenhum dos dois ganha uma curva mais fácil), `site/gl/qa/bench-and-screens.mjs` (medição +
screenshots).

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
| 1.000  | **60,9** fps (16,4 / 16,8 ms) | 58,9 fps (17,0 / 33,4 ms) |
| 5.000  | **33,8** fps (29,6 / 50,1 ms) | 27,3 fps (36,7 / 50,1 ms) |
| 10.000 | **20,5** fps (48,8 / 66,8 ms) | 16,2 fps (61,8 / 116,8 ms) |

Neste sandbox (software-GL), o Canvas 2D venceu em throughput bruto de sprites em todas as contagens — o
oposto do que a literatura/benchmarks do próprio PixiJS mostram em GPU real. Ver a ressalva de metodologia:
o `ParticleContainer` reenvia um buffer de posições à GPU a cada frame, e sob rasterização por software esse
upload custa mais do que o simples `drawImage` do Canvas2D — que os navegadores otimizam há 15+ anos.

### FPS — cena real (mapa 64×64 d'O Coração + Nativos + jogador, luz completa)

| Cena | fps (méd./p95 ms) |
|---|---|
| Canvas · dia | **17,7** fps (56,6 / 100,1 ms) |
| Canvas · noite | **18,1** fps (55,2 / 116,8 ms) |
| PixiJS · dia | 9,9 fps (101,0 / 200,0 ms) |
| PixiJS · noite | 10,7 fps (93,9 / 150,0 ms) |
| PixiJS · noite + CRT | 9,1 fps (109,6 / 166,7 ms) |

Mesma leitura: neste ambiente, a pilha de filtros do Pixi (blur do bloom + shader de água + CRT opcional)
custa caro sob raster por software (cada filtro é um *render-to-texture* extra). O mapa real d'O Coração tem
só 4.096 tiles e hoje ~4 entidades em tela (1 jogador + 3 Nativos) — muito abaixo da escala em que
batching costuma compensar.

### Memória (heap JS usado, `CDP Performance.getMetrics`)

| Momento | Canvas 2D | PixiJS |
|---|---|---|
| Baseline (recém-carregado) | 9,5 MB | 9,5 MB |
| Estresse 1.000 | 8,5 MB | 13,4 MB |
| Estresse 5.000 | 9,0 MB | 10,4 MB |
| Estresse 10.000 | 10,6 MB | 11,7 MB |
| Mundo real · dia | 11,5 MB | 13,8 MB |
| Mundo real · noite | 11,5 MB | 13,9 MB |

PixiJS carrega ~2–4 MB a mais de estruturas internas (texturas GPU-side, buffers de partícula, cache de
shader) mesmo em cenas pequenas — custo esperado de qualquer motor WebGL. Nenhum dos dois mostrou sinal de
vazamento crescente entre 1k→10k (a variação é ruído de GC, não uma curva monotônica clara).

### Carregamento e bundle

| Métrica | Valor |
|---|---|
| Tempo até interativo (`window.glProto.ready`), servidor estático local | **498 ms** (uma medição; inclui fetch do `world/heart.json`, decode de todos os PNGs dos dois renderers, init do `Application`/contexto WebGL) |
| `site/gl/` build de produção completo (os dois renderers + todos os efeitos, `npm run build:gl`) | 595,5 kB bruto / **177,7 kB gzip** (~15 chunks — o próprio Pixi separa sua árvore de extensões) |
| PixiJS v8 isolado — só as exportações que este protótipo importa (`Application`, `Assets`, `BlurFilter`, `Container`, `Filter`, `GlProgram`, `Graphics`, `Particle`, `ParticleContainer`, `Rectangle`, `Sprite`, `Text`, `TextStyle`, `Texture`), build single-file minificado | 751,8 kB bruto / **190,1 kB gzip** |
| Equivalente Canvas2D isolado (mesma superfície funcional, sem PixiJS), build single-file minificado | 11,9 kB bruto / **4,15 kB gzip** |
| **"Taxa" do PixiJS** (delta) | **~186 kB gzip** |
| Para contexto: bundle do site ao vivo hoje (`site/src`, `npm run build` em `site/`) | 21,9 kB bruto / **8,06 kB gzip** |

Adotar PixiJS por inteiro multiplicaria o JS do site por ~20–25×. É um custo real para um projeto cuja tese
(D-03) é ficar magro e 100% GitHub — mas é um download **único e cacheável** (o navegador baixa uma vez, não
por batida/sessão), e pode ser adiado via `import()` dinâmico só quando a janela WebGL é de fato escolhida
(ver plano de migração).

## Screenshots

Lado a lado, mesma cena (`world/heart.json` ao vivo, batida #37), 1280×800, em
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
- Já está em produção, testado, zero dependência nova, bundle mínimo (8 kB gzip hoje).
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
- ~186 kB gzip a mais no bundle (medido, ver tabela) — um baque real para um site que hoje pesa 8 kB gzip.
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
- O custo de bundle (~186 kB gzip) é real mas administrável: é *um* download cacheável, não um custo por
  batida/tick, e pode ser adiado via `import()` dinâmico (ver plano abaixo) — quem nunca liga a janela WebGL
  nunca paga o custo.
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
npm install                       # instala pixi.js (pinned 8.19.0) além das deps existentes
npm run build:gl                  # build de produção do protótipo em site/dist-gl/
node gl/qa/bench-and-screens.mjs  # roda a bateria de FPS + memória + screenshots, escreve site/qa/r3/
```

Requer Chromium em `/opt/pw-browsers/chromium` (o mesmo usado por `site/qa/screenshot.mjs`). O script não
faz nenhuma chamada de rede externa — serve `site/dist-gl/` localmente e só lê a cópia local de
`world/heart.json`.
