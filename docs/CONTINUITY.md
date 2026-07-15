# Continuidade — onde paramos

> Este arquivo é o "save game" do desenvolvimento. Toda sessão começa lendo-o e termina atualizando-o.

## Estado atual (2026-07-15)

- Fase: **v1 NO AR e jogável.** 🎉 Site vivo em https://brigsd.github.io/nos
- Verificado de ponta a ponta: `/entrar` (issue #15) → tick disparou em ~17s (gatilho híbrido D-11) → jogador `brigsd` criado em (30,30), 100 energia → issue respondida e fechada pelo bot. Pipeline de comandos (T6) confirmado no mundo real.
- Toda a v1 (T1–T9) na `main`, CI verde, Pages ativo.

## Próximo passo imediato

1. ~~Repo criado e estrutura publicada~~ ✅
2. ~~Backlog v1 como issues~~ ✅ (#1–#9)
3. ~~Leva 1 (T1+T2 engine, T7 arte)~~ ✅ — PRs #10 e #11 revisados e mesclados.
4. ~~v1 completa (T3–T9)~~ ✅ — a branch `colaborador2/v1-avatar` (que absorveu T3/T4) foi revisada (90/90 testes, typecheck, auditoria de segurança do input hostil, zero conflito) e mesclada na `main` via PR #14. Toda a v1 está no mundo oficial.
5. ~~Pôr a v1 no ar~~ ✅ — Pages ativado, tick verificado, jogador entrou. **v1 LANÇADA.**
6. **Correção durante o teste ao vivo:** o site lia o mundo de uma cópia congelada no build; commits do tick (bot `github-actions`) não disparam o Pages (anti-recursão do GitHub), então a janela nunca atualizava. Corrigido (commit 224dc6c): o cliente agora busca `world/heart.json` AO VIVO do raw (CORS `*`, cache 300s) com timeout de 4s + fallback local. Site agora reflete cada batida sem redeploy.

## Achados a resolver (follow-ups)
- **D-19 saltou tickCount para 24 na 1ª batida real** (worldTime 1440 = 24h): a auto-correção compensou muitas batidas perdidas desde o genesis de uma vez. Decidir: o relógio do mundo deve "começar agora" ou catch-up? Ver issue de follow-up.
- #12 (refinos de arte: margem d'água, xadrez de campina) e #13 (endurecer validador: bounds-check de eventos) — conferir se T6/T8 já cobriram #13.
- Limpeza de branches redundantes (t3/t4/v1-avatar já mescladas) — proxy instável travou os deletes; tentar de novo.

## Decisão adiada — visual dos avatares (Registro vs Eco)
- No ar: **O Registro** (D-22) — avatar oficial sólido, local (intenção) fantasma.
- O Tiago achou contraintuitivo *quem ele controla* ficar transparente. Prototipei o inverso, **O Eco** (você sólido, oficial pálido que te segue) — é a **recomendação** quando ele quiser retomar.
- Pedido do Tiago: "deixa assim por hora" → mantido O Registro, sem publicar o Eco.
- Como aplicar o Eco depois: no `site/src/renderer.ts`, mover o `globalAlpha` do bloco 4 (jogador local) para o bloco 3 (jogadores oficiais). Inversão de ~1 linha. Quando o login (D-13) existir, refinar pra só o *próprio* eco ficar pálido — outros jogadores são reais, ficam sólidos.

## Próximo
- Testar comandos restantes: `/coletar`, `/dizer` (`/entrar` e `/mover` já verificados no mundo real — issues #15 e #17).
- Retomar a **v2** (branch `colaborador2/v2`, congelada): combate, economia, NPCs, Crônica — revisar com calma.

### Acordo de trabalho (definido pelo Tiago)
Tiago = **ideador** (visão, rumo, escopo). Claude = **coder** (integridade do código, decisões técnicas, merges). Não trazer implementação/merge para aprovação do Tiago; parar só em decisões de produto. Registrado aqui para todas as sessões futuras.

## Decisões pendentes (perguntar ao Tiago quando relevante)

- Cadência definitiva do tick na v1 (proposta: 1h).
- Divulgação do lançamento v1 (onde/como).
- ~~Monetização~~ → resolvida: **D-20, sem dinheiro em nenhuma forma, decisão definitiva do Tiago.**

## Como retomar do zero

Ler `CLAUDE.md` → este arquivo → `IMPLEMENTATION_PLAN.md`. O contexto de produto está em `VISION.md` + `GDD.md`; o técnico em `ARCHITECTURE.md`; o porquê das escolhas em `DECISIONS.md`.
