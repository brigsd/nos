/* helpers de TEXTURA do motor v3 (D-55) — paleta Resurrect64, ruído, dither e
   o gerador de canvas. Uma peça pode devolver índice da paleta OU [r,g,b]
   direto (madeiras ricas aprovadas em D-54f) OU -1 (transparente). */
export const PALETTE = ["#2e222f","#3e3546","#625565","#966c6c","#ab947a","#694f62","#7f708a","#9babb2","#c7dcd0","#ffffff","#6e2727","#b33831","#ea4f36","#f57d4a","#ae2334","#e83b3b","#fb6b1d","#f79617","#f9c22b","#7a3045","#9e4539","#cd683d","#e6904e","#fbb954","#4c3e24","#676633","#a2a947","#d5e04b","#fbff86","#165a4c","#239063","#1ebc73","#91db69","#cddf6c","#313638","#374e4a","#547e64","#92a984","#b2ba90","#0b5e65","#0b8a8f","#0eaf9b","#30e1b9","#8ff8e2","#323353","#484a77","#4d65b4","#4d9be6","#8fd3ff","#45293f","#6b3e75","#905ea9","#a884f3","#eaaded","#753c54","#a24b6f","#cf657f","#ed8099","#831c5d","#c32454","#f04f78","#f68181","#fca790","#fdcbb0"];
export const RGB = PALETTE.map(h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]);

export function hash2(x, y) { let h = (x * 374761393 + y * 668265263) >>> 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const a = hash2(xi,yi), b = hash2(xi+1,yi), c = hash2(xi,yi+1), d = hash2(xi+1,yi+1);
  return a*(1-u)*(1-v) + b*u*(1-v) + c*(1-u)*v + d*u*v;
}
export function fbm(x, y) { return vnoise(x, y) * 0.6 + vnoise(x*2.1+5, y*2.1+9) * 0.3 + vnoise(x*4.3, y*4.3) * 0.1; }

const BAYER4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
/* dither ordenado: mescla 2 índices p/ compor cores fora da paleta */
export function dth(x, y, a, b, t) { return (BAYER4[(y & 3) * 4 + (x & 3)] / 16) < t ? a : b; }

/* fn(x,y) -> índice da paleta | [r,g,b] | -1 (transparente) */
export function texCanvas(W, H, fn) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(W, H); const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = fn(x, y); const o = (y * W + x) * 4;
    if (Array.isArray(v)) { d[o] = v[0]; d[o+1] = v[1]; d[o+2] = v[2]; d[o+3] = 255; }
    else if (v < 0) { d[o+3] = 0; }
    else { const [r, g, b] = RGB[v]; d[o] = r; d[o+1] = g; d[o+2] = b; d[o+3] = 255; }
  }
  ctx.putImageData(img, 0, 0); return cv;
}
