/* PEÇA: arvore-cartoon — a PROVA do carimbo plantável (D-63). Usa o construtor
   motor/arvore-cartoon.js pra montar um POOL pequeno de variantes (espécie×seed)
   e planta ~36 INSTÂNCIAS espalhadas, cada uma por matriz (posição+escala+giro).
   As instâncias reusam as mesmas malhas/texturas por referência -> o dedupe do
   carregar sobe só o pool pra GPU (floresta barata). Chão = grama padrão do
   visor (NÃO é a ilha — é a vitrine do port; integrar no mundo vem depois). */
import { criarArvores } from '../motor/arvore-cartoon.js';

export const meta = { nome: 'arvore-cartoon', tipo: 'objeto', desc: 'bosque cartoon plantável: pool de espécie×seed instanciado por matriz' };

export function construir(ctx) {
  const { hash2 } = ctx.tex;
  const { construir: umaArvore, ESPECIES, BARK } = criarArvores(ctx);

  /* pool de variantes: mistura de espécies e seeds (cada uma é UMA malha) */
  const pool = [];
  for (let i = 0; i < 10; i++) {
    const esp = ESPECIES[(hash2(i * 13 + 1, 7) * ESPECIES.length) | 0];
    pool.push(umaArvore(esp, 100 + i * 37));
  }

  /* matriz de instância: translada (x,z), escala s, gira yaw em Y (column-major) */
  const inst = (x, z, s, yaw) => { const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s; return [c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, x, 0, z, 1]; };

  /* planta um grid 6×6 com jitter; cada célula pega uma variante do pool */
  const lotes = [];
  const N = 6, STEP = 3.2;
  for (let gz = 0; gz < N; gz++) for (let gx = 0; gx < N; gx++) {
    const v = pool[(hash2(gx * 7 + 1, gz * 5) * pool.length) | 0];
    const x = (gx - (N - 1) / 2) * STEP + (hash2(gx * 3, gz * 9) - 0.5) * 1.6;
    const z = (gz - (N - 1) / 2) * STEP + (hash2(gx * 11, gz * 3) - 0.5) * 1.6;
    const s = 0.8 + hash2(gx * 5, gz * 7) * 0.55;          // porte varia
    const yaw = hash2(gx * 17, gz * 13) * Math.PI * 2;     // giro varia (o lado do sol muda)
    const M = inst(x, z, s, yaw);
    /* espécies de malha única deixam trunk OU canopy vazios (seca sem copa, raiz
       toda no canopy) — só empurra lote com malha de verdade */
    if (v.trunk.v.length) lotes.push({ mesh: v.trunk, tex: BARK, matriz: M, wind: 0.006, windF: 0.9 });                                    // MESMO wind/windF do tronco+copa
    if (v.canopy.v.length) lotes.push({ mesh: v.canopy, tex: v.tex, matriz: M, outline: v.outline, toon: v.toon, outlineInk: v.outlineInk, wind: 0.006, windF: 0.9 });
  }

  return { lotes, camera: { e: 5.5, r: 26 }, fog: [48, 40], far: 120 };
}
