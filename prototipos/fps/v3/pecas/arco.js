/* PEÇA: arco — o ARCO DE ENTRADA reconstruído com GEOMETRIA DE VERDADE (D-62→).
   No v2 ele era um billboard chapado com PROFUNDIDADE FALSA (b.depth: até 40
   fatias empilhadas por coluna = overdraw puro — a "gambiarra" que o ideador
   flagrou). Aqui, no v3/GPU, a profundidade é grátis: os pilares são CAIXAS
   de 4 faces reais (+ topo/base) e o arco abatido é uma FAIXA extrudada com
   espessura de verdade (frente/trás/intradorso/extradorso). Nenhuma fatia.
   UV ancorado ao tamanho da face (não estica em face alta — lição do monólito).
   Linguagem: pedra dos antigos tomada por musgo (sci-fi decaído, D-57). */
export const meta = {
  nome: 'arco',
  tipo: 'objeto',
  desc: 'arco de entrada: pilares 4-faces + arco abatido com profundidade REAL (sem gambiarra)',
};

export function construir(ctx) {
  const { tex, geo } = ctx;
  const { texCanvas, fbm, hash2 } = tex;
  const { Mesh, quad } = geo;

  /* ---------- texturas (POT p/ REPEAT no WebGL1) ---------- */
  /* pedra dos antigos: fiadas ciclópicas com argamassa, grão, tufos de musgo */
  const STONE = texCanvas(32, 32, (x, y) => {
    const course = (y / 8) | 0;
    const mortar = (y % 8 === 0) || (((x + (course & 1) * 4) % 9) === 0);
    if (mortar) return 2;                                  // junta/argamassa escura
    const n = fbm(x * 0.6 + course * 2, y * 0.5 + 3);
    let i = n > 0.72 ? 8 : n > 0.42 ? 7 : 6;               // grão claro→médio
    if (fbm(x * 0.3 + 11, y * 0.3 + 7) > 0.82) i = 35;     // tufo de musgo (tomado por mato)
    return i;
  });
  /* pedra-chave: mais clara (pedra nova, menos erodida) com fio de verdigris */
  const KEY = texCanvas(32, 32, (x, y) => {
    const n = fbm(x * 0.55 + 2, y * 0.5);
    let i = n > 0.6 ? 8 : n > 0.3 ? 7 : 6;
    if (x === 15 || x === 16) i = 41;                      // veio de verdigris escorrendo
    if ((y % 10) === 0) i = 2;
    return i;
  });

  const T = 0.34;   // unidades de mundo por repetição de textura (fiada ~quadrada)

  /* caixa com UV ancorado ao TAMANHO da face (tile por T unidades) — não estica
     numa face alta, ao contrário do box() padrão (uS=vS=1). 6 faces reais. */
  const caixaUV = (m, x0, y0, z0, x1, y1, z1) => {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const u = (a) => a / T;
    quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], u(dx), u(dy), [0, 0, 1]);   // frente +z
    quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], u(dx), u(dy), [0, 0, -1]);  // trás  -z
    quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], u(dz), u(dy), [1, 0, 0]);   // dir   +x
    quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], u(dz), u(dy), [-1, 0, 0]);  // esq   -x
    quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], u(dx), u(dz), [0, 1, 0]);   // topo  +y
    quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], u(dx), u(dz), [0, -1, 0]);  // base  -y
  };

  /* ---------- PILARES: caixas de 4 faces, com plinto (base) e capitel (topo) ---------- */
  const pedra = Mesh();
  const D = 0.17;               // meia-profundidade (Z) do arco todo
  const pilW = 0.34;            // largura (X) do fuste
  const pilH = 2.15;            // altura do arranque do arco
  const cx = [-0.85, 0.85];     // centro X de cada pilar
  for (const c of cx) {
    caixaUV(pedra, c - pilW / 2, 0.16, -D, c + pilW / 2, pilH, D);                 // fuste
    caixaUV(pedra, c - pilW / 2 - 0.05, 0, -D - 0.05, c + pilW / 2 + 0.05, 0.18, D + 0.05); // plinto (base larga)
    caixaUV(pedra, c - pilW / 2 - 0.04, pilH - 0.14, -D - 0.04, c + pilW / 2 + 0.04, pilH, D + 0.04); // capitel
  }

  /* ---------- ARCO ABATIDO: faixa extrudada com espessura REAL ----------
     intradorso (yBot) sobe do arranque (yS) até a coroa no centro (arco raso);
     a faixa segue com espessura constante 'band'. Frente/trás/intradorso/
     extradorso são quads de verdade — circundar mostra a espessura, sem fatia. */
  const Ain = 0.68;            // arranque: quina INTERNA do pilar (o arco nasce colado ali)
  const Aout = 1.02;           // borda externa do pilar (a faixa assenta RETO sobre o impost)
  const yS = pilH;             // arranque = topo do capitel
  const rise = 0.40;           // quanto a coroa sobe no meio (abatido = pouco)
  const band = 0.34;           // espessura (altura) da faixa
  const N = 18;
  /* intradorso: RETO (yS) sobre o pilar de Ain→Aout, sobe até a coroa só no vão
     — mata a fresta triangular de antes (o arco subia já da borda externa e
     deixava um vão entre o topo do pilar e a barriga do arco). */
  const yBot = (x) => { const ax = Math.abs(x); return ax >= Ain ? yS : yS + rise * (1 - (ax / Ain) * (ax / Ain)); };
  const pts = [];
  for (let i = 0; i <= N; i++) { const x = -Aout + (2 * Aout) * (i / N); pts.push({ x, b: yBot(x), t: yBot(x) + band }); }
  const seg = (2 * Aout) / N;
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    const uu = seg / T;                                       // repetições de textura no segmento
    const vb = band / T;
    // frente (+z)
    quad(pedra, [a.x, a.b, D], [b.x, b.b, D], [b.x, b.t, D], [a.x, a.t, D], uu, vb, [0, 0, 1]);
    // trás (-z)
    quad(pedra, [b.x, b.b, -D], [a.x, a.b, -D], [a.x, a.t, -D], [b.x, b.t, -D], uu, vb, [0, 0, -1]);
    // intradorso (por baixo, o vão) — normal p/ baixo/dentro
    const nlen = Math.hypot(b.b - a.b, seg) || 1;
    const nin = [(b.b - a.b) / nlen, -seg / nlen, 0];         // aponta pra baixo/fora, perpendicular à curva (era -x = invertido)
    quad(pedra, [a.x, a.b, D], [a.x, a.b, -D], [b.x, b.b, -D], [b.x, b.b, D], 2 * D / T, uu, nin);
    // extradorso (por cima) — normal p/ cima
    quad(pedra, [a.x, a.t, -D], [a.x, a.t, D], [b.x, b.t, D], [b.x, b.t, -D], 2 * D / T, uu, [0, 1, 0]);
  }

  /* ---------- PEDRA-CHAVE: bloco central saliente (frente/trás e pra cima) ---------- */
  const chave = Mesh();
  const kBot = yBot(0) - 0.06, kTop = yBot(0) + band + 0.22;
  caixaUV(chave, -0.15, kBot, -D - 0.06, 0.15, kTop, D + 0.06);

  return {
    camera: { e: 1.8, r: 5.6 },
    lotes: [
      { mesh: pedra, tex: STONE },
      { mesh: chave, tex: KEY },
    ],
  };
}
