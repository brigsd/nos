/* detector-de-seam [seam] — numa textura que LADRILHA, a borda oposta deve casar
   (wrap): direita↔esquerda, topo↔base. O defeito plantado troca uma LINHA/COLUNA
   de borda por uma cor chapada (col direita→vermelha, linha topo→azul), o que
   quebra o wrap. O truque é NÃO acusar textura que só não ladrilha (billboard em
   CLAMP, água radial): nessas a borda difere da oposta de forma SUAVE/GLOBAL, mas
   continua sendo a extensão natural do interior — sem descontinuidade localizada.
   Assino a costura injetada por 2 marcas simultâneas numa faixa de 1px:
     (a) a linha de borda virou CHAPADA (desvio-padrão ~0), e
     (b) ela dá um SALTO forte contra a linha imediatamente interior.
   Borda chapada porém contínua (jump~0) = moldura legítima, não acusa. */
export const id = 'detector-de-seam';
export const dom = 'seam';

const UNI_MAX = 10;   // desvio-padrão máx p/ considerar a linha de borda "chapada"
const JUMP_MIN = 55;  // deltaE médio mín entre a borda e a linha 1px interior

function dE(d, o1, o2) {
  return Math.hypot(d[o1] - d[o2], d[o1 + 1] - d[o2 + 1], d[o1 + 2] - d[o2 + 2]);
}
// offset do pixel (x,y)
const off = (w, x, y) => (y * w + x) * 4;

// desvio-padrão RGB de uma linha (isCol=coluna x fixa, senão linha y fixa)
function uni(d, w, h, idx, isCol) {
  const n = isCol ? h : w;
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < n; i++) { const o = isCol ? off(w, idx, i) : off(w, i, idx); mr += d[o]; mg += d[o + 1]; mb += d[o + 2]; }
  mr /= n; mg /= n; mb /= n;
  let v = 0;
  for (let i = 0; i < n; i++) { const o = isCol ? off(w, idx, i) : off(w, i, idx); v += (d[o] - mr) ** 2 + (d[o + 1] - mg) ** 2 + (d[o + 2] - mb) ** 2; }
  return Math.sqrt(v / n);
}
// deltaE médio entre duas linhas paralelas
function jump(d, w, h, a, b, isCol) {
  const n = isCol ? h : w;
  let s = 0;
  for (let i = 0; i < n; i++) s += isCol ? dE(d, off(w, a, i), off(w, b, i)) : dE(d, off(w, i, a), off(w, i, b));
  return s / n;
}

function checarBorda(f, d, w, h, li, edge, idx, inner, isCol) {
  const u = uni(d, w, h, idx, isCol);
  if (u > UNI_MAX) return;               // borda não é chapada → não é a costura injetada
  const j = jump(d, w, h, idx, inner, isCol);
  if (j < JUMP_MIN) return;              // chapada mas contínua (moldura) → ok
  f.push({ sev: 'erro', msg: `lote ${li}: borda ${edge} chapada destoa do interior (salto deltaE≈${j.toFixed(0)}) — wrap quebrado` });
}

export function analisar(built, { pixels }) {
  const f = [];
  built.lotes.forEach((L, li) => {
    const t = L.tex;
    if (!t) return;
    let w, h, d;
    try { ({ w, h, data: d } = pixels(t)); } catch { return; }
    if (!d || w < 4 || h < 4) return;
    // 4 bordas: direita, esquerda, topo, base
    checarBorda(f, d, w, h, li, 'direita', w - 1, w - 2, true);
    checarBorda(f, d, w, h, li, 'esquerda', 0, 1, true);
    checarBorda(f, d, w, h, li, 'topo', 0, 1, false);
    checarBorda(f, d, w, h, li, 'base', h - 1, h - 2, false);
  });
  return f;
}
