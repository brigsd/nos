#!/usr/bin/env node
/**
 * bake-gi.mjs — o path tracer do Actions (D-36, passe A dos "gráficos que
 * ninguém fez"): ilumina o mundo de verdade, offline, e entrega o resultado
 * como uma textura minúscula que o cliente só CONSULTA.
 *
 * Para cada ponto do chão (grade 128×128, 2 amostras/tile) integra:
 *   - sol/lua direto com raio de sombra (paredes ocluem, copas filtram),
 *   - céu + 1 rebote (hemisfério cosseno: raio bate numa parede → devolve
 *     o albedo dela iluminado — é daí que vem o sangramento de cor),
 *   - copas da floresta como meio absorvente (Beer-Lambert, verde por baixo),
 *   - luzes pontuais com oclusão: 4 lampiões, o véu do Átrio, o Núcleo e
 *     as veias do Pulso (anel semeado ao redor do largo).
 * Assa 3 horários (dia/entardecer/noite), normaliza cada um pelo campo
 * aberto (128 = "igual ao chão livre") e escreve UM PNG 128×384 que o
 * build-fps inline no HTML. Grade inválida (amostra dentro de parede) é
 * dilatada dos vizinhos — bilinear nunca vaza preto.
 *
 * Determinístico (seed fixa), só Node builtins (zlib pro PNG). ~10-40s —
 * cabe no build do Pages; o cliente segue leve.
 *
 * PoC honesto: o layout d'A Clareira abaixo é DUPLICADO de nos-fps.html
 * (§A CLAREIRA) — extrair pra fonte única é o passo de produção.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const t0 = Date.now();

/* ---------- mundo ---------- */
const world = JSON.parse(readFileSync(join(REPO, 'world/heart.json'), 'utf8'));
const W = world.width, H = world.height;
const biome = new Array(W * H);
for (let i = 0; i < world.tiles.length; i++) biome[i] = world.tiles[i].biome;
const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H) ? biome[y * W + x] : 'void';

/* ---------- cena: A Clareira (duplicado de nos-fps.html §A CLAREIRA) ---------- */
const AL = { wood: [0.62, 0.42, 0.26], stone: [0.52, 0.5, 0.56], chimney: [0.3, 0.26, 0.3], arch: [0.5, 0.5, 0.55] };
const box = (tx, ty, kind, h) => ({ x0: tx, y0: ty, x1: tx + 1, y1: ty + 1, z1: h, al: AL[kind] });
const BOXES = [ // v2 (D-37): bancas removidas, telhados com desnível, portal ÚNICO
  box(43, 12, 'wood', 1.88), box(44, 12, 'wood', 1.68), box(43, 13, 'wood', 1.75), box(42, 12, 'wood', 0.85),
  box(48, 12, 'stone', 1.42), box(49, 12, 'chimney', 2.05), box(49, 13, 'stone', 1.3), box(50, 12, 'stone', 0.8),
  box(43, 19, 'wood', 1.02), box(44, 19, 'wood', 0.9), box(43, 18, 'wood', 0.95), box(42, 19, 'wood', 0.7),
  box(48, 19, 'wood', 1.2), box(49, 19, 'wood', 1.05), box(49, 18, 'wood', 1.12),
  /* o Portal do Átrio: lâmina fina de pedra */
  { x0: 50.98, y0: 15.2, x1: 51.22, y1: 16.0, z1: 1.7, al: AL.arch },
];

const PLAZA = { x: 46.2, y: 15.6 };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = mulberry32(20260716);

/* luzes pontuais: [x,y,z, r,g,b, I_dia,I_entardecer,I_noite, k_falloff] */
const LIGHTS = [
  [45.0, 14.1, 0.95, 1.0, 0.72, 0.35, 0, 1.2, 2.0, 4.0], // lampiões (poças locais, não iluminação pública)
  [47.4, 14.1, 0.95, 1.0, 0.72, 0.35, 0, 1.2, 2.0, 4.0],
  [45.0, 17.1, 0.95, 1.0, 0.72, 0.35, 0, 1.2, 2.0, 4.0],
  [47.4, 17.1, 0.95, 1.0, 0.72, 0.35, 0, 1.2, 2.0, 4.0],
  [51.1, 15.6, 0.7, 0.35, 1.0, 0.85, 0.25, 0.7, 1.2, 2.4], // véu do Átrio
  [33.5, 33.5, 0.6, 0.75, 0.45, 1.0, 1.1, 1.1, 1.1, 0.9],  // o Núcleo, sempre
];
for (let i = 0; i < 26; i++) { // veias: anel semeado ao redor do largo (fios, não lavagem)
  const a = rnd() * Math.PI * 2, r = 1.6 + rnd() * 3.0;
  const blue = rnd() > 0.5;
  LIGHTS.push([PLAZA.x + Math.cos(a) * r, PLAZA.y + Math.sin(a) * r * 0.9, 0.05,
    blue ? 0.3 : 0.66, blue ? 0.61 : 0.52, blue ? 0.9 : 0.95, 0.03, 0.12, 0.3, 10.0]);
}

/* ---------- horários ----------
   chroma: quanto da COR da GI entra (0 = só luminância). De dia a razão
   por canal contra referência azulada infla o R (rebote quente vira rosa
   no calçamento) — então o dia é quase só luminância; a noite guarda a
   cor, que é onde ela importa (poças âmbar, véu teal, veias). */
const TODS = [
  { name: 'dia', sun: norm([-0.5, -0.45, 0.74]), sunI: [1.6, 1.5, 1.35], skyZen: [0.5, 0.68, 1.02], skyHor: [0.78, 0.88, 1.0], skyI: 1.0, canopyLum: 1.0, li: 0, chroma: 0.22 },
  { name: 'entardecer', sun: norm([-0.88, -0.12, 0.24]), sunI: [1.35, 0.72, 0.4], skyZen: [0.38, 0.34, 0.55], skyHor: [1.0, 0.6, 0.38], skyI: 0.55, canopyLum: 0.45, li: 1, chroma: 0.45 },
  /* squash comprime os desvios (f-1): a noite tem referência minúscula, então
     sem isso qualquer lanterna vira iluminação pública — queremos BREU com poças */
  { name: 'noite', sun: norm([0.5, 0.3, 0.55]), sunI: [0.14, 0.17, 0.27], skyZen: [0.07, 0.09, 0.18], skyHor: [0.1, 0.12, 0.22], skyI: 0.32, canopyLum: 0.08, li: 2, squash: 0.5, chroma: 0.65 },
];
function norm(v) { const l = Math.hypot(...v); return v.map((c) => c / l); }

/* ---------- interseções ---------- */
function hitBoxes(ox, oy, oz, dx, dy, dz, tMax) {
  let best = null, bt = tMax;
  for (const b of BOXES) {
    let t0v = 0, t1v = bt, nAxis = -1, nSign = 0;
    // slabs x/y/z (chão z0=0)
    const sl = (o, d, lo, hi, ax) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let ta = (lo - o) / d, tb = (hi - o) / d, s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0v) { t0v = ta; nAxis = ax; nSign = s * Math.sign(d); }
      if (tb < t1v) t1v = tb;
      return t0v <= t1v;
    };
    if (!sl(ox, dx, b.x0, b.x1, 0)) continue;
    if (!sl(oy, dy, b.y0, b.y1, 1)) continue;
    if (!sl(oz, dz, 0, b.z1, 2)) continue;
    if (t0v > 1e-4 && t0v < bt) { bt = t0v; best = { t: t0v, b, nAxis, nSign }; }
  }
  return best;
}
/* transmitância pelas copas (z 1.0..2.1 sobre tiles de floresta) */
function canopyT(ox, oy, oz, dx, dy, dz, tMax) {
  let T = 1;
  const step = 0.5;
  for (let t = step * 0.5; t < tMax; t += step) {
    const z = oz + dz * t;
    if (z > 2.15 && dz > 0) break;
    if (z < 0.95) continue;
    if (z > 2.15) continue;
    if (at((ox + dx * t) | 0, (oy + dy * t) | 0) === 'forest') T *= 0.80;
    if (T < 0.05) return T;
  }
  return T;
}
const insideBox = (x, y, z) => BOXES.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z < b.z1);

/* ---------- o integrador de um ponto do chão ---------- */
function radiance(px0, py0, tod, nRays) {
  const oz = 0.02;
  const out = [0, 0, 0];
  /* sol direto (n = pra cima): sombra por paredes, filtro das copas */
  const sVis = hitBoxes(px0, py0, oz, tod.sun[0], tod.sun[1], tod.sun[2], 60) ? 0 : canopyT(px0, py0, oz, tod.sun[0], tod.sun[1], tod.sun[2], 60);
  for (let c = 0; c < 3; c++) out[c] += tod.sunI[c] * tod.sun[2] * sVis;
  /* céu + 1 rebote, hemisfério cosseno */
  for (let i = 0; i < nRays; i++) {
    const u1 = rnd(), u2 = rnd();
    const rr = Math.sqrt(u1), phi = u2 * Math.PI * 2;
    const dx = rr * Math.cos(phi), dy = rr * Math.sin(phi), dz = Math.sqrt(1 - u1);
    const hit = hitBoxes(px0, py0, oz, dx, dy, dz, 26);
    const tEnd = hit ? hit.t : 26;
    const T = canopyT(px0, py0, oz, dx, dy, dz, tEnd);
    const green = (1 - T) * tod.canopyLum;
    out[0] += green * 0.14; out[1] += green * 0.30; out[2] += green * 0.17;
    if (hit) {
      /* parede: albedo × (sol na face + céu ambiente) — o rebote de cor */
      const n = [0, 0, 0]; n[hit.nAxis] = hit.nSign || 1;
      const face = Math.max(0, n[0] * tod.sun[0] + n[1] * tod.sun[1] + n[2] * tod.sun[2]);
      for (let c = 0; c < 3; c++) {
        out[c] += T * hit.b.al[c] * (tod.sunI[c] * face * 0.7 + tod.skyHor[c] * tod.skyI * 0.5);
      }
    } else {
      /* céu: zênite→horizonte pelo dz */
      for (let c = 0; c < 3; c++) out[c] += T * (tod.skyZen[c] * dz + tod.skyHor[c] * (1 - dz)) * tod.skyI;
    }
  }
  for (let c = 0; c < 3; c++) out[c] = out[c] / (nRays * 0.55); // fator do estimador, calibrado no campo aberto
  /* luzes pontuais com oclusão binária por paredes */
  for (const L of LIGHTS) {
    const I = L[6 + tod.li];
    if (I < 0.01) continue;
    const lx = L[0] - px0, ly = L[1] - py0, lz = L[2] - oz;
    const d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2);
    if (d > 9) continue;
    const fall = I / (1 + L[9] * d2);
    if (fall < 0.004) continue;
    const vis = hitBoxes(px0, py0, oz, lx / d, ly / d, lz / d, d - 0.05) ? 0 : 1;
    if (!vis) continue;
    out[0] += L[3] * fall; out[1] += L[4] * fall; out[2] += L[5] * fall;
  }
  return out;
}

/* ---------- assar as 3 grades ---------- */
const G = 128, SC = W / G; // 2 amostras por tile
const grids = [];
/* perto de caixa/floresta/luz = full-res; campo aberto = poucos raios */
const busy = (x, y) =>
  BOXES.some((b) => x > b.x0 - 4 && x < b.x1 + 4 && y > b.y0 - 4 && y < b.y1 + 4) ||
  LIGHTS.some((L) => (x - L[0]) ** 2 + (y - L[1]) ** 2 < 49) ||
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([ox, oy]) => at((x + ox) | 0, (y + oy) | 0) === 'forest');

for (const tod of TODS) {
  const g = new Float64Array(G * G * 3).fill(-1);
  /* referência do campo aberto: média de 32 amostras céu-limpo sintéticas */
  const ref = [0, 0, 0];
  { const scene = BOXES.splice(0); const lights = LIGHTS.splice(0); // esvazia
    for (let i = 0; i < 32; i++) { const r = radiance(5 + rnd() * 3, 40 + rnd() * 3, tod, 48); for (let c = 0; c < 3; c++) ref[c] += r[c] / 32; }
    BOXES.push(...scene); LIGHTS.push(...lights); }
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const x = (gx + 0.5) * SC, y = (gy + 0.5) * SC;
      if (insideBox(x, y, 0.05)) continue; // inválida → dilatação
      const r = radiance(x, y, tod, busy(x, y) ? 128 : 30);
      const o = (gy * G + gx) * 3;
      /* normalização anti-viés: cada canal puxado 45% pra razão de LUMINÂNCIA
         (mata o ruído de cor de razões entre números minúsculos, preserva o
         sangramento verdadeiro) + joelho suave acima de 1.6 (poça continua
         poça; lavagem nunca) */
      const refLum = 0.30 * ref[0] + 0.55 * ref[1] + 0.15 * ref[2];
      const rLum = (0.30 * r[0] + 0.55 * r[1] + 0.15 * r[2]) / refLum;
      const sq = tod.squash ?? 1, ch = tod.chroma ?? 0.5;
      for (let c = 0; c < 3; c++) {
        let f2 = (r[c] / ref[c]) * ch + rLum * (1 - ch);
        if (sq < 1) f2 = 1 + (f2 - 1) * sq;
        if (f2 > 1.6) f2 = 1.6 + (f2 - 1.6) * 0.45;
        g[o + c] = f2;
      }
    }
  }
  /* dilata inválidas a partir dos vizinhos válidos */
  for (let pass = 0; pass < 3; pass++) {
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      const o = (gy * G + gx) * 3;
      if (g[o] >= 0) continue;
      let n = 0; const acc = [0, 0, 0];
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + ox, ny = gy + oy;
        if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
        const q = (ny * G + nx) * 3;
        if (g[q] >= 0) { n++; for (let c = 0; c < 3; c++) acc[c] += g[q + c]; }
      }
      if (n) for (let c = 0; c < 3; c++) g[o + c] = acc[c] / n;
    }
  }
  /* blur 3×3: GI é baixa-frequência por natureza — mata o ruído do Monte
     Carlo e o PNG encolhe junto (grão comprime mal) */
  const soft = new Float64Array(G * G * 3);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const acc = [0, 0, 0]; let n = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = gx + ox, ny = gy + oy;
      if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
      const q = (ny * G + nx) * 3;
      if (g[q] < 0) continue;
      n++; for (let c = 0; c < 3; c++) acc[c] += g[q + c];
    }
    const o = (gy * G + gx) * 3;
    for (let c = 0; c < 3; c++) soft[o + c] = n ? acc[c] / n : 1;
  }
  grids.push(soft);
  console.log(`gi: ${tod.name} assado (ref ${ref.map((v) => v.toFixed(2)).join('/')})`);
}

/* ---------- PNG 128×384 (3 grades empilhadas), 128 = neutro ---------- */
const rows = [];
for (const g of grids) {
  for (let gy = 0; gy < G; gy++) {
    const row = Buffer.alloc(1 + G * 3);
    for (let gx = 0; gx < G; gx++) {
      const o = (gy * G + gx) * 3;
      for (let c = 0; c < 3; c++) row[1 + gx * 3 + c] = Math.max(0, Math.min(255, Math.round((g[o + c] < 0 ? 1 : g[o + c]) * 128)));
    }
    rows.push(row);
  }
}
const raw = Buffer.concat(rows);
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(G, 0); ihdr.writeUInt32BE(G * 3, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out/gi.png'), png);
console.log(`gi: out/gi.png ${(png.length / 1024).toFixed(1)}KB em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
