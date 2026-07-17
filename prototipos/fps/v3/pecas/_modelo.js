/* _modelo — o "olá mundo" da OFICINA (D-55): copie este arquivo pra criar uma
   peça nova. Mostra o contrato inteiro: textura procedural, geometria e
   ANIMAÇÃO (matriz por lote, atualizada em animar(t, lotes)).
   Teste: visor.html?peca=_modelo  ·  npm run peca -- _modelo */
export const meta = {
  nome: '_modelo',
  tipo: 'objeto',
  desc: 'cubo girando — template de peça nova',
};

export function construir(ctx) {
  const { TS, tex, geo, m4 } = ctx;

  /* 1 · TEXTURA: fn(x,y) -> índice da paleta Resurrect64 | [r,g,b] | -1 */
  const TEXTURA = tex.texCanvas(16*TS, 16*TS, (x, y) => {
    const bx = x/TS, by = y/TS;
    let i = tex.dth(x, y, 41, 40, 0.5 + 0.3*Math.sin(bx*0.8));   // teal ondulado
    if (bx < 0.6 || bx > 15.4 || by < 0.6 || by > 15.4) i = 44;  // moldura
    return i;
  });

  /* 2 · GEOMETRIA: caixas/quads/tris em unidades de tile */
  const cubo = geo.Mesh();
  geo.box(cubo, -0.5, 0, -0.5, 0.5, 1, 0.5);

  /* 3 · LOTES + ANIMAÇÃO: cada lote tem matriz própria (uModel) */
  return {
    lotes: [{ mesh: cubo, tex: TEXTURA, matriz: m4.ident() }],
    animar(t, lotes) {
      const g = m4.rotY(t * 0.8);
      const l = m4.translate(0, 0.15 + Math.sin(t * 1.7) * 0.1, 0); // flutua
      lotes[0].matriz = new Float32Array(m4.mul(l, g));
    },
  };
}
