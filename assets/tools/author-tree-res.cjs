'use strict';
/**
 * author-tree-res.cjs — experimento A do D-44: A MESMA árvore autorada em
 * 16×16, 64×64 e 128×128 (formas em coordenadas normalizadas, detalhe — grão,
 * salpicado de folha — escalando com N). A pergunta: no motor (render interno
 * 320×180, fog, perspectiva), a partir de qual resolução o detalhe extra
 * simplesmente não aparece mais? Grava 3 sprite-srcs em tools/art-mcp/qa/.
 */
const path = require('path');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

const CANOPY = [29, 30, 31, 32]; // verdes Resurrect (escuro -> claro)
const LEAFHI = 33;               // brilho de folha
const TRUNK = [0, 24, 20, 21];   // madeira (escuro -> claro)

// hash determinístico 0..1
const h2 = (a, b) => { let t = (a * 374761393 + b * 668265263) | 0; t = (t ^ (t >> 13)) * 1274126177; return (((t ^ (t >> 16)) >>> 0) % 10000) / 10000; };

function genTree(N) {
  const g = Array.from({ length: N }, () => Array(N).fill(-1));
  const put = (x, y, v) => { x |= 0; y |= 0; if (x >= 0 && x < N && y >= 0 && y < N && v != null) g[y][x] = v; };
  const pick = (r, t) => r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];
  const ell = (cx, cy, rx, ry, shade) => { // tudo em coords normalizadas 0..1
    for (let y = Math.floor((cy - ry) * N); y <= Math.ceil((cy + ry) * N); y++)
      for (let x = Math.floor((cx - rx) * N); x <= Math.ceil((cx + rx) * N); x++) {
        const nx = (x / N - cx) / rx, ny = (y / N - cy) / ry;
        if (nx * nx + ny * ny <= 1) put(x, y, shade(nx, ny));
      }
  };
  const lit = (nx, ny) => 0.55 - 0.42 * (nx * 0.65 + ny * 0.7);

  // tronco (afunila pra cima) com grão vertical cuja frequência escala com N
  for (let y = 0.56 * N; y < N; y++) {
    const t = y / N, w = (0.05 + 0.035 * t) * N;
    for (let x = N / 2 - w; x <= N / 2 + w; x++) {
      const u = (x - N / 2) / w; // -1..1
      const grain = Math.sin(x * (N / 10)) > 0.4 ? -0.18 : 0;
      put(x, y, pick(TRUNK, 0.72 - 0.45 * Math.abs(u) - 0.2 * (1 - t) + grain));
    }
  }
  // raízes alargando na base
  for (let x = N / 2 - 0.14 * N; x <= N / 2 + 0.14 * N; x++) put(x, N - 1, TRUNK[1]);

  // copa: aglomerado de blobs (mesmas posições em qualquer N)
  ell(0.50, 0.34, 0.34, 0.27, (nx, ny) => pick(CANOPY, lit(nx, ny)));
  ell(0.30, 0.44, 0.17, 0.14, (nx, ny) => pick(CANOPY, lit(nx, ny) - 0.12));
  ell(0.71, 0.42, 0.18, 0.15, (nx, ny) => pick(CANOPY, lit(nx, ny) - 0.08));
  ell(0.50, 0.16, 0.21, 0.13, (nx, ny) => pick(CANOPY, lit(nx, ny) + 0.12));

  // salpicado de folha: 500 pontos determinísticos em coords normalizadas —
  // em 16px eles colapsam (quase nada), em 128px viram brilho de folhagem
  for (let i = 0; i < 500; i++) {
    const px2 = h2(i, 7), py = h2(i, 13);
    const x = (px2 * N) | 0, y = (py * N) | 0;
    if (y < N && x < N && g[y][x] !== -1 && g[y][x] >= 29 && g[y][x] <= 33) {
      const upperLeft = px2 * 0.65 + py * 0.7 < 0.62;
      // pares 2px (o crítico de órfãos exige vizinho)
      const v = upperLeft ? (h2(i, 3) > 0.5 ? LEAFHI : 32) : 29;
      put(x, y, v); put(x + 1, y, v);
    }
  }

  // contorno automático
  const mask = g.map((r) => r.map((v) => v !== -1));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (mask[y][x]) continue;
    if ((mask[y - 1] && mask[y - 1][x]) || (mask[y + 1] && mask[y + 1][x]) || mask[y][x - 1] || mask[y][x + 1]) g[y][x] = 0;
  }
  return g;
}

for (const N of [16, 64, 128]) {
  const sprite = {
    name: `tree_res${N}`,
    kind: 'object',
    width: N, height: N,
    notes: `Experimento D-44: a mesma árvore autorada em ${N}px (formas normalizadas idênticas nas 3 resoluções).`,
    frames: [{ pixels: genTree(N) }],
  };
  const out = path.resolve(__dirname, `../../tools/art-mcp/qa/tree_res${N}.json`);
  writeSpriteSrc(out, sprite);
  console.log('gravado', out);
}
