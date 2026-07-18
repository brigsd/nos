# tools/ — as ferramentas do coder (o lar unificado)

Tudo que ajuda a **criar, ver e medir** o NÓS mora aqui. Índice de invocação
rápida (npm scripts + o quê): `docs/RECURSOS.md`. Guia de método: `docs/CODER.md`.

```
tools/
  art-mcp/     Estúdio de ARTE — pixel art como código: gerar → OLHAR → auditar →
               preview in-engine → turnaround. Paleta Resurrect 64. README próprio.
  bancadas/    As BANCADAS de auditoria do cliente FPS (Playwright headless, offline):
               olhar.mjs     — screenshot de pontos de vista canônicos (pontos.json)
               olhar-peca.mjs— screenshot de PEÇA da Oficina v3 em 3 ângulos (npm run peca)
               ouvir.mjs     — mede o som (estado/ganho/RMS), barra a regressão muda
               prancheta.mjs — câmera de TOPO: planta técnica viva (colisões, alturas,
                               planos) via window.__nosMapa() — auditar/criar estrutura
               res-bench.mjs — desempenho por fase (window.__nosPerf) nos 4 presets
               auditar.mjs   — gate de senso crítico [cpu]: os 5 críticos numa peça v3
                               real, exit≠0 em achado (npm run auditar) — D-60
               porteiro.mjs  — gate de render: pageerror/__ready/frame degenerado
                               (decoder PNG próprio via zlib) (npm run porteiro) — D-60
               bench/        — benchmark dos críticos (D-60): sandbox.mjs (roda construir()
                               em Node puro), mutacoes.mjs (18 defeitos plantados),
                               benchmark.mjs (placar F1), tools/ (os 5 críticos), pngstats.mjs
               out/          — PNGs de saída (gitignorado; evidência é regenerável, D-30)
```

**A OFICINA (v3, D-55)** — o ambiente padrão de CRIAÇÃO (objetos/texturas/animações)
mora em `prototipos/fps/v3/` (motor + pecas + visor), porque o motor é compartilhado
com o futuro cliente GPU. Manual: `prototipos/fps/v3/README.md`. Bancada: `npm run peca`.

**Pré-requisito das bancadas:** `cd site && npm ci` uma vez (o Playwright/Chromium
vive em `site/node_modules`; as bancadas avisam se faltar).

## Ferramentas que moram FORA daqui (e por quê)

São ferramentas também, mas **acopladas** a um pipeline — mover quebraria
build/CI/deploy. Ficam onde estão de propósito; este índice existe pra você
nunca ter que caçá-las:

| Ferramenta | Onde | Por que fica lá |
|---|---|---|
| Pipeline de sprites (`build.cjs`, `render.cjs`, `author-*.cjs`) | `assets/tools/` | opera direto em `assets/sprites/`; roda no CI (`lint:sprites`). README próprio |
| Publicação do FPS (`build-fps.mjs`) | `site/scripts/` | é o build do Vite e **o gatilho de deploy** (`pages.yml` observa `site/**`) |
| QA do cliente 2D (`screenshot.mjs` etc.) | `site/qa/` | usa o toolchain do `site/` (Vite/Playwright do site) |
| Path tracer da GI (`bake-gi.mjs`) | `prototipos/fps/bake/` | referenciado pelo `build-fps.mjs` num caminho fixo; assa a luz do mundo |

Regra: **ferramenta nova de coder (bancada/auditoria) nasce em `tools/bancadas/`**;
só sai daqui se um pipeline exigir (e aí entra na tabela acima com o motivo).
