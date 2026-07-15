'use strict';
/** Basic 2D palette-index grid helpers shared by sprite authoring code. */

function makeGrid(w, h, fillValue = -1) {
  return Array.from({ length: h }, () => Array(w).fill(fillValue));
}

function set(g, x, y, v) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = v;
}

function get(g, x, y) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) return g[y][x];
  return -1;
}

function setMany(g, coords, v) {
  for (const [x, y] of coords) set(g, x, y, v);
}

function rectFill(g, x0, y0, x1, y1, v) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) set(g, x, y, v);
  }
}

module.exports = { makeGrid, set, get, setMany, rectFill };
