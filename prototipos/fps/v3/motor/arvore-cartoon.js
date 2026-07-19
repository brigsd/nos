/* NÓS v3 — CONSTRUTOR de árvores CARTOON (D-63), o "carimbo" plantável.
   Porta o elenco aprovado no mostruário _arvformas pra uma fábrica reutilizável:
   criarArvores(ctx) monta as texturas UMA vez (compartilhadas) e devolve
   construir(especie, seed) -> { trunk, canopy, tex, outlineInk } com a árvore
   na ORIGEM (base em y=0, centrada em x/z). Quem planta transforma por matriz
   e reusa mesh/textura por referência (dedupe do carregar) -> floresta barata.

   Linguagem cartoon (D-63): base chapada + curvas de cacho + CONTORNO (casca
   invertida) + CEL-shading — os três recursos toon vivem no motor/render.js;
   aqui a peça só marca outline/toon/outlineInk por lote. */

export const ESPECIES = ['oval', 'larga', 'pinheiro', 'cerejeira', 'copada', 'seca'];

export function criarArvores(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, hash2 } = tex;
  const { Mesh, quadUV } = geo;
  const TAU = Math.PI * 2;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  /* ---------- texturas (compartilhadas por TODAS as árvores) ---------- */
  /* casca CARTOON (D-63): UMA cor marrom clara (22 #e6904e) + RANHURAS verticais
     finas e frequentes (24 escuro) que ondulam de leve por linha — sem os manchões
     escuros do fbm. Casca limpa, casa com o fill das copas. */
  const BARK = texCanvas(32, 64, (x, y) => {
    const wob = (fbm(y * 0.12 + 1, 5) - 0.5) * 2.4;      // ranhuras ondulam levemente
    const c = ((Math.round(x - wob) % 32) + 32) % 32;
    return hash2(c, 7) < 0.22 ? 24 : 22;                 // ~22% das colunas = ranhura fina escura
  });
  /* textura CARTOON: base chapada + curvas de cacho "‿" (curva + sombra), arcos
     de inclinação/abertura variadas. base/curva/sombra = índices da paleta. */
  const cartoonTex = (base, curva, sombra) => {
    const GT = 64, WR = (v) => (Math.round(v) & (GT - 1)), lb = new Int16Array(GT * GT).fill(base);
    const arc = (cx, cy, r, aMid, span, c) => { for (let a = aMid - span; a <= aMid + span; a += 3) { const rad = a * Math.PI / 180; lb[WR(cy + Math.sin(rad) * r) * GT + WR(cx + Math.cos(rad) * r)] = c; } };
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      const cx = (gx + 0.5) * (GT / 3) + (hash2(gx * 7 + 1, gy * 5) - 0.5) * 8;
      const cy = (gy + 0.5) * (GT / 3) + (hash2(gx * 3, gy * 11 + 2) - 0.5) * 8;
      const r = 6 + hash2(gx + 2, gy) * 3;
      const aMid = 90 + (hash2(gx * 5, gy * 9) - 0.5) * 70;
      const span = 52 + hash2(gx, gy * 3) * 34;
      arc(cx, cy, r + 1, aMid, span - 6, sombra);
      arc(cx, cy, r, aMid, span, curva);
    }
    return texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  };
  const VERDE_CARTOON = cartoonTex(32, 30, 29);   // verde: base clara 32, curva 30, sombra 29
  const ROSA_CARTOON = cartoonTex(57, 55, 54);    // cerejeira: base lavanda 57, curva 55, sombra 54
  /* pinheiro: verde-escuro chapado em faixas por nível (topo 31, corpo 30, rebordo 29) */
  const PINE = texCanvas(32, 32, (x, y) => { const v = y / 32; return v > 0.72 ? 29 : v > 0.3 ? 30 : 31; });
  const TINTA_ROSA = [0.20, 0.10, 0.18];   // contorno da cerejeira (ameixa, não verde)
  const TINTA_SECA = [0.16, 0.10, 0.06];   // contorno marrom-escuro (galho morto/seco)

  /* ---------- geometria (na ORIGEM: ox=0, base em y=0) ---------- */
  const quad4 = (m, P, UV, N) => {
    const push = (i) => m.v.push(P[i][0], P[i][1], P[i][2], UV[i][0], UV[i][1], N[i][0], N[i][1], N[i][2]);
    push(0); push(1); push(2); push(0); push(2); push(3);
  };
  const RPT = 2.3;
  const uvOf = (a, o, lat, lon, uo, vo) => [[o / lon * RPT + uo, a / lat * RPT + vo], [(o + 1) / lon * RPT + uo, a / lat * RPT + vo], [(o + 1) / lon * RPT + uo, (a + 1) / lat * RPT + vo], [o / lon * RPT + uo, (a + 1) / lat * RPT + vo]];
  const SIDES = 8;
  function addTrunk(m, h, rb, rt) {
    const ring = (yy, r) => Array.from({ length: SIDES + 1 }, (_, i) => { const a = i / SIDES * TAU; return [Math.cos(a) * r, yy, Math.sin(a) * r]; });
    const A = ring(0, rb), B = ring(0.35, rb * 0.7), C = ring(h, rt);
    const band = (P, Q, vA, vB) => { for (let i = 0; i < SIDES; i++) {
      const p0 = P[i], p1 = P[i + 1], p2 = Q[i + 1], p3 = Q[i];
      quadUV(m, p0, p1, p2, p3, [i / SIDES * 3, vA], [(i + 1) / SIDES * 3, vA], [(i + 1) / SIDES * 3, vB], [i / SIDES * 3, vB], norm([p0[0] + p3[0], 0, p0[2] + p3[2]]));
    } };
    band(A, B, 1, 0.85); band(B, C, 0.85, 0);
  }
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
  function pinheiroTiers(m, baseY, rBase, totalH, tiers, seed) {
    const LON = 16, sJit = (hash2(seed * 5 + 1, 3) - 0.5) * 2;   // fase da serrilha por seed
    const ring = (yc, r, droopAmp, sd) => Array.from({ length: LON + 1 }, (_, i) => {
      const a = i / LON * TAU, cA = Math.cos(a), sA = Math.sin(a);
      const lump = 0.8 + 0.36 * fbm(cA * 2.4 + sd + sJit, sA * 2.4 + sd + sJit);
      const droop = droopAmp * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(a * 4 + sd)));
      return [cA * r * lump, yc - droop, sA * r * lump];
    });
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const yRim = baseY + f * totalH * 0.66;
      const r = rBase * (1 - f * 0.78) + 0.05;
      const tierH = totalH * (0.30 - f * 0.03);
      const uo = hash2(t * 7 + 1, 5) * 9;
      const top = ring(yRim + tierH, r * 0.10, 0, t * 3 + 1);
      const bot = ring(yRim, r, tierH * 0.16, t * 3 + 1);
      for (let i = 0; i < LON; i++) {
        const p0 = top[i], p1 = top[i + 1], p2 = bot[i + 1], p3 = bot[i];
        const N = norm([p3[0] + p2[0], tierH * 0.9, p3[2] + p2[2]]);
        quadUV(m, p0, p1, p2, p3, [i / LON * 3 + uo, 0.05], [(i + 1) / LON * 3 + uo, 0.05], [(i + 1) / LON * 3 + uo, 1], [i / LON * 3 + uo, 1], N);
      }
    }
  }

  /* ---------- 'seca': esqueleto ramificado (árvore MORTA, sem copa) ---------- */
  const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  const LADOS = 6;   // lados do prisma de cada galho (hexágono: barato e o contorno lê bem)
  /* quadro ortonormal {u, w} com a MESMA lateralidade do addTrunk (u×w = -d) */
  const quadro = (d) => { const ref = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; const u = norm(cross(ref, d)); return [u, cross(u, d)]; };
  /* parallel transport: mantém a FASE dos anéis contínua -> tubo estanque */
  const transporta = (uPrev, d) => {
    const dot = uPrev[0]*d[0] + uPrev[1]*d[1] + uPrev[2]*d[2];
    let u = [uPrev[0] - d[0]*dot, uPrev[1] - d[1]*dot, uPrev[2] - d[2]*dot];
    if (Math.hypot(u[0], u[1], u[2]) < 1e-4) u = quadro(d)[0];
    return norm(u);
  };
  const desviar = (d, theta, phi) => {
    const [u, w] = quadro(d), st = Math.sin(theta), ct = Math.cos(theta), cp = Math.cos(phi), sp = Math.sin(phi);
    return norm([d[0]*ct + (u[0]*cp + w[0]*sp)*st, d[1]*ct + (u[1]*cp + w[1]*sp)*st, d[2]*ct + (u[2]*cp + w[2]*sp)*st]);
  };
  const anel = (c, u, w, r) => Array.from({ length: LADOS + 1 }, (_, i) => {
    const a = i / LADOS * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    return [c[0] + u[0]*ca + w[0]*sa, c[1] + u[1]*ca + w[1]*sa, c[2] + u[2]*ca + w[2]*sa];
  });
  const tri3 = (m, p0, p1, p2, N, uv0, uv1, uv2) => {
    m.v.push(p0[0],p0[1],p0[2], uv0[0],uv0[1], N[0],N[1],N[2]);
    m.v.push(p1[0],p1[1],p1[2], uv1[0],uv1[1], N[0],N[1],N[2]);
    m.v.push(p2[0],p2[1],p2[2], uv2[0],uv2[1], N[0],N[1],N[2]);
  };
  /* tampa em leque que FECHA o tubo (senão a casca invertida do contorno vaza) */
  const tampa = (m, cen, ring, d, lado) => {
    const N = [d[0]*lado, d[1]*lado, d[2]*lado], uvc = [0.5, 0.5];
    for (let i = 0; i < LADOS; i++) {
      const a0 = ring[i], a1 = ring[i + 1];
      const uv0 = [0.5 + Math.cos(i/LADOS*TAU)*0.5, 0.5 + Math.sin(i/LADOS*TAU)*0.5];
      const uv1 = [0.5 + Math.cos((i+1)/LADOS*TAU)*0.5, 0.5 + Math.sin((i+1)/LADOS*TAU)*0.5];
      if (lado > 0) tri3(m, cen, a0, a1, N, uvc, uv0, uv1); else tri3(m, cen, a1, a0, N, uvc, uv1, uv0);
    }
  };
  /* um galho: tubo afunilado ESTANQUE tampado nas 2 pontas + recursão de filhos
     que EMBUTEM na ponta (a sobreposição esconde a junção). Determinístico via hash2. */
  function galhoSeca(m, base, dir, len, r0, r1, nivel, sd) {
    let rc = 0;
    const rnd = () => hash2(sd + rc * 29 + 11, (rc++) * 17 + sd * 2 + 3);
    const SUB = nivel > 0 ? 3 : 2, curva = 0.10 + 0.05 * (3 - nivel);
    const pts = [base.slice()], rads = [r0], segD = [];
    let d = dir.slice(), p = base.slice();
    for (let s = 1; s <= SUB; s++) {
      d = desviar(d, curva * (0.4 + rnd()), rnd() * TAU);
      segD.push(d.slice());
      p = [p[0] + d[0]*(len/SUB), p[1] + d[1]*(len/SUB), p[2] + d[2]*(len/SUB)];
      pts.push(p.slice()); rads.push(r0 + (r1 - r0) * (s / SUB));
    }
    const tang = (i) => i === 0 ? segD[0] : i === SUB ? segD[SUB-1]
      : norm([segD[i-1][0]+segD[i][0], segD[i-1][1]+segD[i][1], segD[i-1][2]+segD[i][2]]);
    const rings = [];
    let u = quadro(tang(0))[0];
    for (let i = 0; i <= SUB; i++) { const t = tang(i); u = i === 0 ? u : transporta(u, t); rings.push(anel(pts[i], u, cross(u, t), rads[i])); }
    for (let s = 0; s < SUB; s++) {
      const lo = rings[s], hi = rings[s+1];
      const axm = [(pts[s][0]+pts[s+1][0])/2, (pts[s][1]+pts[s+1][1])/2, (pts[s][2]+pts[s+1][2])/2];
      for (let i = 0; i < LADOS; i++) {
        const p0 = lo[i], p1 = lo[i+1], p2 = hi[i+1], p3 = hi[i];
        const mid = [(p0[0]+p1[0]+p2[0]+p3[0])/4, (p0[1]+p1[1]+p2[1]+p3[1])/4, (p0[2]+p1[2]+p2[2]+p3[2])/4];
        const Nrm = norm([mid[0]-axm[0], mid[1]-axm[1], mid[2]-axm[2]]);
        const uA = i/LADOS*3, uB = (i+1)/LADOS*3;
        quadUV(m, p0, p1, p2, p3, [uA, s], [uB, s], [uB, s+1], [uA, s+1], Nrm);
      }
    }
    tampa(m, pts[0], rings[0], tang(0), -1);
    tampa(m, pts[SUB], rings[SUB], tang(SUB), +1);
    if (nivel <= 0) return;
    const tip = pts[SUB], tdir = tang(SUB), nCh = 2 + (rnd() < 0.45 ? 1 : 0);
    const start = [tip[0] - tdir[0]*len*0.06, tip[1] - tdir[1]*len*0.06, tip[2] - tdir[2]*len*0.06];
    for (let k = 0; k < nCh; k++) {
      const theta = 0.45 + rnd() * 0.5, phi = (k / nCh) * TAU + rnd() * 0.9;
      let cdir = desviar(tdir, theta, phi);
      cdir = norm([cdir[0], cdir[1] + 0.18, cdir[2]]);   // viés p/ cima -> lê como árvore
      const cLen = len * (0.60 + rnd() * 0.16), cR0 = r1 * (0.78 + rnd() * 0.10);
      const cR1 = Math.max(0.035, cR0 * (0.48 + rnd() * 0.18));
      galhoSeca(m, start, cdir, cLen, cR0, cR1, nivel - 1, sd * 4 + k + 1);
    }
  }

  /* ---------- o carimbo: uma árvore por (espécie, seed) na origem ---------- */
  function construir(especie, seed) {
    const S = (seed | 0) || 1, trunk = Mesh(), canopy = Mesh();
    let ctex = VERDE_CARTOON, ink = null;
    if (especie === 'oval') {
      addTrunk(trunk, 1.9, 0.34, 0.12); blobOval(canopy, [0, 1.9 + 2.0 * 0.92, 0], 1.35, 2.0, 0.44, S);
    } else if (especie === 'larga') {
      addTrunk(trunk, 1.3, 0.4, 0.16); blobOval(canopy, [0, 1.3 + 1.5 * 0.92, 0], 2.0, 1.5, 0.5, S);
    } else if (especie === 'pinheiro') {
      addTrunk(trunk, 0.85, 0.28, 0.11); pinheiroTiers(canopy, 0.7, 1.65, 4.0, 5, S); ctex = PINE;
    } else if (especie === 'cerejeira') {
      addTrunk(trunk, 1.7, 0.3, 0.12); blobOval(canopy, [0, 1.7 + 1.6 * 0.92, 0], 1.6, 1.6, 0.42, S); ctex = ROSA_CARTOON; ink = TINTA_ROSA;
    } else if (especie === 'seca') {
      // a árvore INTEIRA é o esqueleto de galhos -> vira o "trunk" (recebe BARK do plantador); copa vazia
      galhoSeca(trunk, [0, 0, 0], [0, 1, 0], 1.7, 0.30, 0.20, 3, S); ink = TINTA_SECA;
    } else {   // copada: maciço de 4 lóbulos ancorado no tronco
      addTrunk(trunk, 1.7, 0.34, 0.13); const cy = 1.7 + 1.15;
      blobOval(canopy, [0, cy, 0], 1.5, 1.62, 0.42, S);
      blobOval(canopy, [-0.66, cy - 0.18, 0.3], 0.82, 0.98, 0.44, S + 1);
      blobOval(canopy, [0.68, cy - 0.12, -0.28], 0.86, 1.02, 0.44, S + 2);
      blobOval(canopy, [0.06, cy + 0.72, 0.06], 0.8, 0.86, 0.46, S + 3);
    }
    return { trunk, canopy, tex: ctex, outlineInk: ink, outline: 0.05, toon: 1 };
  }

  return { construir, ESPECIES, BARK };
}
