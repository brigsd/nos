'use strict';
/**
 * author-brasa64.cjs — teste de resolução (D-44): a brasa "pessoa do ofício"
 * em 64×64. Hipótese: com 16× mais pixel, um Habitante-herói ganha alma
 * (rosto que expressa, avental de couro com textura, mãos, martelo). Método:
 * compor por FORMAS + gradiente (não pixel a pixel), contorno automático pra
 * ler no fog. O avental de couro é GRANDE e claro de propósito: é ele + o
 * contorno que seguram a silhueta quando o vestido escuro some no fog.
 * Paleta: Resurrect 64. Grava num src de rascunho pra comparar.
 */
const path = require('path');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

const N = 64;
const g = Array.from({ length: N }, () => Array(N).fill(-1));
const put = (x, y, v) => { if (v == null) return; x = Math.round(x); y = Math.round(y); if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = v; };
const pick = (ramp, t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))))];

// rampas (escuro -> claro), índices Resurrect 64
const SKIN = [3, 4, 63, 9];        // dusty -> tan -> pêssego -> quase branco (realce)
const SCARF = [10, 14, 11, 15];    // vermelhos (lenço)
const DRESS = [1, 45, 46];         // vestido cinza-azulado (frio, contrasta o couro; segura melhor que preto)
const LEATHER = [19, 20, 21, 22, 23]; // couro: marrom-vinho -> rust -> clay -> laranja -> ouro
const METAL = [1, 2, 7, 8];        // ferro do martelo
const WOOD = [10, 20, 21];         // cabo de madeira (marrom quente)
const HAIR = [0, 10, 19];          // cabelo auburn escuro
const GLOW = [16, 17, 18, 28];     // luz/fagulha da forja

function ellipse(cx, cy, rx, ry, shade) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) put(x, y, shade(nx, ny, x, y));
    }
}
function line(x0, y0, x1, y1, v, w = 1) {
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= n; i++) { const x = x0 + (dx * i) / n, y = y0 + (dy * i) / n; for (let o = -((w - 1) >> 1); o <= (w >> 1); o++) put(x + o, y, v); }
}
const lit = (nx, ny) => 0.5 - 0.4 * (nx * 0.7 + ny * 0.6); // luz de cima-esquerda

// ---- martelo apoiado à direita (atrás da mão): cabo + cabeça de ferro ----
line(47, 30, 47, 55, WOOD[1], 3);
rectFill(43, 53, 52, 60, (u, v2) => pick(METAL, 0.75 - 0.5 * v2 - 0.25 * Math.abs(u - 0.4)));
function rectFill(x0, y0, x1, y1, shade) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, shade((x - x0) / (x1 - x0 || 1), (y - y0) / (y1 - y0 || 1), x, y)); }

// ---- vestido: ombros/mangas + saia; corpo base (fica atrás do avental) ----
for (let y = 30; y <= 54; y++) { const w = 14 - Math.abs(y - 34) * 0.15; for (let x = 32 - w; x <= 32 + w; x++) put(x, y, pick(DRESS, lit((x - 32) / w, (y - 40) / 14))); }
rectFill(14, 31, 21, 46, (u, v2) => pick(DRESS, 0.6 - 0.4 * u - 0.15 * v2));   // braço esq
rectFill(43, 31, 50, 46, (u, v2) => pick(DRESS, 0.4 - 0.3 * (1 - u) - 0.15 * v2)); // braço dir
ellipse(17, 48, 4.5, 4.5, (nx, ny) => pick(SKIN, lit(nx, ny)));                // mão esq
ellipse(47, 48, 4.5, 4.5, (nx, ny) => pick(SKIN, lit(nx, ny) - 0.15));         // mão dir (no martelo)

// ---- AVENTAL DE COURO: grande, cobre o tronco (bib) + saia; alças aos ombros ----
line(28, 30, 26, 48, LEATHER[1], 2); line(36, 30, 38, 48, LEATHER[1], 2);     // alças
// bib (peito->cintura), cantos superiores arredondados
for (let y = 30; y <= 48; y++) for (let x = 24; x <= 40; x++) {
  if (y < 33 && (x < 26 || x > 38)) continue;                                  // arredonda o topo
  const u = (x - 32) / 8, v2 = (y - 30) / 18;
  put(x, y, pick(LEATHER, 0.7 - 0.4 * v2 - 0.3 * Math.abs(u) + 0.1));
}
for (let y = 47; y <= 57; y++) { const w = 11 + (y - 47) * 0.5; for (let x = 32 - w; x <= 32 + w; x++) put(x, y, pick(LEATHER, 0.62 - 0.28 * ((y - 47) / 10) - 0.28 * Math.abs((x - 32) / w))); } // saia do avental
for (let y = 34; y <= 55; y++) if (y % 2 === 0) put(32, y, LEATHER[0]);        // vinco central
for (let x = 25; x <= 39; x += 2) put(x, 46, LEATHER[4]);                       // costura clara na cintura

// ---- pernas + botas (aparecem sob a saia do avental) ----
rectFill(26, 56, 31, 61, () => DRESS[0]); rectFill(33, 56, 38, 61, () => DRESS[0]);
rectFill(25, 60, 32, 63, () => 0); rectFill(32, 60, 39, 63, () => 0);

// ---- pescoço ----
rectFill(29, 25, 35, 31, (u, v2) => pick(SKIN, 0.3 - 0.1 * v2));

// ---- lenço (dome) + rosto ----
ellipse(32, 15, 12, 13, (nx, ny) => (ny < 0.28 ? pick(SCARF, 0.62 - 0.4 * (nx * 0.6 + ny * 0.7)) : null));
ellipse(43, 15, 4.5, 5, (nx) => pick(SCARF, 0.5 - 0.3 * nx));                   // nó
put(48, 12, SCARF[2]); put(49, 15, SCARF[1]); put(48, 18, SCARF[0]);           // pontas do nó
ellipse(22, 22, 2.4, 4, () => HAIR[1]); ellipse(42, 22, 2.4, 4, () => HAIR[1]);// cabelo escapando
ellipse(32, 18, 9, 10, (nx, ny) => (ny > -0.32 ? pick(SKIN, lit(nx, ny) + 0.12) : null)); // rosto

// ---- feições (nítidas a 64px: é o que dá alma) ----
for (const ex of [28, 36]) { put(ex, 17, 0); put(ex + 1, 17, 0); put(ex, 18, 0); put(ex + 1, 18, 0); put(ex + 1, 17, 9); } // olhos + catchlight
line(27, 15, 30, 15, HAIR[2], 1); line(35, 15, 38, 15, HAIR[2], 1);            // sobrancelhas
put(32, 20, SKIN[0]); put(32, 21, 3); put(31, 21, SKIN[0]);                    // nariz
line(30, 24, 34, 24, 54, 1); put(29, 23, SKIN[0]); put(35, 23, SKIN[0]);       // boca (leve sorriso)
put(26, 21, 62); put(38, 21, 62);                                             // bochechas

// ---- luz da forja: subluz quente + fagulhas ----
for (let x = 22; x <= 42; x++) if (g[56] && g[56][x] !== -1) put(x, 56, pick(GLOW, 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(x * 1.3))));
for (let y = 40; y <= 55; y++) if (g[y][41] !== -1 && y % 2) put(41, y, 17);   // rim quente à direita
[[54, 22], [57, 28], [52, 15], [58, 36]].forEach(([x, y]) => { put(x, y, 17); put(x, y - 1, 18); });

// ---- contorno automático (1px, índice 0) ----
const mask = g.map((row) => row.map((v) => v !== -1));
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (mask[y][x]) continue;
  if ((mask[y - 1] && mask[y - 1][x]) || (mask[y + 1] && mask[y + 1][x]) || mask[y][x - 1] || mask[y][x + 1]) g[y][x] = 0;
}

const sprite = {
  name: 'nativo_brasa64',
  kind: 'object',
  width: N, height: N,
  notes: 'Teste D-44: brasa "pessoa do ofício" em 64×64 — ferreira com lenço, rosto expressivo, avental de couro grande, martelo; forja como luz.',
  frames: [{ pixels: g }],
};
const out = path.resolve(__dirname, '../../tools/art-mcp/qa/brasa_pessoa64.json');
writeSpriteSrc(out, sprite);
console.log('gravado', out);
