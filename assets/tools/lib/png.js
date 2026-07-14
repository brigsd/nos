'use strict';
/**
 * Minimal, dependency-free PNG encoder.
 *
 * Only uses Node's built-in `zlib` module (for the DEFLATE/zlib stream that
 * PNG's IDAT chunk requires) — no npm packages. This keeps assets/tools/
 * self-contained per the T7 constraint: no package.json / external deps.
 *
 * Supports exactly what this project's render pipeline needs: 8-bit RGBA,
 * non-interlaced, filter-type 0 (None) per scanline. That's enough for
 * crisp pixel-art sprites where compression ratio doesn't matter.
 */

const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Standard CRC-32 (polynomial 0xEDB88320), table-based — the same checksum
// used by both zlib and PNG chunk trailers.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Encode an RGBA image into a PNG buffer.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Buffer} rgba - length must be width*height*4, row-major, top-to-bottom.
 * @returns {Buffer}
 */
function encodePNG(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `encodePNG: rgba buffer length ${rgba.length} does not match ${width}x${height}x4 = ${width * height * 4}`
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type 6 = RGBA
  ihdr.writeUInt8(0, 10); // compression method
  ihdr.writeUInt8(0, 11); // filter method
  ihdr.writeUInt8(0, 12); // interlace method (0 = none)

  // Build raw scanlines: 1 filter-type byte (0 = None) + RGBA bytes per row.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const src = Buffer.isBuffer(rgba) ? rgba : Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    src.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });

  const out = Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return out;
}

module.exports = { encodePNG, crc32 };
