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
4. ~~v1 completa (T3–T9)~~ ✅ — a branch `colaborador2/v1-avatar` (que absorveu T3/T4) foi revisada (90/90 testes, typecheck, auditoria de segurança do input hostil, zero conflito) e mesclada na `main` via PR #14. Toda a v1 está no mundo oficial.
5. **Próximo passo — pôr a v1 no ar:**
   * Habilitar o GitHub Pages: Settings → Pages → Source: GitHub Actions (o workflow tenta ativar sozinho; confirmar se subiu em brigsd.github.io/nos).
   * Confirmar a primeira batida real do tick (workflow `tick.yml`) e o site refletindo o estado.
   * Fechar follow-ups pendentes: #12 (refinos de arte) e #13 (endurecer validador — conferir se o T6/T8 já cobriram).
   * **Lançamento v1** e depois retomar a v2 (branch `colaborador2/v2`, congelada).

### Acordo de trabalho (definido pelo Tiago)
Tiago = **ideador** (visão, rumo, escopo). Claude = **coder** (integridade do código, decisões técnicas, merges). Não trazer implementação/merge para aprovação do Tiago; parar só em decisões de produto. Registrado aqui para todas as sessões futuras.

## Decisões pendentes (perguntar ao Tiago quando relevante)

- Cadência definitiva do tick na v1 (proposta: 1h).
- Divulgação do lançamento v1 (onde/como).
- ~~Monetização~~ → resolvida: **D-20, sem dinheiro em nenhuma forma, decisão definitiva do Tiago.**

## Como retomar do zero

Ler `CLAUDE.md` → este arquivo → `IMPLEMENTATION_PLAN.md`. O contexto de produto está em `VISION.md` + `GDD.md`; o técnico em `ARCHITECTURE.md`; o porquê das escolhas em `DECISIONS.md`.
