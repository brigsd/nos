# Plano de Implementação — NÓS

## v0 — Fundação
- [x] Nome, visão e decisões estruturais
- [x] Harness (CLAUDE.md), documentação e agentes
- [x] Repositório público `brigsd/nos` criado e estrutura enviada
- [x] Backlog inicial como issues (#1–#9)

## v1 — O Coração pulsa (meta: jogável)
- [ ] T1 · Engine: tipos do mundo + JSON Schema + validador
- [ ] T2 · Gerador procedural do mapa d'O Coração (64×64, seed fixa)
- [ ] T3 · Tick mínimo: cron horário + disparo por evento de comando (D-11), 1 commit por lote ("batida" visível)
- [ ] T4 · Site no Pages: renderiza o mapa em canvas, mobile + desktop
- [ ] T5 · Avatar local andável (toque/WASD) com sprite próprio
- [ ] T6 · Comandos `/entrar`, `/mover`, `/coletar`, `/dizer` via issue-form + processamento no tick
- [ ] T7 · Arte base: tileset adaptado à paleta + sprite do Núcleo pulsante
- [ ] T8 · CI guardrails: testes, schema, lint de sprites — bloqueando merge
- [ ] T9 · README vivo: contador de batidas + jogadores ativos
- [ ] 🎉 Lançamento v1: primeiro jogador externo entra no mundo

## v2 — O mundo responde
- [ ] Nativos (NPCs) com árvores de comportamento + falas do lore-writer
- [ ] Combate por turnos autoritativo com replay animado no cliente
- [ ] Economia: Pulso (₱), inventário, comércio com Nativos
- [ ] Construção de estruturas persistentes
- [ ] Mural do mundo + registro de eventos (a "crônica")
- [ ] Login com GitHub no site (OAuth device flow, D-13) — agir sem sair do jogo

## v3 — O metaverso
- [ ] Portais e segundo mundo
- [ ] Kit de criação de mundos + pipeline de PR comunitário (validação automática)
- [ ] A Caçada: enigmas escondidos no jogo E no histórico do repositório
- [ ] PWA (instalável no celular)
- [ ] Governança comunitária das decisões de mundo

## Regras do plano

- Uma task = uma issue = um PR. Checkbox só marca com feature mesclada e verificada pelo qa-tester.
- Mudou o plano? Registrar o porquê em `DECISIONS.md`.
