---
name: estruturas
description: Fluxo de criação e auditoria de estruturas no cliente FPS do NÓS — blueprint de topo (prancheta), colisão, paredes/arcos com profundidade, verificação multi-ângulo. Use ao criar, mover ou aprimorar qualquer estrutura (prédio, arco, monumento, praça).
---

# Estruturas — criar e auditar com visão total

O ciclo: **prancheta (topo) → construir → prancheta de novo → olhar (3 ângulos) → testes**.
Nunca construa às cegas: a prancheta é a planta baixa VIVA do mundo.

## 1 · Antes de construir: a planta

```bash
npm run prancheta                  # A Clareira (40,9 -> 55,23)
npm run prancheta -- 25,8,50,20   # qualquer recorte x0,y0,x1,y1
```

LEIA o PNG (`prototipos/fps/qa/out/prancheta.png`): hachura = tile sólido ·
bloco+número = parede da cidade (altura) · círculo vermelho = colisão exata
(tronco/pilar/anel) · traço teal = plano orientado (arco/portal, com espessura)
· pontos = billboards. Fonte: `window.__nosMapa()` — as estruturas VIVAS do
cliente, nada duplicado. Cheque: vai colidir com algo? tapa caminho/vista?

## 2 · Construir (as peças do motor, em `prototipos/fps/nos-fps.html`)

| Peça | Quando | Como |
|---|---|---|
| `cityWall(tx,ty,kind,h,mm)` | volume sólido por tile (prédio) | altura `h` em tiles; `mm` = cor no minimapa; DDA desenha e colide |
| billboard normal | objeto que PODE encarar a câmera (árvore, sólido de revolução tipo o chafariz) | `bills.push({x,y,genFrames,label,scale,...})` |
| billboard **orientado** | arquitetura plana (arco, portal, letreiro) | `+ orient:` (ângulo do plano no mundo) — circundar encurta até o perfil |
| **profundidade** | espessura 3D no orientado | `+ depth:` (tiles) — extrusão em fatias adaptativas, AO sutil no fundo |
| `addTrunk(tx,ty,x,y,r)` | colisão fina circular | pilares/anéis; a prancheta mostra o círculo exato |

Regras: paleta Resurrect 64; texturas por gerador (`genWallTex`/`gen*`);
**sincronize `prototipos/fps/bake/bake-gi.mjs` (BOXES/LIGHTS)** se mexer em
volume ou luz — e re-rode o baker.

## 3 · Depois: auditar

1. `npm run prancheta` de novo — colisão onde planejou, nada invadindo caminho.
2. `npm run olhar -- <x,y,a>` em **3 ângulos** (frente, 45°, perfil) + `--tod=0.8`
   se tiver luz. LER os PNGs (achado do D-50: fatias viram "pente"? AO pesado?).
3. `npm test` (368+) e, se o visual mudou, atualizar os pontos canônicos
   (`prototipos/fps/qa/pontos.json`).

## Limitações honestas

- Estrutura nova só publica com toque em `site/**` (gap do pages.yml).
- Billboard orientado não escreve no zbuf: sprites muito próximos do plano
  podem sortear errado (ordem por centro).
- Próximo passo planejado (F17): formato PLANTA — desenhar a estrutura como
  blueprint declarativo (paredes/colisões/billboards num objeto só) e o motor
  "sobe" tudo; a prancheta já é a metade de leitura desse ciclo.
