'use strict';
/**
 * author-brasa-pessoa.cjs — v2 da brasa, "pessoa do ofício" (D-44, teste).
 * Fiel à lore: brasa é A FERREIRA, uma pessoa — não um elemental de brasa.
 * Então: cabeça com lenço, rosto de pele, avental de couro; a forja é LUZ
 * (subluz âmbar no avental + fagulha), não o corpo. Grava num src separado
 * pra comparar com a v1 elemental sem sobrescrevê-la.
 */
const path = require('path');
const { writeSpriteSrc } = require('./lib/spritesrc.cjs');

// Resurrect 64 (ver lib/palette-names.cjs)
const T = -1;
const O = 0;    // contorno
const K = 1;    // pano escuro / sombra (#3e3546)
const s = 6;    // camisa/manga (#7f708a cinza-lilás) — clara o bastante pra ler no fog
const S = 4;    // pele (#ab947a tan)
const d = 3;    // sombra de pele / fuligem (#966c6c)
const b = 11;   // lenço (#b33831 vermelho tijolo)
const B = 10;   // sombra do lenço (#6e2727)
const a = 21;   // avental de couro (#cd683d clay)
const A = 20;   // sombra do avental (#9e4539 rust)
const H = 22;   // realce do avental (#e6904e)
const g = 17;   // luz da forja / fagulha (#f79617 âmbar)

const W = 16, Hh = 16;
const grid = Array.from({ length: Hh }, () => Array(W).fill(T));
const set = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < Hh) grid[y][x] = v; };
const span = (x0, x1, y, v) => { for (let x = x0; x <= x1; x++) set(x, y, v); };

// lenço na cabeça (com banda escura)
span(6, 9, 1, O);
span(6, 9, 2, b); set(5, 2, O); set(10, 2, O);
span(5, 10, 3, b); set(7, 3, B); set(8, 3, B); set(4, 3, O); set(11, 3, O);
// rosto (pele) — 3 linhas: é o que diz "pessoa"
span(5, 10, 4, S); set(4, 4, O); set(11, 4, O);
span(5, 10, 5, S); set(6, 5, K); set(9, 5, K); set(4, 5, O); set(11, 5, O); // olhos (escuros p/ definir)
span(5, 10, 6, S); set(7, 6, d); set(8, 6, d); set(4, 6, O); set(11, 6, O); // boca/queixo
// pescoço + ombros
span(6, 9, 7, S); set(5, 7, s); set(10, 7, s); set(4, 7, O); set(11, 7, O);
// tronco: avental de couro (bib com topo iluminado) no centro, mangas claras nas laterais
set(3, 8, O); set(4, 8, s); set(5, 8, s); set(6, 8, H); set(7, 8, a); set(8, 8, a); set(9, 8, H); set(10, 8, s); set(11, 8, s); set(12, 8, O); // topo do avental pega luz
set(3, 9, O); set(4, 9, s); set(5, 9, A); span(6, 9, 9, a); set(10, 9, A); set(11, 9, s); set(12, 9, O);
set(3, 10, O); set(4, 10, s); set(5, 10, A); span(6, 9, 10, a); set(10, 10, A); set(11, 10, s); set(12, 10, O);
// barra do avental com SUBLUZ da forja (âmbar) — a forja ilumina, não é o corpo
set(4, 11, O); set(5, 11, A); set(6, 11, a); set(7, 11, g); set(8, 11, g); set(9, 11, a); set(10, 11, A); set(11, 11, O);
// saia/pernas (cinza-lilás pra ler no fog, com sombra)
span(6, 9, 12, s); set(6, 12, K); set(9, 12, K); set(5, 12, O); set(10, 12, O);
span(6, 9, 13, s); set(7, 13, K); set(8, 13, K); set(5, 13, O); set(10, 13, O);
// botas
set(6, 14, O); set(7, 14, K); set(8, 14, K); set(9, 14, O);
// fagulha subindo ao lado (par de 2px fora do corpo, não é órfã)
set(13, 8, g); set(13, 9, g);

const sprite = {
  name: 'nativo_brasa_pessoa',
  kind: 'object',
  width: W, height: Hh,
  notes: 'v2 (D-44): brasa como A FERREIRA — pessoa com lenço, rosto e avental de couro; a forja é LUZ (subluz âmbar + fagulha), não o corpo. Comparar com a v1 elemental.',
  frames: [{ pixels: grid }],
};
const out = path.resolve(__dirname, '../../tools/art-mcp/qa/brasa_pessoa.json');
writeSpriteSrc(out, sprite);
console.log('gravado', out);
