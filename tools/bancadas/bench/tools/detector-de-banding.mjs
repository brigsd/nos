/* detector-de-banding [banding] — dois defeitos de textura que o olho pega mas
   nenhuma checagem de malha vê:
     (a) FAIXA CHAPADA — uma faixa horizontal de UMA cor sólida, plantada no meio
         da textura, interrompendo o conteúdo. Assino como um BLOCO SÓLIDO opaco
         (>= LEN_MIN linhas idênticas pixel-a-pixel) que é INTERIOR (não encosta
         no topo/base da imagem) e SALTA forte contra as linhas de fora nos dois
         lados. Isso separa a faixa injetada de flats legítimos, que ou encostam
         numa borda da imagem (céu/chão em CLAMP) ou são curtos demais.
     (b) RUÍDO ALEATÓRIO — chuvisco RGB: cada pixel destoa muito do vizinho. Uma
         faixa de linhas com diferença-média-adjacente ALTÍSSIMA (muito acima do
         dither/fbm moderado das texturas limpas). Exijo uma CORRIDA de linhas
         ruidosas, não uma linha solta, pra não morder detalhe de alto contraste.
   As texturas limpas (grama, casca, folhas) ficam no meio-termo: dither de 2
   cores e fbm suave — nem corrida chapada interior nem ruído puro. */
export const id = 'detector-de-banding';
export const dom = 'banding';

const LEN_MIN = 8;     // altura mín (linhas) de bloco sólido p/ suspeitar de faixa
const JUMP_MIN = 40;   // salto médio (soma |ΔRGB|) mín contra as linhas de fora
const NOISE_ROW = 150; // diferença-média-adjacente p/ linha "chuviscada"
const NOISE_RUN = 4;   // nº mín de linhas ruidosas consecutivas p/ acusar ruído

const off = (w, x, y) => (y * w + x) * 4;

// chave da linha se ela for totalmente chapada (1 cor, com alpha); senão null
function chaveLinhaChapada(d, w, y) {
  const o0 = off(w, 0, y);
  for (let x = 1; x < w; x++) {
    const o = off(w, x, y);
    if (d[o] !== d[o0] || d[o + 1] !== d[o0 + 1] || d[o + 2] !== d[o0 + 2] || d[o + 3] !== d[o0 + 3]) return null;
  }
  return `${d[o0]},${d[o0 + 1]},${d[o0 + 2]},${d[o0 + 3]}`;
}

// soma média de |ΔRGB| entre duas linhas (a,b) — 0 se alguma sair da imagem
function saltoLinhas(d, w, h, a, b) {
  if (a < 0 || b >= h) return -1;
  let s = 0;
  for (let x = 0; x < w; x++) {
    const o = off(w, x, a), p = off(w, x, b);
    s += Math.abs(d[o] - d[p]) + Math.abs(d[o + 1] - d[p + 1]) + Math.abs(d[o + 2] - d[p + 2]);
  }
  return s / w;
}

// diferença-média-adjacente (horizontal) de uma linha
function ruidoLinha(d, w, y) {
  let s = 0;
  for (let x = 1; x < w; x++) {
    const o = off(w, x, y), p = off(w, x - 1, y);
    s += Math.abs(d[o] - d[p]) + Math.abs(d[o + 1] - d[p + 1]) + Math.abs(d[o + 2] - d[p + 2]);
  }
  return s / (w - 1);
}

function analisarTex(f, li, w, h, d) {
  // chaves de linha chapada
  const key = new Array(h);
  for (let y = 0; y < h; y++) key[y] = chaveLinhaChapada(d, w, y);

  // (a) blocos sólidos opacos (linhas chapadas idênticas consecutivas)
  let s = 0;
  for (let y = 1; y <= h; y++) {
    const fim = y === h || !key[y] || key[y] !== key[y - 1];
    if (fim) {
      const len = y - s, k = key[s];
      if (k && !k.endsWith(',0') && len >= LEN_MIN) {
        const y0 = s, y1 = y - 1;
        const interior = y0 > 0 && y1 < h - 1;              // não encosta em borda da imagem
        if (interior) {
          const tj = saltoLinhas(d, w, h, y0 - 1, y0);
          const bj = saltoLinhas(d, w, h, y1, y1 + 1);
          if (tj >= JUMP_MIN && bj >= JUMP_MIN) {
            f.push({ sev: 'erro', msg: `lote ${li}: faixa chapada (${len} linhas de 1 cor, y ${y0}-${y1}) interrompe a textura — banding` });
          }
        }
      }
      s = y;
    }
  }

  // (b) ruído: corrida de linhas com diferença-adjacente altíssima
  let run = 0, y0 = 0, best = 0, bestY0 = 0, bestY1 = 0;
  for (let y = 0; y < h; y++) {
    if (ruidoLinha(d, w, y) >= NOISE_ROW) {
      if (run === 0) y0 = y;
      run++;
      if (run > best) { best = run; bestY0 = y0; bestY1 = y; }
    } else run = 0;
  }
  if (best >= NOISE_RUN) {
    f.push({ sev: 'erro', msg: `lote ${li}: ruído aleatório (${best} linhas de chuvisco, y ${bestY0}-${bestY1}) — variância local anormal` });
  }
}

export function analisar(built, { pixels }) {
  const f = [];
  built.lotes.forEach((L, li) => {
    const t = L.tex;
    if (!t) return;
    let w, h, d;
    try { ({ w, h, data: d } = pixels(t)); } catch { return; }
    if (!d || w < 4 || h < 4) return;
    analisarTex(f, li, w, h, d);
  });
  return f;
}
