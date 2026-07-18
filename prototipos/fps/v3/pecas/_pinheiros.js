/* scratch: variações do PINHEIRO (não versionar/publicar). Mesmo padrão que o
   ideador aprovou no _arvformas — saias empilhadas (escada) + agulha verde
   escuro "uma cor só" — variando ALTURA DO TRONCO e porte. 5 lado a lado pra
   escolher o elenco de coníferas. */
export const meta = { nome: '_pinheiros', tipo: 'objeto', desc: 'pinheiros: mudinha, padrão, alto, espigão, largo' };

export function construir(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, hash2 } = tex;
  const { Mesh, quadUV } = geo;
  const TAU = Math.PI * 2;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  /* casca quente (tronco de pinheiro: castanho-avermelhado) */
  const BARK = texCanvas(32, 64, (x, y) => {
    const n = fbm(x / 5, y / 11);
    let i = n > 0.6 ? 21 : n > 0.4 ? 20 : n > 0.24 ? 24 : 1;
    if ((x + (fbm(x / 3, y / 22) * 3 | 0)) % 5 === 0) i = 1;
    return i;
  });
  /* AGULHA: verde escuro "uma cor só" (29/30 + poucos 31), traços curtos */
  const PINE = (() => {
    const GT = 64, WR = (v) => (Math.round(v) & (GT - 1)), lb = new Int16Array(GT * GT);
    for (let i = 0; i < lb.length; i++) { const n = fbm((i % GT) / 8 + 3, ((i / GT) | 0) / 8 + 1); lb[i] = n > 0.6 ? 30 : 29; }
    for (let s = 0; s < 560; s++) {
      const x = hash2(s * 13 + 1, 7) * GT, y0 = hash2(s * 29 + 3, 11) * GT;
      const len = 2 + hash2(s * 7, 5) * 3, lean = (hash2(s * 5, 9) - 0.5) * 1.3;
      const g = hash2(s * 3, 13), col = g < 0.62 ? 30 : g < 0.9 ? 31 : 29;
      for (let k = 0; k <= len; k++) lb[WR(y0 + k) * GT + WR(x + lean * k / len)] = col;
    }
    return texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  })();

  /* tronco compartilhado (tronco-cone afunilado) */
  const trunk = Mesh(), SIDES = 8;
  function addTrunk(ox, h, rb, rt) {
    const ring = (yy, r) => Array.from({ length: SIDES + 1 }, (_, i) => { const a = i / SIDES * TAU; return [ox + Math.cos(a) * r, yy, Math.sin(a) * r]; });
    const A = ring(0, rb), B = ring(0.35, rb * 0.7), C = ring(h, rt);
    const band = (P, Q, vA, vB) => { for (let i = 0; i < SIDES; i++) {
      const p0 = P[i], p1 = P[i + 1], p2 = Q[i + 1], p3 = Q[i];
      quadUV(trunk, p0, p1, p2, p3, [i / SIDES * 3, vA], [(i + 1) / SIDES * 3, vA], [(i + 1) / SIDES * 3, vB], [i / SIDES * 3, vB], norm([p0[0] - ox + p3[0] - ox, 0, p0[2] + p3[2]]));
    } };
    band(A, B, 1, 0.85); band(B, C, 0.85, 0);
  }

  /* copa em NÍVEIS (idêntica ao _arvformas aprovado): saias empilhadas */
  const canopy = Mesh();
  function pinheiroTiers(ox, baseY, rBase, totalH, tiers) {
    const LON = 16;
    const ring = (yc, r, droopAmp, sd) => Array.from({ length: LON + 1 }, (_, i) => {
      const a = i / LON * TAU, cA = Math.cos(a), sA = Math.sin(a);
      const lump = 0.8 + 0.36 * fbm(cA * 2.4 + sd, sA * 2.4 + sd);
      const droop = droopAmp * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(a * 4 + sd)));
      return [ox + cA * r * lump, yc - droop, sA * r * lump];
    });
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const yRim = baseY + f * totalH * 0.66;
      const r = rBase * (1 - f * 0.78) + 0.05;
      const tierH = totalH * (0.30 - f * 0.03);
      const uo = hash2(t * 7 + 1 + (ox * 31 | 0), 5) * 9;
      const top = ring(yRim + tierH, r * 0.10, 0, t * 3 + 1);
      const bot = ring(yRim, r, tierH * 0.16, t * 3 + 1);
      for (let i = 0; i < LON; i++) {
        const p0 = top[i], p1 = top[i + 1], p2 = bot[i + 1], p3 = bot[i];
        const N = norm([(p3[0] - ox) + (p2[0] - ox), tierH * 0.9, p3[2] + p2[2]]);
        quadUV(canopy, p0, p1, p2, p3, [i / LON * 3 + uo, 0.05], [(i + 1) / LON * 3 + uo, 0.05], [(i + 1) / LON * 3 + uo, 1], [i / LON * 3 + uo, 1], N);
      }
    }
  }

  /* pinheiro = tronco + copa; a saia de baixo assenta logo abaixo do topo do tronco */
  function pinheiro(ox, trunkH, trunkRb, rBase, totalH, tiers) {
    addTrunk(ox, trunkH, trunkRb, trunkRb * 0.42);
    pinheiroTiers(ox, trunkH - 0.15, rBase, totalH, tiers);
  }

  /* ---- 5 variações (foco: altura do tronco) ---- */
  //         ox    trunkH trunkRb rBase totalH tiers
  pinheiro(-10,   0.5,   0.16,  1.05,  2.5,  4);   // mudinha (baixa, canopy quase no chão)
  pinheiro(-5,    0.85,  0.28,  1.6,   4.0,  5);   // padrão (o aprovado)
  pinheiro(0,     2.2,   0.30,  1.35,  3.6,  5);   // alto (tronco alto, copa no alto)
  pinheiro(5,     3.2,   0.26,  1.15,  3.4,  6);   // espigão (bem alto e estreito)
  pinheiro(10,    1.1,   0.38,  2.05,  4.4,  6);   // largo (velho, saias amplas)

  return {
    camera: { e: 4.2, r: 26 },
    fog: [60, 45],
    far: 130,
    lotes: [{ mesh: trunk, tex: BARK }, { mesh: canopy, tex: PINE }],
  };
}
