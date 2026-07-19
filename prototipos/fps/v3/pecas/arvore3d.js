/* PEÇA: arvore3d — experimento "3D-ish" da árvore (D-59→): tronco de verdade
   (prisma afunilado com casca) + copa feita de VÁRIOS cartões de folhagem
   agrupados num bolo 3D (não billboard chapado, não cruz com costura). Volume
   de qualquer ângulo, ~30 triângulos. Copa e casca são texturas próprias do
   v3 (fbm consertado, D-58); estilo BotW da V2 (sombra teal embaixo → topo
   amarelo-verde, contorno de tinta). Barato por design — dá pra florestar. */
/* raio do flare de raiz — a parte MAIS LARGA do tronco. Fica aqui fora porque
   o meta e a geometria leem o mesmo número: colisor declarado à parte vira uma
   segunda verdade, e foi assim que a borda da ilha saiu do lugar. */
const TRONCO_R = 0.34, TRONCO_H = 1.9;

export const meta = {
  nome: 'arvore3d',
  tipo: 'objeto',
  desc: 'árvore 3D: tronco prisma + copa bola-3D deformada com cachos de folha',
  /* colisão POR TIPO, não por árvore plantada. Só o tronco: a copa começa
     acima da cabeça, e incluí-la faria esbarrar em nada a metros do tronco. */
  colisao: { forma: 'cilindro', raio: TRONCO_R, altura: TRONCO_H },
};

export function construir(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, hash2 } = tex;
  const { Mesh, quad, quadUV, tri } = geo;
  /* tier de TEXTURA (D-61, medido — 32/64/128px, ctx.TS=2/4/8): GT=16·TS
     casa com a convenção que a casa-toras já usa; SCALE reescala as
     frequências de ruído JUNTO (senão vira padrão mais denso, não "mesma
     árvore com mais pixel" — a lição do teste de 32..512px). */
  const TS = ctx.TS ?? 4, SCALE = TS / 4;
  /* SEED (D-61): construir() era 100% determinístico — sempre a MESMA árvore.
     Pra plantar um punhado sem clonar, um seed opcional desloca a fase do
     ruído da copa e o jitter dos cachos; tronco/silhueta continuam iguais
     (a pool de variantes é textura+copa, não geometria toda nova). */
  const SEED = ctx.seed ?? 0;

  /* ---------- texturas ---------- */
  /* folhagem: CACHOS de folha ladrilháveis — cada cacho é um blob escalopado
     com topo iluminado, meio, e fresta escura embaixo (separação entre cachos)
     + glint de sol esparso. Estampado num buffer (wrap = ladrilha na casca). */
  const GT = 16 * TS;
  const lb = new Int16Array(GT * GT);
  for (let i = 0; i < lb.length; i++) {            // base mosqueada
    const n = fbm((i % GT) / (6 * SCALE) + 1, ((i / GT) | 0) / (6 * SCALE) + 2);
    lb[i] = n > 0.6 ? 31 : n > 0.35 ? 30 : 29;
  }
  const rnd = (a, b) => hash2(a * 7 + b * 13 + 1 + SEED * 31, b * 17 + 3 + SEED * 17);
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {   // 8×8 cachos jitterados
    const cx = (gx * 8 + rnd(gx, gy) * 6) * SCALE, cy = (gy * 8 + rnd(gy, gx) * 6) * SCALE, r = (4 + rnd(gx + 1, gy) * 3) * SCALE;
    for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      const dd = Math.hypot(dx, dy);
      const er = r * (0.82 + 0.18 * Math.sin(Math.atan2(dy, dx) * 3 + gx));  // borda escalopada
      if (dd > er) continue;
      const px = (Math.round(cx + dx) + GT) & (GT - 1), py = (Math.round(cy + dy) + GT) & (GT - 1);
      let i = dy < -r * 0.35 ? 33 : dy < r * 0.05 ? 32 : 31;   // topo claro -> meio
      if (dd > er - 1.5 * SCALE) i = dy > 0 ? 29 : 30;         // fresta escura embaixo
      lb[py * GT + px] = i;
    }
    if (rnd(gx, gy + 9) < 0.45) { const gpx = Math.round(cx) & (GT - 1), gpy = (Math.round(cy - r * 0.5) + GT) & (GT - 1); lb[gpy * GT + gpx] = 28; }  // glint
  }
  const LEAFTEX = texCanvas(GT, GT, (x, y) => lb[y * GT + x]);
  /* casca: estrias verticais quentes */
  const BW = 8 * TS, BH = 16 * TS;
  const BARK = texCanvas(BW, BH, (x, y) => {
    const n = fbm(x / (5 * SCALE), y / (11 * SCALE));
    let i = n > 0.6 ? 4 : n > 0.4 ? 21 : n > 0.24 ? 20 : 24;
    if (Math.round(x + fbm(x / (3 * SCALE), y / (22 * SCALE)) * 3 * SCALE) % Math.round(5 * SCALE) < SCALE) i = 24;  // ranhura
    return i;
  });

  /* ---------- helpers de vetor ---------- */
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  /* ---------- tronco: prisma afunilado com flare de raiz ---------- */
  const trunk = Mesh();
  const SIDES = 8, trunkH = TRONCO_H;
  const ring = (yy, r) => Array.from({ length: SIDES + 1 }, (_, i) => {
    const a = i / SIDES * Math.PI * 2; return [Math.cos(a) * r, yy, Math.sin(a) * r];
  });
  const rFlare = ring(0, TRONCO_R), rBase = ring(0.35, 0.24), rTop = ring(trunkH, 0.12);
  const band = (A, B, vA, vB) => {
    for (let i = 0; i < SIDES; i++) {
      const p0 = A[i], p1 = A[i + 1], p2 = B[i + 1], p3 = B[i];
      const nrm = norm([p0[0] + p3[0], 0, p0[2] + p3[2]]);   // radial pra fora
      quadUV(trunk, p0, p1, p2, p3, [i / SIDES * 3, vA], [(i + 1) / SIDES * 3, vA], [(i + 1) / SIDES * 3, vB], [i / SIDES * 3, vB], nrm);
    }
  };
  band(rFlare, rBase, 1, 0.85); band(rBase, rTop, 0.85, 0);

  /* ---------- copa: BOLA 3D deformada, LISA e OVAL (variante escolhida) ----------
     normais por-vértice RADIAIS = superfície lisa (sem facetado); forma ovalada
     (ry>rx) = cara de árvore, não pirulito; lumps por ruído quebram a bola. O
     degradê topo→base sai da LUZ na normal. Sem contorno de tinta (o ideador
     achou o rim estranho) — o motor tem o recurso (rim por lote) se um dia. */
  const canopy = Mesh();
  const cRx = 1.35, cRy = 2.0, AMP = 0.34, LAT = 9, LON = 12;
  const cCenY = trunkH + cRy * 0.92, cen = [0, cCenY, 0];
  const cpt = (a, o) => {
    const theta = a / LAT * Math.PI, phi = o / LON * Math.PI * 2;
    const cP = Math.cos(phi), sP = Math.sin(phi), sT = Math.sin(theta);
    const bump = 1 + AMP * (fbm(cP * 1.9 + a * 0.8 + 5 + SEED * 9, sP * 1.9 + a * 0.8 + SEED * 5) - 0.5) * 2;  // saliências
    const rx = cRx * sT * bump;
    return [cP * rx, cCenY + cRy * Math.cos(theta) * (0.92 + 0.08 * bump), sP * rx];
  };
  const grid = Array.from({ length: LAT + 1 }, (_, a) => Array.from({ length: LON + 1 }, (_, o) => cpt(a, o)));
  const quad4 = (P, UV, Nn) => {
    const push = (i) => canopy.v.push(P[i][0], P[i][1], P[i][2], UV[i][0], UV[i][1], Nn[i][0], Nn[i][1], Nn[i][2]);
    push(0); push(1); push(2); push(0); push(2); push(3);
  };
  for (let a = 0; a < LAT; a++) for (let o = 0; o < LON; o++) {
    const P = [grid[a][o], grid[a][o + 1], grid[a + 1][o + 1], grid[a + 1][o]];
    const UV = [[o / LON * 2.5, a / LAT * 2.5], [(o + 1) / LON * 2.5, a / LAT * 2.5], [(o + 1) / LON * 2.5, (a + 1) / LAT * 2.5], [o / LON * 2.5, (a + 1) / LAT * 2.5]];
    const Nn = P.map((p) => norm([p[0] - cen[0], p[1] - cen[1], p[2] - cen[2]]));   // radial = liso
    quad4(P, UV, Nn);
  }

  return {
    camera: { e: 3.0, r: 7.2 },
    lotes: [
      { mesh: trunk, tex: BARK },
      { mesh: canopy, tex: LEAFTEX },   // sem contorno (a ③: lisa+oval limpa)
    ],
  };
}
