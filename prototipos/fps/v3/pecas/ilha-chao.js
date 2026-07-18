/* PEÇA: ilha-chao — o primeiro retalho de CHÃO do v3 (port da natureza v2).
   Ilha flutuante NA ESCALA DA V2 (o mundo é uma grade 64×64 tiles; a ilha tem
   ~56 unidades de diâmetro) sobre o mar de nuvens. Decisões do ideador (D-57→):
   sem carreiro; SEM a parte de baixo (o jogador nunca a vê) — só uma fita de
   terra na borda pra ilha não virar papel; sem pólen (em paisagem lia como
   enxame). A grama volta aos 64px/UNIDADE da v2 (receita do genGrassTile:
   mancha de sol + pinceladas diagonais + touceiras + flores), o lago ganha
   praia de areia, e a névoa/far são da peça (a padrão esmagava tudo). */
export const meta = {
  nome: 'ilha-chao',
  tipo: 'chao',
  desc: 'a ilha flutuante na escala v2: grama, lago com praia e a beirada sobre o mar de nuvens',
};

export function construir(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, vnoise, hash2 } = tex;
  const { Mesh, quad, quadUV, tri } = geo;
  const TAU = Math.PI * 2;

  /* ---------- texturas (per-pixel, paleta Resurrect64) ---------- */
  /* GRAMA na densidade da v2: 256px cobrindo 4×4 unidades (64px/unidade).
     Receita do genGrassTile portada: base mosqueada em 2 escalas + pinceladas
     curtas na diagonal do vento + touceiras com raiz + flores esparsas.
     Stamps imperativos exigem buffer próprio (texCanvas é per-pixel). */
  const GT = 256;
  const gbuf = new Int16Array(GT * GT).fill(32);
  for (let y = 0; y < GT; y++) for (let x = 0; x < GT; x++) {
    /* base CALMA: manchas largas de sol/sombra, brilho fino RARO (com o ruído
       consertado os limiares antigos viravam confete a distância) */
    const broad = vnoise(x / 30 + 11, y / 30 - 3);
    const fine = vnoise(x / 5 - 7, y / 5 + 17);
    let i = 32;
    if (broad > 0.72) i = 33;
    else if (broad < 0.30 && fine > 0.62) i = 31;  // sombra rasteira
    if (fine > 0.93) i = 33;                       // fiapo claro raro
    gbuf[y * GT + x] = i;
  }
  const R = (i, k) => hash2(i * 7 + k, k * 13 + 5);          // stream de rnd
  for (let i = 0; i < 2000; i++) {                           // pinceladas (\)
    const sx = (R(i, 1) * GT) | 0, sy = (R(i, 2) * GT) | 0, len = 2 + (R(i, 3) * 4) | 0;
    const r = R(i, 4), tone = r < 0.55 ? 31 : r < 0.85 ? 27 : 33;
    for (let k = 0; k < len; k++) gbuf[(((sy - (k >> 1)) & (GT - 1)) * GT + ((sx + k) & (GT - 1)))] = tone;
  }
  for (let i = 0; i < 150; i++) {                            // touceiras c/ raiz
    const cx = (R(i, 5) * GT) | 0, cy = (R(i, 6) * GT) | 0;
    for (let k = 0; k < 5; k++) {
      const x = (cx + ((R(i * 5 + k, 7) * 3) | 0) - 1) & (GT - 1), y = (cy + ((R(i * 5 + k, 8) * 3) | 0)) & (GT - 1);
      gbuf[y * GT + x] = k === 0 ? 30 : k < 3 ? 31 : 27;
    }
  }
  for (let i = 0; i < 40; i++) {                             // flores 2×2 + miolo
    const fx = 2 + (R(i, 9) * (GT - 4)) | 0, fy = 2 + (R(i, 10) * (GT - 4)) | 0;
    const petal = [9, 57, 18, 53][(R(i, 11) * 4) | 0];
    gbuf[fy * GT + fx] = petal; gbuf[fy * GT + fx + 1] = petal;
    gbuf[(fy + 1) * GT + fx] = petal; gbuf[(fy + 1) * GT + fx + 1] = 28;
  }
  const GRASS = texCanvas(GT, GT, (x, y) => gbuf[y * GT + x]);

  /* fita da borda: TERRA sob a grama (oliva/pedra), não breu */
  const ROCK = texCanvas(128, 64, (x, y) => {
    const n = fbm(x / 9, y / 9), m = fbm(x / 4 + 7, y / 4 + 2);
    let i = n > 0.62 ? 25 : n > 0.40 ? 24 : 34;
    if (m > 0.74) i = 2;                          // pedra encravada
    if (m < 0.16) i = 1;                          // fenda
    if (y < 5 + fbm(x / 6, 9) * 7) i = 24;        // raiz de terra sob a grama
    return i;
  });
  /* LAGO na escala v2: raso ciano na orla -> teal fundo, crista, orla clara */
  const WATER = texCanvas(256, 256, (x, y) => {
    const dx = (x + 0.5) / 256 - 0.5, dy = (y + 0.5) / 256 - 0.5;
    const d = Math.hypot(dx, dy) * 2;                 // 0 centro .. ~1 borda
    const w = fbm(x / 13 + 2, y / 13 + 4);
    let i = d > 0.93 ? 43 : d > 0.80 ? 42 : d > 0.58 ? 41 : d > 0.34 ? 40 : 39;
    if (w > 0.70 && ((x + y) & 3) === 0) i = 43;      // brilho de crista
    return i;
  });
  /* PRAIA: anel de areia quente entre a grama e a água (a margem da v2) */
  const SAND = texCanvas(128, 128, (x, y) => {
    const n = fbm(x / 7 + 5, y / 7), h = hash2(x * 3, y * 3);
    let i = n > 0.62 ? 23 : 4;
    if (h < 0.02) i = 3; else if (h > 0.985) i = 63;  // conchinha/grão
    return i;
  });
  /* mar de nuvens: cumes brancos e vales azuis (amplitude esticada — o fbm
     cru mal cruzava os limiares e virava plano liso) */
  const CLOUD = texCanvas(256, 256, (x, y) => {
    const bx = x / 36, by = y / 36;
    const raw = fbm(bx + 3, by + 7) * 0.62 + fbm(bx * 2.6 + 11, by * 2.6 + 1) * 0.38;
    const n = (raw - 0.5) * 2.6 + 0.5;
    return n > 0.68 ? 9 : n > 0.46 ? 8 : n > 0.26 ? 48 : 46;
  });

  /* ---------- geometria ---------- */
  const N = 96, R0 = 28;                 // ~56u de diâmetro = a ilha da v2
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const faceNorm = (a, b, c, ref) => {
    const u = sub(b, a), v = sub(c, a);
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (ref && (nx * ref[0] + nz * ref[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx, ny, nz];
  };

  // contorno ORGÂNICO + saia de terra (funda o bastante pra não ler papel)
  const rim = [], skirt = [];
  for (let i = 0; i <= N; i++) {
    const a = (i % N) / N * TAU, c = Math.cos(a), s = Math.sin(a);
    const Rr = R0 * (0.82 + 0.18 * fbm(c * 1.6 + 3.1, s * 1.6 + 3.1));
    rim.push([c * Rr, 0, s * Rr]);
    skirt.push([c * Rr * 0.965, -2.4, s * Rr * 0.965]);
  }

  const top = Mesh(), rock = Mesh(), water = Mesh(), sand = Mesh(), cloud = Mesh();

  // capa de grama (leque do centro à borda) — 1 repeat de textura a cada 4u
  const uvG = p => [p[0] / 4, p[2] / 4];
  for (let i = 0; i < N; i++)
    tri(top, [0, 0, 0], rim[i], rim[i + 1], uvG([0, 0, 0]), uvG(rim[i]), uvG(rim[i + 1]), [0, 1, 0]);

  // fita da borda — normal inclinada pro céu (luz de céu, não breu na sombra)
  for (let i = 0; i < N; i++) {
    const p0 = rim[i], p1 = rim[i + 1], p2 = skirt[i + 1], p3 = skirt[i];
    let [nx, ny, nz] = faceNorm(p0, p1, p2, [p0[0] + p2[0], 0, p0[2] + p2[2]]);
    ny += 0.55; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const u0 = i / N * 26, u1 = (i + 1) / N * 26;
    quadUV(rock, p0, p1, p2, p3, [u0, 0], [u1, 0], [u1, 1], [u0, 1], [nx, ny, nz]);
  }

  // LAGO com PRAIA: anel de areia (grama->água) + disco d'água por cima
  const lox = 10, loz = -8, lr = 6.5, sandR = lr + 1.6;
  const ringUV = (ang, rr, base) => [0.5 + 0.5 * Math.cos(ang) * rr / base, 0.5 + 0.5 * Math.sin(ang) * rr / base];
  for (let i = 0; i < N; i++) {
    const a = i / N * TAU, a2 = (i + 1) / N * TAU;
    // areia: anel de lr*0.8 (por baixo da água) até sandR
    const pA = r0 => [lox + Math.cos(a) * r0, 0.06, loz + Math.sin(a) * r0];
    const pB = r0 => [lox + Math.cos(a2) * r0, 0.06, loz + Math.sin(a2) * r0];
    quadUV(sand, pA(lr * 0.8), pB(lr * 0.8), pB(sandR), pA(sandR),
      ringUV(a, lr * 0.8, sandR), ringUV(a2, lr * 0.8, sandR), ringUV(a2, sandR, sandR), ringUV(a, sandR, sandR), [0, 1, 0]);
    // água
    const p1 = [lox + Math.cos(a) * lr, 0.14, loz + Math.sin(a) * lr];
    const p2 = [lox + Math.cos(a2) * lr, 0.14, loz + Math.sin(a2) * lr];
    tri(water, [lox, 0.14, loz], p1, p2,
      [0.5, 0.5], [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)], [0.5 + 0.5 * Math.cos(a2), 0.5 + 0.5 * Math.sin(a2)],
      [0, 1, 0]);
  }

  // mar de nuvens: plano ENORME bem abaixo; derrete no céu ao longe (fog).
  // uS=18 -> ~24u por repetição (com 6 a área visível caía DENTRO de um blob)
  const CY = -16, CX = 220;
  quad(cloud, [-CX, CY, CX], [CX, CY, CX], [CX, CY, -CX], [-CX, CY, -CX], 18, 18, [0, 1, 0]);

  return {
    palco: false,       // ESTA peça é o chão
    particulas: false,  // sem pólen em paisagem
    fog: [120, 300],    // névoa recuada: o mar de nuvens fica VISÍVEL (com a
                        // padrão ele derretia inteiro no céu — provado no A/B)
    far: 320,           // o mar de nuvens não pode ser cortado pelo far padrão
    camera: { e: 16, r: 46 },  // órbita padrão ALTA (a de objeto nasce dentro da ilha)
    lotes: [
      { mesh: cloud, tex: CLOUD },
      { mesh: rock, tex: ROCK },
      { mesh: top, tex: GRASS },
      { mesh: sand, tex: SAND },
      { mesh: water, tex: WATER },
    ],
  };
}
