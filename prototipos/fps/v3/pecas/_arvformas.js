/* scratch: variações de FORMATO de árvore (não versionar/publicar).
   Builder paramétrico: tronco + copa (oval / cone / multi-blob), rampa de cor
   por espécie. 6 formas lado a lado pra o ideador escolher o elenco. */
export const meta = { nome: '_arvformas', tipo: 'objeto', desc: 'formatos: oval, larga, pinheiro, cerejeira, copada' };

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
  /* folhagem paramétrica: R = [c0 escuro, c1, c2, c3, c4 claro, glint].
     CACHOS IRREGULARES (posição por hash puro — sem a grade 8×8 que lia como
     padrão) sobre um CAMPO DE TOM de baixa freq (manchas grandes claras/escuras
     que quebram a chapa uniforme). Cada cacho tem raio, nº de lóbulos e tom
     próprios; wrap seamless (GT=64 POT). O ladrilho na copa some porque cada
     blob amostra uma FASE de UV diferente (ver blobOval/uo,vo). */
  function leafTex(R) {
    const GT = 64, WR = (v) => (Math.round(v) & (GT - 1));
    const lb = new Int16Array(GT * GT);
    for (let i = 0; i < lb.length; i++) {                                 // campo de tom (baixa freq)
      const n = fbm((i % GT) / 10 + 1, ((i / GT) | 0) / 10 + 2);
      lb[i] = n > 0.6 ? R[2] : n > 0.36 ? R[1] : R[0];
    }
    for (let c = 0; c < 46; c++) {                                        // cachos espalhados, sem lattice
      const cx = hash2(c * 13 + 1, 7) * GT, cy = hash2(c * 29 + 3, 11) * GT;
      const r = 3 + hash2(c * 17, 5) * 4.5, lobes = 3 + (hash2(c, 9) * 3 | 0), ph = hash2(c * 7, 3) * 6.283;
      const g = hash2(c * 5, 13), dTone = g > 0.7 ? 1 : g < 0.3 ? -1 : 0;  // cacho todo +claro/+escuro
      for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
        const dd = Math.hypot(dx, dy);
        const er = r * (0.8 + 0.2 * Math.sin(Math.atan2(dy, dx) * lobes + ph));   // borda escalopada c/ lóbulos variados
        if (dd > er) continue;
        let k = dy < -r * 0.4 ? 4 : dy < -r * 0.05 ? 3 : dy < r * 0.4 ? 2 : 1;    // topo claro -> base escura (luz de cima)
        if (dd > er - 1.6) k = dy > 0 ? 0 : 1;                                     // fresta/borda funda (separação)
        lb[WR(cy + dy) * GT + WR(cx + dx)] = R[Math.max(0, Math.min(4, k + dTone))];
      }
      if (hash2(c * 3, 19) < 0.4) lb[WR(cy - r * 0.5) * GT + WR(cx)] = R[5];        // glint esparso
    }
    return texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  }
  /* AGULHA de conífera: verde escuro "uma cor só" (fica em 29/30 com poucos 31
     de brilho — sem amarelo/glint), traços curtos = textura de agulha em vez de
     manchas de folha. A forma vem da luz hemisférica sobre as saias. */
  function pineTex() {
    const GT = 64, WR = (v) => (Math.round(v) & (GT - 1)), lb = new Int16Array(GT * GT);
    for (let i = 0; i < lb.length; i++) { const n = fbm((i % GT) / 8 + 3, ((i / GT) | 0) / 8 + 1); lb[i] = n > 0.6 ? 30 : 29; }
    for (let s = 0; s < 560; s++) {
      const x = hash2(s * 13 + 1, 7) * GT, y0 = hash2(s * 29 + 3, 11) * GT;
      const len = 2 + hash2(s * 7, 5) * 3, lean = (hash2(s * 5, 9) - 0.5) * 1.3;
      const g = hash2(s * 3, 13), col = g < 0.62 ? 30 : g < 0.9 ? 31 : 29;   // maioria médio, poucos brilho
      for (let k = 0; k <= len; k++) lb[WR(y0 + k) * GT + WR(x + lean * k / len)] = col;
    }
    return texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  }
  const GREEN = leafTex([29, 30, 31, 32, 33, 28]);
  const PINE = pineTex();
  const CHERRY = leafTex([54, 55, 56, 57, 63, 9]);
  /* verde claro + CURVAS DE CACHO cartoon (larga, copa ÚNICA): base clara (32) e
     arcos curvos escuros (30 + sombra 29) espalhados = a "boca ‿" de cada tufo.
     Agora os arcos VARIAM: centro (inclinação) e abertura próprios por clump —
     não são todos a mesma boca. Ladrilha seamless (GT=64 POT) com fase por blob. */
  const VERDE_CARTOON = (() => {
    const GT = 64, WR = (v) => (Math.round(v) & (GT - 1)), lb = new Int16Array(GT * GT).fill(32);
    const arc = (cx, cy, r, aMid, span, c) => { for (let a = aMid - span; a <= aMid + span; a += 3) { const rad = a * Math.PI / 180; lb[WR(cy + Math.sin(rad) * r) * GT + WR(cx + Math.cos(rad) * r)] = c; } };
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      const cx = (gx + 0.5) * (GT / 3) + (hash2(gx * 7 + 1, gy * 5) - 0.5) * 8;
      const cy = (gy + 0.5) * (GT / 3) + (hash2(gx * 3, gy * 11 + 2) - 0.5) * 8;
      const r = 6 + hash2(gx + 2, gy) * 3;
      const aMid = 90 + (hash2(gx * 5, gy * 9) - 0.5) * 70;   // inclinação da boca varia
      const span = 52 + hash2(gx, gy * 3) * 34;              // abertura varia
      arc(cx, cy, r + 1, aMid, span - 6, 29);   // sombra
      arc(cx, cy, r, aMid, span, 30);           // curva do cacho
    }
    return texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  })();

  const quad4 = (m, P, UV, N) => {
    const push = (i) => m.v.push(P[i][0], P[i][1], P[i][2], UV[i][0], UV[i][1], N[i][0], N[i][1], N[i][2]);
    push(0); push(1); push(2); push(0); push(2); push(3);
  };
  const RPT = 2.3;   // repetição da textura na copa; a fase (uo,vo) por-blob desalinha o ladrilho
  const uvOf = (a, o, lat, lon, uo = 0, vo = 0) => [[o / lon * RPT + uo, a / lat * RPT + vo], [(o + 1) / lon * RPT + uo, a / lat * RPT + vo], [(o + 1) / lon * RPT + uo, (a + 1) / lat * RPT + vo], [o / lon * RPT + uo, (a + 1) / lat * RPT + vo]];

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
    const uo = hash2(seed * 3 + 1, 5) * 9, vo = hash2(seed * 7 + 2, 9) * 9;   // fase de UV do blob
    const cpt = (a, o) => {
      const th = a / LAT * Math.PI, ph = o / LON * TAU, cP = Math.cos(ph), sP = Math.sin(ph), sT = Math.sin(th);
      const bump = 1 + amp * (fbm(cP * 1.9 + a * 0.8 + seed + 5, sP * 1.9 + a * 0.8 + seed) - 0.5) * 2;
      const r = rx * sT * bump;
      return [cen[0] + cP * r, cen[1] + ry * Math.cos(th) * (0.92 + 0.08 * bump), cen[2] + sP * r];
    };
    const g = Array.from({ length: LAT + 1 }, (_, a) => Array.from({ length: LON + 1 }, (_, o) => cpt(a, o)));
    for (let a = 0; a < LAT; a++) for (let o = 0; o < LON; o++) {
      const P = [g[a][o], g[a][o + 1], g[a + 1][o + 1], g[a + 1][o]];
      quad4(m, P, uvOf(a, o, LAT, LON, uo, vo), P.map((p) => norm([p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]])));
    }
  }
  /* pinheiro em NÍVEIS: saias cônicas empilhadas (rebordo largo embaixo, ponta
     em cima), cada uma mais estreita e mais alta que a de baixo -> a silhueta em
     ESCADA da conífera. Rebordo serrilhado + pontas caídas (galho). Normal
     radial + viés p/ cima: o topo de cada saia pega o sol, a barriga escurece. */
  function pinheiroTiers(m, ox, baseY, rBase, totalH, tiers) {
    const LON = 16;
    const ring = (yc, r, droopAmp, sd) => Array.from({ length: LON + 1 }, (_, i) => {
      const a = i / LON * TAU, cA = Math.cos(a), sA = Math.sin(a);
      const lump = 0.8 + 0.36 * fbm(cA * 2.4 + sd, sA * 2.4 + sd);                 // serrilha do rebordo
      const droop = droopAmp * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(a * 4 + sd)));    // pontas caídas
      return [ox + cA * r * lump, yc - droop, sA * r * lump];
    });
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const yRim = baseY + f * totalH * 0.66;          // rebordo sobe a cada nível
      const r = rBase * (1 - f * 0.78) + 0.05;         // ...e estreita
      const tierH = totalH * (0.30 - f * 0.03);        // altura da saia
      const uo = hash2(t * 7 + 1, 5) * 9;
      const top = ring(yRim + tierH, r * 0.10, 0, t * 3 + 1);   // ~ponta da saia
      const bot = ring(yRim, r, tierH * 0.16, t * 3 + 1);       // rebordo lumpy drooping
      for (let i = 0; i < LON; i++) {
        const p0 = top[i], p1 = top[i + 1], p2 = bot[i + 1], p3 = bot[i];
        const N = norm([(p3[0] - ox) + (p2[0] - ox), tierH * 0.9, p3[2] + p2[2]]);  // radial + p/ cima
        quadUV(m, p0, p1, p2, p3, [i / LON * 3 + uo, 0.05], [(i + 1) / LON * 3 + uo, 0.05], [(i + 1) / LON * 3 + uo, 1], [i / LON * 3 + uo, 1], N);
      }
    }
  }

  /* ---- as 5 formas principais (ESPÉCIES distintas). A "alta/esguia" saiu:
     é a oval #1 esticada = variação de ALTURA da oval, não espécie própria
     (vai pro mostruário de variações da oval, como fizemos com os pinheiros) ---- */
  const forms = [];
  const push = (mesh, tex) => forms.push({ mesh, tex });
  // 1 carvalho (oval média)
  addTrunk(-9, 1.9); { const m = Mesh(); blobOval(m, [-9, 1.9 + 2.0 * 0.92, 0], 1.35, 2.0, 0.34); push(m, GREEN); }
  // 2 larga (baixa e espalhada, copa ÚNICA) — verde claro + curvas de cacho variadas
  addTrunk(-4.5, 1.3, 0.4, 0.16); { const m = Mesh(); blobOval(m, [-4.5, 1.3 + 1.35 * 0.92, 0], 2.05, 1.3, 0.36, 7); push(m, VERDE_CARTOON); }
  // 3 pinheiro (NÍVEIS em escada, verde escuro de agulha, tronco curto)
  addTrunk(0, 0.85, 0.28, 0.11); { const m = Mesh(); pinheiroTiers(m, 0, 0.7, 1.65, 4.0, 5); push(m, PINE); }
  // 4 cerejeira (oval redonda, rosa)
  addTrunk(4.5, 1.7, 0.3, 0.12); { const m = Mesh(); blobOval(m, [4.5, 1.7 + 1.6 * 0.92, 0], 1.6, 1.6, 0.3, 11); push(m, CHERRY); }
  // 5 copada (multi-lóbulo bushy): blob central dominante ANCORADO no topo do
  // tronco + satélites MENORES encaixados (offsets pequenos -> a silhueta funde
  // num maciço em vez de 4 bolas soltas; base desce sobre o tronco, sem flutuar)
  addTrunk(9, 1.7, 0.34, 0.13);
  { const m = Mesh(); const cy = 1.7 + 1.15;
    blobOval(m, [9, cy, 0], 1.5, 1.62, 0.42, 21);              // central: base ~1.23 engole o topo do tronco (1.7)
    blobOval(m, [9 - 0.66, cy - 0.18, 0.3], 0.82, 0.98, 0.44, 22);
    blobOval(m, [9 + 0.68, cy - 0.12, -0.28], 0.86, 1.02, 0.44, 23);
    blobOval(m, [9 + 0.06, cy + 0.72, 0.06], 0.8, 0.86, 0.46, 24);
    push(m, GREEN); }

  return {
    camera: { e: 4.6, r: 23 },
    fog: [55, 40],   // câmera longe: recua a névoa pra as formas ficarem nítidas
    far: 120,
    lotes: [{ mesh: trunk, tex: BARK }, ...forms],
  };
}
