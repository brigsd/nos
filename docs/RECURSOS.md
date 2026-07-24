# Recursos do coder — o índice único

O mapa de TUDO que ajuda a desenvolver o NÓS (hoje: o **Atelier**, `prototipos/fps/v3/`):
scripts, bancadas, skills e agentes, cada um com *como invocar*. **Sessão nova? Comece
por aqui e pelo `CLAUDE.md`.** Achou tooling que não está listado? Adicione — a próxima
sessão agradece.

## Pré-requisito das bancadas visuais

`npm ci` na raiz, uma vez por checkout fresco (o Playwright está nas devDependencies;
o Chromium já vem no ambiente). Sem isso, as bancadas saem avisando.

## Scripts npm (`package.json` da raiz)

### Gates (rodam no CI — rode antes de todo commit)

| Comando | O que faz |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) sobre os testes .ts de `tools/som` + `tools/oficina` |
| `npm test` | Vitest — os testes de núcleo (`tools/**/*.test.ts`) |
| `npm run mapa:check` | O mapa do repo está em dia? Falha se `docs/MAPA.md` estiver velho ou se algum arquivo estiver SEM cabeçalho — criou arquivo? dê cabeçalho e rode `npm run mapa` |
| `npm run docs:toc:check` | O índice de `docs/oficina.md` está em dia? (regenerar: `npm run docs:toc`) |

### Bancadas — objeto / render

| Comando | O que faz |
|---|---|
| `npm run peca -- <nome>` | **O visor de peça**: renderiza uma peça de `prototipos/fps/v3/pecas/` em 3 ângulos → PNGs em `tools/bancadas/out/` (LEIA-os). `--res=1400`, `--giro=8` (8 ângulos), `--geo=normais\|flat` (SEM textura: emenda/faceta/silhueta saltam), `--e=<alt> --r=<raio>` (câmera) |
| `npm run oficina` | **A bancada da Oficina**: prova cada passo do editor (câmera, arrasto, undo, gizmo, extrude, mescla, pincel, exportar, materiais, animação, esqueleto) com NÚMERO — Playwright com eventos reais |
| `npm run auditar -- <peca>` | **Gate de senso crítico [cpu]**: os 5 críticos (malha, paleta, costura, banding, órfãos) — exit≠0 em achado. Sem argumento roda em todas. Detalhe: skill `auditar-peca` |
| `npm run porteiro -- <peca>` | **Gate de render**: pageerror / `__ready` / frame degenerado |
| `npm run executar` | Replay headless do núcleo (`nucleo`/`neutroCanonico`) em Node — determinismo/replay |
| `npm run jogar` | Screenshot do jogo (`jogo.html`): `-- --cam=x,y,alt,ang`, `-- --pausado --aba=graficos` |
| `npm run bench` | Benchmark dos críticos (defeitos plantados → placar F1) — rode se mexer nos críticos |

### Bancadas — som (o "ouvido": a IA não escuta, então mede)

| Comando | O que faz |
|---|---|
| `npm run analisar -- <peca-som>` | **O ouvido**: espectrograma (imagem tempo×freq pra Read) + descritores (tom, brilho/centroide, envelope, duração) de uma peça de `pecas-som/` |
| `npm run sintetizar -- <peca-som>` | Render offline (OfflineAudioContext) → amostras/hash — o `cmp` de amostra do determinismo |
| `npm run somtela` | A bancada da aba Som (`som.html`): editor de grafo, presets, espectrograma, sem regressão |
| `npm run somab` | **A/B**: o som REAL do jogo (`som.js`, offline) × o preset — distância por eixo medido |
| `npm run somexportar` | Round-trip do exportar de som (reabre bit-a-bit) |

### Dev

| Comando | O que faz |
|---|---|
| `npm run servir` | Servidor local do v3 (`no-store`): `oficina.html`/`som.html` com SALVAR de verdade (`POST /oficina/salvar` → `pecas/`, `POST /som/salvar` → `pecas-som/`) |
| `npm run mapa` / `docs:toc` | Regenera `docs/MAPA.md` / o índice de `docs/oficina.md` |

## Skills — `.claude/skills/`

| Skill | Pra quê |
|---|---|
| `nos-fluxo` | O FLUXO de entregar qualquer feature: orquestrar coder+revisor, jóias, gates, git, registrar decisão |
| `oficina` | A ARQUITETURA da Oficina (núcleo/adaptador/interface, o que cada passo construiu, armadilhas) — pra mexer NA ferramenta |
| `criar-peca` | CRIAR CONTEÚDO com a Oficina (objeto, som, animação por lista de PASSOS + o laço de ver/medir) — pra usar a ferramenta |
| `auditar-peca` | O gate de senso crítico + a visão de geometria — julgar peça com número, não opinião |

## Agentes — `.claude/agents/` (D-24, D-106)

O orquestrador briefa e integra, registrando em `docs/DECISIONS.md`.

| Agente | Papel | Quando despachar | Modelo |
|---|---|---|---|
| `game-builder` | Constrói o v3 (motor GPU, Oficina, som, animação, interface); jóias aditivas, três camadas, prova por medição, branch wip sem push | qualquer feature do v3 | sonnet |
| `revisor-adversarial` | Tenta QUEBRAR por risco: fundação / formato salvo / jóia / conta de julgamento | quando é fundação, mexe no formato salvo, toca uma jóia, ou tem julgamento (dispensa se já provado byte-idêntico) | **opus** |

O DOMÍNIO (som/animação/geometria/pintura) mora nas **skills**, não num agent
por assunto (D-106). Os 6 agents da era 2D e a skill `estruturas` (v2) foram
aposentados — vivem no histórico do git.

## Docs de orientação

- **`CLAUDE.md`** — o acordo de trabalho + as regras (jóias, determinismo, pt-BR).
- **`docs/oficina.md`** — o roteiro da Oficina (Ordem de construção + specs). `docs/oficina-referencia.md` — o manual de como cada elemento funciona.
- **`docs/playground.md`** — o ÉPICO ativo (D-113): fechar o vocabulário + forma-como-número + a camada IA de laço único. O que construir em seguida mora aqui.
- **`docs/DECISIONS.md`** — TODAS as decisões (índice + detalhe; histórico em `DECISIONS-ARCHIVE.md`).
- **`docs/MAPA.md`** — a árvore do repo com resumo por arquivo (gerada, sempre fresca).
- **`docs/LORE.md`** / **`docs/VISION.md`** — narrativa / o que o NÓS é e não é.
- **`docs/FERRAMENTAS.md`** — o plano de potência das ferramentas (visão). `docs/AUDIO_E_CENAS.md` — direção de música/voz/cenas (nada construído).
- **`docs/legado/`** — os docs d'O Coração (o mundo 2D congelado) — leitura histórica.
