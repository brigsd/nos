/* lint-de-malha [malha] — checagem-CPU da geometria antes do render: triângulo
   degenerado, vértice NaN/Inf/gigante, normal zero/não-unitária, stride/contagem
   errada, lote vazio. Pega bug que nenhum PNG deixa óbvio. */
export const id = 'lint-de-malha';
export const dom = 'malha';
const BOUND = 1e4, fin = (n) => Number.isFinite(n);

export function analisar(built) {
  const f = [];
  built.lotes.forEach((L, li) => {
    const v = L.mesh?.v;
    if (!v || v.length === 0) { f.push({ sev: 'erro', msg: `lote ${li}: malha vazia` }); return; }
    if (v.length % 8 !== 0) { f.push({ sev: 'erro', msg: `lote ${li}: vértices não são múltiplos de 8 floats (${v.length})` }); return; }
    const nv = v.length / 8;
    if (nv % 3 !== 0) f.push({ sev: 'erro', msg: `lote ${li}: ${nv} vértices não formam triângulos (÷3)` });
    let nan = 0, huge = 0, badN = 0, degen = 0;
    for (let i = 0; i < nv; i++) {
      const o = i * 8;
      for (let k = 0; k < 3; k++) if (!fin(v[o + k])) nan++; else if (Math.abs(v[o + k]) > BOUND) huge++;
      const nl = Math.hypot(v[o + 5], v[o + 6], v[o + 7]);
      if (!fin(nl) || nl < 0.5 || nl > 2.0) badN++;
    }
    for (let t = 0; t + 3 <= nv; t += 3) {
      const a = t * 8, b = (t + 1) * 8, c = (t + 2) * 8;
      const e1 = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]];
      const e2 = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      const area = 0.5 * Math.hypot(cx, cy, cz);
      if (fin(area) && area < 1e-7) degen++;
    }
    if (nan) f.push({ sev: 'erro', msg: `lote ${li}: ${nan} coordenada(s) NaN/Inf` });
    if (huge) f.push({ sev: 'erro', msg: `lote ${li}: ${huge} coordenada(s) fora de escala (>${BOUND})` });
    if (badN) f.push({ sev: 'aviso', msg: `lote ${li}: ${badN} normal(is) zero/não-unitária(s)` });
    if (degen) f.push({ sev: 'aviso', msg: `lote ${li}: ${degen} triângulo(s) degenerado(s)` });
  });
  return f;
}
