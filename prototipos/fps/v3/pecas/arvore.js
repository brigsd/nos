/* PEÇA: arvore — o port das ÁRVORES da V2 pro v3 (D-59).
   O gerador growTree foi trazido FIEL pra motor/arvore.js (extraído, não
   redigitado). Aqui cada árvore vira uma CRUZ de 2 billboards perpendiculares
   (ganha volume de qualquer ângulo quando se anda em volta, em vez de girar
   chapada encarando a câmera). A sombra baked do sprite (luz do alto-esquerda)
   é preservada: a normal aponta pra CIMA -> luz uniforme, sem re-sombrear a
   pintura. 3 espécies lado a lado pra ver a variedade do port. */
import { growTree, bufToCanvas } from '../motor/arvore.js';

export const meta = {
  nome: 'arvore',
  tipo: 'objeto',
  desc: 'árvores da V2 portadas (growTree) como cruz de billboards — carvalho, florida, bétula',
};

export function construir(ctx) {
  const { geo } = ctx;
  const { Mesh, quadUV } = geo;

  // cruz de 2 quads (XY + ZY) no ponto (cx,cz), base no chão, topo em Ht
  function cruz(m, cx, cz, Ht, hw) {
    const N = [0, 1, 0];   // normal pra cima = luz uniforme (preserva o baked)
    quadUV(m, [cx - hw, 0, cz], [cx + hw, 0, cz], [cx + hw, Ht, cz], [cx - hw, Ht, cz],
      [0, 1], [1, 1], [1, 0], [0, 0], N);
    quadUV(m, [cx, 0, cz - hw], [cx, 0, cz + hw], [cx, Ht, cz + hw], [cx, Ht, cz - hw],
      [0, 1], [1, 1], [1, 0], [0, 0], N);
  }

  const defs = [
    { sp: 'carvalho', seed: 4021, x: -4.2 },
    { sp: 'florida', seed: 5137, x: 0 },
    { sp: 'betula', seed: 6203, x: 4.2 },
  ];
  const Ht = 4.6;

  const lotes = defs.map((d) => {
    const gen = growTree({ species: d.sp, mood: 'dia', seed: d.seed, W: 166, H: 218, sizeMul: 1.6 });
    const hw = Ht * (gen.W / gen.H) / 2;
    const m = Mesh();
    cruz(m, d.x, 0, Ht, hw);
    return { mesh: m, tex: bufToCanvas(gen) };
  });

  return {
    camera: { e: 3.4, r: 13 },   // recuada pra enquadrar 3 árvores de ~4.6u
    lotes,
  };
}
