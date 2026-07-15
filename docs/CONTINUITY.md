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

## Faxina de pendências — TUDO FECHADO (2026-07-15, parte 2)
4 frentes disparadas em paralelo (3 agentes Sonnet 5 + 1 eu no fix delicado), revisadas e mescladas. Mundo vivo em **batida #34**, main verde (206 testes).
- **#27 destravado + robustez do tick (PR #33, eu):** RAIZ REAL do #27 — `advanceWorld` descartava comandos quando `ticksToProcess===0`, então comando enviado *entre batidas* (o caso normal do gatilho `issues.opened`) evaporava: issue sem resposta, nunca fechava. Comandos antigos só funcionaram porque o mundo estava atrás do relógio. Fix: comandos agora processam mesmo sem batida devida (aplicados no tick atual, sem `core_pulse`); `tick.yml` empurra com rebase+retry (push concorrente não derruba mais a batida) e só fecha issue com push bem-sucedido (removido `if: always()`). O #27 foi destravado rodando o tick canônico (batida #34, `player_said` no mundo) e fechado com a resposta do motor. 202→206 testes.
- **`ACTIONS_PER_TICK` fonte única (PR #31):** era duplicado em `types.ts` e `commands.ts`; agora só em `types.ts`, reexportado por `commands.ts`. Débito do review do #13 quitado.
- **Margem d'água sem repetição (PR #34):** `drawMeadowRim` escolhe entre 2 variantes de relevo + flip horizontal por hash de tile (mesmo padrão do `meadowSprite`, determinístico). Nova sprite `margem_agua_4dir_b` pela pipeline `.cjs`; antes/depois em `site/qa/`. Débito do art-review do #12 quitado.
- **`/dizer` visível — O Mural (PR #32):** o comando gerava `player_said` mas NADA renderizava. Agora: balão de fala sobre o jogador no mapa (espelha o padrão dos Nativos) + HUD DOM "O Mural" com as últimas 8 falas (`@login` + texto + "há N pulsos"). XSS-safe (`textContent`). Descoberta: o `/dizer` sempre persistiu (havia um `player_said` no tick 26); só faltava a tela.

## v2 — fatia 💰 Economia até a tela ✅ MESCLADA (2026-07-15, PR #35)
Re-implementação limpa sobre a main (a v2 congelada foi só referência de design; seus bugs não vieram junto):
- **Motor:** `Player.pulso` (opcional, retrocompatível — ausente = ₱0, ler via `getPulso`), `engine/economy.ts` (tabela `TRADE_RECIPES` de compra/venda/escambo + `executeTrade` puro e total), comando `/trocar nativo troca` (alcance = raio de saudação dos Nativos, 3 tiles; 1 de energia), evento `trade_completed` (given/received/pulsoDelta). Itens são conservados (mudam de mochila); a perna ₱ é emitida/queimada pelo tick (banco central, GDD). Spread compra>venda é o dreno de ₱.
- **Segurança:** TODO lookup por string do jogador via `getOwn` — `/trocar __proto__` (nativo OU troca hostil) morre como "não existe", testado. Verificado e2e com o tick canônico.
- **Schema/validador:** `Player.pulso` (inteiro ≥0) + `TradeCompletedEvent`; cross-checks genéricos de login/nativeId já cobrem o evento novo; testes anti-drift (STARTING_PULSO, receitas só com recursos conhecidos, alcance = PLAYER_PROXIMITY_TILES).
- **Tela:** HUD "Meu Nó" (informa seu login 1x — localStorage `nos_login`, NÃO é autenticação, só escolhe qual entrada pública exibir → ₱ + energia + mochila do Registro), painel "Comércio" (bancas dos Nativos com estoque + só as trocas que o Nativo pode honrar, cada uma um link de issue `/trocar` pré-preenchida) e Mural agora também narra trocas ("@login deu 1 madeira e levou ₱5 — negócio com Raiz"). Tudo `textContent` (XSS-safe).
- **Fork de produto a confirmar com o Tiago:** números de preço (v2 de referência: madeira/pedra ₱10 compra / ₱5 venda; fragmento ₱25/₱20; escambo 1 fragmento ↔ 3 recursos) e ₱ inicial = 0 (só se ganha vendendo).
## v2 — fatia 💬 Interação leve com os Nativos até a tela ✅ MESCLADA (2026-07-15, PR #36; conflitos com #35 resolvidos pelo lead — união dos dois comandos, Mural 3 vozes)
- **Motor:** comando `/conversar nativo` (0 de energia, alcance = `PLAYER_PROXIMITY_TILES`): o Nativo responde com fala roteirizada da sua própria voz (`CONVERSATION_REPLIES` em behavior.ts, LORE voice, D-09 sem LLM), escolhida por RNG semeada por evento (`seed + "-conversa-" + nº da issue`, mesma família do beatOnce) — mesmo mundo + mesma issue ⇒ mesma resposta. Mercadora com mochila cheia do jogador solta a deixa da troca. Evento novo `native_replied {nativeId, login, message}`.
- **Segurança:** `getOwn` no lookup do nativo (`/conversar __proto__` = "não existe", testado); pool de respostas também via getOwn com fallback lacônico ("Hm.").
- **Schema/validador:** `NativeRepliedEvent` (mensagem 1..280); cross-checks genéricos de login/nativeId cobrem o evento; teste anti-drift do cap de mensagem; toda fala roteirizada testada contra o cap.
- **Tela:** painel HUD "Nativos" (quem habita, facção em uma linha, posição atual, última resposta dada e link "puxar conversa" → issue `/conversar` pré-preenchida), Mural agora mostra respostas ("Cinza → @brigsd: ..."), e o balão de fala no mapa também acende para `native_replied` (mesmo padrão do native_spoke). Verificado e2e (tick canônico) e em Chromium headless.
- 206→233 testes.
- **Direção do ideador (2026-07-15, chegou durante a integração): O Coração é um mundo PACÍFICO** — vira "A Fábrica" do metaverso (fabricação por receitas com materiais de outros mundos, v3). **Combate cancelado neste mundo para sempre** (PR #37 fechado sem mesclar, fica como referência). Falas dos Nativos desta fatia ajustadas para "mestres de ofício" (misturas/madeira/pedra), sem papel de combate. A próxima fatia depois desta é a FABRICAÇÃO — mas precisa de design de produto com o Tiago antes (quais ofícios primeiro, minigames por ofício); NÃO começar sem isso.

## v2.5 — R2 · Login GitHub (D-13) — PAT hoje, device flow pronto e travado (2026-07-15, branch `claude/r2-login-github`)
Investigação primeiro (era o ponto central da tarefa): **`github.com/login/device/code` e `github.com/login/oauth/access_token` não respondem CORS** (sem `Access-Control-Allow-Origin`, sem responder ao preflight OPTIONS) — verdade desde pelo menos 2015 (`github/isaacs#330`) e ainda assim em fontes de 2025/2026 checadas (docs oficiais do GitHub + post independente de jan/2025 sobre device flow no navegador, que precisa de um servidor-relay por exactly esse motivo). Sem acesso de rede direto a github.com neste sandbox (proxy do ambiente só libera chamadas de API escopadas a repositório) para um teste ao vivo — verificação foi documental (fontes acima), não uma sonda ao vivo. Em contraste, **`api.github.com/*` tem CORS completo** (`Access-Control-Allow-Origin: *`, `Authorization` liberado), inclusive autenticado — é por isso que dá pra ir direto da API uma vez que exista um token, só não dá pra *obter* esse token via device flow puro-cliente.

Decisão tomada seguindo a própria tarefa: **login por PAT (personal access token) é o caminho que funciona hoje**; device flow fica implementado por completo (`site/src/auth.ts`, máquina de estados RFC 8628 correta) mas atrás de `NOS_OAUTH_CLIENT_ID` vazio (`site/src/config.ts`) — some quando o app OAuth for registrado, mas mesmo aí não basta (precisaria de um relay servidor, que a tarefa proíbe adicionar — "nada de servidores fora do GitHub").

- **`site/src/auth.ts`**: `getToken`/`isLoggedIn`/`peekLogin`/`logout` (localStorage `nos_token`, nunca URL/log), `loginWithToken` (valida contra `GET /user` antes de guardar), `getLogin` (reconfirma, com fallback ao cache num soluço de rede, desloga se o token foi revogado), `createCommandIssue` (POST `/repos/brigsd/nos/issues` com o mesmo formato "### Campo\n\nvalor" que os parsers do motor já esperam), e o trio device-flow `startDeviceFlow`/`pollDeviceToken`/`loginWithDeviceFlow` (não alcançável hoje, ver acima).
- **`site/src/config.ts`**: `NOS_OAUTH_CLIENT_ID = ''` (placeholder do Tiago) + `GITHUB_REPO_OWNER`/`GITHUB_REPO_NAME`.
- **`site/src/auth-ui.ts`**: painel HUD "Entrar com GitHub" — formulário PAT com texto de segurança em pt-BR quando `NOS_OAUTH_CLIENT_ID` vazio; UI de device flow (código + link + "aguardando confirmação…") pronta atrás da flag.
- **Meu Nó auto-preenche**: `meu-no.ts` ganhou `setSavedLogin` (exportado); ao logar, o login autenticado grava em `nos_login` automaticamente.
- **"agir daqui"**: `trade.ts` e `nativos.ts` ganharam um botão ao lado do link de sempre — quando logado, tenta `createCommandIssue` direto pela API; qualquer falha (sem escopo, offline, ...) cai de volta para abrir o link pré-preenchido (`window.open`), sem quebrar o fluxo existente. Os links pré-preenchidos continuam sendo o caminho PADRÃO para todo mundo; o login é "modo avançado" opcional.
- Verificado: `cd site && npx tsc --noEmit` e `npm run build` verdes; `npm test` na raiz segue 276/276; QA visual (`site/qa/screenshot.mjs`) confirma o painel de login renderizado no HUD, no mesmo estilo dos outros painéis.
- **PR #38 aberto, NÃO mesclado** (deixado para revisão) — branch `claude/r2-login-github`.
- **Pendente para quando o app OAuth existir**: preencher `NOS_OAUTH_CLIENT_ID`; se o CORS do device flow não tiver mudado, também será preciso um pequeno relay (ou aceitar continuar só de PAT) — decisão de infra que fica para quando chegar lá. Alternativa melhor anotada no código: um **GitHub App** (permissão fine-grained `issues:write` instalada só neste repo) em vez de OAuth App, já que `public_repo` é reconhecidamente largo demais.

### Review do PR #38 (REQUEST CHANGES) — 2 achados HIGH corrigidos na própria branch
O manuseio de token/XSS/escopo passou limpo, mas dois achados quebravam a feature para jogadores REAIS (não-colaboradores):
1. **Fine-grained PAT não abre issues em repo alheio.** Um jogador comum só consegue dar a um token fine-grained acesso READ-ONLY a repos públicos de terceiros — a combinação pré-preenchida no link antigo era impossível de selecionar. Correção: o "agir daqui" agora pede **token clássico com escopo `public_repo`**, com aviso honesto em pt-BR de que isso dá escrita em TODOS os repos públicos do jogador, link direto para a página de revogação e recomendação de revogar ao terminar. Os links de issue pré-preenchidos continuam sendo o caminho padrão sem risco; login virou explicitamente "modo avançado" opcional.
2. **GitHub descarta `labels` silenciosamente na criação por quem não tem triage/push.** A issue criada via API por um jogador comum chegava SEM o label `comando` → o tick (que ingeria via `--label comando` e gateava o gatilho no label) nunca a processava — comando perdido em silêncio. Correção desenhada em `.github/workflows/tick.yml`: (a) ingestão independente de label — `gh issue list --state open --limit 100` + filtro `jq` por título com prefixo `comando:` case-insensitive OU label `comando` (compat com os templates); (b) gatilho do job também aceita `startsWith(github.event.issue.title, 'Comando:')`. Seguro sobre-selecionar: `parseRawIssues` ignora títulos que não são comandos e `respond-issues` só toca issues que geraram resultado — o resto fica aberto e intocado. Filtro jq validado localmente contra uma lista fake (seleciona comando-sem-label, comando-com-label, casing variado; exclui bug reports, título com "comando:" no meio, `labels: null` não explode) e a saída alimentada em `parseRawIssues` com sucesso. **PORÉM: o sistema de permissões desta sessão bloqueou commitar/pushar mudança em `.github/workflows/` (fronteira da tarefa original que só o usuário real pode liberar). O diff pronto está no corpo do PR #38 para o Tiago (ou uma sessão com aprovação humana) aplicar. O PR NÃO deve ser mesclado sem esse diff aplicado — sem ele, o "agir daqui" de um não-colaborador cria issue que o tick ignora.** Com o diff aplicado, o "enviado (#N)" do botão fica verdadeiro de ponta a ponta: POST 2xx ⇒ issue existe com título `Comando:` ⇒ gatilho ou batida horária a ingere ⇒ tick só fecha a issue depois do push do mundo.
- `auth.ts`: continua enviando `labels: ['comando']` (inofensivo; pega quando o autor PODE rotular — dono/colaboradores), mas o label deixou de ser estrutural.
- Nota LOW do reviewer atendida: comentário em `DEVICE_FLOW_SCOPE` reconhecendo que `public_repo` é largo demais e que GitHub App é o caminho futuro preferido.
- Re-verificado após as correções: site `tsc --noEmit` + `npm run build` verdes, raiz 276/276.

## v2.5 — R3 · Comparativo canvas vs. PixiJS (WebGL) — PR #41 aberto, NÃO mesclado (2026-07-15, branch `claude/r3-webgl-comparativo`)
Sessão começou achando uma tentativa anterior morta: o worktree `/workspace/nos-gl` já tinha um protótipo
inteiro (`site/gl/`) construído e verificado (screenshots, `results.json`, rascunho do doc) mas **nada
commitado nem pushado**. Revisei tudo (li cada arquivo, rodei os builds/testes, olhei os PNGs) antes de
assumir o trabalho como próprio — estava genuinamente sólido, então commitei em cima dele em vez de refazer.

- **O que existe:** `site/gl/` — protótipo isolado (próprio `index.html`/`vite.config`, fora do
  build/typecheck do site ao vivo) que renderiza o mesmo `world/heart.json` de duas formas alternáveis:
  Canvas 2D (cópia do `renderer.ts` + tint dia/noite + luz pontual + bloom de 1 sprite) e PixiJS v8/WebGL
  (batching, luz ambiente+pontual pulsando no Núcleo, *shimmer* de água via shader GLSL próprio, bloom,
  CRT/scanline opcional). Estresse sintético determinístico (hash, sem `Math.random`) mede 1k/5k/10k sprites.
  `pixi.js` 8.19.0 pinned em `site/package.json`, só usado pelo protótipo.
- **Correção real feita nesta sessão:** reproduzi de forma independente os números de "bundle PixiJS isolado"
  do rascunho herdado e NÃO bateram (751,8 kB/190,1 kB gzip alegados vs. ~200-300 kB/~60-76 kB gzip medidos,
  dependendo do formato de build). Em vez de copiar o número não-verificado, escrevi
  `gl/qa/bundle-pixi-isolated.mjs` (script pequeno, reproduzível, comentado) que isola exatamente os símbolos
  do Pixi que o protótipo usa via build de biblioteca Vite (ES module — o formato real de um `import()`
  dinâmico), e troquei os números do doc pelos medidos por ele: **~76 kB gzip** é a "taxa" realista do Pixi
  no cenário de migração recomendado (lazy `import()`), não os ~186 kB do rascunho original.
- **Também:** fiz merge do `origin/main` (7 commits — R2/login GitHub PR #38, batidas #38/#39) para dentro do
  branch (sem conflito — arquivos diferentes) e re-rodei toda a bateria de FPS/memória/screenshots contra o
  mundo atual (batida #39) em vez de deixar o doc referenciando a batida #37 congelada da tentativa morta.
- **Números (sandbox sem GPU real, SwiftShader software-GL — ver ressalva no doc):** Canvas2D venceu em
  throughput bruto de sprites em toda a bateria (ex.: 10k sprites, 24,7 fps Canvas vs. 18,8 fps Pixi) — o
  oposto do que se espera em GPU real; documentado como característica do sandbox, não conclusão sobre
  hardware real. Bundle: site ao vivo hoje 10,4 kB gzip de JS; protótipo `site/gl/` completo 177,7 kB gzip;
  Pixi isolado/*tree-shaken* ~76 kB gzip.
- **Recomendação registrada no PR:** adotar a janela PixiJS como upgrade **opt-in/lazy-loaded** (`import()`
  dinâmico, flag de jogador em `localStorage`) — Canvas2D continua padrão e fallback permanente. O argumento
  decisivo não é performance (não sustentada pelos números deste sandbox); é visual — água com movimento
  real, bloom que generaliza e CRT como *pass* de custo fixo só são práticos com shaders de verdade (D-25e:
  luz Eastward/Octopath). Plano de migração de 6 passos, incremental, sem tocar `engine/`/`world/heart.json`,
  no doc.
- **Intocados, como pedido pela tarefa:** `site/src/`, `engine/`, `world/heart.json`, workflows. Verificado
  de ponta a ponta: `cd site && npx tsc --noEmit && npm run build` verde, `npm ci` em `site/` limpo (igual ao
  CI), raiz `npm test` 276/276, `npm run typecheck`/`lint:sprites`/`validate-world` verdes (réplica local do
  `ci.yml`), `site/gl/` com typecheck/build próprios verdes.
- **Doc completo:** `docs/R3_COMPARATIVO_RENDER.md` (metodologia, tabelas, screenshots em `site/qa/r3/`,
  prós/contras, "o que isto não prova", plano de migração, passos de reprodução).
- **PR #41 aberto, NÃO mesclado** (tarefa pediu explicitamente para não mesclar — é evidência para decisão,
  não feature pronta). `docs/IMPLEMENTATION_PLAN.md` — checkbox do R3 deixado como está (`[ ]`) até a decisão
  de merge, seguindo o padrão do fluxo (checkbox some quando mescla).
- **Pendente para quando alguém decidir:** rodar o teste manual num navegador com GPU de verdade (5 min,
  comando no doc) antes de confiar no argumento de performance — este sandbox não tem GPU.

## Nota de segurança — proteção de branch (dúvida do Tiago, 2026-07-15)
Só quem tem acesso de escrita (Tiago + token da integração) empurra na `main`; desconhecido não force-pusha. Recomendado ao Tiago: ligar SÓ "block force-push + deletion" (inofensivo). NÃO exigir PR/status-checks na main — **o tick (bot) commita direto na main a cada batida**; exigir PR quebraria o coração do jogo. Decisão final é do Tiago.

## Depois
- Registro vs Eco (decisão adiada do Tiago).
- **Board limpo — próxima fatia v2 é a evolução "um nível acima"** (o Tiago pediu fechar pendências ANTES de subir de nível). Recomendada: **economia** (T13) ou **interação leve com NPCs**. Ordem: T14 estruturas / T13 economia / T12 combate. Fundação de segurança pronta.
- Ao integrar combate/economia: usar `getOwn` em TODOS os lookups por string de jogador (STRUCTURE_COSTS, TRADE_RECIPES, world.natives[alvo]).
- Cosmético: Tiago deleta as branches órfãs (o token não deleta — 403). Órfãs mescladas: v1 (claude/v1-*, colaborador2/v1-avatar), Nativos (claude/v2-npc-*, claude/p12-art, claude/p13-validator, claude/sec-harden-tick) e desta faxina (claude/tick-command-robustness, claude/debt-actions-per-tick, claude/art-water-rim, claude/mural-player-said). MANTER `colaborador2/v2` (v2 congelada).

### Acordo de trabalho (definido pelo Tiago)
Tiago = **ideador** (visão, rumo, escopo). Claude = **coder** (integridade do código, decisões técnicas, merges). Não trazer implementação/merge para aprovação do Tiago; parar só em decisões de produto. Registrado aqui para todas as sessões futuras.

## Decisões pendentes (perguntar ao Tiago quando relevante)

- Cadência definitiva do tick na v1 (proposta: 1h).
- Divulgação do lançamento v1 (onde/como).
- ~~Monetização~~ → resolvida: **D-20, sem dinheiro em nenhuma forma, decisão definitiva do Tiago.**

## Como retomar do zero

Ler `CLAUDE.md` → este arquivo → `IMPLEMENTATION_PLAN.md`. O contexto de produto está em `VISION.md` + `GDD.md`; o técnico em `ARCHITECTURE.md`; o porquê das escolhas em `DECISIONS.md`.
