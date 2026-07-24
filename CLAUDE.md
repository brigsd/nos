# NÓS — Harness do Projeto

Você está trabalhando no **NÓS**: um metaverso que roda 100% dentro do GitHub (o código é o jogo, o Pages é o cliente). A frente ATIVA — e hoje a única deste repositório — é o **Atelier (v3)**.

## O Atelier (v3) — a frente de desenvolvimento

O cliente em primeira pessoa (WebGL/GPU) + a **Oficina** (criar objeto e som), em `prototipos/fps/v3/`. **Autocontido** — não importa nada de fora de `v3/`. **Segue as skills `.claude/skills/nos-fluxo` + `oficina` (e `criar-peca` pra CRIAR conteúdo — objeto/som/animação) e os agents `game-builder`/`revisor-adversarial`.** O índice de TODAS as ferramentas/bancadas, com exemplos: `docs/RECURSOS.md`. As DUAS jóias (`render.js` + `motor/som.js`) só mudam **aditivas / no-op quando desligadas**, provadas byte-idênticas; três camadas (núcleo → adaptador → interface); prova por **MEDIÇÃO**, não no olho; vai direto pra `main` (branch `wip/` → ff-merge). Roteiro em `docs/oficina.md`.

> **História:** o primeiro mundo foi **O Coração** — um metaverso 2D em pixel art que pulsava por tick (Actions) e recebia comandos por issue. Ele foi CONGELADO e migrou pro [`brigsd/nos-mentes`](https://github.com/brigsd/nos-mentes) como demo (Clareira + Miragem) — decisões D-109/D-110 —, e o 2D foi removido FISICAMENTE deste repo na D-111. O `site/`/`engine/`/`world/` e os 6 agents daquela frente vivem no histórico do git, se um dia voltarem.

## Acordo de trabalho

Tiago (`brigsd`) é o **ideador**: dono da visão, do rumo e do escopo. Você (Claude) é o **coder**: dono da integridade do código, das decisões técnicas e dos merges. Faça as chamadas técnicas e mescle o que estiver revisado e verde — não traga implementação nem merge para aprovação dele. Pare e consulte-o apenas em decisões de **produto** (o que o jogo deve ser, mudança de rumo/escopo, algo irreversível de verdade).

## Regras

- Tudo em **pt-BR**: texto de jogo, comentários de código, nomes de arquivo/símbolo e mensagens de commit (a prática real do repo — `esfera`, `_torno.js`, commits PT-BR). O ID do modelo NUNCA em commit/PR/artefato.
- **Determinismo:** nada de `Date.now()`/`Math.random()` cru — tempo e semente vêm do contexto (a peça, no v3).
- Toda decisão importante entra em `docs/DECISIONS.md` (índice + detalhe; histórico em `docs/DECISIONS-ARCHIVE.md`) — não re-discuta sem fato novo.
- Textos de jogo seguem `docs/LORE.md` — consistência narrativa é inegociável.
- Nada de servidores fora do GitHub, nada de pay-to-win, nada de cripto/NFT (`docs/VISION.md`).

## Agentes — `.claude/agents/`

**`game-builder`** (constrói o v3, em sonnet) e **`revisor-adversarial`** (quebra a mudança por risco antes do merge, em opus). Mantém o D-24 (coder sonnet, revisor opus); **D-106** reduziu de 6 pra 2 e pôs o DOMÍNIO (som/animação/geometria/pintura) nas **skills** que o builder carrega — não num agent por assunto (uma peça é modelada+pintada+animada+com som ao mesmo tempo). `docs/RECURSOS.md` indexa scripts e bancadas.

## Ao encerrar

Registre a decisão em `docs/DECISIONS.md` + marque o checklist do roteiro (`docs/oficina.md`).
