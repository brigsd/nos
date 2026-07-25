/* pngwrite.mjs — codifica um buffer RGB em PNG (8-bit, colortype 2), sem
   dependência externa (par do decodePng em pngstats.mjs). Usado pela bancada
   de gabarito pra salvar a EVIDÊNCIA visual (silhueta extraída, contorno
   rasterizado, sobreposição) — número sem imagem não é veredito, é aposta
   (a regra do playground, D-113 rule 3). */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

/** encodePng({W,H,ch,pixels}) -> Buffer PNG. `ch` 1 (cinza) ou 3 (RGB); `pixels` sem filtro (raw, stride=W*ch). */
export function encodePng({ W, H, ch, pixels }) {
  const ct = ch === 1 ? 0 : 2;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = ct; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = W * ch;
  const filtered = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) {
    filtered[y * (stride + 1)] = 0;   // filtro "none" — simples, tamanho não importa aqui (evidência, não transporte)
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(filtered);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** máscara binária (Uint8Array W*H, 0/1) -> PNG cinza (0/255) — pra Read direto. */
export function mascaraParaPng(mascara) {
  const { W, H, m } = mascara;
  const pixels = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) pixels[i] = m[i] ? 255 : 0;
  return encodePng({ W, H, ch: 1, pixels });
}

/** sobreposição colorida: verde = só render, magenta = só referência, branco = os dois (interseção), preto = nenhum. */
export function sobreposicaoParaPng(render, referencia) {
  const { W, H } = render;
  const pixels = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const r = render.m[i], f = referencia.m[i], o = i * 3;
    if (r && f) { pixels[o] = 255; pixels[o + 1] = 255; pixels[o + 2] = 255; }
    else if (r) { pixels[o] = 40; pixels[o + 1] = 220; pixels[o + 2] = 90; }
    else if (f) { pixels[o] = 230; pixels[o + 1] = 40; pixels[o + 2] = 200; }
  }
  return encodePng({ W, H, ch: 3, pixels });
}
