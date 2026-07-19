/* NÓS v3 — CONSTRUTOR de árvores CARTOON (D-63), o "carimbo" plantável.
   Porta o elenco aprovado no mostruário _arvformas pra uma fábrica reutilizável:
   criarArvores(ctx) monta as texturas UMA vez (compartilhadas) e devolve
   construir(especie, seed) -> { trunk, canopy, tex, outlineInk } com a árvore
   na ORIGEM (base em y=0, centrada em x/z). Quem planta transforma por matriz
   e reusa mesh/textura por referência (dedupe do carregar) -> floresta barata.

   Linguagem cartoon (D-63): base chapada + curvas de cacho + CONTORNO (casca
   invertida) + CEL-shading — os três recursos toon vivem no motor/render.js;
   aqui a peça só marca outline/toon/outlineInk por lote. */

export const ESPECIES = ['oval', 'larga', 'pinheiro', 'cerejeira', 'copada', 'seca', 'frondosa', 'raiz'];

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
  /* CORPO de madeira compartilhado (tronco == raiz): veios largos misturando 22
     (claro) + 21 (médio) -> mesma paleta quente, sem emenda de cor na junção. */
  const woodBody = (x) => fbm(x * 0.09 + 3, 1) > 0.5 ? 21 : 22;
  const BARK = texCanvas(64, 64, (x, y) => {
    const groove = hash2(x, 7) < 0.13;                   // colunas fixas -> ranhuras RETAS, ~13% = espaçadas
    const on = hash2(x * 7 + 1, (y >> 2) * 3) > 0.48;    // liga/desliga a cada ~4px -> traços CURTOS na altura
    return groove && on ? 20 : woodBody(x);              // ranhura = 20 (#9e4539) marrom ESCURO; corpo = madeira quente
  });
  /* casca da RAIZ = casca de TODA a árvore 'raiz' (raiz+tronco+galhos): UMA textura só,
     LISA (SEM ranhura — exigência do ideador: tudo com a textura da raiz), mapeada por
     ALTURA (vAlt) igual a BARK_SECA mas SEM a faixa ranhurada -> base aterrada escura ->
     resto warm liso, fluindo contínuo da raiz ao topo. */
  const BARK_RAIZ = texCanvas(8, 128, (x, y) => {
    const f = y / 128;
    if (f < 0.08) return 20;                          // base na terra: sombra de aterramento
    if (f < 0.15) return hash2(x, y) < 0.5 ? 20 : 21; // penumbra subindo (dither)
    return 21;                                        // corpo: UM tom warm só (SEM listra 21/22) -> raiz==tronco==galhos, seja qual for o UV
  });
  /* casca do TRONCO-RAIZ (loft único pé->tronco): mapeada por ALTURA (v = vAlt(y)).
     Base (v baixo) = escura (sombra de aterramento) -> raiz LISA -> tronco RANHURADO.
     Uma textura só que flui da raiz pro tronco sem emenda. */
  const vAlt = (y) => (y + 0.55) * 0.28;   // worldY -> v da textura (usado pelo loft E pelos galhos)
  const BARK_SECA = texCanvas(32, 128, (x, y) => {
    const f = y / 128, body = woodBody(x);
    if (f < 0.09) return 20;                                    // base na terra: sombra escura
    if (f < 0.16) return hash2(x, y) < 0.5 ? 20 : 21;           // penumbra subindo (dither)
    if (f < 0.28) return body;                                  // raiz: lisa (sem ranhura)
    const groove = hash2(x, 7) < 0.13, on = hash2(x * 7 + 1, (y >> 2) * 3) > 0.48;   // tronco+galhos: ranhura fina
    return groove && on ? 20 : body;
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
  const VERDE_FLAT = texCanvas(4, 4, () => 32);   // verde CHAPADO (sem curvas): a copa fundida lê melhor lisa, forma vem do cel+contorno
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
  /* ---------- extrator de SUPERFÍCIE (surface-nets sobre um SDF qualquer) ----------
     Recebe um campo sdf (<0 dentro) e uma caixa [lo,hi]; devolve UMA malha fundida:
     amostra a grade, extrai 1 vértice por célula de borda (média das interseções),
     opcional deslocamento por fbm (caroços), triângulos orientados p/ fora pelo
     gradiente, normais suaves = média das faces (casa com o contorno). UV vem de
     uvFn(p,n). É o MOTOR comum da copa (esferas) e da árvore seca (cápsulas). */
  const CO = [[0,0,0],[1,0,0],[1,0,1],[0,0,1],[0,1,0],[1,1,0],[1,1,1],[0,1,1]];
  const ED = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const smin = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return a * h + b * (1 - h) - k * h * (1 - h); };
  function superficieSDF(m, sdf, lo, hi, H, bumpAmp, smooth, seed, uvFn) {
    const grad = (px, py, pz) => { const e = 0.02; return norm([sdf(px+e,py,pz)-sdf(px-e,py,pz), sdf(px,py+e,pz)-sdf(px,py-e,pz), sdf(px,py,pz+e)-sdf(px,py,pz-e)]); };  // +grad = p/ FORA
    const nx = Math.ceil((hi[0]-lo[0])/H), ny = Math.ceil((hi[1]-lo[1])/H), nz = Math.ceil((hi[2]-lo[2])/H);
    const NX = nx+1, NY = ny+1, NZ = nz+1;
    const val = new Float32Array(NX*NY*NZ), vidx = (i,j,k) => (i*NY+j)*NZ+k;
    for (let i=0;i<NX;i++) for (let j=0;j<NY;j++) for (let k=0;k<NZ;k++) val[vidx(i,j,k)] = sdf(lo[0]+i*H, lo[1]+j*H, lo[2]+k*H);
    const cellV = new Int32Array(nx*ny*nz).fill(-1), cidx = (i,j,k) => (i*ny+j)*nz+k;
    const verts = [];
    for (let i=0;i<nx;i++) for (let j=0;j<ny;j++) for (let k=0;k<nz;k++) {
      const cv = CO.map(([a,b,c]) => val[vidx(i+a,j+b,k+c)]);
      let neg = 0; for (const v of cv) if (v < 0) neg++;
      if (neg === 0 || neg === 8) continue;                               // célula toda dentro/fora
      let ax=0, ay=0, az=0, cnt=0;
      for (const [a,b] of ED) { const va=cv[a], vb=cv[b]; if ((va<0)===(vb<0)) continue; const t=va/(va-vb); ax+=CO[a][0]+(CO[b][0]-CO[a][0])*t; ay+=CO[a][1]+(CO[b][1]-CO[a][1])*t; az+=CO[a][2]+(CO[b][2]-CO[a][2])*t; cnt++; }
      const p = [lo[0]+(i+ax/cnt)*H, lo[1]+(j+ay/cnt)*H, lo[2]+(k+az/cnt)*H];
      const n = grad(p[0], p[1], p[2]);
      if (bumpAmp) { const b = (fbm(p[0]*1.8 + seed + 3, p[2]*1.8 + p[1]*0.9 + seed) - 0.5) * bumpAmp; p[0]+=n[0]*b; p[1]+=n[1]*b; p[2]+=n[2]*b; }
      cellV[cidx(i,j,k)] = verts.length; verts.push(p);
    }
    const tris = [], nrm = verts.map(() => [0, 0, 0]);
    const tri = (A, B, C) => {                                            // orienta p/ fora via gradiente no centro
      const a = verts[A], b = verts[B], c = verts[C];
      const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], wx=c[0]-a[0], wy=c[1]-a[1], wz=c[2]-a[2];
      const fx=uy*wz-uz*wy, fy=uz*wx-ux*wz, fz=ux*wy-uy*wx;
      const g = grad((a[0]+b[0]+c[0])/3, (a[1]+b[1]+c[1])/3, (a[2]+b[2]+c[2])/3);
      tris.push(A, (fx*g[0]+fy*g[1]+fz*g[2]) < 0 ? C : B, (fx*g[0]+fy*g[1]+fz*g[2]) < 0 ? B : C);
    };
    const quad = (a,b,c,d) => { if (a<0||b<0||c<0||d<0) return; tri(a,b,c); tri(a,c,d); };
    for (let i=0;i<nx;i++) for (let j=0;j<ny;j++) for (let k=0;k<nz;k++) {
      const s0 = val[vidx(i,j,k)] < 0;
      if (j>0 && k>0 && (val[vidx(i+1,j,k)]<0) !== s0) quad(cellV[cidx(i,j-1,k-1)], cellV[cidx(i,j,k-1)], cellV[cidx(i,j,k)], cellV[cidx(i,j-1,k)]);
      if (i>0 && k>0 && (val[vidx(i,j+1,k)]<0) !== s0) quad(cellV[cidx(i-1,j,k-1)], cellV[cidx(i,j,k-1)], cellV[cidx(i,j,k)], cellV[cidx(i-1,j,k)]);
      if (i>0 && j>0 && (val[vidx(i,j,k+1)]<0) !== s0) quad(cellV[cidx(i-1,j-1,k)], cellV[cidx(i,j-1,k)], cellV[cidx(i,j,k)], cellV[cidx(i-1,j,k)]);
    }
    if (smooth) {                                                         // suavização Laplaciana: tira os caroços do surface-nets
      const adj = verts.map(() => new Set());
      for (let t = 0; t < tris.length; t += 3) { const a=tris[t], b=tris[t+1], c=tris[t+2]; adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b); }
      for (let it = 0; it < smooth; it++) {
        const nv = verts.map((p, i) => { if (!adj[i].size) return p; let x=0, y=0, z=0; for (const j of adj[i]) { x+=verts[j][0]; y+=verts[j][1]; z+=verts[j][2]; } const n = adj[i].size; return [p[0]+0.5*(x/n-p[0]), p[1]+0.5*(y/n-p[1]), p[2]+0.5*(z/n-p[2])]; });
        for (let i = 0; i < verts.length; i++) verts[i] = nv[i];
      }
    }
    for (let t = 0; t < tris.length; t += 3) {                            // normais suaves = média das faces
      const A=tris[t], B=tris[t+1], C=tris[t+2], a=verts[A], b=verts[B], c=verts[C];
      const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], wx=c[0]-a[0], wy=c[1]-a[1], wz=c[2]-a[2];
      const fx=uy*wz-uz*wy, fy=uz*wx-ux*wz, fz=ux*wy-uy*wx;
      for (const V of [A, B, C]) { nrm[V][0]+=fx; nrm[V][1]+=fy; nrm[V][2]+=fz; }
    }
    for (let v = 0; v < nrm.length; v++) nrm[v] = norm(nrm[v]);
    for (let t = 0; t < tris.length; t += 3) for (const V of [tris[t], tris[t+1], tris[t+2]]) {
      const p = verts[V], n = nrm[V], uv = uvFn(p, n);
      m.v.push(p[0], p[1], p[2], uv[0], uv[1], n[0], n[1], n[2]);
    }
  }
  /* copa MESCLADA: lóbulos = esferas SDF unidas por smin (o "boolean" pedido),
     mantendo o raio de cada bojo; caroços por fbm. UV triplanar. */
  function copaMetaball(m, lobes, seed) {
    const K = 0.14, PAD = 0.4;
    const ph = hash2(seed * 3 + 1, 5) * 9, ph2 = hash2(seed * 7 + 2, 9) * 9;
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const L of lobes) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], L.c[a] - L.r - PAD); hi[a] = Math.max(hi[a], L.c[a] + L.r + PAD); }
    const sdf = (px, py, pz) => { let d = 1e9; for (const L of lobes) { const dx=px-L.c[0], dy=py-L.c[1], dz=pz-L.c[2]; d = smin(d, Math.sqrt(dx*dx+dy*dy+dz*dz) - L.r, K); } return d; };
    const uv = (p, n) => { const ax=Math.abs(n[0]), ay=Math.abs(n[1]), az=Math.abs(n[2]); const u = ay>=ax&&ay>=az?p[0]:ax>=az?p[2]:p[0]; const v = ay>=ax&&ay>=az?p[2]:p[1]; return [u*0.78+ph, v*0.78+ph2]; };
    superficieSDF(m, sdf, lo, hi, 0.15, 0.16, 0, seed, uv);
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
  const anel = (c, u, w, r, lados = LADOS) => Array.from({ length: lados + 1 }, (_, i) => {
    const a = i / lados * TAU, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    return [c[0] + u[0]*ca + w[0]*sa, c[1] + u[1]*ca + w[1]*sa, c[2] + u[2]*ca + w[2]*sa];
  });
  const tri3 = (m, p0, p1, p2, N, uv0, uv1, uv2) => {
    m.v.push(p0[0],p0[1],p0[2], uv0[0],uv0[1], N[0],N[1],N[2]);
    m.v.push(p1[0],p1[1],p1[2], uv1[0],uv1[1], N[0],N[1],N[2]);
    m.v.push(p2[0],p2[1],p2[2], uv2[0],uv2[1], N[0],N[1],N[2]);
  };
  /* tampa em leque que FECHA o tubo (senão a casca invertida do contorno vaza) */
  const tampa = (m, cen, ring, d, lado, lados = LADOS) => {
    const N = [d[0]*lado, d[1]*lado, d[2]*lado], uvc = [0.5, 0.5];
    for (let i = 0; i < lados; i++) {
      const a0 = ring[i], a1 = ring[i + 1];
      const uv0 = [0.5 + Math.cos(i/lados*TAU)*0.5, 0.5 + Math.sin(i/lados*TAU)*0.5];
      const uv1 = [0.5 + Math.cos((i+1)/lados*TAU)*0.5, 0.5 + Math.sin((i+1)/lados*TAU)*0.5];
      if (lado > 0) tri3(m, cen, a0, a1, N, uvc, uv0, uv1); else tri3(m, cen, a1, a0, N, uvc, uv1, uv0);
    }
  };
  /* um galho: tubo afunilado ESTANQUE tampado nas 2 pontas + recursão de filhos
     que EMBUTEM na ponta (a sobreposição esconde a junção). Determinístico via hash2. */
  function galhoSeca(m, base, dir, len, r0, r1, nivel, sd, tips, flare, vAltMode, lados = LADOS) {
    let rc = 0;
    const rnd = () => hash2(sd + rc * 29 + 11, (rc++) * 17 + sd * 2 + 3);
    const SUB = nivel > 0 ? 3 : 2, curva = 0.10 + 0.05 * (3 - nivel);
    const pts = [base.slice()], rads = [r0 * (flare || 1)], segD = [];   // flare>1: base do galho começa larga (colar) e afina -> junção suave
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
    for (let i = 0; i <= SUB; i++) { const t = tang(i); u = i === 0 ? u : transporta(u, t); rings.push(anel(pts[i], u, cross(u, t), rads[i], lados)); }
    for (let s = 0; s < SUB; s++) {
      const lo = rings[s], hi = rings[s+1];
      const axm = [(pts[s][0]+pts[s+1][0])/2, (pts[s][1]+pts[s+1][1])/2, (pts[s][2]+pts[s+1][2])/2];
      for (let i = 0; i < lados; i++) {
        const p0 = lo[i], p1 = lo[i+1], p2 = hi[i+1], p3 = hi[i];
        const mid = [(p0[0]+p1[0]+p2[0]+p3[0])/4, (p0[1]+p1[1]+p2[1]+p3[1])/4, (p0[2]+p1[2]+p2[2]+p3[2])/4];
        const Nrm = norm([mid[0]-axm[0], mid[1]-axm[1], mid[2]-axm[2]]);
        const uA = i/lados*3, uB = (i+1)/lados*3;
        const vL = vAltMode ? vAlt(pts[s][1]) : s, vH = vAltMode ? vAlt(pts[s+1][1]) : s + 1;   // vAltMode: V pela ALTURA (casa com o loft do tronco-raiz)
        quadUV(m, p0, p1, p2, p3, [uA, vL], [uB, vL], [uB, vH], [uA, vH], Nrm);
      }
    }
    tampa(m, pts[0], rings[0], tang(0), -1, lados);
    tampa(m, pts[SUB], rings[SUB], tang(SUB), +1, lados);
    if (nivel <= 0) { if (tips) tips.push(pts[SUB].slice()); return; }   // ponta terminal -> semente de lóbulo
    const tip = pts[SUB], tdir = tang(SUB), nCh = 2 + (rnd() < 0.45 ? 1 : 0);
    const start = [tip[0] - tdir[0]*len*0.13, tip[1] - tdir[1]*len*0.13, tip[2] - tdir[2]*len*0.13];   // embute MAIS fundo -> esconde a costura
    for (let k = 0; k < nCh; k++) {
      const theta = 0.45 + rnd() * 0.5, phi = (k / nCh) * TAU + rnd() * 0.9;
      let cdir = desviar(tdir, theta, phi);
      cdir = norm([cdir[0], cdir[1] + 0.18, cdir[2]]);   // viés p/ cima -> lê como árvore
      const cLen = len * (0.60 + rnd() * 0.16), cR0 = r1 * (0.78 + rnd() * 0.10);
      const cR1 = Math.max(0.035, cR0 * (0.48 + rnd() * 0.18));
      galhoSeca(m, start, cdir, cLen, cR0, cR1, nivel - 1, sd * 4 + k + 1, tips, 1.5, vAltMode, lados);   // base do filho flarada -> colar suave
    }
  }

  /* ---------- base com RAÍZES (ref. do ideador): tronco alarga num "pé de elefante"
     e splaia em N dedos que ABREM na linha do chão e afinam em ponta abaixo (entrando
     na terra, y<0 escondido pelo chão). Loft por um PERFIL vertical explícito
     [y, raioBase, amplitudeDedo]: o dedo (cos(N·a)) é MÁXIMO no chão e some no topo
     (junta no tronco) e afina embaixo (ponta na terra).
     UV por ALTURA (v = vAlt(y)) igualzinho ao galhoSeca(vAltMode) -> a casca BARK_SECA
     é IDÊNTICA e FLUI da raiz pro tronco (base escura -> raiz lisa -> tronco ranhurado);
     a sombra do vão/base agora vem da própria BARK_SECA (gradiente por altura), não de
     luz pintada -> mesma textura nas duas partes (exigência do ideador). */
  function baseRaiz(m, seed, LON = 30) {
    const nRoots = 5, phase = hash2(seed * 3 + 1, 7) * TAU;   // LON múltiplo de 5 -> dedos caem em vértices (estrela nítida)
    const LV = [
      [0.72, 0.29, 0.00],   // topo: junta liso no tronco
      [0.46, 0.33, 0.07],
      [0.24, 0.40, 0.22],
      [0.05, 0.49, 0.44],   // LINHA DO CHÃO: dedos bem abertos
      [-0.12, 0.44, 0.52],  // logo abaixo: ainda largo, mergulhando
      [-0.34, 0.27, 0.42],  // estreitando
      [-0.58, 0.09, 0.18],  // ponta na terra
    ];
    const mkRing = ([yy, rb, ta]) => Array.from({ length: LON + 1 }, (_, i) => {
      const a = i / LON * TAU, s = Math.max(0, Math.cos(nRoots * (a - phase)));   // 1 no dedo, 0 no vão
      const rr = rb + Math.pow(s, 1.5) * ta - (1 - s) * 0.03 * (ta > 0.05 ? 1 : 0);   // dedo salta; vão recua leve
      return [Math.cos(a) * rr, yy, Math.sin(a) * rr];
    });
    const rings = LV.map(mkRing);
    for (let r = 0; r < rings.length - 1; r++) {
      const up = rings[r], dn = rings[r + 1], vU = vAlt(LV[r][0]), vD = vAlt(LV[r + 1][0]);   // v pela ALTURA (mesma da BARK_SECA)
      for (let i = 0; i < LON; i++) {
        const p0 = dn[i], p1 = dn[i + 1], p2 = up[i + 1], p3 = up[i];   // winding = addTrunk (baixo->cima, frente p/ fora)
        quadUV(m, p0, p1, p2, p3, [i / LON * 4, vD], [(i + 1) / LON * 4, vD], [(i + 1) / LON * 4, vU], [i / LON * 4, vU], norm([p0[0] + p3[0], 0, p0[2] + p3[2]]));   // normal RADIAL pura (sem viés p/ cima) = igual ao galhoSeca -> pé e tronco sombreiam idêntico, sem degrau de brilho na emenda
      }
    }
  }

  /* ---------- o carimbo: uma árvore por (espécie, seed) na origem ---------- */
  function construir(especie, seed) {
    const S = (seed | 0) || 1, trunk = Mesh(), canopy = Mesh();
    let ctex = VERDE_CARTOON, ink = null, outl = 0.05, toon = 1;
    if (especie === 'oval') {
      addTrunk(trunk, 1.9, 0.34, 0.12); blobOval(canopy, [0, 1.9 + 2.0 * 0.92, 0], 1.35, 2.0, 0.44, S);
    } else if (especie === 'larga') {
      addTrunk(trunk, 1.3, 0.4, 0.16); blobOval(canopy, [0, 1.3 + 1.5 * 0.92, 0], 2.0, 1.5, 0.5, S);
    } else if (especie === 'pinheiro') {
      addTrunk(trunk, 0.85, 0.28, 0.11); pinheiroTiers(canopy, 0.7, 1.65, 4.0, 5, S); ctex = PINE;
    } else if (especie === 'cerejeira') {
      addTrunk(trunk, 1.7, 0.3, 0.12); blobOval(canopy, [0, 1.7 + 1.6 * 0.92, 0], 1.6, 1.6, 0.42, S); ctex = ROSA_CARTOON; ink = TINTA_ROSA;
    } else if (especie === 'seca') {
      // esqueleto de galhos (tubos) -> trunk (BARK ranhurada); copa vazia
      galhoSeca(trunk, [0, 0, 0], [0, 1, 0], 1.7, 0.30, 0.20, 3, S); ink = TINTA_SECA; outl = 0; toon = 0;
    } else if (especie === 'raiz') {
      // UMA malha (canopy), UMA textura (BARK_RAIZ LISA por ALTURA) na árvore INTEIRA —
      // exigência do ideador: tronco e galhos com a MESMÍSSIMA textura da raiz (lisa, sem
      // ranhura). Pé de raízes + tronco/galhos (galhoSeca em vAltMode) NO MESMO mesh e MESMO
      // mapeamento por altura -> casca idêntica que flui (base escura -> warm liso) da raiz
      // ao topo; galhoSeca nivel 3 dá a ramificação natural. Única marca: a emenda geométrica.
      const NL = 10;   // MESMO nº de lados na raiz e no tronco/galhos -> a FORMA bate (sem a raiz redonda vs tronco quadrado); 10 = estrela de 5 pontas afiada
      baseRaiz(canopy, S, NL);
      galhoSeca(canopy, [0, 0.5, 0], [0, 1, 0], 1.5, 0.31, 0.18, 3, S + 1, null, null, true, NL);
      ctex = BARK_RAIZ; ink = null; outl = 0; toon = 0;
    } else if (especie === 'frondosa') {
      /* a seca ramificada + COPA que SEGUE os galhos: aglomera as pontas de CIMA em
         poucos lóbulos MESCLADOS (silhueta irregular, não bolas nas pontas); os galhos
         de baixo ficam PELADOS. Esqueleto -> trunk (BARK); lóbulos -> canopy (verde+contorno). */
      const tips = [];
      galhoSeca(trunk, [0, 0, 0], [0, 1, 0], 1.55, 0.30, 0.16, 3, S, tips);
      let ymin = 1e9, ymax = -1e9;
      for (const t of tips) { if (t[1] < ymin) ymin = t[1]; if (t[1] > ymax) ymax = t[1]; }
      const corte = ymin + (ymax - ymin) * 0.34;             // só as pontas do TERÇO de cima viram copa
      const altas = tips.filter((t) => t[1] > corte).sort((a, b) => b[1] - a[1]);
      const centros = [];                                    // aglomera greedy: pontas próximas viram um lóbulo só
      for (const t of altas) if (centros.every((c) => Math.hypot(c[0]-t[0], c[1]-t[1], c[2]-t[2]) > 0.64)) centros.push(t.slice());
      const lobes = centros.map((c, i) => ({ c: [c[0], c[1] + 0.10, c[2]], r: 0.54 + hash2(i * 7 + 1, S) * 0.26 }));
      copaMetaball(canopy, lobes, S);                        // funde tudo numa pele só (sem seams internos)
      ctex = VERDE_FLAT; outl = 0.03;                        // sem curvas; contorno FINO (superfície orgânica não aguenta casca grossa)
    } else {   // copada: maciço de 4 lóbulos ancorado no tronco
      addTrunk(trunk, 1.7, 0.34, 0.13); const cy = 1.7 + 1.15;
      blobOval(canopy, [0, cy, 0], 1.5, 1.62, 0.42, S);
      blobOval(canopy, [-0.66, cy - 0.18, 0.3], 0.82, 0.98, 0.44, S + 1);
      blobOval(canopy, [0.68, cy - 0.12, -0.28], 0.86, 1.02, 0.44, S + 2);
      blobOval(canopy, [0.06, cy + 0.72, 0.06], 0.8, 0.86, 0.46, S + 3);
    }
    return { trunk, canopy, tex: ctex, outlineInk: ink, outline: outl, toon };
  }

  return { construir, ESPECIES, BARK };
}
