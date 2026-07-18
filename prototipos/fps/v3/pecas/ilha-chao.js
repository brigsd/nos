/* PEÇA: ilha-chao — o primeiro retalho de CHÃO do v3 (port da natureza v2).
   Ilha flutuante NA ESCALA DA V2 (o mundo é uma grade 64×64 tiles; a ilha tem
   ~56 unidades de diâmetro) sobre o mar de nuvens. Decisões do ideador (D-57→):
   sem carreiro; SEM a parte de baixo (o jogador nunca a vê) — só uma fita de
   terra na borda pra ilha não virar papel; sem pólen (em paisagem lia como
   enxame). A grama volta aos 64px/UNIDADE da v2 (receita do genGrassTile:
   mancha de sol + pinceladas diagonais + touceiras + flores), o lago ganha
   praia de areia, e a névoa/far são da peça (a padrão esmagava tudo). */
export const meta = {
  nome: 'ilha-chao',
  tipo: 'chao',
  desc: 'a ilha flutuante na escala v2: grama, lago com praia + ilhotas craggy ao redor',
};

export function construir(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, vnoise, hash2 } = tex;
  const { Mesh, quad, quadUV, tri } = geo;
  const TAU = Math.PI * 2;

  /* ---------- texturas (per-pixel, paleta Resurrect64) ---------- */
  /* GRAMA na densidade da v2: 256px cobrindo 4×4 unidades (64px/unidade).
     Receita do genGrassTile portada: base mosqueada em 2 escalas + pinceladas
     curtas na diagonal do vento + touceiras com raiz + flores esparsas.
     Stamps imperativos exigem buffer próprio (texCanvas é per-pixel). */
  const GT = 256;
  const gbuf = new Int16Array(GT * GT).fill(32);
  for (let y = 0; y < GT; y++) for (let x = 0; x < GT; x++) {
    /* base CALMA: manchas largas de sol/sombra, brilho fino RARO (com o ruído
       consertado os limiares antigos viravam confete a distância) */
    const broad = vnoise(x / 30 + 11, y / 30 - 3);
    const fine = vnoise(x / 5 - 7, y / 5 + 17);
    let i = 32;
    if (broad > 0.72) i = 33;
    else if (broad < 0.30 && fine > 0.62) i = 31;  // sombra rasteira
    if (fine > 0.93) i = 33;                       // fiapo claro raro
    gbuf[y * GT + x] = i;
  }
  const R = (i, k) => hash2(i * 7 + k, k * 13 + 5);          // stream de rnd
  for (let i = 0; i < 2000; i++) {                           // pinceladas (\)
    const sx = (R(i, 1) * GT) | 0, sy = (R(i, 2) * GT) | 0, len = 2 + (R(i, 3) * 4) | 0;
    const r = R(i, 4), tone = r < 0.55 ? 31 : r < 0.85 ? 27 : 33;
    for (let k = 0; k < len; k++) gbuf[(((sy - (k >> 1)) & (GT - 1)) * GT + ((sx + k) & (GT - 1)))] = tone;
  }
  for (let i = 0; i < 150; i++) {                            // touceiras c/ raiz
    const cx = (R(i, 5) * GT) | 0, cy = (R(i, 6) * GT) | 0;
    for (let k = 0; k < 5; k++) {
      const x = (cx + ((R(i * 5 + k, 7) * 3) | 0) - 1) & (GT - 1), y = (cy + ((R(i * 5 + k, 8) * 3) | 0)) & (GT - 1);
      gbuf[y * GT + x] = k === 0 ? 30 : k < 3 ? 31 : 27;
    }
  }
  for (let i = 0; i < 40; i++) {                             // flores 2×2 + miolo
    const fx = 2 + (R(i, 9) * (GT - 4)) | 0, fy = 2 + (R(i, 10) * (GT - 4)) | 0;
    const petal = [9, 57, 18, 53][(R(i, 11) * 4) | 0];
    gbuf[fy * GT + fx] = petal; gbuf[fy * GT + fx + 1] = petal;
    gbuf[(fy + 1) * GT + fx] = petal; gbuf[(fy + 1) * GT + fx + 1] = 28;
  }
  const GRASS = texCanvas(GT, GT, (x, y) => gbuf[y * GT + x]);

  /* fita da borda: TERRA sob a grama (oliva/pedra), não breu */
  const ROCK = texCanvas(128, 64, (x, y) => {
    const n = fbm(x / 9, y / 9), m = fbm(x / 4 + 7, y / 4 + 2);
    let i = n > 0.62 ? 25 : n > 0.40 ? 24 : 34;
    if (m > 0.74) i = 2;                          // pedra encravada
    if (m < 0.16) i = 1;                          // fenda
    if (y < 5 + fbm(x / 6, 9) * 7) i = 24;        // raiz de terra sob a grama
    return i;
  });
  /* LAGO na escala v2: raso ciano na orla -> teal fundo, crista, orla clara */
  const WATER = texCanvas(256, 256, (x, y) => {
    const dx = (x + 0.5) / 256 - 0.5, dy = (y + 0.5) / 256 - 0.5;
    const d = Math.hypot(dx, dy) * 2;                 // 0 centro .. ~1 borda
    const w = fbm(x / 13 + 2, y / 13 + 4);
    let i = d > 0.93 ? 43 : d > 0.80 ? 42 : d > 0.58 ? 41 : d > 0.34 ? 40 : 39;
    if (w > 0.70 && ((x + y) & 3) === 0) i = 43;      // brilho de crista
    return i;
  });
  /* PRAIA: anel de areia quente entre a grama e a água (a margem da v2) */
  const SAND = texCanvas(128, 128, (x, y) => {
    const n = fbm(x / 7 + 5, y / 7), h = hash2(x * 3, y * 3);
    let i = n > 0.62 ? 23 : 4;
    if (h < 0.02) i = 3; else if (h > 0.985) i = 63;  // conchinha/grão
    return i;
  });
  /* BARRIGA de rocha das ilhotas distantes: pedra craggy cinza c/ veio terroso
     e coroa de terra sob a grama (a silhueta pontuda que "flutua") */
  const BELLY = texCanvas(128, 128, (x, y) => {
    const n = fbm(x / 11, y / 11), m = fbm(x / 4 + 5, y / 4 + 2);
    let i = n > 0.62 ? 7 : n > 0.44 ? 6 : n > 0.28 ? 2 : 34;
    if (m > 0.72) i = 5;                          // veio
    if (m < 0.14) i = 1;                          // fenda
    if (y < 9 + fbm(x / 7, 3) * 7) i = 24;        // coroa de terra sob a grama
    return i;
  });
  /* ---------- geometria ---------- */
  const N = 96, R0 = 28;                 // ~56u de diâmetro = a ilha da v2
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const faceNorm = (a, b, c, ref) => {
    const u = sub(b, a), v = sub(c, a);
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (ref && (nx * ref[0] + nz * ref[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx, ny, nz];
  };

  // contorno ORGÂNICO + saia de terra (funda o bastante pra não ler papel)
  const rim = [], skirt = [];
  for (let i = 0; i <= N; i++) {
    const a = (i % N) / N * TAU, c = Math.cos(a), s = Math.sin(a);
    const Rr = R0 * (0.82 + 0.18 * fbm(c * 1.6 + 3.1, s * 1.6 + 3.1));
    rim.push([c * Rr, 0, s * Rr]);
    skirt.push([c * Rr * 0.965, -2.4, s * Rr * 0.965]);
  }

  const top = Mesh(), rock = Mesh(), water = Mesh(), sand = Mesh(), belly = Mesh();

  // capa de grama (leque do centro à borda) — 1 repeat de textura a cada 4u
  const uvG = p => [p[0] / 4, p[2] / 4];
  for (let i = 0; i < N; i++)
    tri(top, [0, 0, 0], rim[i], rim[i + 1], uvG([0, 0, 0]), uvG(rim[i]), uvG(rim[i + 1]), [0, 1, 0]);

  // fita da borda — normal inclinada pro céu (luz de céu, não breu na sombra)
  for (let i = 0; i < N; i++) {
    const p0 = rim[i], p1 = rim[i + 1], p2 = skirt[i + 1], p3 = skirt[i];
    let [nx, ny, nz] = faceNorm(p0, p1, p2, [p0[0] + p2[0], 0, p0[2] + p2[2]]);
    ny += 0.55; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const u0 = i / N * 26, u1 = (i + 1) / N * 26;
    quadUV(rock, p0, p1, p2, p3, [u0, 0], [u1, 0], [u1, 1], [u0, 1], [nx, ny, nz]);
  }

  // LAGO com PRAIA: anel de areia (grama->água) + disco d'água por cima
  const lox = 10, loz = -8, lr = 6.5, sandR = lr + 1.6;
  const ringUV = (ang, rr, base) => [0.5 + 0.5 * Math.cos(ang) * rr / base, 0.5 + 0.5 * Math.sin(ang) * rr / base];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, a2 = (i + 1) / N * TAU;
    // areia: anel de lr*0.8 (por baixo da água) até sandR
    const pA = r0 => [lox + Math.cos(a) * r0, 0.06, loz + Math.sin(a) * r0];
    const pB = r0 => [lox + Math.cos(a2) * r0, 0.06, loz + Math.sin(a2) * r0];
    quadUV(sand, pA(lr * 0.8), pB(lr * 0.8), pB(sandR), pA(sandR),
      ringUV(a, lr * 0.8, sandR), ringUV(a2, lr * 0.8, sandR), ringUV(a2, sandR, sandR), ringUV(a, sandR, sandR), [0, 1, 0]);
    // água
    const p1 = [lox + Math.cos(a) * lr, 0.14, loz + Math.sin(a) * lr];
    const p2 = [lox + Math.cos(a2) * lr, 0.14, loz + Math.sin(a2) * lr];
    tri(water, [lox, 0.14, loz], p1, p2,
      [0.5, 0.5], [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)], [0.5 + 0.5 * Math.cos(a2), 0.5 + 0.5 * Math.sin(a2)],
      [0, 1, 0]);
  }

  /* ILHOTAS FLUTUANTES distantes: capa de grama + barriga CRAGGY (não cone
     liso — o raio de cada anel varia por ângulo E por altura com ruído 3D, e
     as alturas jitteram → bossas/saliências irreguladas descendo até a quilha
     lumpy). É a silhueta que vende a altura, espalhadas embaixo e ao redor. */
  function ilhota(cx, cy, cz, S, seed) {
    const M = 40, LV = 5;
    const anel = (lv) => {
      const t = lv / LV;                                   // 0 topo .. 1 quilha
      const taper = (1 - t) ** 1.4 * 0.92 + 0.06;
      const yBase = cy - S * 1.75 * (t ** 0.9);
      const pts = [];
      for (let i = 0; i <= M; i++) {
        const a = (i % M) / M * TAU, c = Math.cos(a), s = Math.sin(a);
        const bump = fbm(c * 2.4 + seed + t * 4, s * 2.4 + seed * 1.7 + t * 4) - 0.5;  // saliência
        const R = S * taper * (0.80 + 0.20 * fbm(c * 1.4 + seed, s * 1.4 + seed) + bump * 0.6);
        const yj = yBase + (fbm(c * 3 + seed + t, s * 3 + seed) - 0.5) * S * 0.20;
        pts.push([cx + c * R, yj, cz + s * R]);
      }
      return pts;
    };
    const rings = []; for (let lv = 0; lv <= LV; lv++) rings.push(anel(lv));
    const rim = rings[0];
    for (let i = 0; i < M; i++)
      tri(top, [cx, cy, cz], rim[i], rim[i + 1], uvG([cx, cy, cz]), uvG(rim[i]), uvG(rim[i + 1]), [0, 1, 0]);
    for (let lv = 0; lv < LV; lv++) {
      const A = rings[lv], B = rings[lv + 1], v0 = lv / LV * 2.4, v1 = (lv + 1) / LV * 2.4;
      for (let i = 0; i < M; i++) {
        const p0 = A[i], p1 = A[i + 1], p2 = B[i + 1], p3 = B[i];
        let [nx, ny, nz] = faceNorm(p0, p1, p2, [(p0[0] + p2[0]) / 2 - cx, 0, (p0[2] + p2[2]) / 2 - cz]);
        ny += 0.3; const nl = Math.hypot(nx, ny, nz);
        quadUV(belly, p0, p1, p2, p3, [i / M * 5, v0], [(i + 1) / M * 5, v0], [(i + 1) / M * 5, v1], [i / M * 5, v1], [nx / nl, ny / nl, nz / nl]);
      }
    }
    const last = rings[LV], keel = [cx + (fbm(seed, seed) - 0.5) * S * 0.25, cy - S * 1.98, cz + (fbm(seed + 1, seed + 1) - 0.5) * S * 0.25];
    for (let i = 0; i < M; i++) {
      const p0 = last[i], p1 = last[i + 1];
      let [nx, ny, nz] = faceNorm(p0, p1, keel, [(p0[0] + p1[0]) / 2 - cx, 0, (p0[2] + p1[2]) / 2 - cz]);
      const nl = Math.hypot(nx, ny, nz);
      tri(belly, p0, p1, keel, [i / M * 5, 2.4], [(i + 1) / M * 5, 2.4], [2.5, 3], [nx / nl, ny / nl, nz / nl]);
    }
  }
  ilhota(-46, -13, 22, 12, 1.3);
  ilhota(50, -19, -14, 10, 2.7);
  ilhota(14, -27, 52, 14, 3.9);
  ilhota(-26, -10, -58, 15, 4.6);
  ilhota(64, -31, 34, 9, 5.2);
  ilhota(-62, -17, -34, 11, 6.4);

  return {
    palco: false,       // ESTA peça é o chão
    particulas: false,  // sem pólen em paisagem
    fog: [80, 160],     // ilha inteira nítida, some no céu ao longe
    far: 200,
    camera: { e: 16, r: 46 },  // órbita padrão ALTA (a de objeto nasce dentro da ilha)
    lotes: [
      { mesh: belly, tex: BELLY },
      { mesh: rock, tex: ROCK },
      { mesh: top, tex: GRASS },
      { mesh: sand, tex: SAND },
      { mesh: water, tex: WATER },
    ],
  };
}
