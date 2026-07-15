'use strict';
/**
 * Tiny 3x5 pixel digit font, used only for dev-tool labels (contact sheet
 * numbering / map-mock ruler). Not part of any in-game sprite.
 */

const DIGITS = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ' ': ['000', '000', '000', '000', '000'],
};

/**
 * Draw a string of digits/spaces onto a canvas at (x,y) using `color`, each
 * glyph pixel drawn as a `scale`x`scale` block, 1 glyph-pixel gap between chars.
 */
function drawText(canvas, setPixelFn, text, x, y, color, scale = 1) {
  let cursor = x;
  for (const ch of String(text)) {
    const glyph = DIGITS[ch] || DIGITS[' '];
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPixelFn(canvas, cursor + gx * scale + sx, y + gy * scale + sy, color);
          }
        }
      }
    }
    cursor += (3 + 1) * scale;
  }
  return cursor - scale; // right edge of last glyph
}

module.exports = { drawText };
