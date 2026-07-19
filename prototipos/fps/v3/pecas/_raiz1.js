/* scratch: close da RAIZ — tronco ranhurado + pé de raízes liso com sombra (malhas separadas). */
import { criarArvores } from '../motor/arvore-cartoon.js';
export const meta = { nome: '_raiz1', tipo: 'objeto', desc: 'raiz close: tronco ranhurado + raiz lisa com sombra (separados)' };
export function construir(ctx) {
  const arv = criarArvores(ctx);
  const M = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const v = arv.construir('raiz', 7);
  const lotes = [];
  if (v.trunk.v.length) lotes.push({ mesh: v.trunk, tex: arv.BARK, matriz: M, outline: 0, wind: 0.006, windF: 0.9 });
  if (v.canopy.v.length) lotes.push({ mesh: v.canopy, tex: v.tex, matriz: M, outline: 0, wind: 0.006, windF: 0.9 });
  return { lotes, particulas: false, camera: { e: 1.9, r: 4.4 }, fog: [40, 30], far: 90 };
}
