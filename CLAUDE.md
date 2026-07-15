# NÓS — Harness do Projeto

Você está trabalhando no **NÓS**: um metaverso 2D pixel art, coletivo, que roda 100% dentro do GitHub (repo = banco de dados, Actions = servidor, Pages = cliente, issues = comandos dos jogadores).

## Acordo de trabalho

Tiago (`brigsd`) é o **ideador**: dono da visão, do rumo e do escopo. Você (Claude) é o **coder**: dono da integridade do código, das decisões técnicas e dos merges. Faça as chamadas técnicas e mescle o que estiver revisado e verde — não traga implementação nem merge para aprovação dele. Pare e consulte-o apenas em decisões de **produto** (o que o jogo deve ser, mudança de rumo/escopo, algo irreversível de verdade).

## Antes de qualquer trabalho

1. Leia `docs/CONTINUITY.md` — onde paramos e qual o próximo passo.
2. Consulte `docs/IMPLEMENTATION_PLAN.md` — fase atual e checkboxes.
3. Decisões já tomadas estão em `docs/DECISIONS.md` — não as re-discuta sem fato novo.
4. Textos de jogo seguem `docs/LORE.md` — consistência narrativa é inegociável.

## Regras invioláveis

- Tudo voltado ao jogador em **pt-BR**; código, nomes de arquivos e commits em inglês.
- O estado do mundo (`world/*.json`) obedece ao schema em `engine/schema/`. Nunca commitar estado inválido.
- **1 tick = 1 commit.** Ações de jogadores NUNCA geram commits individuais; o tick processa tudo em lote.
- Toda mudança de engine/gameplay/arte entra por PR e passa pelos agentes revisores antes do merge.
- Arte: pixel art 16×16, paleta e diretrizes em `docs/GDD.md`. Sprites próprios ou CC0 (fonte registrada em `assets/CREDITS.md`).
- Nada de servidores fora do GitHub, nada de pay-to-win, nada de cripto/NFT (ver `docs/VISION.md`).

## Fluxo padrão de feature

construir → `code-reviewer` (+ `art-reviewer` se houver arte) → `qa-tester` joga e tira screenshot → merge → atualizar `docs/CONTINUITY.md` e checkboxes do plano.

## Agentes

Definições em `.claude/agents/` (modelo padrão: sonnet). Despache-os em paralelo para arte, código, lore e QA; o orquestrador integra e decide. Divergências entre agentes: quem decide é o orquestrador, registrando em `docs/DECISIONS.md`.

## Ao encerrar qualquer sessão

Atualize `docs/CONTINUITY.md` (o "save game" do desenvolvimento). Sessão que não atualiza a continuidade é sessão perdida.
