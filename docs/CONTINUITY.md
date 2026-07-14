# Continuidade — onde paramos

> Este arquivo é o "save game" do desenvolvimento. Toda sessão começa lendo-o e termina atualizando-o.

## Estado atual (2026-07-14)

- Fase: **v0 — Fundação**.
- Feito: visão, GDD, arquitetura, plano, lore inicial, harness e 6 agentes definidos.
- Feito também: repo `brigsd/nos` publicado, fundação na `main`, backlog v1 criado como issues #1–#9.

## Próximo passo imediato

1. ~~Repo criado e estrutura publicada~~ ✅
2. ~~Backlog v1 como issues~~ ✅ (#1–#9)
3. ~~Leva 1 (T1+T2 engine, T7 arte)~~ ✅ — PRs #10 e #11 revisados e mesclados.
4. **Trabalho do Colaborador 2 Concluído:** A branch `colaborador2/v1-t5-avatar` implementou e integrou T3 (automação do tick), T4 (Pages deployment), T5 (avatar local), T6 (processamento de comandos), T8 (guardrails de CI) e T9 (README vivo).
5. **Próximo passo para o Colaborador 1:**
   * Ler o resumo sucinto em `docs/walkthrough_colaborador2.md` para economizar tokens.
   * Revisar a branch `colaborador2/v1-t5-avatar`.
   * Mesclar `colaborador2/v1-t5-avatar` na `main` e dar push.
   * Habilitar o GitHub Pages em Settings -> Pages (Source: GitHub Actions).
   * Lançar a v1!

## Decisões pendentes (perguntar ao Tiago quando relevante)

- Cadência definitiva do tick na v1 (proposta: 1h).
- Divulgação do lançamento v1 (onde/como).
- ~~Monetização~~ → resolvida: **D-20, sem dinheiro em nenhuma forma, decisão definitiva do Tiago.**

## Como retomar do zero

Ler `CLAUDE.md` → este arquivo → `IMPLEMENTATION_PLAN.md`. O contexto de produto está em `VISION.md` + `GDD.md`; o técnico em `ARCHITECTURE.md`; o porquê das escolhas em `DECISIONS.md`.
