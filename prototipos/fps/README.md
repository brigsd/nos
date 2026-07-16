# Protótipo — Visão da Intenção (O Coração em primeira pessoa)

Raycaster clássico (DDA + floor casting + billboards, ~300 linhas, sem lib)
lendo o MESMO `world/heart.json` e os MESMOS sprites 16px do jogo.
O Núcleo vira um orbe de luz procedural pulsando sobre a praça; fog para o
vazio, céu estrelado, 60fps a 320×180.

**Não é parte do site.** É um protótipo de discussão de direção (teto
gráfico / câmera em primeira pessoa) — se aprovado, vira uma "janela"
opt-in (D-26) integrada em `site/`.

## Rodar
```
node build-data.mjs   # regenera data.js a partir do mundo/sprites atuais
# abra nos-fps.html no navegador (file:// funciona — tudo local)
```
Controles: WASD anda, ←/→ olha, M alterna o minimapa; no touch, arraste
(esquerda anda, direita olha).

Screenshots: `shot-spawn.png` (spawn: orbe + oficinas + rio) e
`shot-core.png` (perto da forja).

## Modo dia (iteração 2 — direção BotW)

A pedido do ideador (referência: campos de Breath of the Wild), o protótipo
virou DIA e a floresta deixou de ser parede esticada:

- **Árvores geradas** (`tree-core.js`, L-system + copa por campo de
  densidade) como BILLBOARDS de verdade — 6 variantes, uma por tile de
  floresta (com desbaste + jitter determinístico), até ~3.0 tiles de altura.
- **Rochas geradas** (blob + normal quantizada + musgo) espalhadas pela
  campina por hash determinístico; bloqueiam movimento.
- **Céu panorâmico** (gira com a câmera): gradiente liso + cúmulos + maciço
  fixo no rumo leste como marco do mundo. Nuvens à deriva.
- **Bruma diurna** (paleMint) no lugar do breu — a distância derrete em luz.
- Chão de grama gerado (base clara + salpicos + flores, ref. BotW).
- `prototipos/estudio/tree-studio.html`: o Estúdio de Cena interativo
  (árvores 4 espécies × 5 humores, rochas, céu, cena composta — exporta PNG).

Screenshots: `shot-day-forest.png`, `shot-day-forest-close.png`,
`shot-day-rock.png`; cena 2D de referência em `../estudio/cena-11.png`.
