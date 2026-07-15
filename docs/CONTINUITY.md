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

## Pendências — RESOLVIDAS (2026-07-15)
- ✅ **#13 · Endurecer validador** — PR #20 mesclado. Bounds-check de eventos, cross-check de login, teste anti-drift schema↔constantes, NITs (serialize, regex de login). 90→102 testes. Corrigiu de quebra um teste de mapgen já quebrado no main.
- ✅ **#12 · Refinos de arte** — PR #21 mesclado. Xadrez de campina eliminado (tons reafinados + campina_3) e margem d'água (`margem_agua_4dir` + `drawMeadowRim`). Antes/depois em `site/qa/`. Descoberta: os scripts de arte `.js` nunca rodavam (raiz é `type:module`) → renomeados pra `.cjs`.
- ✅ **#16 · D-19 tickCount** — fechado. O cap `MAX_CATCHUP_TICKS=24` já existia; mantida Opção A (relógio = tempo real desde genesis, com cap). Opção B fora (mundo já tem jogador/histórico).
- ✅ **Comandos** — os 4 verificados no mundo real: `/entrar` (#15), `/mover` (#17), `/dizer` (#18, mensagem no mural), `/coletar` (#19, caminho "sem recurso" gracioso).
- ⚠️ **Limpeza de branches mescladas** — BLOQUEADA: `git push --delete` retorna 403 (token da integração não deleta branches, mesma classe de não-criar-repo). Cosmético; o Tiago deleta em 1 clique em *Branches* no GitHub. Branches órfãs: claude/v1-t1-t2-engine, claude/v1-t3-tick, claude/v1-t4-site, claude/v1-t7-art, colaborador2/v1-avatar.

### Tech-debt menor (não-bloqueante, anotado)
- `ACTIONS_PER_TICK` duplicado em `types.ts` e `commands.ts` (mesmo valor; risco de drift) — flag do code-review do #13.
- Margem d'água: costas bem retas repetem o mesmo relevo a cada 16px (só em zoom próximo) — ressalva do art-reviewer do #12.

## Decisão adiada — visual dos avatares (Registro vs Eco)
- No ar: **O Registro** (D-22) — avatar oficial sólido, local (intenção) fantasma.
- O Tiago achou contraintuitivo *quem ele controla* ficar transparente. Prototipei o inverso, **O Eco** (você sólido, oficial pálido que te segue) — é a **recomendação** quando ele quiser retomar.
- Pedido do Tiago: "deixa assim por hora" → mantido O Registro, sem publicar o Eco.
- Como aplicar o Eco depois: no `site/src/renderer.ts`, mover o `globalAlpha` do bloco 4 (jogador local) para o bloco 3 (jogadores oficiais). Inversão de ~1 linha. Quando o login (D-13) existir, refinar pra só o *próprio* eco ficar pálido — outros jogadores são reais, ficam sólidos.

## v2 — auditada e em integração faseada (2026-07-15)
Auditoria completa da branch `colaborador2/v2` feita (relatório na conversa). Achados-chave:
- **v2 é 100% headless** — combate/economia/NPCs/estruturas/Crônica só existem como dados+terminal; nunca tocou `site/`. Integrar o motor ≠ jogador ver a feature.
- **Não mesclável como está**: `typecheck` falha na própria branch (3 erros em `commands.ts`); nunca passou por CI.
- **Bug de segurança (bloqueador p/ combate/economia)**: `/atacar __proto__`, `/trocar __proto__` etc. travam o tick e o mundo **permanentemente** (poluição de protótipo + falta de try/catch no tick + workflow sem `if:always()`). NÃO está no ar (comandos só existem na v2). Corrigir antes de integrar T12/T13.
- Conflito minúsculo (2 arquivos): `world.schema.json` (git auto-merge OK, regex endurecida do main preservada) e `world/heart.json` (mundo vivo — NÃO mesclar à mão; seeding aditivo pelo tick).
- Ordem recomendada: T17→T10→T14(estruturas)→T11(NPCs)→T12(combate)→T13(economia)→T15(Crônica). Raycasting (doc `DEBATE_VISAO_3D.md`) = backlog v3+, PR só de doc.

**Decisão do Tiago:** integrar **uma feature completa até a tela** (não motor-primeiro), começando pelos **NPCs (Nativos)**.

### ✅ CONCLUÍDA — fatia "Nativos até a tela" (2026-07-15)
- **Fase A · motor** (issue #22, PR #25): tipo Native + evento native_spoke, behavior.ts + natives.ts, validador generalizado (bounds de eventos genérico + régua dos nativos), behavior.test.ts novo. 102→189 testes. Seeding idempotente pelo tick.
- **Fase B · visual** (issue #23): sprites gota/raiz/cinza (PR #24) + render no mapa com nome e balão de fala (PR #26).
- **Ativado no mundo vivo**: o tick da issue #27 semeou os 3 Nativos preservando brigsd/tickCount/eventos (migração validada em produção). `world/heart.json` da main tem `natives: {gota, raiz, cinza}`. Site (live-fetch) mostra os três — pode levar ~5min pro CDN do raw atualizar.
- Os Nativos agem a cada batida (behavior trees). Ainda NÃO há interação do jogador com eles (isso viria com economia/combate).

## Segurança do pipeline — BLINDADO (2026-07-15, issue #28, PR #29)
Análise: sem exploração ativa hoje, mas a arquitetura podia travar o mundo pra sempre (exceção não isolada + issue ofensora nunca fechada + tickNatives sem rede). Blindado:
- try/catch por comando em `processCommands` → comando ruim vira falha + issue fechada (quebra o loop de travamento).
- `tickNatives` isolado → bug dos Nativos pula a batida, relógio segue.
- helper `getOwn` (Object.hasOwn) contra poluição de protótipo, já no lookup de `players[cmd.login]` — o `__proto__` de combate/economia nasce morto.
- rede de segurança no `scripts/tick.ts` (loga contexto rico, não mascara bug real).
- 189→202 testes. Também corrigido teste de migração obsoleto (#30, o mundo vivo já tem Nativos).
**Pré-requisito de combate/economia cumprido.**

## Depois
- Registro vs Eco (decisão adiada do Tiago).
- Próxima fatia v2 recomendada: **economia** (T13) ou **interação leve com NPCs** — a fundação de segurança já está pronta. Ordem: T14 estruturas / T13 economia / T12 combate.
- Ao integrar combate/economia: usar `getOwn` em TODOS os lookups por string de jogador (STRUCTURE_COSTS, TRADE_RECIPES, world.natives[alvo]).
- Cosmético: Tiago deleta as branches órfãs (o token não deleta — 403).

### Acordo de trabalho (definido pelo Tiago)
Tiago = **ideador** (visão, rumo, escopo). Claude = **coder** (integridade do código, decisões técnicas, merges). Não trazer implementação/merge para aprovação do Tiago; parar só em decisões de produto. Registrado aqui para todas as sessões futuras.

## Decisões pendentes (perguntar ao Tiago quando relevante)

- Cadência definitiva do tick na v1 (proposta: 1h).
- Divulgação do lançamento v1 (onde/como).
- ~~Monetização~~ → resolvida: **D-20, sem dinheiro em nenhuma forma, decisão definitiva do Tiago.**

## Como retomar do zero

Ler `CLAUDE.md` → este arquivo → `IMPLEMENTATION_PLAN.md`. O contexto de produto está em `VISION.md` + `GDD.md`; o técnico em `ARCHITECTURE.md`; o porquê das escolhas em `DECISIONS.md`.
