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
- [ ] W2 · Porte da cena Pixi (branch de evidência `claude/r3-webgl-comparativo`) para `renderer-webgl.ts` (Sonnet) + review Opus + validação do Tiago em dispositivo real — *repriorizar: com o FPS oficial (F1), W2 vira melhoria do mapa 2D, não do cliente principal*
- [ ] C1 · Urbanização d'O Coração (arquiteto Fable, branch `claude/cidade-coracao`): CITY_PLAN, seedCityLayout, tiles/sprites novos, ≥3 rodadas de auto-auditoria — review meu + sign-off estético do Tiago

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
