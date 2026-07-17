'use strict';
/**
 * author-brasa.cjs — "programa o pintor": compõe o avatar da BRASA (Habitante
 * da Forja) por código e grava o sprite-src. Rode, OLHE o PNG, ajuste os
 * parâmetros, repita. Mesma silhueta-cápsula do no_avatar (fica no mundo),
 * mas tema quente: ferro escuro + núcleo incandescente. Paleta: Resurrect 64.
 */
const path = require('path');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

// índices Resurrect 64 (ver assets/tools/lib/palette-names.cjs)
const T = -1;      // transparente
const OUT = 0;     // #2e222f contorno quase-preto
const IROND = 1;   // #3e3546 ferro na sombra (borda direita)
const IRON = 2;    // #625565 ferro (miolo) — claro o bastante pra ler no fog escuro
const IRONH = 6;   // #7f708a realce do ferro (lado iluminado)
const EMBD = 10;   // #6e2727 brasa apagando (sombra quente)
const RUST = 20;   // #9e4539 laranja escuro
const EMB1 = 16;   // #fb6b1d laranja brasa
const AMBER = 17;  // #f79617 âmbar
const GOLD = 18;   // #f9c22b ouro
const HOT = 28;    // #fbff86 amarelo quase-branco (mais quente)

const W = 16, H = 16;
const g = Array.from({ length: H }, () => Array(W).fill(T));
const set = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = v; };

// 1 · silhueta-cápsula encapuzada: [xl,xr] inclusivos por linha; ferro RIMADO
//     (realce à esquerda, sombra à direita) pra a silhueta ler mesmo escura
const EDGES = {
  2: [6, 9], 3: [5, 10], 4: [4, 11], 5: [4, 11], 6: [4, 11],
  7: [3, 12], 8: [3, 12], 9: [4, 11], 10: [4, 11], 11: [4, 11],
  12: [5, 10], 13: [5, 10], 14: [6, 9],
};
for (const [yy, [xl, xr]] of Object.entries(EDGES)) {
  const y = +yy;
  for (let x = xl; x <= xr; x++) set(x, y, IRON);
  set(xl, y, OUT); set(xr, y, OUT);       // contorno
  set(xl + 1, y, IRONH);                  // realce (luz da esquerda)
  set(xr - 1, y, IROND);                  // sombra (direita)
}
for (let x = 6; x <= 9; x++) { set(x, 1, OUT); set(x, 14, OUT); } // tampas coroa/base

// 2 · rosto de brasa: bloco incandescente conectado (cada cor tem vizinha da
//     mesma cor — o crítico de órfãos exige, e é o que impede o "ruído")
set(6, 4, AMBER); set(7, 4, AMBER); set(8, 4, AMBER); set(9, 4, AMBER);
set(6, 5, GOLD); set(7, 5, HOT); set(8, 5, HOT); set(9, 5, GOLD);
set(6, 6, GOLD); set(7, 6, AMBER); set(8, 6, AMBER); set(9, 6, GOLD);

// 3 · rachadura de brasa descendo o peito (pares horizontais, esfria pra baixo)
set(7, 8, EMB1); set(8, 8, EMB1);
set(7, 9, AMBER); set(8, 9, AMBER);
set(7, 10, RUST); set(8, 10, RUST);
set(7, 11, EMBD); set(8, 11, EMBD);

// 4 · brasas nos pés (o ser pisa em carvão aceso)
set(7, 13, EMB1); set(8, 13, EMB1);

const sprite = {
  name: 'nativo_brasa',
  kind: 'object',
  width: W, height: H,
  notes: 'Habitante da Forja: viajante de ferro escuro com núcleo de brasa (rosto e peito incandescentes). Silhueta-cápsula irmã do no_avatar.',
  frames: [{ pixels: g }],
};
const out = path.resolve(__dirname, '../sprites/src/nativo_brasa.json');
writeSpriteSrc(out, sprite);
console.log('gravado', out);
