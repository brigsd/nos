# Continuidade — onde paramos

> Este arquivo é o "save game" do desenvolvimento. Toda sessão começa lendo-o e termina atualizando-o.

## Estado atual (2026-07-14)

- Fase: **v0 — Fundação**.
- Feito: visão, GDD, arquitetura, plano, lore inicial, harness e 6 agentes definidos.
- Feito também: repo `brigsd/nos` publicado, fundação na `main`, backlog v1 criado como issues #1–#9.

## Próximo passo imediato

1. ~~Repo criado e estrutura publicada~~ ✅
2. ~~Backlog v1 como issues~~ ✅ (#1–#9)
3. ~~Leva 1 (T1+T2 engine, T7 arte)~~ ✅ — PRs #10 e #11 revisados e mesclados. Follow-ups abertos: #12 (refinos de arte) e #13 (endurecer validador — fazer antes/junto do T3 gravar eventos).
4. **Em andamento:** leva 2 — T3 (tick, branch `claude/v1-t3-tick`) e T4 (site canvas + Pages, branch `claude/v1-t4-site`). Fluxo: PR → code-reviewer → merge. Depois: T5, T6, T8, T9.
5. Pós-merge do T4: conferir se o GitHub Pages ativou via workflow (`actions/configure-pages` com enablement); se não, ativar em Settings → Pages (source: GitHub Actions).

## Decisões pendentes (perguntar ao Tiago quando relevante)

- Cadência definitiva do tick na v1 (proposta: 1h).
- Divulgação do lançamento v1 (onde/como).
- ~~Monetização~~ → resolvida: **D-20, sem dinheiro em nenhuma forma, decisão definitiva do Tiago.**

## Como retomar do zero

Ler `CLAUDE.md` → este arquivo → `IMPLEMENTATION_PLAN.md`. O contexto de produto está em `VISION.md` + `GDD.md`; o técnico em `ARCHITECTURE.md`; o porquê das escolhas em `DECISIONS.md`.
