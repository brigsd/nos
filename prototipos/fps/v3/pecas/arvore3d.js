/* PEÇA: arvore3d — experimento "3D-ish" da árvore (D-59→): tronco de verdade
   (prisma afunilado com casca) + copa feita de VÁRIOS cartões de folhagem
   agrupados num bolo 3D (não billboard chapado, não cruz com costura). Volume
   de qualquer ângulo, ~30 triângulos. Copa e casca são texturas próprias do
   v3 (fbm consertado, D-58); estilo BotW da V2 (sombra teal embaixo → topo
   amarelo-verde, contorno de tinta). Barato por design — dá pra florestar. */
export const meta = {
  nome: 'arvore3d',
  tipo: 'objeto',
  desc: 'árvore 3D: tronco prisma + copa bola-3D deformada com cachos de folha',
};

export function construir(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, hash2 } = tex;
  const { Mesh, quad, quadUV, tri } = geo;

  /* ---------- texturas ---------- */
  /* folhagem: CACHOS de folha ladrilháveis — cada cacho é um blob escalopado
     com topo iluminado, meio, e fresta escura embaixo (separação entre cachos)
     + glint de sol esparso. Estampado num buffer (wrap = ladrilha na casca). */
  const GT = 64;
  const lb = new Int16Array(GT * GT);
  for (let i = 0; i < lb.length; i++) {            // base mosqueada
    const n = fbm((i % GT) / 6 + 1, ((i / GT) | 0) / 6 + 2);
    lb[i] = n > 0.6 ? 31 : n > 0.35 ? 30 : 29;
  }
  const rnd = (a, b) => hash2(a * 7 + b * 13 + 1, b * 17 + 3);
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {   // 8×8 cachos jitterados
    const cx = gx * 8 + rnd(gx, gy) * 6, cy = gy * 8 + rnd(gy, gx) * 6, r = 4 + rnd(gx + 1, gy) * 3;
    for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      const dd = Math.hypot(dx, dy);
      const er = r * (0.82 + 0.18 * Math.sin(Math.atan2(dy, dx) * 3 + gx));  // borda escalopada
      if (dd > er) continue;
      const px = (cx + dx + GT) & (GT - 1), py = (cy + dy + GT) & (GT - 1);
      let i = dy < -r * 0.35 ? 33 : dy < r * 0.05 ? 32 : 31;   // topo claro -> meio
      if (dd > er - 1.5) i = dy > 0 ? 29 : 30;                 // fresta escura embaixo
      lb[py * GT + px] = i;
    }
    if (rnd(gx, gy + 9) < 0.45) lb[(((cy - r * 0.5) | 0) + GT & (GT - 1)) * GT + (cx & (GT - 1))] = 28;  // glint
  }
  const LEAFTEX = texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  /* casca: estrias verticais quentes */
  const BARK = texCanvas(32, 64, (x, y) => {
    const n = fbm(x / 5, y / 11);
    let i = n > 0.6 ? 4 : n > 0.4 ? 21 : n > 0.24 ? 20 : 24;
    if ((x + (fbm(x / 3, y / 22) * 3 | 0)) % 5 === 0) i = 24;  // ranhura
    return i;
  });

  /* ---------- helpers de vetor ---------- */
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  /* ---------- tronco: prisma afunilado com flare de raiz ---------- */
  const trunk = Mesh();
  const SIDES = 8, trunkH = 1.9;
  const ring = (yy, r) => Array.from({ length: SIDES + 1 }, (_, i) => {
    const a = i / SIDES * Math.PI * 2; return [Math.cos(a) * r, yy, Math.sin(a) * r];
  });
  const rFlare = ring(0, 0.34), rBase = ring(0.35, 0.24), rTop = ring(trunkH, 0.12);
  const band = (A, B, vA, vB) => {
    for (let i = 0; i < SIDES; i++) {
      const p0 = A[i], p1 = A[i + 1], p2 = B[i + 1], p3 = B[i];
      const nrm = norm([p0[0] + p3[0], 0, p0[2] + p3[2]]);   // radial pra fora
      quadUV(trunk, p0, p1, p2, p3, [i / SIDES * 3, vA], [(i + 1) / SIDES * 3, vA], [(i + 1) / SIDES * 3, vB], [i / SIDES * 3, vB], nrm);
    }
  };
  band(rFlare, rBase, 1, 0.85); band(rBase, rTop, 0.85, 0);

  /* ---------- copa: BOLA 3D deformada (elipsoide lumpy, casca fechada) ----------
     a forma É a geometria; o degradê topo-claro→base-escura sai da LUZ na
     normal (não de textura pintada). Lumps por ruído = não vira bola lisa. */
  const canopy = Mesh();
  const cCenY = trunkH + 1.15, cRx = 1.55, cRy = 1.5;
  const LAT = 8, LON = 12, AMP = 0.26;
  const cpt = (a, o) => {
    const theta = a / LAT * Math.PI, phi = o / LON * Math.PI * 2;
    const cP = Math.cos(phi), sP = Math.sin(phi), sT = Math.sin(theta);
    const bump = 1 + AMP * (fbm(cP * 1.9 + a * 0.8 + 5, sP * 1.9 + a * 0.8) - 0.5) * 2;  // saliências
    const rx = cRx * sT * bump;
    return [cP * rx, cCenY + cRy * Math.cos(theta) * (0.92 + 0.08 * bump), sP * rx];
  };
  const grid = Array.from({ length: LAT + 1 }, (_, a) => Array.from({ length: LON + 1 }, (_, o) => cpt(a, o)));
  const faceNorm = (p0, p1, p2) => {
    const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let n = norm(cross(u, v));
    const c = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2 - cCenY, (p0[2] + p2[2]) / 2];  // ref radial
    if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) n = [-n[0], -n[1], -n[2]];         // pra fora
    return n;
  };
  for (let a = 0; a < LAT; a++) for (let o = 0; o < LON; o++) {
    const p0 = grid[a][o], p1 = grid[a][o + 1], p2 = grid[a + 1][o + 1], p3 = grid[a + 1][o];
    const nrm = faceNorm(p0, p1, p2);
    const u0 = o / LON * 2.5, u1 = (o + 1) / LON * 2.5, v0 = a / LAT * 2.5, v1 = (a + 1) / LAT * 2.5;
    quadUV(canopy, p0, p1, p2, p3, [u0, v0], [u1, v0], [u1, v1], [u0, v1], nrm);
  }

  return {
    camera: { e: 2.6, r: 6.2 },
    lotes: [
      { mesh: trunk, tex: BARK },
      { mesh: canopy, tex: LEAFTEX },
    ],
  };
}
