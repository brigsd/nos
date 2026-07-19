/* scratch: prova de 'seca'/'raiz' (malhas separadas, afiadas) + 'frondosa' (copa fundida).
   Fila: seca | raiz | 4× frondosa. */
import { criarArvores } from '../motor/arvore-cartoon.js';

export const meta = { nome: '_frondosa', tipo: 'objeto', desc: 'seca + raiz (pé-vira-tronco) + frondosa (copa fundida)' };

export function construir(ctx) {
  const arv = criarArvores(ctx);
  const inst = (x, z, s, yaw) => { const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s; return [c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, x, 0, z, 1]; };
  const lotes = [];
  const plantar = (esp, seed, x, yaw) => {
    const v = arv.construir(esp, seed);
    const M = inst(x, 0, 1.0, yaw);
    if (v.trunk.v.length) lotes.push({ mesh: v.trunk, tex: arv.BARK, matriz: M, wind: 0.006, windF: 0.9 });
    if (v.canopy.v.length) lotes.push({ mesh: v.canopy, tex: v.tex, matriz: M, outline: v.outline, toon: v.toon, outlineInk: v.outlineInk, wind: 0.006, windF: 0.9 });
  };
  plantar('seca', 3, -8.5, 0.4);
  plantar('raiz', 7, -4.8, 0.2);
  for (let i = 0; i < 4; i++) plantar('frondosa', 10 + i * 41, -1.2 + i * 3.2, i * 1.3);

  return { lotes, camera: { e: 4.0, r: 19 }, fog: [50, 40], far: 120 };
}
