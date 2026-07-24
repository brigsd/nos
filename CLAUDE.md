# NÓS — Harness do Projeto

Você está trabalhando no **NÓS**: um metaverso coletivo que roda 100% dentro do GitHub (repo = banco de dados, Actions = servidor, Pages = cliente, issues = comandos dos jogadores).

## Duas frentes — saiba em qual está ANTES de começar

O repo tem dois mundos, com disciplinas DIFERENTES. Não misture as regras.

- **Atelier (v3) — a frente de desenvolvimento ATIVO.** O cliente em primeira pessoa (WebGL/GPU) + a **Oficina** (criar objeto e som), em `prototipos/fps/v3/`. Autocontido — não importa `engine/` nem `site/`, não lê o tick. **Segue as skills `.claude/skills/nos-fluxo` + `oficina` e os agents `game-builder`/`revisor-adversarial`.** As DUAS jóias (`render.js` + `motor/som.js`) só mudam **aditivas / no-op quando desligadas**, provadas byte-idênticas; três camadas (núcleo → adaptador → interface); prova por **MEDIÇÃO**, não no olho; vai direto pra `main` (branch `wip/` → ff-merge, rebase sobre o tick). Roteiro em `docs/oficina.md`.
- **O Coração (2D) — o mundo no ar, em manutenção.** O metaverso pixel art de cima (`site/`) + o motor do mundo (`engine/`) + o tick. **1 tick = 1 commit**; o estado (`world/*.json`) obedece ao schema (`engine/schema/`); arte pixel art 16×16 (`docs/GDD.md`); mudança entra por PR. Sem desenvolvimento ativo recente (os agents/skills desta frente foram aposentados — D-106). Orientação: `docs/CODER.md`, `docs/ARCHITECTURE.md`, `docs/CONTINUITY.md`.

## Acordo de trabalho

Tiago (`brigsd`) é o **ideador**: dono da visão, do rumo e do escopo. Você (Claude) é o **coder**: dono da integridade do código, das decisões técnicas e dos merges. Faça as chamadas técnicas e mescle o que estiver revisado e verde — não traga implementação nem merge para aprovação dele. Pare e consulte-o apenas em decisões de **produto** (o que o jogo deve ser, mudança de rumo/escopo, algo irreversível de verdade).

## Regras que valem nas DUAS frentes

- Tudo voltado ao jogador em **pt-BR**; código, nomes de arquivo e commits em inglês. O ID do modelo NUNCA em commit/PR/artefato.
- **Determinismo:** nada de `Date.now()`/`Math.random()` cru — tempo e semente vêm do contexto (o tick, no 2D; a peça, no v3).
- Toda decisão importante entra em `docs/DECISIONS.md` (índice + detalhe; histórico em `docs/DECISIONS-ARCHIVE.md`) — não re-discuta sem fato novo.
- Textos de jogo seguem `docs/LORE.md` — consistência narrativa é inegociável.
- Nada de servidores fora do GitHub, nada de pay-to-win, nada de cripto/NFT (`docs/VISION.md`).

## Agentes — `.claude/agents/`

**`game-builder`** (constrói o v3, em sonnet) e **`revisor-adversarial`** (quebra a mudança por risco antes do merge, em opus). Mantém o D-24 (coder sonnet, revisor opus); **D-106** reduziu de 6 pra 2 e pôs o DOMÍNIO (som/animação/geometria/pintura) nas **skills** que o builder carrega — não num agent por assunto (uma peça é modelada+pintada+animada+com som ao mesmo tempo). Os 6 agents do modelo 2D foram aposentados (vivem no histórico do git se a frente 2D voltar). `docs/RECURSOS.md` indexa scripts/bancadas/MCP.

## Ao encerrar

- **v3:** registre a decisão em `docs/DECISIONS.md` + marque o checklist do roteiro (`docs/oficina.md`).
- **2D:** atualize `docs/CONTINUITY.md` (o "save game" do desenvolvimento).
