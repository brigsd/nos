'use strict';
/* NÓS — árvores 3D (v2). A árvore cresce UMA vez como esqueleto 3D de
   verdade (ramificação recursiva com frames ortonormais) + copa em lobos
   3D + nuvem de FOLHAS presas à superfície de cada lobo. A mesma árvore é
   rasterizada de 8 azimutes ("rotações Doom"): circular a árvore mostra
   lados diferentes — galhos passam uns atrás dos outros (z-buffer) e o
   lado do SOL fica parado no mundo (convenção do rock3d: SUN_AZ -2.2,
   SUN_EL 0.5), que é o que lê como sólido.

   Linguagem de arte preservada do gerador 2D aprovado (tree-core):
   Resurrect 64, cel-shading em 4 bandas, contorno de tinta, casca com
   estrias serpenteantes, aterramento (sombra de contato + franja de
   grama). O detalhe de folha NÃO é chuvisco: são pinceladas de 2-4px
   PRESAS em 3D ao lobo — giram junto quando você circula.

   Determinístico por seed. Núcleo puro (sem DOM): o jogo carrega via
   <script src>, o QA/teste via require(). */

const T3_PALETTE = ["#2e222f","#3e3546","#625565","#966c6c","#ab947a","#694f62","#7f708a","#9babb2","#c7dcd0","#ffffff","#6e2727","#b33831","#ea4f36","#f57d4a","#ae2334","#e83b3b","#fb6b1d","#f79617","#f9c22b","#7a3045","#9e4539","#cd683d","#e6904e","#fbb954","#4c3e24","#676633","#a2a947","#d5e04b","#fbff86","#165a4c","#239063","#1ebc73","#91db69","#cddf6c","#313638","#374e4a","#547e64","#92a984","#b2ba90","#0b5e65","#0b8a8f","#0eaf9b","#30e1b9","#8ff8e2","#323353","#484a77","#4d65b4","#4d9be6","#8fd3ff","#45293f","#6b3e75","#905ea9","#a884f3","#eaaded","#753c54","#a24b6f","#cf657f","#ed8099","#831c5d","#c32454","#f04f78","#f68181","#fca790","#fdcbb0"];

const T3_LEAF_RAMPS = {
  dia:    [29, 30, 31, 32, 27],   // sombra teal fria -> topo amarelo-verde (ref. BotW)
  cereja: [54, 55, 56, 57, 53],   // cerejeira: vinho -> rosa -> lavanda
};
const T3_SPECK = 28; // glint de folha ao sol (#fbff86)
const T3_BARK_RAMPS = {
  quente: [1, 19, 20, 21, 22],
  dia:    [1, 24, 3, 4, 63],
  betula: [1, 6, 7, 8, 9],
};
const T3_OUTLINE = 0;

/* sol FIXO NO MUNDO — mesmos valores do rock3d do protótipo */
const T3_SUN_AZ = -2.2, T3_SUN_EL = 0.5;
const T3_SUN = [Math.cos(T3_SUN_AZ) * Math.cos(T3_SUN_EL), Math.sin(T3_SUN_AZ) * Math.cos(T3_SUN_EL), Math.sin(T3_SUN_EL)];

/* espécies: mesmos nomes/intenções do gerador 2D, parâmetros reajustados
   pro crescimento em 3D (spread agora abre em cone de azimute) */
const T3_SPECIES = {
  carvalho: { len: 30, lenDecay: 0.78, width: 8,  widthDecay: 0.68, spread: 0.62, jitter: 0.34, upBias: 0.10, droop: 0.00, depth: 6, apicalLen: 0.80, latLen: 0.72, lateralN: 3, leafFrom: 3, leafR: [11, 16], gnarl: 0,    bark: 'dia' },
  copado:   { len: 28, lenDecay: 0.78, width: 8,  widthDecay: 0.68, spread: 0.80, jitter: 0.34, upBias: 0.07, droop: 0.00, depth: 6, apicalLen: 0.78, latLen: 0.75, lateralN: 3, leafFrom: 3, leafR: [13, 18], gnarl: 0,    bark: 'dia' },
  anciao:   { len: 26, lenDecay: 0.80, width: 12, widthDecay: 0.72, spread: 0.78, jitter: 0.52, upBias: 0.03, droop: 0.04, depth: 6, apicalLen: 0.78, latLen: 0.75, lateralN: 3, leafFrom: 2, leafR: [10, 15], gnarl: 0.55, bark: 'dia' },
  jovem:    { len: 21, lenDecay: 0.77, width: 5,  widthDecay: 0.70, spread: 0.58, jitter: 0.42, upBias: 0.12, droop: 0.00, depth: 5, apicalLen: 0.80, latLen: 0.72, lateralN: 2, leafFrom: 2, leafR: [8, 12],  gnarl: 0,    bark: 'dia' },
  florida:  { len: 27, lenDecay: 0.78, width: 7,  widthDecay: 0.69, spread: 0.66, jitter: 0.38, upBias: 0.09, droop: 0.00, depth: 6, apicalLen: 0.79, latLen: 0.73, lateralN: 3, leafFrom: 3, leafR: [11, 15], gnarl: 0.1,  bark: 'dia', blossoms: true },
  betula:   { len: 26, lenDecay: 0.78, width: 5,  widthDecay: 0.72, spread: 0.55, jitter: 0.34, upBias: 0.14, droop: 0.00, depth: 6, apicalLen: 0.82, latLen: 0.70, lateralN: 3, leafFrom: 3, leafR: [10, 13], gnarl: 0,    bark: 'betula', barkMarks: true, ambFloor: 2 },
  cerejeira:{ len: 26, lenDecay: 0.78, width: 7,  widthDecay: 0.70, spread: 0.70, jitter: 0.40, upBias: 0.06, droop: 0.02, depth: 6, apicalLen: 0.78, latLen: 0.74, lateralN: 3, leafFrom: 3, leafR: [11, 15], gnarl: 0.2,  bark: 'dia', ramp: 'cereja' },
  seca:     { len: 28, lenDecay: 0.79, width: 9,  widthDecay: 0.74, spread: 0.82, jitter: 0.5,  upBias: 0.02, droop: 0.03, depth: 5, apicalLen: 0.80, latLen: 0.76, lateralN: 3, leafFrom: 2, leafR: [5, 7],   gnarl: 0.7,  bark: 'quente', noLeaves: true },
};

function t3Mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function t3Hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const T3_BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const t3Clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const t3Norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const t3Dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const t3Cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * growTree3D({species, seed, sizeMul}) ->
 *   { segs: [{a:[x,y,z], b:[x,y,z], w, trunk}], lobes: [{c, r, strokes}], S }
 * Coordenadas: z pra CIMA, x/y horizontais, base do tronco na origem.
 * Unidade = pixel do sprite (multiplicado por sizeMul).
 */
function growTree3D(opts) {
  const S0 = T3_SPECIES[opts.species] || T3_SPECIES.carvalho;
  const mul = opts.sizeMul || 1;
  const S = { ...S0, len: S0.len * mul, width: Math.max(2, S0.width * mul), leafR: [S0.leafR[0] * mul, S0.leafR[1] * mul] };
  const rnd = t3Mulberry((opts.seed | 0) || 1);
  const segs = [];
  const tips = [];

  function grow(base, dir, len, wid, depth) {
    const tip = [base[0] + dir[0] * len, base[1] + dir[1] * len, base[2] + dir[2] * len];
    segs.push({ a: base, b: tip, w: Math.max(1, wid), trunk: segs.length === 0 });
    const r = S.leafR[0] + rnd() * (S.leafR[1] - S.leafR[0]);
    if (depth <= 0 || len < 2.2 * mul) { tips.push({ c: tip, r }); return; }
    if (depth <= S.leafFrom) tips.push({ c: tip, r: r * 0.7 });

    /* frame ortonormal em volta de dir */
    const up = Math.abs(dir[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const s1 = t3Norm(t3Cross(dir, up));
    const s2 = t3Cross(dir, s1);

    /* apical: segue quase reto, com puxão pro céu */
    let ad = t3Norm([
      dir[0] + (rnd() - 0.5) * S.jitter * (s1[0] + s2[0]),
      dir[1] + (rnd() - 0.5) * S.jitter * (s1[1] + s2[1]),
      dir[2] + (rnd() - 0.5) * S.jitter * (s1[2] + s2[2]) + S.upBias * 2,
    ]);
    grow(tip, ad, len * S.lenDecay * S.apicalLen, wid * S.widthDecay, depth - 1);

    /* laterais: leque em AZIMUTE (o que faz a copa ser 3D de verdade),
       espiral de filotaxia + jitter pra não dar simetria de hélice */
    const goldenA = 2.39996; // ângulo áureo
    const az0 = rnd() * Math.PI * 2;
    for (let i = 0; i < S.lateralN; i++) {
      const az = az0 + i * goldenA + (rnd() - 0.5) * 1.2;
      let tilt = S.spread + (rnd() - 0.5) * S.jitter * 1.5;
      if (S.gnarl) tilt += (rnd() - 0.5) * S.gnarl;
      const ca = Math.cos(az), sa = Math.sin(az), ct = Math.cos(tilt), st = Math.sin(tilt);
      let nd = [
        dir[0] * ct + (s1[0] * ca + s2[0] * sa) * st,
        dir[1] * ct + (s1[1] * ca + s2[1] * sa) * st,
        dir[2] * ct + (s1[2] * ca + s2[2] * sa) * st + S.upBias - S.droop * 2,
      ];
      grow(tip, t3Norm(nd), len * S.lenDecay * S.latLen, wid * S.widthDecay * 0.82, depth - 1);
    }
  }
  /* tronco nasce quase vertical */
  grow([0, 0, 0], t3Norm([(rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1, 1]), S.len, S.width, S.depth);

  /* LOBOS: aglomeração gulosa dos tips em 3D (5-9 bolotas legíveis) */
  const cand = tips.slice().sort((a, b) => b.r - a.r);
  const lobes = [];
  for (const c of cand) {
    if (lobes.length >= 9) break;
    let ok = true;
    for (const k of lobes) {
      const d = Math.hypot(c.c[0] - k.c[0], c.c[1] - k.c[1], c.c[2] - k.c[2]);
      if (d < (c.r + k.r) * 0.5) { ok = false; break; }
    }
    if (ok) lobes.push({ c: c.c.slice(), r: c.r * 1.3 });
  }
  if (!lobes.length && cand.length) lobes.push({ c: cand[0].c.slice(), r: cand[0].r * 1.3 });

  /* nuvem de FOLHAS: pinceladas presas à superfície do lobo, em 3D — ficam
     no lugar quando a câmera gira (a "textura de folhinha" que não nada) */
  let li = 0;
  for (const lb of lobes) {
    const n = t3Clamp((lb.r * lb.r * 0.5) | 0, 34, 120);
    const strokes = [];
    for (let i = 0; i < n; i++) {
      const u = rnd(), v = rnd();
      const z = 1 - 2 * u, ph = v * Math.PI * 2, hz = Math.sqrt(Math.max(0, 1 - z * z));
      strokes.push({
        d: [hz * Math.cos(ph), hz * Math.sin(ph), z],  // normal/posição no lobo
        j: rnd(),                                       // jitter de tom
        g: rnd() < 0.16,                                // candidata a glint
        s: rnd() < 0.5 ? 1 : -1,                        // rumo da pincelada
      });
    }
    lb.strokes = strokes;
    lb.id = li++;
  }
  return { segs, lobes, S, mul };
}

/**
 * renderTreeView3D(tree, viewAz, {W, H}) -> { buf: Int16Array, W, H }
 * Ortográfica olhando ao longo de d=(cos az, sin az); x de tela cresce no
 * rumo (-sin az, cos az) — o MESMO right do raycaster do jogo, então o
 * azimute câmera->árvore indexa a vista direto.
 */
function renderTreeView3D(tree, viewAz, opts) {
  const W = opts.W, H = opts.H;
  const { segs, lobes, S, mul } = tree;
  const leafRamp = S.ramp ? T3_LEAF_RAMPS[S.ramp] : T3_LEAF_RAMPS.dia;
  const barkRamp = T3_BARK_RAMPS[S.bark] || T3_BARK_RAMPS.dia;
  const last = leafRamp.length - 1;
  const buf = new Int16Array(W * H).fill(-1);
  const zb = new Float32Array(W * H).fill(1e9);
  const dx = Math.cos(viewAz), dy = Math.sin(viewAz);
  const rx = -dy, ry = dx;
  const cx0 = W / 2, baseY = H - 4;
  const proj = (p) => [cx0 + p[0] * rx + p[1] * ry, baseY - p[2], p[0] * dx + p[1] * dy];
  /* normal de vista (nx à direita, ny pra baixo na tela, nz pra câmera) -> mundo */
  const wLam = (nx, ny, nz) => {
    const wx = rx * nx - dx * nz, wy = ry * nx - dy * nz, wz = -ny;
    return wx * T3_SUN[0] + wy * T3_SUN[1] + wz * T3_SUN[2];
  };
  const put = (x, y, d, idx) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (d >= zb[i]) return;
    zb[i] = d; buf[i] = idx;
  };

  /* ---- galhos: cápsulas com casca serpenteada, sombreadas pelo sol do mundo ---- */
  let segIx = 0;
  for (const s of segs) {
    const isTrunk = s.trunk;
    segIx++;
    /* poda de raster: graveto fino embaixo da copa nunca aparece — pular
       corta ~75% das cápsulas (o custo real do load) sem mudar 1 pixel */
    if (!S.noLeaves && s.w < 2.3 * mul) continue;
    const [x1, y1, d1] = proj(s.a);
    const [x2, y2, d2] = proj(s.b);
    const ddx = x2 - x1, ddy = y2 - y1;
    const dist = Math.hypot(ddx, ddy);
    const steps = Math.ceil(Math.max(dist, Math.abs(d2 - d1))) + 1;
    const pxn = dist > 0.01 ? -ddy / dist : 1, pyn = dist > 0.01 ? ddx / dist : 0;
    const hasKnot = s.w > 4.5 && t3Hash2((s.a[0] * 7) | 0, (s.a[2] * 11) | 0) < 0.3;
    const knotT = 0.25 + t3Hash2((s.b[0] * 5) | 0, (s.b[2] * 3) | 0) * 0.5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x1 + ddx * t, cy = y1 + ddy * t, cd = d1 + (d2 - d1) * t;
      let halfW = s.w / 2;
      if (isTrunk && t < 0.14) halfW *= 1 + (1 - t / 0.14) * 0.65; // raiz alarga
      const along = isTrunk ? i : i + 37 * segIx;
      for (let o = -halfW; o <= halfW; o += 0.5) {
        const sfrac = o / halfW;
        const nz = Math.sqrt(Math.max(0, 1 - sfrac * sfrac));
        /* luz do sol + ambiente de céu: o contraluz fica cinza-médio, não
           breu (senão o tronco vira poste queimado em metade das vistas) */
        const lam = wLam(pxn * sfrac, pyn * sfrac, nz) * 0.62 + 0.3;
        let b5 = t3Clamp(Math.round(2.1 + lam * 2.1), S.ambFloor ?? 1, 4);
        const wob = (t3Hash2(Math.round(along * 0.11) * 131, Math.round(o * 2) * 7) - 0.5) * 2.2;
        const ridge = t3Hash2(Math.round(o * 3 + wob) + 31, segIx);
        if (ridge < 0.24) b5 = t3Clamp(b5 - 1, 0, 4);
        else if (ridge > 0.9) b5 = t3Clamp(b5 + 1, 0, 4);
        if (t3Hash2(Math.round(along / 5), Math.round(o * 0.7) + 9) < 0.09 && (along % 5) < 1.2) b5 = Math.max(0, b5 - 2);
        put(cx + pxn * o, cy + pyn * o, cd - nz * halfW * 0.5, barkRamp[b5]);
      }
      if (hasKnot && Math.abs(t - knotT) < 0.5 / steps) {
        for (let oy = -2; oy <= 2; oy++) for (let ox = -1.5; ox <= 1.5; ox += 0.5) {
          const rr = (ox * ox) / 2.25 + (oy * oy) / 4;
          if (rr > 1) continue;
          put(cx + pxn * halfW * 0.3 + ox, cy + pyn * halfW * 0.3 + oy, cd - 1, rr > 0.45 ? barkRamp[0] : barkRamp[3]);
        }
      }
    }
  }

  if (!S.noLeaves) {
    /* ---- copa: lobos 3D cel-shaded + vinco + folhas presas ---- */
    let zMid = 0;
    for (const lb of lobes) zMid += lb.c[2];
    zMid /= lobes.length || 1;
    let zSpan = 1;
    for (const lb of lobes) zSpan = Math.max(zSpan, Math.abs(lb.c[2] - zMid));

    for (const lb of lobes) {
      const [lcx, lcy, lcd] = proj(lb.c);
      const R = lb.r * 1.12, Ry = R * 0.85;
      const lift = t3Clamp((lb.c[2] - zMid) / (zSpan * 0.9), -1, 1) * 0.30; // lobo do topo mais claro
      const bumps = 5 + ((t3Hash2(lb.id * 13, 7) * 4) | 0);
      const bPhase = t3Hash2(lb.id * 29, 3) * Math.PI * 2;
      /* recorte de nuvem via LUT por ângulo (atan2 por pixel custava o load) */
      const SCN = 64;
      const scLut = new Float32Array(SCN);
      for (let i = 0; i < SCN; i++) {
        const th = (i / SCN) * Math.PI * 2 - Math.PI;
        scLut[i] = 1 + 0.11 * Math.sin(th * bumps + bPhase) + 0.05 * Math.sin(th * (bumps * 2 + 1) - bPhase);
      }
      const scAt = (ox, oy) => scLut[(((Math.atan2(oy / Ry, ox / R) + Math.PI) / (Math.PI * 2)) * SCN) & (SCN - 1)];
      for (let oy = -Ry - 3; oy <= Ry + 3; oy++) {
        for (let ox = -R - 3; ox <= R + 3; ox++) {
          const sc = scAt(ox, oy);
          const e = ((ox * ox) / (R * R) + (oy * oy) / (Ry * Ry)) / (sc * sc);
          if (e > 1.16) continue;
          if (e > 1) {
            /* anel de tinta do lobo: o vinco entre bolotas do 2D — some
               exatamente onde outro lobo está NA FRENTE (z-buffer decide) */
            put(lcx + ox, lcy + oy, lcd + 0.4, T3_OUTLINE);
            continue;
          }
          const nx = t3Clamp(ox / R, -1, 1), ny = t3Clamp(oy / Ry, -1, 1);
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          /* sol + ambiente do céu: contraluz segura a banda média (a copa
             nunca vira massa preta — linguagem do jogo é legível sempre) */
          let lam = wLam(nx, ny, nz) * 0.66 + 0.24 + lift;
          lam += (t3Hash2((lcx + ox) | 0, (lcy + oy) | 0) - 0.5) * 0.18; // grão
          let idx;
          if (lam > 0.40) idx = last;
          else if (lam > 0.0) idx = last - 1;
          else if (lam > -0.52) idx = Math.max(1, last - 2);
          else idx = Math.max(0, last - 3);
          if (e > 0.62 && ny > 0.35) idx = Math.max(0, idx - 1); // vinco por baixo
          put(lcx + ox, lcy + oy, lcd - nz * R * 0.9, leafRamp[idx]);
        }
      }
      /* folhas: pinceladas 3D na casca do lobo (frente + silhueta) */
      for (const st of lb.strokes) {
        const sd = st.d;
        const nzc = -(sd[0] * dx + sd[1] * dy);          // componente pra câmera
        if (nzc < -0.15) continue;                        // atrás do lobo
        const sxp = sd[0] * rx + sd[1] * ry;              // tela x
        const syp = -sd[2];                               // tela y
        const edge = nzc < 0.3;                           // zona de silhueta
        const rr = edge ? 1.04 : 1.0;                     // tips furam o contorno
        const px0 = lcx + sxp * R * rr, py0 = lcy + syp * Ry * rr;
        let lam = t3Dot(sd, T3_SUN) * 0.66 + 0.24 + lift + (st.j - 0.5) * 0.3;
        let idx;
        if (st.g && lam > 0.5) idx = S.ramp === 'cereja' ? 53 : T3_SPECK; // glint: lavanda na cereja, sol no verde
        else if (lam > 0.40) idx = leafRamp[last];
        else if (lam > 0.0) idx = leafRamp[last - 1];
        else if (lam > -0.52) idx = leafRamp[Math.max(1, last - 2)];
        else idx = leafRamp[Math.max(0, last - 3)];
        const depth = lcd - Math.max(0, nzc) * R - 0.5;
        /* pincelada: 2-4 px em arco caído (folha, não pixel avulso) */
        put(px0, py0, depth, idx);
        put(px0 + st.s, py0, depth, idx);
        if (st.j > 0.35) put(px0 + st.s, py0 + 1, depth, idx);
        if (st.j > 0.8 && !edge) put(px0 + st.s * 2, py0 + 1, depth, idx);
      }
    }
    /* flores brancas (florida): buquês nas zonas de luz */
    if (S.blossoms) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = buf[y * W + x];
        if ((v === leafRamp[last] || v === leafRamp[last - 1]) && t3Hash2(x * 7 + 3, y * 11 + 5) < 0.05) {
          const d = zb[y * W + x] - 0.25;
          put(x, y, d, 9); put(x + 1, y, d, 8); put(x, y + 1, d, 8);
          if (t3Hash2(x, y) < 0.4) put(x + 1, y + 1, d, 53);
        }
      }
    }
  }

  /* marcas de bétula na casca branca */
  if (S.barkMarks) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = buf[y * W + x];
      if (v >= 6 && v <= 9 && t3Hash2(x >> 1, y) < 0.05) { buf[y * W + x] = 1; if (x + 1 < W && buf[y * W + x + 1] >= 6) buf[y * W + x + 1] = 1; }
    }
  }

  /* contorno de tinta */
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = buf[y * W + x];
    if (v < 0 || v === T3_OUTLINE) continue;
    if ((x > 0 && buf[y * W + x - 1] < 0) || (x < W - 1 && buf[y * W + x + 1] < 0) ||
        (y > 0 && buf[(y - 1) * W + x] < 0) || (y < H - 1 && buf[(y + 1) * W + x] < 0)) buf[y * W + x] = T3_OUTLINE;
  }

  /* ---- ATERRAMENTO: sombra de contato + franja de grama (igual ao 2D) ---- */
  {
    let minX = W, maxX = -1;
    for (let y = H - 10; y < H; y++) for (let x = 0; x < W; x++) {
      if (buf[y * W + x] >= 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    if (maxX >= minX) {
      const cxg = (minX + maxX) / 2, span = Math.max(3, (maxX - minX) / 2);
      const shR = span * 1.25 + 2, shRy = Math.max(2, span * 0.38);
      const gy = H - 3.5;
      for (let y = (gy - shRy) | 0; y <= Math.min(H - 1, (gy + shRy) | 0); y++) {
        for (let x = Math.max(0, (cxg - shR) | 0); x <= Math.min(W - 1, (cxg + shR) | 0); x++) {
          const ex = (x - cxg) / shR, ey = (y - gy) / shRy;
          const e = ex * ex + ey * ey;
          if (e > 1 || buf[y * W + x] >= 0) continue;
          if (e < 0.5) buf[y * W + x] = 35;
          else if ((T3_BAYER[y & 3][x & 3] / 16) < (1 - e) * 1.6) buf[y * W + x] = 30;
        }
      }
      const blades = Math.max(5, (span * 1.9) | 0);
      for (let i = 0; i < blades; i++) {
        const hsh = t3Hash2(i * 37 + ((tree.seedTag | 0) & 1023), 91);
        const bx = cxg + (hsh - 0.5) * (span * 1.7 + 6);
        const bh = 2 + t3Hash2(i * 53, 17) * (2.5 + span * 0.22);
        const lean = (t3Hash2(i * 71, 5) - 0.5) * 2.4;
        const tone = T3_LEAF_RAMPS.dia[t3Hash2(i * 13, 3) < 0.55 ? 1 : t3Hash2(i, 9) < 0.5 ? 2 : 3];
        for (let k = 0; k <= bh; k++) {
          const t = k / bh;
          const gx = bx + lean * t * t, gyy = H - 3 - k;
          if (gx >= 0 && gx < W && gyy >= 0) {
            buf[(gyy | 0) * W + (gx | 0)] = tone;
            if (t < 0.4 && gx + 1 < W) buf[(gyy | 0) * W + ((gx + 1) | 0)] = tone;
          }
        }
      }
    }
  }
  return { buf, W, H };
}

/** 8 vistas prontas: growTree3D + render em N azimutes (0 = leste, anti-horário do mundo) */
function growTreeViews3D(opts) {
  const tree = growTree3D(opts);
  tree.seedTag = opts.seed | 0;
  const n = opts.views || 8;
  const out = [];
  for (let i = 0; i < n; i++) out.push(renderTreeView3D(tree, (i / n) * Math.PI * 2, { W: opts.W || 104, H: opts.H || 136 }));
  return out;
}

if (typeof module !== 'undefined') module.exports = { growTree3D, renderTreeView3D, growTreeViews3D, T3_SPECIES, T3_PALETTE };
