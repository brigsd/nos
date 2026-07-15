'use strict';
/**
 * In-engine preview: renders candidate FPS art exactly as the raycaster
 * prototype would show it (prototipos/fps/nos-fps.html on branch
 * claude/fps-prototipo). The wall DDA, floor casting, billboard projection,
 * fog curve and shade() here are 1:1 ports of that prototype's math and
 * constants — audit happens in the real look, not an approximation. If the
 * prototype's constants change, update them here (single block below).
 *
 * Scene is a fixed audit corridor: candidate WALL texture on every wall of
 * a small room, candidate FLOOR texture (optional) on the ground, candidate
 * BILLBOARD sprite placed at 3 distances (near/mid/far). Headless, PNG out.
 */

const path = require('path');
const { createCanvas, matrixToCanvas } = require(path.resolve(__dirname, '..', '..', '..', 'assets', 'tools', 'lib', 'canvas.cjs'));

/* ---- constants ported from the prototype (keep in sync) ---- */
const W = 320;
const H = 180;
const HALF = H / 2;
const FOV_PLANE = 0.66;
const FOG_R = 16, FOG_G = 12, FOG_B = 21; // #100c15
const fogAt = (d) => 1 / (1 + 0.021 * d * d);

function shade(rgba, f) {
  // prototype's shade() minus the core-glow term (no Núcleo in the audit room)
  return [
    Math.min(255, rgba[0] * f + FOG_R * (1 - f)) | 0,
    Math.min(255, rgba[1] * f + FOG_G * (1 - f)) | 0,
    Math.min(255, rgba[2] * f + FOG_B * (1 - f)) | 0,
    255,
  ];
}

/* ---- audit scene: 12x8 room, camera at west end looking east ---- */
const ROOM_W = 12;
const ROOM_H = 8;
const isWall = (x, y) => x <= 0 || y <= 0 || x >= ROOM_W - 1 || y >= ROOM_H - 1;

function sampleSprite(canvas, u, v) {
  const x = Math.min(canvas.width - 1, Math.max(0, (u * canvas.width) | 0));
  const y = Math.min(canvas.height - 1, Math.max(0, (v * canvas.height) | 0));
  const i = (y * canvas.width + x) * 4;
  return [canvas.data[i], canvas.data[i + 1], canvas.data[i + 2], canvas.data[i + 3]];
}

/**
 * Render the audit corridor. `wall`/`floor` are sprite-src objects (frames of
 * palette indices), `billboard` optional. Returns a canvas (PNG-ready).
 */
function renderPreview({ wall, floor = null, billboard = null, palette }) {
  const wallTex = matrixToCanvas(wall.frames[0].pixels, palette);
  const floorTex = floor ? matrixToCanvas(floor.frames[0].pixels, palette) : null;
  const billTex = billboard ? matrixToCanvas(billboard.frames[0].pixels, palette) : null;

  const out = createCanvas(W, H);
  const cam = { x: 1.6, y: ROOM_H / 2, a: 0 }; // west end, looking +x
  const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
  const plX = -dirY * FOV_PLANE, plY = dirX * FOV_PLANE;
  const zbuf = new Float32Array(W);

  const put = (x, y, rgba) => {
    const i = (y * W + x) * 4;
    out.data[i] = rgba[0]; out.data[i + 1] = rgba[1]; out.data[i + 2] = rgba[2]; out.data[i + 3] = 255;
  };

  /* sky: the prototype's void gradient (no stars — nothing to audit there) */
  for (let y = 0; y < HALF; y++) {
    const t = y / HALF;
    const row = [16 + 26 * t * t | 0, 12 + 14 * t * t | 0, 21 + 42 * t * t | 0, 255];
    for (let x = 0; x < W; x++) put(x, y, row);
  }

  /* floor casting (prototype technique): one ray direction pair per row */
  for (let y = HALF; y < H; y++) {
    const p = y - HALF;
    const rowDist = HALF / (p || 1);
    const f = fogAt(rowDist);
    for (let x = 0; x < W; x++) {
      const cx = 2 * x / W - 1;
      const rdx = dirX + plX * cx, rdy = dirY + plY * cx;
      const wx = cam.x + rdx * rowDist, wy = cam.y + rdy * rowDist;
      if (floorTex) {
        const c = sampleSprite(floorTex, wx - Math.floor(wx), wy - Math.floor(wy));
        put(x, y, shade(c, f));
      } else {
        put(x, y, shade([49, 54, 56, 255], f)); // flat dark ground
      }
    }
  }

  /* walls: DDA, textured columns, distance fog — straight from the prototype */
  for (let x = 0; x < W; x++) {
    const cx = 2 * x / W - 1;
    const rdx = dirX + plX * cx, rdy = dirY + plY * cx;
    let mapX = cam.x | 0, mapY = cam.y | 0;
    const dDX = Math.abs(1 / (rdx || 1e-9)), dDY = Math.abs(1 / (rdy || 1e-9));
    let stepX, sideX, stepY, sideY;
    if (rdx < 0) { stepX = -1; sideX = (cam.x - mapX) * dDX; } else { stepX = 1; sideX = (mapX + 1 - cam.x) * dDX; }
    if (rdy < 0) { stepY = -1; sideY = (cam.y - mapY) * dDY; } else { stepY = 1; sideY = (mapY + 1 - cam.y) * dDY; }
    let side = 0;
    for (let i = 0; i < 64; i++) {
      if (sideX < sideY) { sideX += dDX; mapX += stepX; side = 0; } else { sideY += dDY; mapY += stepY; side = 1; }
      if (isWall(mapX, mapY)) break;
    }
    const dist = side === 0 ? sideX - dDX : sideY - dDY;
    zbuf[x] = dist;
    const lineH = (H / dist) | 0;
    const y0 = Math.max(0, HALF - (lineH >> 1));
    const y1 = Math.min(H - 1, HALF + (lineH >> 1));
    let wallU = side === 0 ? cam.y + dist * rdy : cam.x + dist * rdx;
    wallU -= Math.floor(wallU);
    const f = fogAt(dist) * (side === 1 ? 0.8 : 1); // prototype darkens N/S faces
    for (let y = y0; y <= y1; y++) {
      const wallV = (y - (HALF - lineH / 2)) / lineH;
      const c = sampleSprite(wallTex, wallU, wallV);
      put(x, y, shade(c, f));
    }
  }

  /* billboard at 3 distances along the corridor (prototype projection) */
  if (billTex) {
    const spots = [
      { x: cam.x + 2.2, y: cam.y - 1.2 },
      { x: cam.x + 4.5, y: cam.y },
      { x: cam.x + 7.5, y: cam.y + 1.4 },
    ];
    spots.sort((a, b) => (b.x - cam.x) - (a.x - cam.x)); // far -> near
    for (const s of spots) {
      const rx = s.x - cam.x, ry = s.y - cam.y;
      const inv = 1 / (plX * dirY - dirX * plY);
      const tx = inv * (dirY * rx - dirX * ry);
      const ty = inv * (-plY * rx + plX * ry); // depth
      if (ty <= 0.2) continue;
      const sx = ((W / 2) * (1 + tx / ty)) | 0;
      const size = Math.abs((H / ty) | 0);
      const f = fogAt(ty);
      for (let px = sx - (size >> 1); px < sx + (size >> 1); px++) {
        if (px < 0 || px >= W || ty >= zbuf[px]) continue;
        for (let py = HALF - (size >> 1); py < HALF + (size >> 1); py++) {
          if (py < 0 || py >= H) continue;
          const u = (px - (sx - (size >> 1))) / size;
          const v = (py - (HALF - (size >> 1))) / size;
          const c = sampleSprite(billTex, u, v);
          if (c[3] === 0) continue;
          put(px, py, shade(c, f));
        }
      }
    }
  }

  return out;
}

module.exports = { renderPreview, W, H };
