/* mat4 mínimo do motor v3 (D-55) — colunas-major, como o WebGL espera */
export const m4 = {
  ident() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
    return [t / asp,0,0,0, 0,t,0,0, 0,0,(f + n) * nf,-1, 0,0,2 * f * n * nf,0]; },
  ortho(l, r, b, t, n, f) { return [2/(r-l),0,0,0, 0,2/(t-b),0,0, 0,0,-2/(f-n),0, -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]; },
  mul(a, b) { const o = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
    return o; },
  lookAt(e, ct, up) {
    let zx = e[0]-ct[0], zy = e[1]-ct[1], zz = e[2]-ct[2]; let l = Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
    let xx = up[1]*zz-up[2]*zy, xy = up[2]*zx-up[0]*zz, xz = up[0]*zy-up[1]*zx; l = Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
    const yx = zy*xz-zz*xy, yy = zz*xx-zx*xz, yz = zx*xy-zy*xx;
    return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
      -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1]; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
  translate(x, y, z) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); },
  /* inversa 4×4 por cofatores. O TAA precisa dela pra desfazer a projeção: só
     com a inversa dá pra sair de (pixel + profundidade) de volta pro ponto do
     mundo e perguntar onde ele estava no quadro anterior.
     Devolve null se a matriz for singular — quem chama decide o que fazer, em
     vez de propagar NaN silenciosamente pelo resto do quadro. */
  inv(m) {
    const c0 = m[0]*m[5]-m[1]*m[4], c1 = m[0]*m[6]-m[2]*m[4], c2 = m[0]*m[7]-m[3]*m[4];
    const c3 = m[1]*m[6]-m[2]*m[5], c4 = m[1]*m[7]-m[3]*m[5], c5 = m[2]*m[7]-m[3]*m[6];
    const c6 = m[8]*m[13]-m[9]*m[12], c7 = m[8]*m[14]-m[10]*m[12], c8 = m[8]*m[15]-m[11]*m[12];
    const c9 = m[9]*m[14]-m[10]*m[13], c10 = m[9]*m[15]-m[11]*m[13], c11 = m[10]*m[15]-m[11]*m[14];
    const det = c0*c11 - c1*c10 + c2*c9 + c3*c8 - c4*c7 + c5*c6;
    if (!det) return null;
    const d = 1 / det;
    return new Float32Array([
      ( m[5]*c11 - m[6]*c10 + m[7]*c9) * d, (-m[1]*c11 + m[2]*c10 - m[3]*c9) * d,
      ( m[13]*c5 - m[14]*c4 + m[15]*c3) * d, (-m[9]*c5 + m[10]*c4 - m[11]*c3) * d,
      (-m[4]*c11 + m[6]*c8 - m[7]*c7) * d, ( m[0]*c11 - m[2]*c8 + m[3]*c7) * d,
      (-m[12]*c5 + m[14]*c2 - m[15]*c1) * d, ( m[8]*c5 - m[10]*c2 + m[11]*c1) * d,
      ( m[4]*c10 - m[5]*c8 + m[7]*c6) * d, (-m[0]*c10 + m[1]*c8 - m[3]*c6) * d,
      ( m[12]*c4 - m[13]*c2 + m[15]*c0) * d, (-m[8]*c4 + m[9]*c2 - m[11]*c0) * d,
      (-m[4]*c9 + m[5]*c7 - m[6]*c6) * d, ( m[0]*c9 - m[1]*c7 + m[2]*c6) * d,
      (-m[12]*c3 + m[13]*c1 - m[14]*c0) * d, ( m[8]*c3 - m[9]*c1 + m[10]*c0) * d,
    ]);
  },
};
