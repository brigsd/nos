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
  /* casca CARTOON (D-63): uma cor marrom clara (22) + ranhuras verticais finas (24) */
  const BARK = texCanvas(32, 64, (x, y) => {
    const wob = (fbm(y * 0.12 + 1, 5) - 0.5) * 2.4;
    const c = ((Math.round(x - wob) % 32) + 32) % 32;
    return hash2(c, 7) < 0.22 ? 24 : 22;
  });
  /* pinheiro CARTOON (D-63): verde-escuro chapado em faixas por nível (topo do
     nível 31, corpo 30, rebordo escuro 29 = sombra sob cada camada). Casa com as
     folhosas cartoon do _arvformas; a forma vem das saias + contorno + cel. */
  const PINE = texCanvas(32, 32, (x, y) => { const v = y / 32; return v > 0.72 ? 29 : v > 0.3 ? 30 : 31; });

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
  function pinheiro(ox, trunkH, trunkRb, rBase, totalH, tiers, baseY) {
    addTrunk(ox, trunkH, trunkRb, trunkRb * 0.42);
    pinheiroTiers(ox, baseY ?? (trunkH - 0.15), rBase, totalH, tiers);  // baseY: onde a saia de baixo assenta (padrão = topo do tronco)
  }

  /* ---- 5 variações (foco: altura do tronco) ---- */
  //         ox    trunkH trunkRb rBase totalH tiers
  pinheiro(-10,   0.5,   0.16,  1.05,  2.5,  4);   // mudinha (baixa, canopy quase no chão)
  pinheiro(-5,    0.85,  0.28,  1.6,   4.0,  5);   // padrão (o aprovado)
  pinheiro(0,     1.8,   0.30,  1.35,  3.6,  5);        // alto (tronco alto — encurtado um pouco)
  pinheiro(5,     3.2,   0.36,  1.55,  4.2,  6,  1.6);  // espigão (tronco largo; copa grande começa na METADE do tronco)
  pinheiro(10,    1.1,   0.38,  2.05,  4.4,  6);   // largo (velho, saias amplas)

  return {
    camera: { e: 4.2, r: 26 },
    fog: [60, 45],
    far: 130,
    lotes: [{ mesh: trunk, tex: BARK }, { mesh: canopy, tex: PINE, outline: 0.05, toon: 1 }],
  };
}
