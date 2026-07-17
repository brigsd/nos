/* PEÇA: casa-toras — a cabana de toras aprovada pelo ideador (D-54f).
   Toras VERTICAIS castanho-mel (tons reais, D-54f), janelas-ABERTURA com
   moldura+cruzeta+duas abas venezianas, porta estreita/alta com batente,
   telhado de telha de barro (capa-canal), assoalho interno de tábuas.
   Migrada do protótipo gpu-beauty.html pro contrato da OFICINA (D-55). */
export const meta = {
  nome: 'casa-toras',
  tipo: 'objeto',
  desc: 'cabana de toras castanho-mel com interior, abas e telha de barro',
};

export function construir(ctx) {
  const { TS, tex, geo } = ctx;
  const { texCanvas } = tex;
  const { Mesh, quad, quadUV, tri } = geo;

  /* ---------- texturas ---------- */
  /* madeira em tons REAIS (Resurrect64 não tem castanho quente — D-54f):
     mel na crista -> castanho no corpo -> sombra na borda + 2 grãos finos */
  const W_CREST = [190,138,80], W_BODY = [150,98,52], W_MID = [122,80,44],
        W_EDGE = [92,60,32], W_GRAIN = [70,45,24], W_JUNTA = [54,35,19];
  function logIdx(x, y) {
    const bx = x / TS;
    const logW = 3.4, inLog = bx / logW - Math.floor(bx / logW);   // toras de pé
    if (inLog < 0.05 || inLog > 0.95) return W_JUNTA;
    const r = Math.abs(inLog - 0.5);                               // cilindro
    let c = r < 0.14 ? W_CREST : r < 0.30 ? W_BODY : r < 0.42 ? W_MID : W_EDGE;
    if (Math.abs(inLog - 0.30) < 0.02 || Math.abs(inLog - 0.70) < 0.02) c = W_GRAIN;
    return c;
  }
  const WALL_TEX = texCanvas(16*TS, 32*TS, logIdx);
  const TRUSS_TEX = texCanvas(16*TS, 16*TS, logIdx);   // empena = mesmas toras
  const TRIM_TEX = texCanvas(16*TS, 16*TS, logIdx);    // verga/fundo do vão idem
  const FRAME_TEX = texCanvas(8*TS, 8*TS, (x, y) => (tex.fbm(x/TS*0.6, y/TS*0.6) > 0.55 ? 24 : 20));
  const SHUTTER_TEX = texCanvas(8*TS, 16*TS, (x, y) => {
    const bx = x/TS, by = y/TS;
    let i = (Math.floor(by) % 2 === 0) ? 4 : 21;                   // veneziana
    if ((by % 2) < 0.45) i = 24;
    if (bx < 0.7 || bx > 7.3 || by < 0.6 || by > 15.4) i = 24;
    return i;
  });
  /* telha de barro capa-canal: canais meia-cana descendo + fiadas sobrepostas */
  const ROOF_TEX = texCanvas(16*TS, 16*TS, (x, y) => {
    const bx = x/TS, by = y/TS;
    const chanW = 4, inCh = bx / chanW - Math.floor(bx / chanW);
    const r = Math.abs(inCh - 0.5);
    let i = r < 0.13 ? 17 : r < 0.28 ? 16 : r < 0.40 ? 21 : 14;
    const inC = by % 5;
    if (inC < 0.85) i = 14; else if (inC < 1.6) i = r < 0.32 ? 17 : 21;
    return i;
  });
  const FLOOR_TEX = texCanvas(16*TS, 16*TS, (x, y) => {
    const bx = x/TS, by = y/TS; const board = (by/4)|0;
    const n = tex.fbm(bx*2.2 + board*5, board*1.7 + by*0.3);
    let i = n > 0.62 ? 22 : n < 0.34 ? 4 : 21;
    if ((by % 4) < 0.5) i = 24;
    if (tex.hash2((board*97 + (bx*3|0)), board) < 0.05 && (by%4) > 1) i = 24;
    return i;
  });

  /* ---------- geometria ---------- */
  const HW = 1.5, WALLH = 1.2, RIDGE = 1.98, DOORW = 0.34, DOORH = 1.0, OV = 0.22;
  const walls = Mesh(), truss = Mesh(), trim = Mesh(), fram = Mesh(), shut = Mesh(), roof = Mesh(), planks = Mesh();

  /* parede com VÃO real (janela = abertura): 4 tiras + moldura + cruzeta + abas */
  function panelHole(o, R, U, N, w, h, hx, hy, hw, hh, uS, vS) {
    const pt = (lu, lv) => [o[0]+R[0]*lu+U[0]*lv, o[1]+R[1]*lu+U[1]*lv, o[2]+R[2]*lu+U[2]*lv];
    const uv = (lu, lv) => [lu/w*uS, (1-lv/h)*vS];
    const strip = (a, b, c, d) => quadUV(walls, pt(a,b), pt(c,b), pt(c,d), pt(a,d), uv(a,b), uv(c,b), uv(c,d), uv(a,d), N);
    strip(0,0, w,hy); strip(0,hy+hh, w,h); strip(0,hy, hx,hy+hh); strip(hx+hw,hy, w,hy+hh);
    const off = [N[0]*0.01, N[1]*0.01, N[2]*0.01];
    const P = (lu, lv) => { const p = pt(lu, lv); return [p[0]+off[0], p[1]+off[1], p[2]+off[2]]; };
    const bar = (a, b, c, d) => quadUV(fram, P(a,b), P(c,b), P(c,d), P(a,d), [0,1],[1,1],[1,0],[0,0], N);
    const fw = 0.05;
    bar(hx-fw,hy-fw, hx+hw+fw,hy); bar(hx-fw,hy+hh, hx+hw+fw,hy+hh+fw);
    bar(hx-fw,hy, hx,hy+hh); bar(hx+hw,hy, hx+hw+fw,hy+hh);
    const mx = hx+hw/2, my = hy+hh/2, mt = 0.022;
    bar(mx-mt,hy, mx+mt,hy+hh); bar(hx,my-mt, hx+hw,my+mt);
    const ws = hw/2 * 0.98, ang = 0.72, co = Math.cos(ang), si = Math.sin(ang);
    const aba = (hu, dir) => {
      const hb = pt(hu, hy), ht = pt(hu, hy+hh);
      const fO = [dir*R[0]*ws*co + N[0]*ws*si, dir*R[1]*ws*co + N[1]*ws*si, dir*R[2]*ws*co + N[2]*ws*si];
      const fb = [hb[0]+fO[0], hb[1]+fO[1], hb[2]+fO[2]], ft = [ht[0]+fO[0], ht[1]+fO[1], ht[2]+fO[2]];
      const e1 = [ht[0]-hb[0], ht[1]-hb[1], ht[2]-hb[2]];
      let nx = e1[1]*fO[2]-e1[2]*fO[1], ny = e1[2]*fO[0]-e1[0]*fO[2], nz = e1[0]*fO[1]-e1[1]*fO[0];
      const nl = Math.hypot(nx, ny, nz) || 1;
      quadUV(shut, hb, fb, ft, ht, [0,1],[1,1],[1,0],[0,0], [nx/nl*dir, ny/nl*dir, nz/nl*dir]);
    };
    aba(hx, -1); aba(hx+hw, 1);
  }

  quad(planks, [-HW,0.01,HW],[HW,0.01,HW],[HW,0.01,-HW],[-HW,0.01,-HW], 3,3, [0,1,0]);
  // paredes E/O do beiral, com janela-abertura
  panelHole([HW,0,HW], [0,0,-1], [0,1,0], [1,0,0], 2*HW, WALLH, 1.15, 0.40, 0.7, 0.42, 3, 1);
  panelHole([-HW,0,-HW], [0,0,1], [0,1,0], [-1,0,0], 2*HW, WALLH, 1.15, 0.40, 0.7, 0.42, 3, 1);
  // parede N (fundo) + empena
  quad(walls, [-HW,0,-HW],[HW,0,-HW],[HW,WALLH,-HW],[-HW,WALLH,-HW], 3,1, [0,0,-1]);
  tri(truss, [-HW,WALLH,-HW],[HW,WALLH,-HW],[0,RIDGE,-HW], [0,0],[1,0],[0.5,1], [0,0,-1]);
  // parede S (frente): jambas com janela, verga, batente da porta, empena
  panelHole([-HW,0,HW], [1,0,0], [0,1,0], [0,0,1], HW-DOORW, WALLH, 0.36, 0.46, 0.44, 0.38, 1, 1);
  panelHole([DOORW,0,HW], [1,0,0], [0,1,0], [0,0,1], HW-DOORW, WALLH, 0.36, 0.46, 0.44, 0.38, 1, 1);
  quad(trim, [-DOORW,DOORH,HW],[DOORW,DOORH,HW],[DOORW,WALLH,HW],[-DOORW,WALLH,HW], 1,0.2, [0,0,1]);
  { const fw = 0.09, zf = HW + 0.012,
      df = (x0,y0,x1,y1) => quadUV(fram, [x0,y0,zf],[x1,y0,zf],[x1,y1,zf],[x0,y1,zf], [0,1],[1,1],[1,0],[0,0], [0,0,1]);
    df(-DOORW-fw,0,-DOORW,DOORH+fw); df(DOORW,0,DOORW+fw,DOORH+fw); df(-DOORW-fw,DOORH,DOORW+fw,DOORH+fw); }
  tri(truss, [-HW,WALLH,HW],[HW,WALLH,HW],[0,RIDGE,HW], [0,0],[1,0],[0.5,1], [0,0,1]);
  quad(trim, [-DOORW,0,-HW+0.02],[DOORW,0,-HW+0.02],[DOORW,DOORH,-HW+0.02],[-DOORW,DOORH,-HW+0.02], 1,1, [0,0,1]);
  // telhado duas águas com beiral
  const EZ = HW + OV, EX = HW + OV;
  quad(roof, [0,RIDGE,-EZ],[0,RIDGE,EZ],[-EX,WALLH,EZ],[-EX,WALLH,-EZ], 3.4,1.6, [-0.7,0.7,0]);
  quad(roof, [0,RIDGE,EZ],[0,RIDGE,-EZ],[EX,WALLH,-EZ],[EX,WALLH,EZ], 3.4,1.6, [0.7,0.7,0]);

  return {
    lotes: [
      { mesh: planks, tex: FLOOR_TEX },
      { mesh: walls, tex: WALL_TEX },
      { mesh: truss, tex: TRUSS_TEX },
      { mesh: trim, tex: TRIM_TEX },
      { mesh: fram, tex: FRAME_TEX },
      { mesh: shut, tex: SHUTTER_TEX },
      { mesh: roof, tex: ROOF_TEX },
    ],
  };
}
