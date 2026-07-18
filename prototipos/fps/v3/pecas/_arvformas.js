/* scratch: variações de FORMATO de árvore (não versionar/publicar).
   Builder paramétrico: tronco + copa (oval / cone / multi-blob), rampa de cor
   por espécie. 6 formas lado a lado pra o ideador escolher o elenco. */
export const meta = { nome: '_arvformas', tipo: 'objeto', desc: 'formatos: oval, alta, larga, pinheiro, cerejeira, copada' };

export function construir(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, hash2 } = tex;
  const { Mesh, quadUV } = geo;
  const TAU = Math.PI * 2;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  /* casca (compartilhada) */
  const BARK = texCanvas(32, 64, (x, y) => {
    const n = fbm(x / 5, y / 11);
    let i = n > 0.6 ? 4 : n > 0.4 ? 21 : n > 0.24 ? 20 : 24;
    if ((x + (fbm(x / 3, y / 22) * 3 | 0)) % 5 === 0) i = 24;
    return i;
  });
  /* folhagem paramétrica: R = [c0 escuro, c1, c2, c3, c4 claro, glint] */
  function leafTex(R) {
    const GT = 64, lb = new Int16Array(GT * GT);
    for (let i = 0; i < lb.length; i++) { const n = fbm((i % GT) / 6 + 1, ((i / GT) | 0) / 6 + 2); lb[i] = n > 0.6 ? R[2] : n > 0.35 ? R[1] : R[0]; }
    const rnd = (a, b) => hash2(a * 7 + b * 13 + 1, b * 17 + 3);
    for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
      const cx = gx * 8 + rnd(gx, gy) * 6, cy = gy * 8 + rnd(gy, gx) * 6, r = 4 + rnd(gx + 1, gy) * 3;
      for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
        const dd = Math.hypot(dx, dy), er = r * (0.82 + 0.18 * Math.sin(Math.atan2(dy, dx) * 3 + gx));
        if (dd > er) continue;
        const px = (cx + dx + GT) & (GT - 1), py = (cy + dy + GT) & (GT - 1);
        let i = dy < -r * 0.35 ? R[4] : dy < r * 0.05 ? R[3] : R[2];
        if (dd > er - 1.5) i = dy > 0 ? R[0] : R[1];
        lb[py * GT + px] = i;
      }
      if (rnd(gx, gy + 9) < 0.45) lb[(((cy - r * 0.5) | 0) + GT & (GT - 1)) * GT + (cx & (GT - 1))] = R[5];
    }
    return texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  }
  const GREEN = leafTex([29, 30, 31, 32, 33, 28]);
  const PINE = leafTex([29, 29, 30, 31, 32, 33]);
  const CHERRY = leafTex([54, 55, 56, 57, 63, 9]);

  const quad4 = (m, P, UV, N) => {
    const push = (i) => m.v.push(P[i][0], P[i][1], P[i][2], UV[i][0], UV[i][1], N[i][0], N[i][1], N[i][2]);
    push(0); push(1); push(2); push(0); push(2); push(3);
  };
  const uvOf = (a, o, lat, lon) => [[o / lon * 2.5, a / lat * 2.5], [(o + 1) / lon * 2.5, a / lat * 2.5], [(o + 1) / lon * 2.5, (a + 1) / lat * 2.5], [o / lon * 2.5, (a + 1) / lat * 2.5]];

  /* tronco compartilhado */
  const trunk = Mesh(), SIDES = 8;
  function addTrunk(ox, h, rb = 0.34, rt = 0.12) {
    const ring = (yy, r) => Array.from({ length: SIDES + 1 }, (_, i) => { const a = i / SIDES * TAU; return [ox + Math.cos(a) * r, yy, Math.sin(a) * r]; });
    const A = ring(0, rb), B = ring(0.35, rb * 0.7), C = ring(h, rt);
    const band = (P, Q, vA, vB) => { for (let i = 0; i < SIDES; i++) {
      const p0 = P[i], p1 = P[i + 1], p2 = Q[i + 1], p3 = Q[i];
      quadUV(trunk, p0, p1, p2, p3, [i / SIDES * 3, vA], [(i + 1) / SIDES * 3, vA], [(i + 1) / SIDES * 3, vB], [i / SIDES * 3, vB], norm([p0[0] - ox + p3[0] - ox, 0, p0[2] + p3[2]]));
    } };
    band(A, B, 1, 0.85); band(B, C, 0.85, 0);
  }

  /* copa OVAL (elipsoide lumpy liso) — cen = centro do blob */
  function blobOval(m, cen, rx, ry, amp, seed = 0) {
    const LAT = 9, LON = 12;
    const cpt = (a, o) => {
      const th = a / LAT * Math.PI, ph = o / LON * TAU, cP = Math.cos(ph), sP = Math.sin(ph), sT = Math.sin(th);
      const bump = 1 + amp * (fbm(cP * 1.9 + a * 0.8 + seed + 5, sP * 1.9 + a * 0.8 + seed) - 0.5) * 2;
      const r = rx * sT * bump;
      return [cen[0] + cP * r, cen[1] + ry * Math.cos(th) * (0.92 + 0.08 * bump), cen[2] + sP * r];
    };
    const g = Array.from({ length: LAT + 1 }, (_, a) => Array.from({ length: LON + 1 }, (_, o) => cpt(a, o)));
    for (let a = 0; a < LAT; a++) for (let o = 0; o < LON; o++) {
      const P = [g[a][o], g[a][o + 1], g[a + 1][o + 1], g[a + 1][o]];
      quad4(m, P, uvOf(a, o, LAT, LON), P.map((p) => norm([p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]])));
    }
  }
  /* copa CONE (pinheiro): raio afunila do pé à ponta, borda lumpy */
  function blobCone(m, ox, baseY, rx, h) {
    const LAT = 8, LON = 12;
    const cpt = (a, o) => {
      const t = a / LAT, ph = o / LON * TAU, cP = Math.cos(ph), sP = Math.sin(ph);
      const r = rx * (1 - t) * (0.82 + 0.32 * fbm(cP * 2.2 + a, sP * 2.2));
      return [ox + cP * r, baseY + t * h, sP * r];
    };
    const g = Array.from({ length: LAT + 1 }, (_, a) => Array.from({ length: LON + 1 }, (_, o) => cpt(a, o)));
    for (let a = 0; a < LAT; a++) for (let o = 0; o < LON; o++) {
      const P = [g[a][o], g[a][o + 1], g[a + 1][o + 1], g[a + 1][o]];
      const N = P.map((p) => norm([p[0] - ox, (p[1] - baseY) * 0.35 + 0.4, p[2]]));  // radial + viés p/ cima
      quad4(m, P, uvOf(a, o, LAT, LON), N);
    }
  }

  /* ---- as 6 formas ---- */
  const forms = [];
  const push = (mesh, tex) => forms.push({ mesh, tex });
  // 1 carvalho (oval média)
  addTrunk(-9, 1.9); { const m = Mesh(); blobOval(m, [-9, 1.9 + 2.0 * 0.92, 0], 1.35, 2.0, 0.34); push(m, GREEN); }
  // 2 esguia (alta e estreita, tronco alto)
  addTrunk(-5.4, 2.7, 0.26, 0.1); { const m = Mesh(); blobOval(m, [-5.4, 2.7 + 1.9 * 0.92, 0], 1.0, 1.9, 0.3, 3); push(m, GREEN); }
  // 3 larga (baixa e espalhada, tronco curto)
  addTrunk(-1.8, 1.3, 0.4, 0.16); { const m = Mesh(); blobOval(m, [-1.8, 1.3 + 1.35 * 0.92, 0], 2.05, 1.3, 0.36, 7); push(m, GREEN); }
  // 4 pinheiro (cone, verde escuro, tronco curto)
  addTrunk(1.8, 1.1, 0.3, 0.12); { const m = Mesh(); blobCone(m, 1.8, 1.1, 1.7, 3.6); push(m, PINE); }
  // 5 cerejeira (oval redonda, rosa)
  addTrunk(5.4, 1.7, 0.3, 0.12); { const m = Mesh(); blobOval(m, [5.4, 1.7 + 1.6 * 0.92, 0], 1.6, 1.6, 0.3, 11); push(m, CHERRY); }
  // 6 copada (multi-blob bushy)
  addTrunk(9, 1.6, 0.34, 0.13);
  { const m = Mesh(); const b = 1.6 + 1.4;
    blobOval(m, [9, b, 0], 1.25, 1.25, 0.34, 21);
    blobOval(m, [9 - 0.9, b - 0.5, 0.4], 0.95, 0.95, 0.36, 22);
    blobOval(m, [9 + 0.85, b - 0.3, -0.5], 1.05, 1.05, 0.36, 23);
    blobOval(m, [9 + 0.1, b + 0.9, 0.1], 0.9, 0.9, 0.38, 24);
    push(m, GREEN); }

  return {
    camera: { e: 4.6, r: 23 },
    fog: [55, 40],   // câmera longe: recua a névoa pra as formas ficarem nítidas
    far: 120,
    lotes: [{ mesh: trunk, tex: BARK }, ...forms],
  };
}
