# assets/tools — a pipeline de sprites

A **fonte da verdade** de cada sprite é a matriz de índices da paleta em
`assets/sprites/src/*.json` (nunca o PNG — o PNG é derivado). Editou a matriz?
Re-renderize.

## O comando que importa

```bash
npm run build:sprites        # = node assets/tools/build.cjs
```

Renderiza todo `sprites/src/*.json` → `sprites/*.png` (+ previews `_8x` em
`assets/preview/`, gitignorado) e monta as folhas de contato e o mapa-mock de
coesão. É o único script que precisa rodar depois de editar uma matriz à mão.

## O que é cada arquivo

| Arquivo | Papel |
|---|---|
| `build.cjs` | Ponto de entrada único (render + folhas de contato + mapa-mock) |
| `render.cjs` | `src/*.json` → PNG 1x (+ `_8x`). Multi-frame vira spritesheet horizontal |
| `author-*.cjs` | **Geradores** que compõem uma matriz por código (`author-brasa.cjs`, `-nativos`, `-sprites`, `-portal`). One-time/opt-in: rode, OLHE, ajuste, regenere. NÃO são chamados por `build.cjs` |
| `contact-sheet*.cjs` / `map-mock.cjs` | Folhas de consistência de estilo e cena |
| `lint-sprites.js` | Validação de PNG (`npm run lint:sprites`, roda no CI) |
| `lib/` | Helpers sem dependência: `canvas`, `spritesrc`, `palette-names`, `dither`, `png`, `grid`, `font3x5` |

## Fluxo de autoria de um sprite novo

1. Escreva/edite um `author-<x>.cjs` (compõe a matriz 16×16 com `lib/spritesrc.cjs`).
2. Rode `npm run build:sprites` (ou o próprio author, que grava o `src/*.json`).
3. **Audite e OLHE** pelo art-mcp: `npm run art -- audit --src …`, `… view …`,
   `… preview --billboard …` (ver `tools/art-mcp/README.md`).
4. Fie no jogo (ex.: FPS lê o PNG via `site/scripts/build-fps.mjs`).

Paleta: **Resurrect 64** exclusivamente (`assets/palette.json`; nomes semânticos
em `lib/palette-names.cjs`).
