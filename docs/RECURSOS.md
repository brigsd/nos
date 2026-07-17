# Recursos do coder — o índice único

O mapa de TUDO que ajuda a desenvolver o NÓS: scripts, ferramentas, MCP e
agentes, cada um com *como invocar*. Sessão nova? Comece por aqui e por
`docs/CODER.md` (o método + as bancadas). Achou tooling que não está listado?
Adicione — a próxima sessão agradece.

## Pré-requisito das bancadas visuais

`npm run olhar` e `npm run ouvir` usam o **Playwright/Chromium do `site/`** (não
há Playwright na raiz). Rode **uma vez** por checkout fresco:

```bash
cd site && npm ci
```

Sem isso, as bancadas saem com uma mensagem pedindo exatamente esse comando.

## Scripts npm — raiz (`package.json`)

| Comando | O que faz |
|---|---|
| `npm test` | Vitest — cobre `engine/**` e `tools/**` (o gate de sempre) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run olhar` | **Bancada visual do FPS** (D-35): screenshot de pontos de vista canônicos. `npm run olhar -- forja portais`, `-- 46.2,15.6,0.9`, `-- largo-noite --tod=0.8`. Depois **LEIA os PNGs** em `prototipos/fps/qa/out/` |
| `npm run ouvir` | **Bancada de som** (D-40): mede estado/ganho/RMS do áudio, barra a regressão muda. `npm run ouvir -- chafariz spawn` |
| `npm run art` | CLI do art-mcp (= `node tools/art-mcp/cli.cjs`) — ver "Estúdio de arte" abaixo |
| `npm run build:sprites` | Renderiza `assets/sprites/src/*.json` → `assets/sprites/*.png` + folhas de contato (= `node assets/tools/build.cjs`) |
| `npm run lint:sprites` | Valida os PNGs de sprite (roda no CI) |
| `npm run genworld` / `mapascii` / `validate-world` | Scripts da engine (`engine/scripts/*.ts`): gerar mundo, mapa ASCII, validar `world/heart.json` |
| `npm run tick` | Roda um tick do mundo localmente (`scripts/tick.ts`) |
| `npm run validate-worlds` | Valida o `worlds/registry.json` e os mundos |
| `npm run respond-issues` | Processa comandos de issues (`scripts/respond-issues.ts`) |

## Scripts npm — `site/` (cliente 2D + publicação do FPS)

Rode de dentro de `site/`. `predev`/`prebuild` já chamam `copy-data` + `build-fps`.

| Comando | O que faz |
|---|---|
| `npm run dev` | Vite dev server (cliente 2D + `/fps/`) |
| `npm run build` | Build de produção (o que o Pages publica) |
| `npm run preview` | Serve o build (`:4173`) |
| `npm run qa` | Screenshot do 2D (`qa/screenshot.mjs`) — há outros scripts em `site/qa/` rodáveis via `node qa/<x>.mjs` |

## Estúdio de arte — `tools/art-mcp/`

O ciclo completo de pixel art: **gerar → renderizar → OLHAR → auditar → corrigir**.
Documentação canônica: `tools/art-mcp/README.md`. Via CLI (`npm run art -- <cmd>` ou
`node tools/art-mcp/cli.cjs <cmd>`) ou via MCP (server `nos-art-toolkit`, ver abaixo).

| Comando | O que faz |
|---|---|
| `gen --preset <p> --size 64 --seed x` | Textura tileável de um preset |
| `audit --src <json> [--tileable]` | Crítico algorítmico (paleta, costura, órfãos, silhueta) |
| `view --src <json> [--scale 8]` | Frame ampliado, fundo escuro E claro |
| `preview --wall <json> [--billboard <json>]` | Cena in-engine (fog/perspectiva do FPS) |
| `turnaround [--figure <json>]` | Boneco 3D em 8 vistas (andaime pra personagem) |
| `sheet --dir <dir>` / `diff --before a --after b` / `presets` | Folha de contato / diff / listar presets |

Autoria de sprite por código: geradores `assets/tools/author-*.cjs` (ex.: `author-brasa.cjs`,
D-42). Fonte da verdade = `assets/sprites/src/*.json` (matriz de índices). Detalhe em
`assets/tools/README.md`.

## Outras ferramentas

| Ferramenta | Caminho | Como rodar |
|---|---|---|
| Path tracer da GI assada (D-36) | `prototipos/fps/bake/bake-gi.mjs` | `node prototipos/fps/bake/bake-gi.mjs` (o `build-fps` auto-assa se faltar) |
| Publicação do FPS | `site/scripts/build-fps.mjs` | roda no `predev`/`prebuild`; tocá-lo **dispara o deploy** (ver nota abaixo) |
| Estúdio de cena de árvore | `prototipos/estudio/tree-studio.html` | abrir no navegador |

**Nota de deploy (medida 2026-07-17):** o `pages.yml` só dispara em push a
`site/**`, `world/**`, `assets/**` ou `engine/types.ts`. Mudança só em
`prototipos/fps/**` NÃO publica sozinha — toque um arquivo de trigger (ex.:
`site/scripts/build-fps.mjs`) pra forçar. Correção definitiva (com o ideador):
adicionar `- 'prototipos/fps/**'` aos paths do `pages.yml`.

## MCP

| Server | Definido em | Expõe | Carga |
|---|---|---|---|
| `nos-art-toolkit` | `.mcp.json` (raiz) | as tools do art-mcp (gen/audit/view/preview/…) | automático no início da sessão; no meio dela use o CLI `npm run art` |

## Agentes — `.claude/agents/` (D-10, D-24)

Despache em paralelo; o orquestrador integra e decide, registrando divergências
em `docs/DECISIONS.md`. **Modelos (D-24): codadores em Sonnet, revisores em Opus.**

| Agente | Papel | Quando despachar | Modelo |
|---|---|---|---|
| `engine-dev` | Motor (TS): tick, schema, comandos, geração | features de engine/backend | sonnet |
| `pixel-artist` | Sprites como código (matriz → PNG) | arte nova ou retoque | sonnet |
| `lore-writer` | Quests, diálogos, nomes, descrições | qualquer texto de jogo | sonnet |
| `code-reviewer` | Revisa diffs (corretude, determinismo, invariantes) | todo PR, antes do merge | **opus** |
| `art-reviewer` | Revisa arte renderizada, com veto | após qualquer mudança visual | **opus** |
| `qa-tester` | Joga a build headless, screenshot, reporta bug | antes de todo merge com efeito visível | **opus** |

**Fluxo padrão de feature** (`CLAUDE.md`): construir → `code-reviewer` (+ `art-reviewer`
se houver arte) → `qa-tester` → merge → atualizar `docs/CONTINUITY.md` + checkboxes do plano.

## Docs de orientação

`CLAUDE.md` (acordo + regras) · `docs/CODER.md` (método + bancadas + limites) ·
`docs/CONTINUITY.md` (o "save game") · `docs/DECISIONS.md` (decisões numeradas) ·
`docs/IMPLEMENTATION_PLAN.md` (o plano) · `docs/COMUNICACAO.md` (IDs/setores) ·
`docs/ARCHITECTURE.md` · `docs/GDD.md` · `docs/LORE.md` · `docs/HABITANTES.md` ·
`docs/CIDADE.md` · `docs/PORTALS_PROTOCOL.md`.
