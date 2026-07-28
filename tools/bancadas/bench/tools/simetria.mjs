/* simetria [malha] — a peça que DECLARA simetria de fato é simétrica? Opt-in pelo
   envelope: só roda se `meta.simetria` estiver declarado ('x', 'y' ou 'z' — o eixo
   cuja coordenada é NEGADA no espelho). Peça que não declara é IGNORADA (uma
   árvore não é simétrica, e não deve virar ruído) — fail-open no que não foi
   prometido, cobrado no que foi.

   POR QUE EXISTE (D-128): o experimento do TETO (docs/historico/TETO.md) pediu uma moto
   SIMÉTRICA e a peça saiu com 12 de 492 vértices sem par espelhado (desvio máx
   4.45e-3, a armadilha de frame do `loft` — ver o cabeçalho da op). NENHUM gate
   pegava: nem `auditar`, nem `porteiro`, nem `criar`. O desvio é sub-visual (4,5
   mm numa peça de 2,8 m), então o olho também não pega — é exatamente a classe
   "criou, mas não percebeu o defeito" que pede MÉTRICA, não mais um render.

   COMO MEDE: lê as posições do mesh JÁ CONSTRUÍDO (todos os lotes, pos3 nos
   floats 0..2 de cada vértice de 8) — então mede o que o RENDER de fato recebe,
   não o neutro. Deduplica por posição arredondada e, pra cada posição, procura a
   parceira com a coordenada do eixo NEGADA. Vértice EM CIMA do plano (coord ~0) é
   seu próprio par e nunca acusa.

   TOLERÂNCIA: `EPS = 1e-6` — folga generosa sobre ruído de float (o próprio
   arredondamento de dedup é mais grosso que isso), apertada o bastante pra pegar
   o 4.45e-3 do achado real, ~3 ordens de grandeza acima. Um espelho de verdade
   (`espelha`, que nega a coordenada exata) casa em 0. */
export const id = 'simetria';
export const dom = 'malha';

const EPS = 1e-6;
const CASA = 1e6;   // grade de dedup: 6 casas decimais (mais grossa que EPS de propósito — dedup não pode fundir vértices distintos)
const k3 = (x, y, z) => `${Math.round(x * CASA)},${Math.round(y * CASA)},${Math.round(z * CASA)}`;

export function analisar(built, ctx) {
  const eixo = ctx && ctx.meta && ctx.meta.simetria;
  if (eixo == null) return [];                                     // não declarou: nada a cobrar
  const ix = { x: 0, y: 1, z: 2 }[eixo];
  if (ix == null) return [{ sev: 'erro', msg: `meta.simetria = '${eixo}' inválido (só 'x'/'y'/'z')` }];

  // posições ÚNICAS de todos os lotes (o mesh é sopa de triângulos: cada canto repetido)
  const pos = new Map();
  for (const L of built.lotes || []) {
    const v = L.mesh && L.mesh.v;
    if (!v || v.length % 8 !== 0) continue;                        // malha malformada é problema do lint-de-malha, não deste crítico
    for (let i = 0; i + 8 <= v.length; i += 8) {
      const x = v[i], y = v[i + 1], z = v[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;   // NaN é do lint-de-malha
      pos.set(k3(x, y, z), [x, y, z]);
    }
  }
  if (!pos.size) return [];

  let semPar = 0, desvioMax = 0, exemplo = null;
  for (const p of pos.values()) {
    if (Math.abs(p[ix]) <= EPS) continue;                          // no plano do espelho: é o próprio par
    const espelhado = p.slice(); espelhado[ix] = -p[ix];
    if (pos.has(k3(espelhado[0], espelhado[1], espelhado[2]))) continue;   // par EXATO na grade de dedup

    // sem par exato: acha o mais próximo do refletido e mede o quanto falta
    let melhor = Infinity;
    for (const q of pos.values()) {
      const d = Math.hypot(q[0] - espelhado[0], q[1] - espelhado[1], q[2] - espelhado[2]);
      if (d < melhor) melhor = d;
    }
    if (melhor > EPS) {
      semPar++;
      if (melhor > desvioMax) { desvioMax = melhor; exemplo = p; }
    }
  }

  if (!semPar) return [];
  return [{
    sev: 'erro',
    msg: `declara meta.simetria:'${eixo}' mas ${semPar} de ${pos.size} posições não têm par espelhado ` +
         `(desvio máx ${desvioMax.toExponential(2)}, ex.: [${exemplo.map((c) => c.toFixed(4)).join(', ')}]) — ` +
         `modele UMA metade e use \`espelha\`; caminho simétrico no \`loft\` NÃO garante malha simétrica (D-128)`,
  }];
}
