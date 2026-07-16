# Plano de Implementação — NÓS

## v0 — Fundação
- [x] Nome, visão e decisões estruturais
- [x] Harness (CLAUDE.md), documentação e agentes
- [x] Repositório público `brigsd/nos` criado e estrutura enviada
- [x] Backlog inicial como issues (#1–#9)

## v1 — O Coração pulsa (meta: jogável)
- [x] T1 · Engine: tipos do mundo + JSON Schema + validador (PR #11, 62 testes; follow-up #13)
- [x] T2 · Gerador procedural do mapa d'O Coração (64×64, seed fixa) (PR #11, stress-test 25k seeds)
- [x] T3 · Tick mínimo: cron horário + disparo por evento de comando (D-11), 1 commit por lote ("batida" visível) (PR #14)
- [x] T4 · Site no Pages: renderiza o mapa em canvas, mobile + desktop (PR #14)
- [x] T5 · Avatar local andável (toque/WASD) com sprite próprio (PR #14)
- [x] T6 · Comandos `/entrar`, `/mover`, `/coletar`, `/dizer` via issue-form + processamento no tick (PR #14)
- [x] T7 · Arte base: tileset adaptado à paleta + sprite do Núcleo pulsante (PR #10; refinos em #12)
- [x] T8 · CI guardrails: testes, schema, lint de sprites — bloqueando merge
- [x] T9 · README vivo: contador de batidas + jogadores ativos
- [ ] 🎉 Lançamento v1: primeiro jogador externo entra no mundo

## v2 — O mundo responde
- [x] Nativos (NPCs) com árvores de comportamento + falas do lore-writer (fatia "até a tela" concluída)
- [ ] ~~Combate por turnos~~ → **cancelado n'O Coração (D-23)**; combate é tema de outros mundos (v3)
- [ ] Economia: Pulso (₱), inventário, comércio com Nativos
- [ ] **A Fábrica (D-23)**: receitas + oficinas de ofício com minijogos (fases: 2–3 ofícios primeiro)
- [ ] Construção de estruturas persistentes
- [ ] Mural do mundo + registro de eventos — a Crônica auto-escrita (D-16)
- [ ] Login com GitHub no site (OAuth device flow, D-13) — agir sem sair do jogo
- [ ] v2.5 · Nativos com IA via GitHub Models (D-15)
- [ ] Tick auto-corretivo + snapshots como releases (D-19)

## v2.5 — Os trilhos do coder (D-24, autonomia total; ordem de execução)
- [x] R1 · O Eco no renderer (D-25b: jogador sólido, Registro fantasma)
- [x] R2 · Login GitHub (D-13) — PAT-based hoje (device flow travado por CORS, código pronto atrás de flag; ver docs/CONTINUITY.md)
- [x] R3 · Comparativo (D-26: PixiJS opt-in, canvas padrão) canvas vs. PixiJS + janela WebGL (mira: luz Eastward/Octopath; contrato de mundo intocado)
- [x] R4 · Motor de fabricação (PR #39, mesclado) + painel Oficinas na tela (PR #42, mesclado): 4 máquinas-sintetizador (D-25a), receitas JSON, comando /sintetizar, oficinas no mapa e no HUD — minijogos plugam depois (design do ideador)
- [x] R5 · Fluidez B (PR #43): polling autenticado ~3s (ETag/304) + indicador "pulso ao vivo"
- [x] R6 · Portais fase 1 (PR #44, D-27): `worlds/registry.json` (protocolo) + O Salão de Portais no HUD + O Átrio (2º mundo, estático, 32×32) + travessia real sem sair do site (fetch/valida/troca o mundo em tela, câmera, banner "de visita", pausa/retoma o pulso ao vivo) + marco do portal no mapa. Visitar é só-leitura por design nesta fase — check-in/check-out (D-21) e agir em mundo remoto ficam para quando a federação de repositórios de verdade chegar (`docs/PORTALS_PROTOCOL.md`, v3 abaixo)
- [x] R7 · Fluidez A (PR #45, mesclado): WebRTC P2P, a camada Intenção (D-25c/D-28) — sinalização por comentários de issue, STUN público como única exceção, opt-in com copy honesta sobre IP em issue pública, anti-spam com backoff, vulto translúcido interpolado no renderer

## Pós-v2.5 — trilhos em andamento (D-24)
- [x] W1 · Cirurgia da interface `Renderer` (D-26): `FrameScene`/`Renderer`/`createCanvasRenderer` em renderer.ts, seleção por flag `nos_renderer` com fallback permanente pra Canvas2D, stub lazy `renderer-webgl.ts` (feita pelo coder principal, direto no main — neutra em comportamento, QA visual + fallback provados)
- [x] **F1 · Primeira pessoa vira o cliente OFICIAL (D-29, decisão do ideador)**: o raycaster (`prototipos/fps/`, ilha flutuante + dia/noite + água shader + árvores L-system) é publicado pelo Pages em `/fps/` via `site/scripts/build-fps.mjs` (mundo da batida atual inlined a cada deploy; pages.yml já redeploya a cada batida). Botão JOGAR do README → `/fps/`; mapa 2D segue na raiz como visão de cima + painéis (Mural/Comércio/Portais), com links cruzados entre os dois.
- [x] F2 · Dieta do repo (D-30): binários regeneráveis fora da main — previews `_8x`/contact sheets/mapa mock agora saem em `assets/preview/` (gitignorado; `assets/tools/` ajustados), screenshots de QA (site/qa, prototipos) removidos e ignorados — evidência vive nos branches de trabalho; ~5MB fora do checkout e do deploy.
- [x] F3 · Carreiro + clareira + spawn novo (D-31): estrada de terra do spawn (campina norte, rio longe) até a clareira na floresta NE — o sítio da futura cidade. Campo de distância client-side (mundo oficial intocado), fileiras de árvores na campina, corredor desbastado na mata, largo de terra, minimapa. QA: caminhada com colisão real de ponta a ponta, 57-60fps
- [ ] W2 · Porte da cena Pixi (branch de evidência `claude/r3-webgl-comparativo`) para `renderer-webgl.ts` (Sonnet) + review Opus + validação do Tiago em dispositivo real — *repriorizar: com o FPS oficial (F1), W2 vira melhoria do mapa 2D, não do cliente principal*
- [x] C1 · **A Clareira v1 construída (D-32)** — aprovada pelo ideador (cobre oxidado, veios azuis/roxos pulsantes, largo de pedra, nome A Clareira): paredes DDA client-side com altura por tile, 4 alas, 3 bancas, Hall de Portais com o Átrio aceso, chaminé fumegando, calçamento de lajotas com veias do Pulso. Substitui o plano antigo da cidade 2D (branch `claude/cidade-coracao`, arte reprovada)
- [x] C2 · **A Clareira canonizada** (autorizada pelo ideador): 73 tiles floresta→campina (círculo r5, madeira derrubada junto — schema exige) + 4 máquinas migradas pros vãos das alas — forja (48,13), cozinha (48,18), bancada (44,18), estaleiro (44,13) — via `serializeWorld`/`assertValidWorld` do motor (formato preservado, 81 linhas de diff); guardrail de gênese em `engine/mapgen.test.ts` atualizado com a exceção documentada (única mudança de bioma pós-gênese)
- [x] F4 · Comunicação ideador↔coder (D-33): tags de ID (tecla I), setores A1–H8 no mapa grande (M cicla), ?cam= na URL, `docs/COMUNICACAO.md`; fix da borda-céu (nuvens em perspectiva de plano fundo)
- [x] F5 · **Os Habitantes (D-34, fases 1+2)**: mentes em `brigsd/nos-mentes` (brasa/broa/quilha — persona+memórias commitadas), pensam a cada hora via GitHub Models com fallback determinístico, balões no FPS via falas.json; a mão (`NOS_PAT`) posta `Comando: /habitar` e o motor valida (allowlist `MENTES_GUARDIAS`, 2 falas/batida/habitante) → `native_spoke` no mundo, visível no Mural do 2D
- [x] F7 · **A bancada do coder (D-35)**: `npm run olhar` (auditoria visual offline por pontos canônicos, `qa/pontos.json`), `?tod=` determinístico no cliente, `docs/CODER.md` (método do diário de atrito, navegação no arquivo grande, tabela limite→mitigação, kit de replicação pra mundos novos)
- [x] F8 · **GI assada (D-36, passe A dos gráficos)**: path tracer offline em `prototipos/fps/bake/` (sol/céu/rebote/copas/luzes ocluídas, 3 horários, PNG 58KB), inlined pelo build, 1 sampler no cliente + paredes por coluna, tecla G, 59-60fps — calibrado em 4 rodadas pelo `npm run olhar`
- [ ] F9 · Gráficos passes B e C (D-36): horizonte matte-painting path-traced em camadas com paralaxe; "a quietude revela" (acumulação temporal parado = o quadro converge pra pintura — mecânica-metáfora do D-22)
- [ ] F6 · Habitantes fase 3: mais verbos (/trocar, /fabricar, mover-se), presença no estado do mundo, GitHub App pra identidade própria de bot, mentes apadrinhadas pela comunidade (template)
- [ ] C3 · A Clareira fase 3: doca do Estaleiro apontando pro vazio, letreiros/lampiões, interiores; arte de ruína de verdade pras ruínas NW (hoje ocultas no FPS)

## v3 — O metaverso
- [ ] Portais e segundo mundo
- [ ] Kit de criação de mundos + pipeline de PR comunitário (validação automática)
- [ ] Federação: protocolo de portais entre repositórios (D-17)
- [ ] Quests que rendem achievements reais de GitHub (D-18)
- [ ] A Caçada: enigmas escondidos no jogo E no histórico do repositório
- [ ] PWA (instalável no celular)
- [ ] Governança comunitária das decisões de mundo

## Regras do plano

- Uma task = uma issue = um PR. Checkbox só marca com feature mesclada e verificada pelo qa-tester.
- Mudou o plano? Registrar o porquê em `DECISIONS.md`.
