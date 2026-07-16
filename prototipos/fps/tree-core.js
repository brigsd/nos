'use strict';
/* NÓS — gerador de árvores (L-system / ramificação recursiva + copa por campo
   de densidade). Determinístico por seed. Saída: buffer de índices da paleta
   Resurrect 64 (mesma do jogo), -1 = transparente. Núcleo puro, sem DOM —
   serve tanto ao estúdio (artifact) quanto, depois, ao asset do jogo. */

const PALETTE = ["#2e222f","#3e3546","#625565","#966c6c","#ab947a","#694f62","#7f708a","#9babb2","#c7dcd0","#ffffff","#6e2727","#b33831","#ea4f36","#f57d4a","#ae2334","#e83b3b","#fb6b1d","#f79617","#f9c22b","#7a3045","#9e4539","#cd683d","#e6904e","#fbb954","#4c3e24","#676633","#a2a947","#d5e04b","#fbff86","#165a4c","#239063","#1ebc73","#91db69","#cddf6c","#313638","#374e4a","#547e64","#92a984","#b2ba90","#0b5e65","#0b8a8f","#0eaf9b","#30e1b9","#8ff8e2","#323353","#484a77","#4d65b4","#4d9be6","#8fd3ff","#45293f","#6b3e75","#905ea9","#a884f3","#eaaded","#753c54","#a24b6f","#cf657f","#ed8099","#831c5d","#c32454","#f04f78","#f68181","#fca790","#fdcbb0"];

/* ramps: shadow2 -> shadow1 -> mid -> light -> hi (índices da paleta) */
const LEAF_RAMPS = {
  verao:     [29, 30, 31, 32, 33],   // #165a4c..#cddf6c — verde vivo
  outono:    [19, 20, 21, 23, 18],   // vinho..ouro
  primavera: [35, 36, 37, 38, 8],    // teal escuro..menta pálida
  mistica:   [44, 50, 51, 52, 53],   // índigo..lavanda (tema mítico-tecnológico)
  dia:       [29, 30, 31, 32, 27],   // BotW: sombra teal fria -> topo amarelo-verde ao sol
};
const LEAF_SPECK = { verao: 28, outono: 28, primavera: 33, mistica: 43, dia: 28 };  // brilho de folha ao sol / glint ciano
const BARK_RAMPS = {
  quente: [1, 19, 20, 21, 22],   // casca quente (carvalho/ancião)
  fria:   [1, 49, 54, 5, 6],     // casca fria/lilás (mística)
  conif:  [1, 24, 25, 5, 4],     // casca oliva (pinheiro)
  dia:    [1, 24, 3, 4, 63],     // marrom-acinzentado ao sol (ref. BotW)
};

const SPECIES = {
  carvalho:  { len: 22, lenDecay: 0.79, width: 8,  widthDecay: 0.70, spread: 0.54, jitter: 0.34, upBias: 0.06, droop: 0.02, depth: 8, apicalLen: 0.82, latLen: 0.72, lateralN: 2, leafFrom: 3, leafR: [7, 12], gnarl: 0,    bark: 'quente' },
  anciao:    { len: 19, lenDecay: 0.81, width: 12, widthDecay: 0.75, spread: 0.72, jitter: 0.52, upBias: 0.02, droop: 0.05, depth: 7, apicalLen: 0.80, latLen: 0.74, lateralN: 2, leafFrom: 2, leafR: [6, 11], gnarl: 0.55, bark: 'quente' },
  salgueiro: { len: 21, lenDecay: 0.82, width: 6,  widthDecay: 0.73, spread: 0.34, jitter: 0.30, upBias: -0.10, droop: 0.20, depth: 9, apicalLen: 0.84, latLen: 0.74, lateralN: 2, leafFrom: 4, leafR: [4, 7],  gnarl: 0.1,  bark: 'quente' },
  pinheiro:  { len: 15, lenDecay: 0.87, width: 7,  widthDecay: 0.81, spread: 0.95, jitter: 0.20, upBias: 0.0,  droop: 0.30, depth: 9, apicalLen: 0.92, latLen: 0.52, lateralN: 2, leafFrom: 1, leafR: [3, 6],  gnarl: 0,    bark: 'conif' },
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* ruído estável por pixel (quebra banding sem parecer chuvisco) */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * growTree(opts) -> { buf: Int16Array(W*H) de índices da paleta (-1 transp), W, H }
 * opts: { species, mood, seed, W, H, showSkeleton }
 */
function growTree(opts) {
  const S0 = SPECIES[opts.species] || SPECIES.carvalho;
  const mul = opts.sizeMul || 1;
  const S = { ...S0, len: S0.len * mul, width: Math.max(2, S0.width * mul), leafR: [S0.leafR[0] * mul, S0.leafR[1] * mul] };
  const W = opts.W || 104;
  const H = opts.H || 136;
  const rnd = mulberry32((opts.seed | 0) || 1);
  const leafRamp = LEAF_RAMPS[opts.mood] || LEAF_RAMPS.verao;
  const barkRamp = opts.mood === 'mistica' ? BARK_RAMPS.fria : opts.mood === 'dia' ? BARK_RAMPS.dia : BARK_RAMPS[S.bark];
  const speck = LEAF_SPECK[opts.mood] ?? 28;
  const glow = opts.mood === 'mistica';

  const segs = [];
  const leaves = [];
  const baseX = W / 2 + (rnd() - 0.5) * 4;
  const baseY = H - 4;
  const UP = -Math.PI / 2;

  function grow(x, y, ang, len, wid, depth) {
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    segs.push({ x1: x, y1: y, x2, y2, w: Math.max(1, wid) });
    const r = S.leafR[0] + rnd() * (S.leafR[1] - S.leafR[0]);
    if (depth <= 0 || len < 2.2) { leaves.push({ x: x2, y: y2, r }); return; }
    if (depth <= S.leafFrom) leaves.push({ x: x2, y: y2, r: r * 0.7 });

    // filho apical: segue quase reto (dominância apical), mais longo
    let aa = ang + (rnd() - 0.5) * S.jitter;
    aa += (UP - aa) * S.upBias;
    grow(x2, y2, aa, len * S.lenDecay * S.apicalLen, wid * S.widthDecay, depth - 1);

    // filhos laterais: abrem em leque, mais curtos
    for (let i = 0; i < S.lateralN; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      let la = ang + side * S.spread + (rnd() - 0.5) * S.jitter * 1.5;
      la += (UP - la) * S.upBias * 0.5;
      la += S.droop; // gravidade / choro
      if (S.gnarl) la += (rnd() - 0.5) * S.gnarl;
      grow(x2, y2, la, len * S.lenDecay * S.latLen, wid * S.widthDecay * 0.82, depth - 1);
    }
  }
  grow(baseX, baseY, UP + (rnd() - 0.5) * 0.1, S.len, S.width, S.depth);

  const buf = new Int16Array(W * H).fill(-1);
  const put = (x, y, idx) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    buf[y * W + x] = idx;
  };

  /* ---- casca (segmentos com aresta iluminada) ---- */
  const Lx = -0.55, Ly = -0.83; // luz do alto-esquerda
  for (const s of segs) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;      // direção do segmento
    let pxn = -uy, pyn = ux;                    // perpendicular
    const litSign = pxn * Lx + pyn * Ly >= 0 ? 1 : -1; // qual borda pega luz
    const steps = Math.ceil(dist) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = s.x1 + dx * t, cy = s.y1 + dy * t;
      const halfW = s.w / 2;
      for (let o = -halfW; o <= halfW; o += 0.5) {
        const frac = (o / halfW) * litSign; // -1 borda iluminada .. +1 sombra
        let idx;
        if (frac < -0.35) idx = barkRamp[3];
        else if (frac > 0.45) idx = barkRamp[0];
        else if (frac > 0.1) idx = barkRamp[1];
        else idx = barkRamp[2];
        put(cx + pxn * o, cy + pyn * o, idx);
      }
    }
  }

  if (opts.showSkeleton) {
    for (const lf of leaves) put(lf.x, lf.y, LEAF_SPECK[opts.mood] ?? 28);
    return { buf, W, H };
  }

  /* ---- copa: campo de densidade -> massa coesa iluminada ---- */
  const dens = new Float32Array(W * H);
  let cx = 0, cy = 0, minY = H, maxY = 0;
  for (const lf of leaves) {
    cx += lf.x; cy += lf.y;
    if (lf.y < minY) minY = lf.y;
    if (lf.y > maxY) maxY = lf.y;
    const sig = lf.r / 1.7;
    const inv = 1 / (2 * sig * sig);
    const r = Math.ceil(lf.r);
    for (let oy = -r; oy <= r; oy++) {
      const yy = (lf.y + oy) | 0;
      if (yy < 0 || yy >= H) continue;
      for (let ox = -r; ox <= r; ox++) {
        const xx = (lf.x + ox) | 0;
        if (xx < 0 || xx >= W) continue;
        const d2 = ox * ox + oy * oy;
        if (d2 > r * r) continue;
        dens[yy * W + xx] += Math.exp(-d2 * inv);
      }
    }
  }
  cx /= leaves.length || 1; cy /= leaves.length || 1;
  const canopyH = Math.max(8, maxY - minY);

  // alguns "buracos" pra luz atravessar (profundidade)
  const holes = 3 + (rnd() * 3 | 0);
  for (let k = 0; k < holes; k++) {
    const lf = leaves[(rnd() * leaves.length) | 0];
    if (!lf) continue;
    const hr = lf.r * (0.7 + rnd() * 0.5);
    const sig = hr / 1.6, inv = 1 / (2 * sig * sig), r = Math.ceil(hr);
    const hx = lf.x + (rnd() - 0.5) * lf.r, hy = lf.y + (rnd() - 0.5) * lf.r;
    for (let oy = -r; oy <= r; oy++) {
      const yy = (hy + oy) | 0; if (yy < 0 || yy >= H) continue;
      for (let ox = -r; ox <= r; ox++) {
        const xx = (hx + ox) | 0; if (xx < 0 || xx >= W) continue;
        dens[yy * W + xx] -= 0.75 * Math.exp(-(ox * ox + oy * oy) * inv);
      }
    }
  }

  const THR = 0.42;
  const isLeaf = (x, y) => x >= 0 && y >= 0 && x < W && y < H && dens[y * W + x] > THR;
  const last = leafRamp.length - 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (dens[y * W + x] <= THR) continue;
      const gx = (dens[y * W + Math.min(W - 1, x + 1)] - dens[y * W + Math.max(0, x - 1)]);
      const gy = (dens[Math.min(H - 1, y + 1) * W + x] - dens[Math.max(0, y - 1) * W + x]);
      const gm = Math.hypot(gx, gy) || 1e-4;
      const ox = -gx / gm, oy = -gy / gm;   // normal apontando pra fora
      const lam = ox * Lx + oy * Ly;         // -1 (sombra) .. 1 (luz)
      const lift = (cy - y) / (canopyH * 0.6); // topo mais claro
      const sunBoost = opts.mood === 'dia' ? 1.25 : 1;
      let t = 0.46 + 0.42 * sunBoost * lam + 0.13 * lift + (hash2(x, y) - 0.5) * 0.10;
      t += (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.22; // dither ordenado
      let idx = clamp(Math.round(t * last), 0, last);

      // rim: borda da silhueta
      const boundary = !isLeaf(x - 1, y) || !isLeaf(x + 1, y) || !isLeaf(x, y - 1) || !isLeaf(x, y + 1);
      if (boundary) {
        if (lam < -0.05) buf[y * W + x] = leafRamp[0];         // contorno escuro contra o void
        else if (lam > 0.45) buf[y * W + x] = leafRamp[last];  // aresta brilhando
        else buf[y * W + x] = leafRamp[idx];
        continue;
      }
      // brilho pontual (folha pegando sol)
      if (lam > 0.32 && hash2(x + 7, y + 13) < 0.045) idx = last;
      buf[y * W + x] = leafRamp[Math.max(idx, 0)];
      // glint místico (índice de brilho) esparso
      if (glow && lam > 0.4 && hash2(x + 31, y + 17) < 0.03) buf[y * W + x] = speck;
    }
  }
  return { buf, W, H, glow };
}


/* ================= CENA DIURNA (ref. BotW -> Resurrect 64) ================= */

/* fBm 2D barato sobre hash2 (value noise) */
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, oct) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2; }
  return v;
}

/* céu: gradiente azul + cúmulos com base achatada + montanha na bruma + linha de mata */
function genSky(opts) {
  const W = opts.W || 480, H = opts.H || 120;
  const seed = (opts.seed | 0) || 1;
  const rnd = mulberry32(seed);
  const off = rnd() * 512;
  const buf = new Int16Array(W * H);
  // rampa vertical: skyBlue 47 -> paleBlue 48 -> paleMint 8 -> branco no horizonte
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const dth = (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.10;
      const tt = t + dth;
      buf[y * W + x] = tt < 0.42 ? 47 : tt < 0.74 ? 48 : tt < 0.92 ? 8 : 9;
    }
  }
  // cúmulos: fBm + recorte, achatando a base (multiplica por rampa vertical local)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 46 + off, y / 26 + off * 2, 4);
      const band = Math.sin((y / H) * Math.PI); // nuvens vivem no meio do céu
      const v = n * (0.55 + 0.45 * band);
      if (v > 0.56) {
        const topLight = fbm(x / 46 + off, (y - 3) / 26 + off * 2, 4) < v;
        buf[y * W + x] = v > 0.66 ? 9 : topLight ? 9 : y / H > 0.55 ? 7 : 48;
      }
    }
  }
  if (opts.mountain !== false) {
    // maciço distante na bruma: 2 cristas assimétricas, sólido, base hazed
    // crista de trás: fantasma na bruma
    const back = { mx: W * (0.40 + rnd() * 0.06), mw: W * (0.16 + rnd() * 0.05), peak: H * (0.62 + rnd() * 0.06), skew: 0.7 + rnd() * 0.4 };
    // maciço da frente: modesto, sólido
    const front = { mx: W * (0.56 + rnd() * 0.08), mw: W * (0.20 + rnd() * 0.05), peak: H * (0.50 + rnd() * 0.08), skew: 0.6 + rnd() * 0.5 };
    for (let x = 0; x < W; x++) {
      let dxb = (x - back.mx) / back.mw;
      dxb = dxb < 0 ? -dxb * back.skew : dxb;
      if (dxb <= 1) {
        const ridge = back.peak + (H - back.peak) * Math.pow(dxb, 1.7) + (fbm(x / 16 + off * 9, 3, 3) - 0.5) * 6;
        for (let y = Math.max(0, ridge | 0); y < H; y++) {
          const dth = BAYER[y & 3][x & 3] / 16;
          buf[y * W + x] = dth < 0.45 ? 6 : dth < 0.8 ? 7 : 48; // silhueta afogada na bruma
        }
      }
    }
    for (let x = 0; x < W; x++) {
      let dx = (x - front.mx) / front.mw;
      dx = dx < 0 ? -dx * front.skew : dx;
      if (dx > 1) continue;
      const ridge = front.peak + (H - front.peak) * Math.pow(dx, 1.7) + (fbm(x / 13 + off * 3, 7, 3) - 0.5) * 8;
      for (let y = Math.max(0, ridge | 0); y < H; y++) {
        const depth = (y - ridge) / Math.max(1, H - ridge);
        const dth = BAYER[y & 3][x & 3] / 16;
        const nearBase = y > H - 7;
        let idx;
        if (depth < 0.2) idx = dth < 0.5 ? 3 : 19;          // cume pega sol
        else idx = dth < 0.8 ? 19 : 5;                       // corpo vinho sólido
        if (nearBase) idx = dth < 0.45 ? 5 : dth < 0.8 ? 6 : 48; // só a base afunda na bruma
        buf[y * W + x] = idx;
      }
    }
  }
  // linha de mata ao fundo, hazed (últimas linhas)
  for (let x = 0; x < W; x++) {
    const h = 4 + fbm(x / 9 + off * 5, 7, 3) * 8;
    for (let y = H - (h | 0); y < H; y++) {
      buf[y * W + x] = (BAYER[y & 3][x & 3] / 16) < 0.55 ? 30 : 37;
    }
  }
  return { buf, W, H };
}

/* rocha: blob convexo deformado por ruído, sombreado por normal quantizada + topo de musgo */
function genRock(opts) {
  const seed = (opts.seed | 0) || 1;
  const rnd = mulberry32(seed);
  const W = opts.W || 56, H = opts.H || 40;
  const buf = new Int16Array(W * H).fill(-1);
  const cx = W / 2, cy = H * 0.62;
  const rx = W * (0.34 + rnd() * 0.1), ry = H * (0.3 + rnd() * 0.08);
  const off = rnd() * 128;
  const rad = (ang) => 1 + 0.34 * (vnoise(Math.cos(ang) * 1.4 + off, Math.sin(ang) * 1.4 + off) - 0.5) * 2;
  const inside = (x, y) => {
    const ang = Math.atan2((y - cy) / ry, (x - cx) / rx);
    const rr = rad(ang);
    const d = Math.hypot((x - cx) / (rx * rr), (y - cy) / (ry * rr));
    return d <= 1 ? d : -1;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = inside(x, y);
      if (d < 0) continue;
      // normal aproximada pelo gradiente da distância
      const eps = 1.2;
      const dl = inside(x - eps, y), dr = inside(x + eps, y);
      const du = inside(x, y - eps), dd = inside(x, y + eps);
      const nx = (dr < 0 ? 1.4 : dr) - (dl < 0 ? 1.4 : dl);
      const ny = (dd < 0 ? 1.4 : dd) - (du < 0 ? 1.4 : du);
      const nm = Math.hypot(nx, ny) || 1e-4;
      const lam = (-nx / nm) * -0.55 + (-ny / nm) * -0.83; // luz alto-esquerda
      const facet = fbm(x / 7 + off, y / 7 + off, 3);       // facetas internas
      let t = 0.55 + 0.5 * lam + (facet - 0.5) * 0.55;
      t += (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.18;
      // musgo no topo (normal apontando pra cima + parte alta da rocha)
      const upness = -ny / nm;
      if (upness > 0.45 && d < 0.9 && fbm(x / 5 + off * 2, y / 5, 2) > 0.42 && y < cy) {
        buf[y * W + x] = t > 0.62 ? 37 : 36;
        continue;
      }
      const RAMP = [1, 2, 6, 7, 8]; // sombra..luz (cinzas do jogo)
      buf[y * W + x] = RAMP[clamp(Math.round(t * 4), 0, 4)];
    }
  }
  return { buf, W, H };
}

/* carimba um buffer transparente noutro buffer */
function blit(dst, DW, src, ox, oy) {
  for (let y = 0; y < src.H; y++) {
    const dy = oy + y;
    if (dy < 0) continue;
    if (dy * DW >= dst.length) break;
    for (let x = 0; x < src.W; x++) {
      const v = src.buf[y * src.W + x];
      if (v < 0) continue;
      const dx = ox + x;
      if (dx < 0 || dx >= DW) continue;
      dst[dy * DW + dx] = v;
    }
  }
}

/* a cena completa: céu + campo ensolarado + rochas + árvores em profundidade */
function composeScene(opts) {
  const W = opts.W || 480, H = opts.H || 270;
  const seed = (opts.seed | 0) || 1;
  const rnd = mulberry32(seed ^ 0x5eed);
  const buf = new Int16Array(W * H);
  const horizon = (H * 0.44) | 0;

  const sky = genSky({ W, H: horizon, seed });
  buf.set(sky.buf.subarray(0, horizon * W));

  // campo: luz de sol com manchas de sombra de nuvem (BotW) + flores
  const off = rnd() * 256;
  for (let y = horizon; y < H; y++) {
    const depth = (y - horizon) / (H - horizon); // 0 longe .. 1 perto
    for (let x = 0; x < W; x++) {
      const shadow = fbm(x / 150 + off, y / 95 - off, 2);       // nuvens no chão: enormes e raras
      const bright = fbm(x / 70 + off * 2, y / 45, 2);          // clareiras de sol largas
      const tuft = fbm(x / 9 - off, y / 9 + off, 2);            // grão fino
      // campo dominante claro (ref.): base 32, sol derretendo pra 27, salpico fino
      let idx = 32;
      if (bright > 0.58 && (BAYER[y & 3][x & 3] / 16) < (bright - 0.58) * 7) idx = 27;
      if (tuft > 0.82) idx = 27;
      else if (tuft < 0.14) idx = 31;
      // dentro da sombra de nuvem: UM passo mais escuro, borda derretida
      const sh = shadow - 0.56;
      if (sh > 0) {
        const soft = Math.min(1, sh / 0.03);
        if ((BAYER[y & 3][x & 3] / 16) < soft) idx = idx === 27 ? 32 : idx === 32 ? 31 : 30;
      }
      // haze no fundo do campo (funde com a linha de mata)
      if (depth < 0.08 && (BAYER[y & 3][x & 3] / 16) > 0.4 + depth * 5) idx = 37;
      buf[y * W + x] = idx;
      // flores espalhadas ao sol
      if (sh <= 0 && depth > 0.15 && hash2(x + 91, y + 17) < 0.004) {
        buf[y * W + x] = [9, 18, 57, 28][(hash2(x, y * 7) * 4) | 0];
      }
    }
  }

  // rochas: poucas e grandes perto, pequenas longe (com sombra de contato)
  const rocks = [];
  const nRocks = 7 + (rnd() * 3 | 0);
  for (let i = 0; i < nRocks; i++) {
    const depth = rnd();
    const scale = 0.35 + depth * 1.15;
    rocks.push({ depth, w: (44 * scale) | 0, h: (32 * scale) | 0, x: rnd() * W, seed: (seed * 7 + i * 131) | 0 });
  }
  rocks.sort((a, b) => a.depth - b.depth);
  for (const r of rocks) {
    const gy = horizon + ((H - horizon) * (0.06 + r.depth * 0.82)) | 0;
    const rock = genRock({ seed: r.seed, W: r.w, H: r.h });
    // sombra de contato
    const sw = r.w * 0.46, sh = Math.max(2, r.h * 0.14);
    for (let oy = -sh; oy <= sh; oy++) for (let ox = -sw; ox <= sw; ox++) {
      if ((ox * ox) / (sw * sw) + (oy * oy) / (sh * sh) > 1) continue;
      const xx = (r.x + ox) | 0, yy = (gy - 2 + oy) | 0;
      if (xx < 0 || xx >= W || yy < horizon || yy >= H) continue;
      if ((BAYER[yy & 3][xx & 3] / 16) < 0.62) buf[yy * W + xx] = 30;
    }
    blit(buf, W, rock, (r.x - r.w / 2) | 0, gy - r.h);
  }

  // árvores: 3 faixas de profundidade
  const trees = [];
  const nTrees = 9 + (rnd() * 3 | 0);
  for (let i = 0; i < nTrees; i++) {
    const depth = rnd();
    trees.push({ depth, x: rnd() * W, seed: (seed * 13 + i * 977) | 0 });
  }
  trees.sort((a, b) => a.depth - b.depth);
  for (const t of trees) {
    const mul = 0.34 + t.depth * 0.85;
    const tw = (104 * mul * 1.15) | 0, th = (136 * mul * 1.15) | 0;
    const tree = growTree({ species: t.depth < 0.35 ? 'carvalho' : rnd() < 0.5 ? 'carvalho' : 'anciao', mood: 'dia', seed: t.seed, W: tw, H: th, sizeMul: mul });
    const gy = horizon + ((H - horizon) * (0.02 + t.depth * 0.8)) | 0;
    // sombra da copa no chão
    const sw = tw * 0.34, sh = Math.max(2, th * 0.07);
    for (let oy = -sh; oy <= sh; oy++) for (let ox = -sw; ox <= sw; ox++) {
      if ((ox * ox) / (sw * sw) + (oy * oy) / (sh * sh) > 1) continue;
      const xx = (t.x + ox + tw * 0.06) | 0, yy = (gy - 1 + oy) | 0;
      if (xx < 0 || xx >= W || yy < horizon || yy >= H) continue;
      if ((BAYER[yy & 3][xx & 3] / 16) < 0.55) buf[yy * W + xx] = 30;
    }
    blit(buf, W, tree, (t.x - tw / 2) | 0, gy - th + 3);
  }

  // tufos de grama alta no primeiro plano (lâminas em V)
  const nTufts = 62;
  for (let i = 0; i < nTufts; i++) {
    const tx = (rnd() * W) | 0;
    const ty = (H * 0.72 + rnd() * H * 0.26) | 0;
    const th2 = 3 + ((ty / H) * 6 + rnd() * 3) | 0;
    const dark = rnd() < 0.4;
    for (let b = -1; b <= 1; b++) {
      for (let k = 0; k < th2; k++) {
        const xx = tx + b * ((k / 2.2) | 0) * (b === 0 ? 0 : 1);
        const yy = ty - k;
        if (xx < 0 || xx >= W || yy < horizon || yy >= H) continue;
        buf[yy * W + xx] = dark ? 31 : k > th2 - 3 ? 32 : 31;
      }
    }
  }
  return { buf, W, H };
}

/* pinta um buffer num canvas 2D (nn scale) */
function paintTree(ctx, tree, scale, bg) {
  const { buf, W, H } = tree;
  ctx.canvas.width = W * scale;
  ctx.canvas.height = H * scale;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W * scale, H * scale); }
  else ctx.clearRect(0, 0, W * scale, H * scale);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = buf[y * W + x];
      if (idx < 0) continue;
      ctx.fillStyle = PALETTE[idx];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

if (typeof module !== 'undefined') module.exports = { growTree, paintTree, genSky, genRock, composeScene, PALETTE, SPECIES, LEAF_RAMPS };
