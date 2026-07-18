/* pngstats.mjs — decodifica um PNG (8-bit, colortype 2/6) via zlib e devolve
   estatística barata do frame: nº de cores distintas (amostradas), fração da
   cor dominante, faixa de luma. Sem dependência externa. Usado pelo porteiro
   pra flagrar frame DEGENERADO (tela chapada = render quebrado que "passou"). */
import { inflateSync } from 'node:zlib';

export function pngStats(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let p = 8, W = 0, H = 0, bd = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`PNG não suportado (bd=${bd} ct=${ct})`);
  const ch = ct === 6 ? 4 : 3, stride = W * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(H * stride);
  const pae = (a, b, c) => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let rp = 0;
  for (let y = 0; y < H; y++) {
    const f = raw[rp++]; const row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[row + x - ch] : 0, b = y > 0 ? out[prev + x] : 0, c = x >= ch && y > 0 ? out[prev + x - ch] : 0;
      let v = raw[rp++];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += pae(a, b, c);
      out[row + x] = v & 255;
    }
  }
  // estatística amostrada
  const counts = new Map(); let lmin = 255, lmax = 0, n = 0;
  const step = Math.max(1, Math.floor((W * H) / 20000));
  for (let i = 0; i < W * H; i += step) {
    const o = i * ch, r = out[o], g = out[o + 1], bb = out[o + 2];
    const key = (r >> 3 << 10) | (g >> 3 << 5) | (bb >> 3);   // quantiza 5-bit/canal
    counts.set(key, (counts.get(key) || 0) + 1);
    const lum = (r * 0.3 + g * 0.59 + bb * 0.11) | 0; if (lum < lmin) lmin = lum; if (lum > lmax) lmax = lum;
    n++;
  }
  let domin = 0; for (const c of counts.values()) if (c > domin) domin = c;
  return { W, H, cores: counts.size, fracDominante: domin / n, lumaRange: lmax - lmin };
}
