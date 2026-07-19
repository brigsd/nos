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
};
