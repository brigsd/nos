/* distancia-paleta [paleta] — conformidade de cor à Resurrect64 em espaço
   perceptual (CIEDE2000 offline, sem libs). Cada pixel deve estar perto de
   alguma cor da paleta; sinaliza cor-fora-da-paleta (magenta) e desvio sutil
   (+22/canal). Tons de madeira REAIS aprovados (casa-toras, D-54f) entram em
   allowlist e NÃO contam. Ignora a borda de 1px (domínio seam, não paleta). */
import { readFileSync } from 'node:fs';
import { RGB } from '../../../../prototipos/fps/v3/motor/tex.js';

export const id = 'distancia-paleta';
export const dom = 'paleta';

/* --- sRGB -> LAB (offline) --- */
function srgb2lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function rgb2lab(r, g, b) {
  const R = srgb2lin(r), G = srgb2lin(g), B = srgb2lin(b);
  let x = R * 0.4124 + G * 0.3576 + B * 0.1805, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  x /= 0.95047; z /= 1.08883;
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/* --- CIEDE2000 --- */
function de00(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  let h1p = Math.atan2(b1, a1p) * 180 / Math.PI; if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * 180 / Math.PI; if (h2p < 0) h2p += 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0; if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p; if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp += (hbp < 360 ? 360 : -360); hbp /= 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * Math.PI / 180) + 0.24 * Math.cos((2 * hbp) * Math.PI / 180)
    + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);
  const dth = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dth * Math.PI / 180) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * dCp / Sc * dHp / Sh);
}

const PLAB = RGB.map((c) => rgb2lab(c[0], c[1], c[2]));
/* allowlist: madeiras castanho-mel aprovadas (D-54f) — lidas de casa-toras.js,
   com fallback aos valores fixos. Estas cores NÃO são defeito de paleta. */
function lerMadeiras() {
  const fallback = [[190, 138, 80], [150, 98, 52], [122, 80, 44], [92, 60, 32], [70, 45, 24], [54, 35, 19]];
  try {
    const src = readFileSync(new URL('../../../../prototipos/fps/v3/pecas/casa-toras.js', import.meta.url), 'utf8');
    const out = [];
    const re = /W_[A-Z]+\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g;
    let m; while ((m = re.exec(src))) out.push([+m[1], +m[2], +m[3]]);
    return out.length ? out : fallback;
  } catch { return fallback; }
}
const ALLOW = new Set(lerMadeiras().map((c) => c.join(',')));

/* cache dE por cor exata (poucas cores distintas por textura) */
const cacheDE = new Map();
function nearestDE(r, g, b) {
  const k = (r << 16) | (g << 8) | b;
  let v = cacheDE.get(k); if (v !== undefined) return v;
  const L = rgb2lab(r, g, b); let mn = 1e9;
  for (const p of PLAB) { const d = de00(L, p); if (d < mn) mn = d; }
  cacheDE.set(k, mn); return mn;
}

const GATE = 4.5;   // dE mínimo pra considerar "fora da paleta"
const FAR = 15;     // dE de cor claramente estranha (magenta) vs banda cinza (~13.5)
const CNT_FAR = 20; // pixels de uma cor-fora pra virar erro (vs 5 órfãos)
const CNT_SUB = 10; // pixels por cor num desvio sutil
const DISTINCT = 2; // nº de cores sutis distintas p/ desvio (desvio≥3, banda≤1)
/* NOTA DE PISO (D-60): mantido em 2 tons distintos DE PROPÓSITO. Baixar pra
   pegar desvio de UM tom só (+18) faz a ferramenta morder a FAIXA CHAPADA (bloco
   cinza fora da paleta) — que é domínio do detector-de-banding. Os domínios se
   sobrepõem numa faixa chapada off-palette; a divisão é: bloco multi-tom = paleta,
   bloco mono-tom chapado = banding. Logo, desvio sutil de 1 tom só é PISO aceito. */

export function analisar(built, { pixels }) {
  const f = [];
  const hist = new Map();  // rgbKey -> count  (interior, off-palette, não-allowlist)
  for (const L of built.lotes) {
    const t = L.tex; if (!t) continue;
    const p = pixels(t), d = p.data, w = p.w, h = p.h;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4;
      if (d[o + 3] < 128) continue;
      const r = d[o], g = d[o + 1], b = d[o + 2];
      const key = r + ',' + g + ',' + b;
      if (ALLOW.has(key)) continue;
      if (nearestDE(r, g, b) <= GATE) continue;
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  let farCount = 0, farColors = 0, subtleColors = 0, subtleTotal = 0;
  for (const [key, c] of hist) {
    const [r, g, b] = key.split(',').map(Number);
    const e = nearestDE(r, g, b);
    if (e > FAR) { if (c >= CNT_FAR) { farColors++; farCount += c; } }
    else if (c >= CNT_SUB) { subtleColors++; subtleTotal += c; }
  }
  if (farColors) f.push({ sev: 'erro', msg: `${farCount} pixel(s) de cor fora da paleta (dE>${FAR}, ${farColors} tom(ns))` });
  if (subtleColors >= DISTINCT) f.push({ sev: 'aviso', msg: `desvio sutil de paleta: ${subtleTotal} pixel(s) em ${subtleColors} tom(ns) levemente fora (dE ${GATE}–${FAR})` });
  return f;
}
