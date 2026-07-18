# v3 — o cliente GPU e A OFICINA (D-55)

Rumo travado pelo ideador: **`v2` (branch) preserva o jogo atual (CPU raycaster)**;
na `main` nasce o **v3 (WebGL/GPU)** — pixel art, render fixo (`?res=`) com upscale
nítido, custo independente da tela (o conserto do "roda terrível no celular").

## A OFICINA — o ambiente padrão de criação

Espaço ISOLADO e padronizado pra criar as coisas do mundo: objetos, texturas,
animações — e, em breve, sons e reflexos. A regra de ouro: **o visor usa o MESMO
motor que o cliente v3** — o que fica bom na oficina, fica bom no jogo.

```
v3/
  motor/        o motor (compartilhado com o futuro cliente)
    mat4.js     matrizes (persp/ortho/lookAt/rotY/translate)
    tex.js      paleta Resurrect64, ruído, dither, texCanvas (índice | [r,g,b] | -1)
    geo.js      Mesh/quad/quadUV/tri/box (8 floats/vértice)
    render.js   o VISOR: sol+sombra PCF, luz de céu, névoa, partículas, grama, blit
  pecas/        cada peça é um módulo JS autocontido (contrato abaixo)
    casa-toras.js   a cabana aprovada (D-54f) — a peça de referência
    _modelo.js      template comentado ("olá mundo": cubo animado)
  visor.html    abre qualquer peça: ?peca=nome&res=640&ts=4[&a=&e=&r=]
```

## O contrato de peça

```js
export const meta = { nome, tipo: 'objeto' | 'chao', desc };
export function construir(ctx) {
  // ctx = { TS, tex: {texCanvas, dth, hash2, vnoise, fbm, PALETTE, RGB},
  //         geo: {Mesh, quad, quadUV, tri, box}, m4 }
  return {
    lotes: [{ mesh, tex, matriz? }],   // malha CPU + canvas; o visor sobe pra GPU
    animar?: (t, lotes) => {},          // anima trocando lotes[i].matriz
    // opções de PAISAGEM (ilha-chao é o exemplo):
    palco?: false,        // a peça É o chão -> some a grama padrão do visor
    particulas?: false,   // sem pólen (em paisagem lia como enxame)
    fog?: [início, alcance],  // névoa própria (a padrão esmaga cenas grandes)
    far?: 320,            // far plane próprio (o padrão 60 cortaria o longe)
    camera?: { e, r },    // órbita sugerida (?e/?r da URL vencem)
  };
}
```

## O ciclo (igual /estruturas, agora pra peças)

1. copie `pecas/_modelo.js` → `pecas/minha-peca.js`
2. `npm run peca -- minha-peca` — screenshots em 3 ângulos (tools/bancadas/out/)
3. LEIA os PNGs, itere até ficar bom de verdade (crítico, não complacente)
4. publique: o build copia `v3/` pra `site/public/fps/v3/` —
   `https://brigsd.github.io/nos/fps/v3/visor.html?peca=minha-peca`

## Limites honestos (hoje)

- **Sons**: ainda no cliente v2 (`SOM`/`npm run ouvir`); peça de som entra na
  oficina numa próxima rodada.
- **Reflexos**: recurso do motor (passe planar/água), planejado, não feito.
- **Câmera andável** (WASD/touch) no visor: ainda não — órbita/fixa por URL.
- O cliente v3 em si (mundo, HUD, gameplay) é o PORT em andamento — a oficina
  é a primeira cidadã do motor, não o jogo pronto.
