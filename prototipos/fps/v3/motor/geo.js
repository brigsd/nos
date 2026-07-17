/* helpers de GEOMETRIA do motor v3 (D-55): malha = lista chata de vértices
   (pos xyz, uv, normal) — 8 floats por vértice, triângulos soltos. */
export function Mesh() { return { v: [] }; }

export function quad(m, p0, p1, p2, p3, uS, vS, nrm) {
  const push = (p, u, v) => m.v.push(p[0], p[1], p[2], u, v, nrm[0], nrm[1], nrm[2]);
  push(p0, 0, vS); push(p1, uS, vS); push(p2, uS, 0);
  push(p0, 0, vS); push(p2, uS, 0); push(p3, 0, 0);
}
export function quadUV(m, p0, p1, p2, p3, a, b, c, d, nrm) {
  const push = (p, uv) => m.v.push(p[0], p[1], p[2], uv[0], uv[1], nrm[0], nrm[1], nrm[2]);
  push(p0, a); push(p1, b); push(p2, c); push(p0, a); push(p2, c); push(p3, d);
}
export function tri(m, p0, p1, p2, uv0, uv1, uv2, nrm) {
  const push = (p, uv) => m.v.push(p[0], p[1], p[2], uv[0], uv[1], nrm[0], nrm[1], nrm[2]);
  push(p0, uv0); push(p1, uv1); push(p2, uv2);
}
/* caixa alinhada aos eixos, uma repetição de textura por face */
export function box(m, x0, y0, z0, x1, y1, z1) {
  quad(m, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], 1,1, [0,0,1]);
  quad(m, [x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], 1,1, [0,0,-1]);
  quad(m, [x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1], 1,1, [1,0,0]);
  quad(m, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], 1,1, [-1,0,0]);
  quad(m, [x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0], 1,1, [0,1,0]);
  quad(m, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], 1,1, [0,-1,0]);
}
