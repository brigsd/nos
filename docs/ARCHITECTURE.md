# Arquitetura — NÓS

```mermaid
flowchart LR
    P[Jogador<br/>navegador PC/celular] -->|comandos via issue| I[Issues]
    I --> T[Tick — GitHub Actions<br/>cron + processamento em lote]
    T -->|1 commit por tick| W[(world/*.json<br/>estado oficial)]
    W --> D[Deploy Pages<br/>via artifact]
    D --> S[Site — canvas 2D<br/>brigsd.github.io/nos]
    S --> P
```

## Pastas

```
engine/          motor do mundo (TypeScript, roda no tick)
  schema/        JSON Schema do estado — guardrail: estado inválido não entra
world/           estado oficial do universo (JSON pequeno, 1 commit por tick)
site/            cliente visual (TypeScript + canvas, publicado no Pages)
assets/          sprites, tiles, paleta + CREDITS.md
.github/
  workflows/     tick.yml (cron) · ci.yml (testes+validação em PRs) · pages.yml (deploy)
  ISSUE_TEMPLATE/ formulários de comando (mover, coletar, dizer...)
docs/            visão, GDD, plano, continuidade, decisões, lore
.claude/agents/  agentes especializados (arte, código, lore, QA)
```

## Princípios técnicos

1. **TypeScript em tudo** — engine e cliente compartilham os mesmos tipos; impossível divergirem.
2. **1 tick = 1 commit** — custo constante por unidade de tempo, independente do nº de jogadores.
3. **Pages por artifact** (`actions/deploy-pages`) — o site publicado não entra no histórico git; repositório permanece leve para sempre.
4. **Determinismo** — mesmo estado + mesmos comandos + mesma seed ⇒ mesmo resultado. Permite replay, auditoria e testes.
5. **Guardrails no CI** — todo PR roda: testes da engine, validação de schema do mundo, lint de sprites (dimensões/paleta). Merge bloqueado se falhar.
6. **Cliente burro, tick esperto** — o navegador só apresenta e monta comandos; toda regra de jogo vive na engine.

## Limites conhecidos (e mitigação)

- Latência de ação: 30s–60min conforme cadência do tick → design assíncrono assumido.
- Rate limit da API com muitos jogadores → comandos como comentários numa issue-thread única + N ações/tick por jogador.
- Actions em repo público: gratuito e ilimitado; jobs de tick devem terminar em minutos.
