/* scratch: ELENCO completo do carimbo — uma de cada espécie em fila, pro ideador ver tudo. */
import { criarArvores } from '../motor/arvore-cartoon.js';
export const meta = { nome: '_elenco', tipo: 'objeto', desc: 'elenco: oval larga pinheiro cerejeira copada seca frondosa raiz' };
export function construir(ctx) {
  const arv = criarArvores(ctx);
  const inst = (x, z, s, yaw) => { const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s; return [c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, x, 0, z, 1]; };
  const lotes = [];
  const plantar = (esp, seed, x) => {
    const v = arv.construir(esp, seed);
    const M = inst(x, 0, 1.0, 0.3);
    if (v.trunk.v.length) lotes.push({ mesh: v.trunk, tex: arv.BARK, matriz: M, wind: 0.006, windF: 0.9 });
    if (v.canopy.v.length) lotes.push({ mesh: v.canopy, tex: v.tex, matriz: M, outline: v.outline, toon: v.toon, outlineInk: v.outlineInk, wind: 0.006, windF: 0.9 });
  };
  const ESP = ['oval', 'larga', 'pinheiro', 'cerejeira', 'copada', 'seca', 'frondosa', 'raiz'];
  ESP.forEach((e, i) => plantar(e, 10 + i * 31, (i - (ESP.length - 1) / 2) * 4.2));
  return { lotes, camera: { e: 5.5, r: 24 }, fog: [60, 48], far: 140 };
}
