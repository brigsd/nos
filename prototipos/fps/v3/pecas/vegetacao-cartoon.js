/* PEÇA: vegetacao-cartoon — a PROVA da vegetação plantável (D-64). Planta um
   PRADO cartoon: tufos de grama (assados numa malha por variante -> poucos draws),
   flores e arbustos instanciados, + algumas árvores de contexto. Cada tipo entra
   com seu VENTO (amplitude + ritmo): grama rápida e viva, flor media, arbusto
   suave, árvore lenta. Chão = grama chapada padrão (não a ilha). */
import { criarVegetacao } from '../motor/vegetacao-cartoon.js';
import { criarArvores } from '../motor/arvore-cartoon.js';

export const meta = { nome: 'vegetacao-cartoon', tipo: 'objeto', desc: 'prado cartoon: tufos + flores + arbustos (vento por espécie) + árvores de contexto' };

export function construir(ctx) {
  const { hash2 } = ctx.tex;
  const { Mesh } = ctx.geo;
  const veg = criarVegetacao(ctx);
  const arv = criarArvores(ctx);
  const inst = (x, z, s, yaw) => { const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s; return [c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, x, 0, z, 1]; };
  const lotes = [];

  /* --- GRAMA: assada em 4 malhas (uma por variante de textura) -> só 4 draws ---
     bake = transladar os vértices da origem pro mundo (a grama é estática; o vento
     ainda funciona porque usa aPos.y LOCAL = altura, e a base fica em y=0). */
  const bakeInto = (tgt, src, x, z) => { const v = src.v; for (let i = 0; i < v.length; i += 8) tgt.v.push(x + v[i], v[i + 1], z + v[i + 2], v[i + 3], v[i + 4], v[i + 5], v[i + 6], v[i + 7]); };
  const grass = [Mesh(), Mesh(), Mesh(), Mesh()], grassTex = [null, null, null, null];
  const NG = 22, GST = 1.2;
  for (let gz = 0; gz < NG; gz++) for (let gx = 0; gx < NG; gx++) {
    const seed = 300 + gz * NG + gx, vi = ((seed % 4) + 4) % 4;
    const p = veg.tufo(seed).partes[0]; grassTex[vi] = p.tex;
    const x = (gx - (NG - 1) / 2) * GST + (hash2(gx * 3, gz * 7) - 0.5) * 1.0;
    const z = (gz - (NG - 1) / 2) * GST + (hash2(gx * 11, gz * 5) - 0.5) * 1.0;
    bakeInto(grass[vi], p.mesh, x, z);
  }
  for (let vi = 0; vi < 4; vi++) if (grass[vi].v.length) lotes.push({ mesh: grass[vi], tex: grassTex[vi], wind: 0.18, windF: 2.6 });

  /* --- FLORES (instanciadas, 2 partes: haste + corola), espalhadas --- */
  for (let i = 0; i < 18; i++) {
    const x = (hash2(i * 13 + 1, 7) - 0.5) * 22, z = (hash2(i * 29 + 3, 11) - 0.5) * 22;
    const M = inst(x, z, 0.9 + hash2(i * 5, 9) * 0.5, hash2(i * 7, 3) * Math.PI * 2);
    for (const p of veg.flor(50 + i * 37).partes)
      lotes.push({ mesh: p.mesh, tex: p.tex, matriz: M, outline: p.outline, outlineInk: p.outlineInk, toon: p.toon, wind: 0.11, windF: 2.2 });
  }

  /* --- ARBUSTOS (instanciados), espalhados --- */
  for (let i = 0; i < 9; i++) {
    const x = (hash2(i * 17 + 5, 13) - 0.5) * 22, z = (hash2(i * 23 + 7, 3) - 0.5) * 22;
    const M = inst(x, z, 0.75 + hash2(i * 11, 5) * 0.4, hash2(i * 19, 9) * Math.PI * 2);
    const p = veg.arbusto(200 + i * 53).partes[0];
    lotes.push({ mesh: p.mesh, tex: p.tex, matriz: M, outline: p.outline, outlineInk: p.outlineInk, toon: p.toon, wind: 0.04, windF: 1.4 });
  }

  /* --- ÁRVORES de contexto (poucas, pro tamanho) --- */
  const ESP = ['oval', 'larga', 'cerejeira', 'pinheiro'];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 6.5, z = -9 - hash2(i * 3, 7) * 2;
    const M = inst(x, z, 0.9 + hash2(i * 5, 3) * 0.3, hash2(i * 9, 5) * Math.PI * 2);
    const v = arv.construir(ESP[i], 500 + i * 91);
    lotes.push({ mesh: v.trunk, tex: arv.BARK, matriz: M, wind: 0.006, windF: 0.9 });
    lotes.push({ mesh: v.canopy, tex: v.tex, matriz: M, outline: v.outline, toon: v.toon, outlineInk: v.outlineInk, wind: 0.006, windF: 0.9 });
  }

  return { lotes, camera: { e: 3.2, r: 13 }, fog: [40, 34], far: 110 };
}
