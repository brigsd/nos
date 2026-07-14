# Resumo de Alterações — Colaborador 2 (T5, T6, T8, T9)

Este documento foi criado para que o **Colaborador 1** (ou qualquer outro agente/desenvolvedor) possa compreender todas as mudanças implementadas na branch `colaborador2/v1-t5-avatar` de forma rápida e economizando tokens.

---

## 🛠️ O que foi implementado

### 1. Avatar Local e Movimentação (T5)
* **Sprite do Avatar:** Gerador procedural adicionado a `assets/tools/author-sprites.js` (`genNoAvatar`). O arquivo fonte `no_avatar.json` e a imagem `no_avatar.png` (16x16) foram gerados e compilados.
* **Classe `LocalPlayer` (`site/src/player.ts`):** Lógica que controla a posição local e visual do jogador, aplicando restrições de biomas (colisão contra água/fora do mapa) e velocidade.
* **WASD / Arrows & Toque (BFS):**
  * Movimentação instantânea por teclado na grade de tiles.
  * O clique/toque no canvas ativa uma busca BFS para traçar o menor caminho caminhável até o destino de forma fluida.
* **Câmera & Renderer:** A câmera foca no jogador ao iniciar. `site/src/renderer.ts` renderiza os avatares dos outros jogadores (do estado do mundo) e o avatar local com name tags ("Você" para o local).

### 2. Processador de Comandos via Issues (T6)
* **Lógica de Ações (`engine/commands.ts`):**
  * `/entrar`: Spawna o jogador em `(30, 30)` se ele não existir, com 100 de energia.
  * `/mover x y`: Move o avatar para um tile adjacente (distância máxima 1), gastando **1 de energia**.
  * `/coletar`: Extrai recursos do tile atual (madeira/pedra/fragmento), gastando **5 de energia**.
  * `/dizer`: Publica mensagens no mural d'O Coração, gastando **0 de energia**.
* **Validações e Justiça:** Limite fixado em **3 ações por jogador por tick**. Execução determinística ordenada por timestamp e número da issue.
* **Issue Templates:** Adicionados formulários YAML em `.github/ISSUE_TEMPLATE/` (`entrar.yml`, `mover.yml`, `coletar.yml`, `dizer.yml`).

### 3. Guardrails de CI (T8)
* **Linter de Sprites (`assets/tools/lint-sprites.js`):** Script leve em Node que valida a integridade visual (resolução 16x16 ou 32x32, indexação correta de cores e validação contra a paleta de cores *Resurrect 64*).
* **Validador de Estado (`engine/scripts/validate-world.ts`):** Script em TS que analisa `world/heart.json` contra o schema do AJV.
* **CI Workflow (`.github/workflows/ci.yml`):** Executa em PRs para validar `typecheck` (raiz e site), testes unitários, linter de sprites, validador de estado e build de produção do site.

### 4. Estatísticas no README (T9)
* **README Vivo:** Adicionadas tags `<!-- stats-start -->` e `<!-- stats-end -->` no `README.md`.
* O script de tick (`scripts/tick.ts`) atualiza dinamicamente as batidas (ticks) e o número de jogadores ativos do mundo a cada execução bem-sucedida.

### 5. Script de Resposta automática (`scripts/respond-issues.ts`)
* Lê `command_results.json` gerado pelo tick e utiliza de forma segura a CLI `gh` para comentar o feedback da ação do jogador e fechar a issue correspondente.

---

## 🧪 Cobertura e Validação Local
- **Testes Unitários:** Adicionado `engine/commands.test.ts` (12 testes).
- **Status:** **Todos os 90 testes unitários do projeto estão passando (`npm run test`)**.
- **Tipo & Build:** `npm run typecheck` e `npm run build` executam sem erros.
