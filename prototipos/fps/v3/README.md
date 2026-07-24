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
    render.js   o VISOR: sol+sombra PCF (tier), luz de céu (tier), névoa, partículas
                (tier), grama, blit — câmera ÓRBITA (Oficina) OU LIVRE (setCam, D-61)
    input.js    teclado+mouse (pointer lock) + joystick touch (D-47/48/49 portado)
    som.js      Web Audio: ambiente (vento+água por proximidade) + passos (D-61)
  pecas/        cada peça é um módulo JS autocontido (contrato abaixo)
    casa-toras.js   a cabana aprovada (D-54f) — a peça de referência
    ilha-chao.js    o chão: ilha flutuante + ilhotas no horizonte (D-58)
    arvore3d.js     árvore: tronco+copa 3D, respeita ctx.TS e ctx.seed (D-59/61)
    _modelo.js      template comentado ("olá mundo": cubo animado)
  visor.html    abre uma peça ISOLADA: ?peca=nome&res=640&ts=4[&a=&e=&r=] — órbita
  jogo.html     o ALICERCE jogável (D-61): ilha+árvores plantadas, câmera livre
                (WASD/mouse/touch), pausa+configurações (som/gráficos/controles/
                idioma). NÃO é o cliente v3 definitivo — é onde ele nasce.
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

## O ciclo

1. copie `pecas/_modelo.js` → `pecas/minha-peca.js`
2. `npm run peca -- minha-peca` — screenshots em 3 ângulos (tools/bancadas/out/)
3. LEIA os PNGs, itere até ficar bom de verdade (crítico, não complacente)
4. publique: push na `main` — o `pages.yml` copia `v3/` direto pro Pages —
   `https://brigsd.github.io/nos/fps/v3/visor.html?peca=minha-peca`

## Limites honestos (hoje)

- **Reflexos**: recurso do motor (passe planar/água), planejado, não feito.
- **Sem colisão de verdade**: `jogo.html` só trava o jogador num raio (MAXR=25)
  do centro da ilha — atravessa tronco de árvore, não cai na lagoa. O motor de
  segmento/colisão da v2 (D-53) não foi portado ainda.
- **As árvores plantadas em `jogo.html` são PLACEHOLDER**: 12 posições fixas,
  4 variantes por seed — não é o "plantar árvores" definitivo (densidade,
  espécie, relação com o terreno ainda em aberto).
- **`ilha-chao.js` não respeita `ctx.TS`** (só `arvore3d.js` foi migrada) — o
  tier de textura do menu não afeta grama/água/rocha, só as árvores.
- **Sombra "Alto" (2048px) é PESADA**: medido em WebGL por software (sandbox)
  caiu de ~20fps (Médio) pra ~10fps — trate como experimental até medir num
  aparelho de verdade (a mesma ressalva do D-54 sobre swiftshader).
- O cliente v3 em si (mundo, HUD, gameplay) é o PORT em andamento; `jogo.html`
  é o primeiro alicerce jogável, não o jogo pronto — falta identidade/economia/
  mago-guia (D-57) e a passagem de bastão do `/fps/` (v2) pro v3 (D-55).
