/* NÓS v3 — CONSTRUTOR de VEGETAÇÃO CARTOON (D-64), irmão do arvore-cartoon.js.
   criarVegetacao(ctx) monta as texturas UMA vez e devolve arbusto/flor/tufo,
   cada um -> { partes: [ {mesh, tex, outline, outlineInk, toon} ] } na ORIGEM
   (base em y=0). A peça-vitrine instancia cada parte por matriz + wind/windF —
   a vegetação NÃO sabe de vento (cantilever por aPos.y local). Determinístico
   por seed via hash2/fbm (nada de Math.random). Linguagem cartoon: fill chapado
   + contorno (casca invertida via lote.outline, quando a geometria é fechada) +
   cel (lote.toon). Fruto de um fanout de design (arbusto+flor+tufo em paralelo). */

export function criarVegetacao(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, hash2 } = tex;
  const { Mesh, quadUV } = geo;
  const TAU = Math.PI * 2;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const quad4 = (m, P, UV, N) => {
    const push = (i) => m.v.push(P[i][0], P[i][1], P[i][2], UV[i][0], UV[i][1], N[i][0], N[i][1], N[i][2]);
    push(0); push(1); push(2); push(0); push(2); push(3);
  };

  /* ======================= ARBUSTO (moita) ======================= */
  const cartoonTex = (base, curva, sombra) => {
    const GT = 64, WR = (v) => (Math.round(v) & (GT - 1)), lb = new Int16Array(GT * GT).fill(base);
    const arc = (cx, cy, r, aMid, span, c) => { for (let a = aMid - span; a <= aMid + span; a += 3) { const rad = a * Math.PI / 180; lb[WR(cy + Math.sin(rad) * r) * GT + WR(cx + Math.cos(rad) * r)] = c; } };
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      const cx = (gx + 0.5) * (GT / 3) + (hash2(gx * 7 + 1, gy * 5) - 0.5) * 8;
      const cy = (gy + 0.5) * (GT / 3) + (hash2(gx * 3, gy * 11 + 2) - 0.5) * 8;
      const r = 6 + hash2(gx + 2, gy) * 3;
      const aMid = 90 + (hash2(gx * 5, gy * 9) - 0.5) * 70, span = 52 + hash2(gx, gy * 3) * 34;
      arc(cx, cy, r + 1, aMid, span - 6, sombra); arc(cx, cy, r, aMid, span, curva);
    }
    return texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  };
  const VERDE_CARTOON = cartoonTex(32, 30, 29);
  const RPT = 2.3;
  const uvOf = (a, o, lat, lon, uo, vo) => [[o / lon * RPT + uo, a / lat * RPT + vo], [(o + 1) / lon * RPT + uo, a / lat * RPT + vo], [(o + 1) / lon * RPT + uo, (a + 1) / lat * RPT + vo], [o / lon * RPT + uo, (a + 1) / lat * RPT + vo]];
  function blobOval(m, cen, rx, ry, amp, seed) {
    const LAT = 9, LON = 12;
    const uo = hash2(seed * 3 + 1, 5) * 9, vo = hash2(seed * 7 + 2, 9) * 9;
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
  /* maciço de 4 lóbulos fundidos, SEM tronco, baixo/largo/denso (~1.1u × ~3u) */
  function arbusto(seed) {
    const S = (seed | 0) || 1, mesh = Mesh();
    blobOval(mesh, [0.00, 0.56, 0.00], 1.05, 0.52, 0.50, S);
    blobOval(mesh, [-0.72, 0.48, 0.34], 0.82, 0.44, 0.52, S + 1);
    blobOval(mesh, [0.70, 0.50, -0.30], 0.86, 0.46, 0.52, S + 2);
    blobOval(mesh, [0.05, 0.66, 0.05], 0.72, 0.40, 0.50, S + 3);
    return { partes: [{ mesh, tex: VERDE_CARTOON, outline: 0.04, outlineInk: null, toon: 1 }] };
  }

  /* ======================= FLOR (haste + corola) ======================= */
  const NP = 5;   // pétalas (fixo: casa textura<->geometria)
  const HASTE_TEX = texCanvas(8, 16, (x) => (x < 2 ? 29 : 30));
  const corolaTex = (petala, curva, sombra, miolo) => texCanvas(64, 64, (x, y) => {
    const dx = x - 31.5, dy = y - 31.5, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    if (d < 6.5) return miolo;
    if (d < 8.0) return sombra;
    const passo = TAU / NP, t = ((ang % passo) + passo) % passo;
    if (Math.abs(t - passo * 0.5) < 0.12 + 0.004 * d) return sombra;
    if (d > 27) return curva;
    return petala;
  });
  const VAR = [
    { nome: 'rosa', tex: corolaTex(61, 60, 59, 23), ink: [0.42, 0.07, 0.20] },
    { nome: 'amarelo', tex: corolaTex(23, 22, 21, 18), ink: [0.45, 0.24, 0.05] },
    { nome: 'branco', tex: corolaTex(9, 8, 7, 23), ink: [0.34, 0.34, 0.40] },
    { nome: 'lilas', tex: corolaTex(57, 56, 55, 23), ink: [0.34, 0.16, 0.36] },
  ];
  function addHaste(m, H, rb, rt, bend, sd) {
    const NS = 6, SEG = 4, side = hash2(sd, 3) < 0.5 ? 1 : -1, ph0 = hash2(sd + 1, 7) * TAU;
    const cxAt = (f) => side * bend * f * f, rAt = (f) => rb + (rt - rb) * f;
    const ringPts = (f) => { const y = f * H, cx = cxAt(f), r = rAt(f); return Array.from({ length: NS + 1 }, (_, i) => { const a = ph0 + i / NS * TAU; return [cx + Math.cos(a) * r, y, Math.sin(a) * r]; }); };
    for (let s = 0; s < SEG; s++) {
      const fa = s / SEG, fb = (s + 1) / SEG, lo = ringPts(fa), hi = ringPts(fb);
      for (let i = 0; i < NS; i++) {
        const a = ph0 + i / NS * TAU, N = [Math.cos(a), 0, Math.sin(a)];
        quadUV(m, lo[i], lo[i + 1], hi[i + 1], hi[i], [i / NS, fa], [(i + 1) / NS, fa], [(i + 1) / NS, fb], [i / NS, fb], N);
      }
    }
    return { topX: cxAt(1), topY: H };
  }
  function addCorola(m, cen, Rrim, Ry, amp) {
    const LAT = 8, LON = 4 * NP;
    const pt = (a, o) => { const th = a / LAT * Math.PI, ph = o / LON * TAU, lobe = 1 + amp * Math.cos(NP * ph), rH = Rrim * Math.sin(th) * lobe; return [cen[0] + Math.cos(ph) * rH, cen[1] + Ry * Math.cos(th), cen[2] + Math.sin(ph) * rH]; };
    const uvAt = (a, o) => { const th = a / LAT * Math.PI, ph = o / LON * TAU, rr = 0.5 * (th / Math.PI); return [0.5 + Math.cos(ph) * rr, 0.5 + Math.sin(ph) * rr]; };
    const g = Array.from({ length: LAT + 1 }, (_, a) => Array.from({ length: LON + 1 }, (_, o) => pt(a, o)));
    const u = Array.from({ length: LAT + 1 }, (_, a) => Array.from({ length: LON + 1 }, (_, o) => uvAt(a, o)));
    for (let a = 0; a < LAT; a++) for (let o = 0; o < LON; o++) {
      const P = [g[a][o], g[a][o + 1], g[a + 1][o + 1], g[a + 1][o]];
      const UV = [u[a][o], u[a][o + 1], u[a + 1][o + 1], u[a + 1][o]];
      quad4(m, P, UV, P.map((p) => norm([p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]])));
    }
  }
  function flor(seed) {
    const S = (seed | 0) || 1, haste = Mesh(), cabeca = Mesh();
    const V = VAR[Math.floor(hash2(S, 1) * VAR.length) % VAR.length];
    const sc = 0.9 + hash2(S, 2) * 0.3, amp = 0.18 + hash2(S, 4) * 0.12, H = 0.46 + hash2(S, 5) * 0.14, bend = 0.04 + hash2(S, 6) * 0.06;
    const top = addHaste(haste, H, 0.05, 0.035, bend, S);
    addCorola(cabeca, [top.topX, top.topY, 0], 0.17 * sc, 0.12 * sc, amp);
    return { partes: [
      { mesh: haste, tex: HASTE_TEX, outline: 0.02, outlineInk: null, toon: 1 },
      { mesh: cabeca, tex: V.tex, outline: 0.03, outlineInk: V.ink, toon: 1 },
    ] };
  }

  /* ======================= TUFO (lâminas de grama) ======================= */
  const TW = 64, TH = 64, OUT_CODE = 100, INK = [13, 43, 28], GREENS = [30, 31, 32], OL = 1.15, FLOOR = 0.55;
  function desenhaBlades(seed) {
    const lb = new Int16Array(TW * TH).fill(-1), NB = 5, baseY = TH - 1, blades = [];
    for (let i = 0; i < NB; i++) {
      const fx = (i + 0.5) / NB, jit = (hash2(seed * 7 + i, 3) - 0.5) * 0.08, bx = TW * (0.18 + 0.64 * fx + jit), dCen = fx - 0.5;
      const baseW = 2.9 + (0.6 - Math.abs(dCen)) * 2.4 + hash2(seed * 3, i * 5 + 1) * 0.9;
      const height = TH * (0.55 + 0.34 * (1 - Math.abs(dCen) * 1.7) + hash2(seed * 11 + i, 9) * 0.06);
      const lean = (dCen * 1.7 + (hash2(seed * 5 + i, 7) - 0.5) * 0.6) * (TW * 0.16);
      const tone = GREENS[(hash2(seed + i * 13, 17) * GREENS.length) | 0];
      blades.push({ bx, baseW, height, lean, tone, toneTip: Math.min(32, tone + 1) });
    }
    const stamp = (b, isOutline) => {
      const topY = baseY - b.height;
      for (let y = Math.floor(topY - (isOutline ? OL : 0)); y <= baseY; y++) {
        if (y < 0 || y >= TH) continue;
        let t = (baseY - y) / b.height; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = b.bx + b.lean * t * t, core = Math.max(FLOOR, b.baseW * Math.pow(1 - t, 0.72)), hw = isOutline ? core + OL : core;
        const val = isOutline ? OUT_CODE : (t > 0.5 ? b.toneTip : b.tone);
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) { if (x < 0 || x >= TW) continue; lb[y * TW + x] = val; }
      }
    };
    for (const b of blades) stamp(b, true);
    for (const b of blades) stamp(b, false);
    return texCanvas(TW, TH, (x, y) => { const v = lb[y * TW + x]; return v === OUT_CODE ? INK : v; });
  }
  const VARIANTES = 4, bladeTexes = Array.from({ length: VARIANTES }, (_, i) => desenhaBlades(i * 101 + 7));
  const UP = [0, 1, 0];
  const v8 = (m, p, u, vv) => m.v.push(p[0], p[1], p[2], u, vv, UP[0], UP[1], UP[2]);
  const plano = (m, dir, hw, h, flip) => {
    const ax = dir[0] * hw, az = dir[1] * hw, bA = [-ax, 0, -az], bB = [ax, 0, az], tA = [-ax, h, -az], tB = [ax, h, az], u0 = flip ? 1 : 0, u1 = flip ? 0 : 1;
    v8(m, bA, u0, 1); v8(m, bB, u1, 1); v8(m, tB, u1, 0);
    v8(m, bA, u0, 1); v8(m, tB, u1, 0); v8(m, tA, u0, 0);
  };
  function tufo(seed) {
    const S = (seed | 0) || 1, m = Mesh();
    const yaw = hash2(S * 3 + 1, 5) * TAU, s = 0.85 + hash2(S * 7, 3) * 0.30, HW = 0.18 * s, H = (0.32 + hash2(S * 5, 9) * 0.12) * s;
    plano(m, [Math.cos(yaw), Math.sin(yaw)], HW, H, false);
    plano(m, [-Math.sin(yaw), Math.cos(yaw)], HW, H, true);
    const bladeTex = bladeTexes[((S % VARIANTES) + VARIANTES) % VARIANTES];
    return { partes: [{ mesh: m, tex: bladeTex, outline: 0, outlineInk: null, toon: 0 }] };
  }

  return { arbusto, flor, tufo, VERDE_CARTOON };
}
