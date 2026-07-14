'use strict';
/**
 * Ordered (Bayer) dithering helpers, used to fake smooth multi-tone
 * gradients/falloffs on a fixed palette without introducing random noise
 * (which would read as "orphan pixels" under the art-reviewer checklist).
 */

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 5, 13],
];

function bayerThreshold(x, y) {
  const row = BAYER4[((y % 4) + 4) % 4];
  const v = row[((x % 4) + 4) % 4];
  return (v + 0.5) / 16;
}

/**
 * Pick a tone band (0..n-1) for continuous value t in [0,1] using ordered
 * dithering, so transitions between flat palette tones look like a smooth
 * gradient at 1x instead of hard bands.
 */
function ditherBand(x, y, t, n) {
  const scaled = Math.max(0, Math.min(1, t)) * (n - 1);
  let band = Math.floor(scaled);
  const frac = scaled - band;
  if (frac > bayerThreshold(x, y)) band += 1;
  return Math.max(0, Math.min(n - 1, band));
}

/** Diagonal "light from top-left" gradient field over a w x h grid: 1 = brightest corner, 0 = darkest. */
function lightT(x, y, w, h) {
  const gx = x / Math.max(1, w - 1);
  const gy = y / Math.max(1, h - 1);
  return 1 - (gx * 0.5 + gy * 0.5);
}

module.exports = { bayerThreshold, ditherBand, lightT, BAYER4 };
