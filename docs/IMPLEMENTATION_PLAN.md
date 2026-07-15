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
- [x] R4 · Motor de fabricação (PR #39; falta painel Oficinas na tela): 4 máquinas-sintetizador (D-25a), receitas JSON, comando /sintetizar, oficinas no mapa — minijogos plugam depois (design do ideador)
- [ ] R5 · Fluidez B: polling autenticado 1–3s (ETag/304) — presença + chat-speed
- [ ] R6 · Portais: protocolo + hall + 2º mundo de teste (travessia entre repos na mesma janela)
- [ ] R7 · Fluidez A: WebRTC P2P (camada Intenção; STUN público, opt-in com aviso de IP — D-25c)

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
