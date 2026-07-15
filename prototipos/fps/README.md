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
