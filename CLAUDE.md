# NÓS — Harness do Projeto

Você está trabalhando no **NÓS**: um metaverso coletivo que roda 100% dentro do GitHub (repo = banco de dados, Actions = servidor, Pages = cliente, issues = comandos dos jogadores).

> **Duas frentes.** (1) O **mundo 2D** (o metaverso pixel art de cima) — `site/` + `engine/` + o tick, o jogo no ar. (2) O **cliente v3** — o FPS GPU + a **Oficina** (criação de objeto e som), em `prototipos/fps/v3/`, autocontido (não importa `engine/`/`site/`). **Trabalho no v3 segue as skills `.claude/skills/nos-fluxo` + `oficina` e os agents `game-builder`/`revisor-adversarial` — NÃO o fluxo 2D abaixo.** As regras 2D (tick, schema, pixel art 16×16) valem pra frente (1). [O reroute completo deste doc é a próxima etapa da reorganização.]

## Acordo de trabalho

Tiago (`brigsd`) é o **ideador**: dono da visão, do rumo e do escopo. Você (Claude) é o **coder**: dono da integridade do código, das decisões técnicas e dos merges. Faça as chamadas técnicas e mescle o que estiver revisado e verde — não traga implementação nem merge para aprovação dele. Pare e consulte-o apenas em decisões de **produto** (o que o jogo deve ser, mudança de rumo/escopo, algo irreversível de verdade).

## Antes de qualquer trabalho

1. Leia `docs/CONTINUITY.md` — onde paramos e qual o próximo passo.
2. Consulte `docs/IMPLEMENTATION_PLAN.md` — fase atual e checkboxes.
3. Decisões já tomadas estão em `docs/DECISIONS.md` (índice de todas + ativas em detalhe; detalhe histórico em `docs/DECISIONS-ARCHIVE.md`) — não as re-discuta sem fato novo.
4. Textos de jogo seguem `docs/LORE.md` — consistência narrativa é inegociável.
5. Trabalho visual/no cliente oficial? `docs/CODER.md` é a sua bancada: `npm run olhar` (auditoria por screenshot, `?cam=`/`?tod=`), navegação no arquivo grande e os limites reais do ambiente com as mitigações que funcionam.
6. Não sabe qual ferramenta/script/agente usar? `docs/RECURSOS.md` é o índice único de tudo (npm scripts, art-mcp, bancadas, MCP, os agentes) com *como invocar* — **desatualizado quanto aos agentes (cita os 6 antigos); vale a lista em `.claude/agents/`**.

## Regras invioláveis

- Tudo voltado ao jogador em **pt-BR**; código, nomes de arquivos e commits em inglês.
- O estado do mundo (`world/*.json`) obedece ao schema em `engine/schema/`. Nunca commitar estado inválido.
- **1 tick = 1 commit.** Ações de jogadores NUNCA geram commits individuais; o tick processa tudo em lote.
- Toda mudança de engine/gameplay/arte entra por PR e passa pelos agentes revisores antes do merge.
- Arte: pixel art 16×16, paleta e diretrizes em `docs/GDD.md`. Sprites próprios ou CC0 (fonte registrada em `assets/CREDITS.md`).
- Nada de servidores fora do GitHub, nada de pay-to-win, nada de cripto/NFT (ver `docs/VISION.md`).

## Fluxo padrão de feature

**v3 (frente ativa):** brief → `game-builder` numa branch `wip/...` → o orquestrador **verifica por MEDIÇÃO** (+ `revisor-adversarial` por risco) → `ff-merge` na main → registra a decisão em `docs/DECISIONS.md`. Detalhe na skill `nos-fluxo`.
**2D:** construir → revisão → QA → merge por PR → atualizar `docs/CONTINUITY.md` e checkboxes do plano.

## Agentes

Definições em `.claude/agents/` — **`game-builder`** (constrói o v3, em sonnet) e **`revisor-adversarial`** (quebra a mudança por risco antes do merge, em opus). Mantém o D-24 (coder sonnet, revisor opus); **D-106** reduziu de 6 pra 2 e moveu o DOMÍNIO (som, animação, geometria, pintura) pras **skills** que o builder carrega — não a um enxame de agents por assunto, porque uma peça é modelada+pintada+animada+com som ao mesmo tempo. O orquestrador integra e decide, registrando em `docs/DECISIONS.md`. (Os 6 agents do modelo 2D — engine-dev/pixel-artist/lore-writer/code-reviewer/art-reviewer/qa-tester — foram aposentados; vivem no histórico do git se a frente 2D voltar a ser desenvolvida.)

## Ao encerrar qualquer sessão

Atualize `docs/CONTINUITY.md` (o "save game" do desenvolvimento). Sessão que não atualiza a continuidade é sessão perdida.
