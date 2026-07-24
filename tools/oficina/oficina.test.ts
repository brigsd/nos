/* Vitest do NÚCLEO da OFICINA (passo 1): prova os invariantes de identidade —
   numeração determinística e POSICIONAL (re-rodar dá ids idênticos), identidade
   estável sob mudança de PARAM (mudar `raio` não renumera), mudança de TOPO
   renumera E reporta órfãos (lei "órfão grita, nunca corrompe"), e a mescla
   de/para (a interação mais delicada, a primeira a ganhar teste de verdade). */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — módulo .js do motor v3 (sem tipos; roda puro no vitest/esbuild)
import { nucleo, neutroCanonico, adaptarV3, executar, colisaoDe, BLOCO, montarAnimar, avaliarChaves, bindPoseOssos } from '../../prototipos/fps/v3/motor/oficina.js';

const P = (extra: any[] = []) => [
  ['cilindro', { id: 0, raio: 'r', altura: 'h', lados: 'lados' }],
  ...extra,
];
const CILN = { r: 0.5, h: 1 };
const T8 = { lados: 8 };

describe('numeração determinística', () => {
  it('re-rodar a mesma lista dá o neutro idêntico (ids, posições, faces)', () => {
    const passos = P([
      ['extruda', { face: 0, dist: 0.2 }],
      ['moveV', { v: 1001, d: [0, 0.1, 0] }],
      ['mescla', { de: [1001], para: 1002 }],
      ['pincel', { modo: 'face', faces: [1, 2], cor: '#123456' }],
      ['solido', { faces: [8, 9] }],
    ]);
    const a = neutroCanonico(nucleo(passos, CILN, T8));
    const b = neutroCanonico(nucleo(passos, CILN, T8));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('vértices criados no meio do caminho (extruda) partem da POSIÇÃO do passo, não de PARAMS', () => {
    const passos = [['cubo', { id: 0, lado: 's' }], ['extruda', { face: 1, dist: 'd' }]];
    const pequeno = nucleo(passos, { s: 1, d: 0.2 }, {});
    const grande = nucleo(passos, { s: 3, d: 0.9 }, {});
    // ids IDÊNTICOS apesar de PARAMS diferentes; o passo 1 (índice 1) numera a partir de 1*BLOCO
    expect([...pequeno.V.keys()].sort((x, y) => x - y)).toEqual([...grande.V.keys()].sort((x, y) => x - y));
    expect(pequeno.V.has(BLOCO)).toBe(true);      // primeiro vértice novo = 1*BLOCO
    // ...mas as posições MUDAM (de fato reconstruiu)
    expect(JSON.stringify([...pequeno.V.values()])).not.toBe(JSON.stringify([...grande.V.values()]));
  });
});

describe('identidade estável sob mudança de PARAM', () => {
  it('mudar raio/altura NÃO renumera nada — mesmos ids e mesma topologia, só posições diferem', () => {
    const passos = P([['pincel', { modo: 'face', faces: [0, 1], cor: '#abcdef' }], ['liso', { faces: [2] }]]);
    const base = neutroCanonico(nucleo(passos, { r: 0.5, h: 1 }, T8));
    const largo = neutroCanonico(nucleo(passos, { r: 0.9, h: 1.7 }, T8));
    expect(largo.V.map((row: any[]) => row[0])).toEqual(base.V.map((row: any[]) => row[0]));
    expect(largo.F).toEqual(base.F);                                   // faces (ids, cantos, atributos) idênticas
    expect(JSON.stringify(largo.V)).not.toBe(JSON.stringify(base.V));  // posições diferem
  });
});

describe('mudança de TOPO renumera e reporta órfãos', () => {
  it('lados 8 -> 12 muda a CONTAGEM e o papel dos ids (renumera)', () => {
    const l8 = neutroCanonico(nucleo(P(), CILN, { lados: 8 }));
    const l12 = neutroCanonico(nucleo(P(), CILN, { lados: 12 }));
    expect(l8.V.length).toBe(16);
    expect(l12.V.length).toBe(24);
    // o id 8 é do anel de CIMA quando lados=8 (y=h) e do anel de BAIXO quando lados=12 (y=0)
    const y8 = l8.V.find((r: any[]) => r[0] === 8)![2];
    const y12 = l12.V.find((r: any[]) => r[0] === 8)![2];
    expect(y8).not.toBe(y12);
  });

  it('um passo que aponta pra um id que a nova TOPO não tem vira ÓRFÃO — grita, não corrompe', () => {
    const passos = P([['moveV', { v: 18, d: [0, 0.1, 0] }]]);   // v18 = anel de cima só existe com lados>=...
    const bom = nucleo(passos, CILN, { lados: 12 });            // com 12 lados, id 18 é vértice vivo
    expect(bom.orfaos).toHaveLength(0);
    const orf = nucleo(passos, CILN, { lados: 8 });             // com 8 lados, maior id é 15 -> 18 não existe
    expect(orf.orfaos).toHaveLength(1);
    expect(orf.orfaos[0]).toMatchObject({ passo: 1, op: 'moveV', ref: 18 });
    expect(orf.V.size).toBe(16);                                // a malha do cilindro segue INTACTA
  });

  it('id de primitiva incompatível com a posição grita (nunca vira segunda-verdade silenciosa)', () => {
    const n = nucleo([['cilindro', { id: 999, raio: 'r', altura: 'h', lados: 'lados' }]], CILN, T8);
    expect(n.orfaos.some((o: any) => o.op === 'cilindro' && o.motivo.includes('posição'))).toBe(true);
  });
});

describe('mescla de/para (a interação mais delicada)', () => {
  it('some com `de`, mantém `para`, re-aponta as faces e apaga a face de área-zero', () => {
    // cubo, extruda o topo (face 1) -> tampa 1000..1003 + 4 paredes; mescla dois cantos DA TAMPA no terceiro
    const passos = [['cubo', { id: 0, lado: 1 }], ['extruda', { face: 1, dist: 0.3 }], ['mescla', { de: [1000, 1001], para: 1002 }]];
    const n = nucleo(passos, {}, {});
    expect(n.V.has(1000)).toBe(false);
    expect(n.V.has(1001)).toBe(false);
    expect(n.V.has(1002)).toBe(true);
    for (const f of n.F.values()) expect(f.vs).not.toContain(1000);   // nenhuma face aponta pro mesclado
    expect(n.F.has(1)).toBe(false);                                    // a tampa virou área-zero e SUMIU
    expect(n.merges).toEqual([{ de: [1000, 1001], para: 1002 }]);      // de/para GRAVADOS
  });

  it('referência posterior a um id mesclado vira órfão', () => {
    const passos = [['cubo', { id: 0, lado: 1 }], ['mescla', { de: [1], para: 0 }], ['moveV', { v: 1, d: [0, 1, 0] }]];
    const n = nucleo(passos, {}, {});
    expect(n.V.has(1)).toBe(false);
    expect(n.orfaos.some((o: any) => o.op === 'moveV' && o.ref === 1)).toBe(true);
  });
});

describe('núcleo -> adaptador (fronteira) e colisão', () => {
  const fakeCtx = { tex: { texCanvas: (w: number, h: number) => ({ width: w, height: h }) }, m4: { ident: () => new Float32Array(16) } };
  /* ctx que CAPTURA a fn do texCanvas -> deixa AMOSTRAR o texel (u,v em 0..1 do
     atlas) como o motor faz (NEAREST). É como o adaptador roda headless: a
     fábrica devolve o canvas de mentira e o amostrador lê a cor de verdade. */
  function ctxAmostra() {
    let T: any = null;
    const ctx = { tex: { texCanvas: (w: number, h: number, fn: any) => (T = { width: w, height: h, fn }) }, m4: { ident: () => new Float32Array(16) } };
    const amostra = (u: number, v: number) => { const x = Math.min(T.width - 1, Math.max(0, Math.floor(u * T.width))); const y = Math.min(T.height - 1, Math.max(0, Math.floor(v * T.height))); return T.fn(x, y); };
    return { ctx, amostra };
  }
  const hx = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const centro = (il: any): [number, number] => [il.x + il.w / 2, il.y + il.h / 2];
  const intersecta = (A: any, B: any) => !(A.x + A.w <= B.x || B.x + B.w <= A.x || A.y + A.h <= B.y || B.y + B.h <= A.y);

  it('executar devolve lotes com mesh de triângulos soltos (8 floats/vértice)', () => {
    const obj = executar([['cubo', { id: 0, lado: 1 }]], {}, {}, fakeCtx);
    expect(obj.lotes).toHaveLength(1);
    // cubo: 6 faces × (4-2 tris) × 3 vértices × 8 floats = 288
    expect(obj.lotes[0].mesh.v.length).toBe(288);
    expect(obj.lotes[0].mesh.v.length % 8).toBe(0);
  });

  it('cor por face chega por TEXTURA + UV (não como atributo do vértice): amostrar a ilha da face dá a cor dela', () => {
    const { ctx, amostra } = ctxAmostra();
    const r: any = adaptarV3(nucleo([['cubo', { id: 0, lado: 1 }], ['pincel', { modo: 'face', faces: [0], cor: '#ff0000' }]], {}, {}), ctx);
    expect(r.lotes[0].mesh.v.length % 8).toBe(0);   // 8 floats/vértice: pos3 uv2 nrm3 — a cor NÃO é atributo do vértice (12a: um lote só, sem material)
    // a face 0 (pintada) amostra VERMELHO no centro da SUA ilha; uma face sem pincel amostra a madeira neutra
    const c0 = centro(r.atlas.daFace(0).ilha), c1 = centro(r.atlas.daFace(1).ilha);
    expect(amostra(c0[0] / r.atlas.W, c0[1] / r.atlas.H)).toEqual([255, 0, 0]);
    expect(amostra(c1[0] / r.atlas.W, c1[1] / r.atlas.H)).toEqual(hx('#9a8f80'));   // COR_PADRAO
  });

  it('ATLAS por face: cada face ganha uma ILHA PRÓPRIA e NENHUMA se sobrepõe (o furo da caixa global: topo +y e fundo -y em ilhas distintas)', () => {
    const { ctx } = ctxAmostra();
    const r: any = adaptarV3(nucleo([['cilindro', { id: 0, raio: 'r', altura: 'h', lados: 'l' }]], { r: 1, h: 2 }, { l: 8 }), ctx);
    const rects = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => r.atlas.daFace(id).ilha);
    let colisoes = 0;
    for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) if (intersecta(rects[a], rects[b])) colisoes++;
    expect(colisoes).toBe(0);   // NENHUM par de ilhas se intersecta
    // fundo (face 8, normal -y) e topo (face 9, normal +y): na caixa GLOBAL empilham no mesmo XZ; no atlas, ilhas distintas
    expect(intersecta(r.atlas.daFace(8).ilha, r.atlas.daFace(9).ilha)).toBe(false);
  });

  it('sem sobreposição PROVADO por independência: pintar o fundo (-y) de vermelho NÃO altera os texels do topo (+y)', () => {
    const { ctx, amostra } = ctxAmostra();
    const r: any = adaptarV3(nucleo([['cilindro', { id: 0, raio: 'r', altura: 'h', lados: 'l' }], ['pincel', { modo: 'face', faces: [8], cor: '#ff0000' }], ['pincel', { modo: 'face', faces: [9], cor: '#0000ff' }]], { r: 1, h: 2 }, { l: 8 }), ctx);
    const c8 = centro(r.atlas.daFace(8).ilha), c9 = centro(r.atlas.daFace(9).ilha);
    expect(amostra(c8[0] / r.atlas.W, c8[1] / r.atlas.H)).toEqual([255, 0, 0]);   // fundo vermelho
    expect(amostra(c9[0] / r.atlas.W, c9[1] / r.atlas.H)).toEqual([0, 0, 255]);   // topo AZUL — intacto (ilha própria)
  });

  it('UV de todo vértice cai DENTRO da ilha da sua face (inset do gutter — nada encosta na vizinha)', () => {
    const { ctx } = ctxAmostra();
    const neutro = nucleo([['cubo', { id: 0, lado: 1 }], ['pincel', { modo: 'face', faces: [0, 3], cor: '#123456' }]], {}, {});
    const r: any = adaptarV3(neutro, ctx);
    const T = 1e-9;
    for (const f of neutro.F.values()) {
      const af = r.atlas.daFace(f.id);
      for (const v of f.vs) {
        const uv = af.projeta(neutro.V.get(v));   // a MESMA projeção que gera o UV do mesh (fonte única)
        const tx = uv[0] * r.atlas.W, ty = uv[1] * r.atlas.H;
        expect(tx).toBeGreaterThanOrEqual(af.ilha.x - T);                 // dentro do retângulo interno da ilha
        expect(tx).toBeLessThanOrEqual(af.ilha.x + af.ilha.w + T);
        expect(ty).toBeGreaterThanOrEqual(af.ilha.y - T);
        expect(ty).toBeLessThanOrEqual(af.ilha.y + af.ilha.h + T);
      }
    }
  });

  it('colisaoDe encaixa um cilindro na malha final (usa as faces solido)', () => {
    const passos = [['cilindro', { id: 0, raio: 'r', altura: 'h', lados: 'lados' }], ['solido', { faces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }]];
    const col = colisaoDe(passos, { r: 0.4, h: 1.2 }, T8);
    expect(col.forma).toBe('cilindro');
    expect(col.raio).toBeCloseTo(0.4, 6);
    expect(col.altura).toBeCloseTo(1.2, 6);
  });
});

describe('peça-exemplo shipável', () => {
  it('_oficina-toco monta sem órfãos e declara colisão sã', async () => {
    const tocoUrl = new URL('../../prototipos/fps/v3/pecas/_oficina-toco.js', import.meta.url);
    const toco: any = await import(fileURLToPath(tocoUrl));
    const n = nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO);
    expect(n.orfaos).toHaveLength(0);
    expect(toco.meta.colisao.forma).toBe('cilindro');
    // raio ENCAIXADO na malha final: maior que troncoR porque a extrusão do galho alargou a malha
    expect(toco.meta.colisao.raio).toBeGreaterThan(toco.PARAMS.troncoR);
    expect(toco.meta.colisao.altura).toBeCloseTo(toco.PARAMS.troncoH, 4);
  });
});

describe('regressões do revisor adversarial (D1/D2/D3)', () => {
  // Newell inline (a do núcleo não é exportada) — testa a DIREÇÃO da normal, o que pegaria o D1
  const newellY = (V: any, vs: number[]) => {
    let ny = 0;
    for (let k = 0; k < vs.length; k++) { const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]); ny += (c[2] - n[2]) * (c[0] + n[0]); }
    return ny; // sinal = direção em y (positivo -> +y)
  };

  it('D1: as tampas do cilindro apontam pra FORA (fundo -y, topo +y)', () => {
    const { V, F } = nucleo([['cilindro', { id: 0, raio: 'r', altura: 'h', lados: 'l' }]], { r: 1, h: 2 }, { l: 8 });
    expect(newellY(V, F.get(8).vs)).toBeLessThan(0);      // fundo -> normal -y
    expect(newellY(V, F.get(9).vs)).toBeGreaterThan(0);   // topo  -> normal +y
  });

  it('D2: mescla que deixa canto repetido não-consecutivo (bowtie) GRITA e remove a face — nunca corrompe em silêncio', () => {
    // extruda o topo do cubo (tampa vira 1000..1003), mescla dois cantos OPOSTOS (1000 e 1002) num vértice fora da tampa
    const passos = [['cubo', { id: 0, lado: 1 }], ['extruda', { face: 1, dist: 0.3 }], ['mescla', { de: [1000, 1002], para: 0 }]];
    const n = nucleo(passos, {}, {});
    expect(n.orfaos.some((o: any) => o.op === 'mescla' && /bowtie|repetido/i.test(o.motivo))).toBe(true);
    for (const f of n.F.values()) expect(new Set(f.vs).size).toBe(f.vs.length);   // nenhuma face sobrevivente com canto repetido
  });

  it('D3: cilindro com lados demais pro bloco de ids falha ALTO (throw), não vaza pro bloco seguinte', () => {
    expect(() => nucleo([['cilindro', { id: 0, raio: 'r', altura: 'h', lados: 'l' }]], { r: 1, h: 1 }, { l: 600 })).toThrow(/estoura o bloco/);
  });
});

/* PASSO 11b — PINCEL MACIO no NÚCLEO (só o MOTOR: a op + a rasterização, sem
   interface). Prova por MEDIÇÃO: a op 'livre' grava a tinta ANCORADA à face ({a,b}
   face-local) e o adaptarV3 rasteriza um DAB radial macio na ilha da face; o replay
   é determinístico (a tinta entra na canon); a tinta ACOMPANHA a face num moveV;
   órfão grita; e o modo 'face' (todo o passo 1..11a) segue BYTE-idêntico. */
describe('passo 11b — pincel macio (motor: op livre + rasterização)', () => {
  const hx = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const BASE = hx('#9a8f80');   // COR_PADRAO: a madeira neutra sob um dab numa face sem cor chapada
  /* ctx headless que CAPTURA a fn do texCanvas e amostra o texel CRU (x,y inteiros) —
     é assim que o rasterizador do atlas se mede sem motor/tela. */
  function ctxTex() {
    let T: any = null;
    const ctx = { tex: { texCanvas: (w: number, h: number, fn: any) => (T = { width: w, height: h, fn }) }, m4: { ident: () => new Float32Array(16) } };
    return { ctx, texel: (x: number, y: number): number[] => T.fn(x, y) };
  }
  const cubo: any[] = ['cubo', { id: 0, lado: 1 }];
  const centroIlha = (il: any): [number, number] => [Math.round(il.x + 0.5 * il.w), Math.round(il.y + 0.5 * il.h)];

  it('1) modo livre GRAVA a tinta na face e RASTERIZA um dab (centro≈cor, degradê por número até a base)', () => {
    const { ctx, texel } = ctxTex();
    const neutro = nucleo([cubo, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.3, dureza: 0.5, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }]], {}, {});
    // a face ganhou a tinta: {a,b} face-local + raio/dureza POR dab (auto-contida, determinística)
    expect(neutro.F.get(0).tinta).toEqual([{ a: 0.5, b: 0.5, cor: '#ff0000', raio: 0.3, dureza: 0.5 }]);
    expect(neutro.orfaos).toHaveLength(0);
    const r: any = adaptarV3(neutro, ctx);
    const il = r.atlas.daFace(0).ilha;
    const [cx, cy] = centroIlha(il);
    const at = (dx: number) => texel(cx + dx, cy);
    expect(at(0)).toEqual([255, 0, 0]);   // CENTRO {0.5,0.5}: a cor cheia da pincelada
    expect(at(8)).toEqual(BASE);          // FORA do raio (rT=0.3·28=8.4 texels): a base intacta
    const meio = at(6);                    // no OMBRO: estritamente ENTRE cor e base (o degradê, por número)
    expect(meio[0]).toBeGreaterThan(BASE[0]); expect(meio[0]).toBeLessThan(255);   // r sobe rumo ao vermelho
    expect(meio[1]).toBeGreaterThan(0); expect(meio[1]).toBeLessThan(BASE[1]);     // g cai rumo a 0
  });

  it('2) determinismo/replay: a canon com pincel macio bate em 2 execuções, sobrevive a round-trip JSON, e a TINTA está na canon', () => {
    const passos = [cubo, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.25, dureza: 0.7, pontos: [{ f: 0, a: 0.3, b: 0.4 }, { f: 0, a: 0.6, b: 0.5 }, { f: 3, a: 0.5, b: 0.5 }] }]];
    const a = JSON.stringify(neutroCanonico(nucleo(passos, {}, {})));
    const b = JSON.stringify(neutroCanonico(nucleo(passos, {}, {})));
    expect(a).toBe(b);                                                          // 2 execuções idênticas
    const passosRT = JSON.parse(JSON.stringify(passos));                        // a LISTA (o formato salvo) ida-e-volta JSON
    expect(JSON.stringify(neutroCanonico(nucleo(passosRT, {}, {})))).toBe(a);   // replay do salvo idêntico bit-a-bit
    // a tinta ESTÁ na forma canônica — sem ela, o replay perderia o pincel: a canon COM dab difere da SEM
    expect(a).not.toBe(JSON.stringify(neutroCanonico(nucleo([cubo], {}, {}))));
  });

  it('3) paint-follows-face: um moveV DEPOIS num vértice da face mantém o dab no MESMO {a,b} da ilha (a tinta acompanha a face)', () => {
    const dab: any[] = ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.3, dureza: 0.6, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }];
    const parado = nucleo([cubo, dab], {}, {});
    const movido = nucleo([cubo, dab, ['moveV', { v: 2, d: [0.4, 0, 0.3] }]], {}, {});   // move um canto da face 0
    const rP: any = adaptarV3(parado, ctxTex().ctx);
    const t = ctxTex(); const rM: any = adaptarV3(movido, t.ctx);
    // a GEOMETRIA de fato mudou: mover v2 alarga a bbox da face 0, então o UV de OUTRO
    // canto (v1, parado) desliza — o próprio mapeamento UV mexeu sob o dab
    const uvP = rP.atlas.daFace(0).projeta(parado.V.get(1));
    const uvM = rM.atlas.daFace(0).projeta(movido.V.get(1));
    expect(JSON.stringify(uvP)).not.toBe(JSON.stringify(uvM));
    // ...mas o dab segue no centro {0.5,0.5} da ilha: o texel central continua a cor da pincelada
    const [cx, cy] = centroIlha(rM.atlas.daFace(0).ilha);
    expect(t.texel(cx, cy)).toEqual([255, 0, 0]);
  });

  it('3b) órfão: ponto com face inexistente GRITA e não corrompe (V/F e a tinta das outras faces intactos)', () => {
    const neutro = nucleo([cubo, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.3, dureza: 0.5, pontos: [{ f: 0, a: 0.5, b: 0.5 }, { f: 999, a: 0.5, b: 0.5 }] }]], {}, {});
    expect(neutro.orfaos).toHaveLength(1);
    expect(neutro.orfaos[0]).toMatchObject({ op: 'pincel', ref: 999 });
    expect(neutro.F.get(0).tinta).toHaveLength(1);              // a face válida recebeu o dab
    expect(neutro.V.size).toBe(8); expect(neutro.F.size).toBe(6);   // malha do cubo intacta
    for (const f of neutro.F.values()) if (f.id !== 0) expect(f.tinta).toHaveLength(0);   // ninguém mais pintado
  });

  it("4) compat 'face': o toco (só-'face') canoniza SEM tinta (linha F de 6) e a textura é BYTE-idêntica ao 11a", async () => {
    const toco: any = await import(fileURLToPath(new URL('../../prototipos/fps/v3/pecas/_oficina-toco.js', import.meta.url)));
    const neutro = nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO);
    for (const row of neutroCanonico(neutro).F) expect((row as any[]).length).toBe(6);   // nenhuma face ganha 7º elemento -> byte-igual ao de antes
    // a textura INTEIRA reproduz a fórmula do 11a (base chapada por célula) — sem dab, zero diferença
    const { ctx, texel } = ctxTex();
    const r: any = adaptarV3(neutro, ctx);
    const faces = [...neutro.F.values()].sort((a: any, b: any) => a.id - b.id);
    const corIlha = faces.map((f: any) => hx(f.cor ?? '#9a8f80'));
    const { cols, tile, W, H } = r.atlas;
    let dif = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ((y / tile) | 0) * cols + ((x / tile) | 0);
      const esp = i < corIlha.length ? corIlha[i] : BASE;   // exatamente o que o 11a produzia
      const got = texel(x, y);
      if (got[0] !== esp[0] || got[1] !== esp[1] || got[2] !== esp[2]) dif++;
    }
    expect(dif).toBe(0);
  });

  it('5) raio e dureza têm efeito MEDÍVEL: raio maior tinge mais texels; dureza maior encurta a transição', () => {
    const dab = (raio: number, dureza: number) => nucleo([cubo, ['pincel', { modo: 'livre', cor: '#ff0000', raio, dureza, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }]], {}, {});
    const naBase = (c: number[]) => c[0] === BASE[0] && c[1] === BASE[1] && c[2] === BASE[2];
    // texels TINGIDOS (fora da base) na ilha da face 0
    const tingidos = (neutro: any) => {
      const { ctx, texel } = ctxTex(); const r: any = adaptarV3(neutro, ctx); const il = r.atlas.daFace(0).ilha;
      let n = 0; for (let y = il.y; y < il.y + il.h; y++) for (let x = il.x; x < il.x + il.w; x++) if (!naBase(texel(x, y))) n++;
      return n;
    };
    const nPeq = tingidos(dab(0.2, 0.5)), nGde = tingidos(dab(0.4, 0.5));
    expect(nGde).toBeGreaterThan(nPeq);   // raio maior => mais texels tingidos
    // LARGURA da transição: na linha central, texels de opacidade PARCIAL (nem cor pura nem base)
    const banda = (neutro: any) => {
      const { ctx, texel } = ctxTex(); const r: any = adaptarV3(neutro, ctx); const il = r.atlas.daFace(0).ilha;
      const cy = Math.round(il.y + 0.5 * il.h); let n = 0;
      for (let x = il.x; x < il.x + il.w; x++) { const c = texel(x, cy); const cor = c[0] === 255 && c[1] === 0 && c[2] === 0; if (!cor && !naBase(c)) n++; }
      return n;
    };
    const bDura = banda(dab(0.45, 0.95)), bMacia = banda(dab(0.45, 0.05));
    expect(bMacia).toBeGreaterThan(bDura);   // dureza baixa => transição LARGA (degradê); alta => borda abrupta
  });

  it('6) o dab fica PRESO na célula: raio gigante numa face NÃO vaza pra ilha vizinha', () => {
    const { ctx, texel } = ctxTex();
    const r: any = adaptarV3(nucleo([cubo, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 3, dureza: 1, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }]], {}, {}), ctx);
    const [c1x, c1y] = centroIlha(r.atlas.daFace(1).ilha);
    expect(texel(c1x, c1y)).toEqual(BASE);   // a face VIZINHA (ilha própria) segue na base — o vermelho não vazou
    expect(texel(0, 0)).toEqual([255, 0, 0]);   // ...mas a célula da face 0 (incl. o gutter) encheu de vermelho: o dab dilatou até a borda da célula
  });
});

/* PASSO 12a — MATERIAIS OPACOS (núcleo + adaptador; o render é provado por byte-cmp
   à parte). Prova por MEDIÇÃO: a op `material` seta f.material (validando contra
   MATERIAIS), o material ENTRA na canon (determinismo/replay/round-trip), `usa`/face
   inexistente GRITAM sem corromper, e o adaptarV3 AGRUPA faces por material em lotes
   carregando os params certos (cor->corMul, emissivo, aspereza, semLuz, contorno->rim).
   Compat: peça SEM material -> UM lote só, byte-idêntico ao 11a. */
describe('passo 12a — materiais opacos', () => {
  const cubo: any[] = ['cubo', { id: 0, lado: 1 }];
  const MAT = { casca: { cor: '#6b4a2f', aspereza: 0.9 }, brasa: { cor: '#ff7326', emissivo: 1.4, semLuz: true } };
  const fakeCtx = { tex: { texCanvas: (w: number, h: number) => ({ width: w, height: h }) }, m4: { ident: () => new Float32Array(16) } };

  it('1) op material seta f.material; a canon inclui o material; determinismo/replay/round-trip JSON batem', () => {
    const passos = [cubo, ['material', { faces: [0, 1], usa: 'casca' }], ['material', { faces: [2], usa: 'brasa' }]];
    const n = nucleo(passos, {}, {}, MAT);
    expect(n.orfaos).toHaveLength(0);
    expect(n.F.get(0).material).toBe('casca');
    expect(n.F.get(1).material).toBe('casca');
    expect(n.F.get(2).material).toBe('brasa');
    expect(n.F.get(3).material).toBe(null);                         // face SEM material intacta (compat)
    // material entra na forma canônica (índice 3 da linha F) — sem isso o replay o perderia
    const canon = neutroCanonico(n);
    expect((canon.F.find((r: any[]) => r[0] === 0) as any[])[3]).toBe('casca');
    expect((canon.F.find((r: any[]) => r[0] === 3) as any[])[3]).toBe(null);
    // 2 execuções + round-trip JSON da LISTA (o formato salvo) idênticos bit-a-bit
    const a = JSON.stringify(neutroCanonico(nucleo(passos, {}, {}, MAT)));
    const b = JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(passos)), {}, {}, MAT)));
    expect(a).toBe(b);
    // sem os passos de material a canon DIFERE (o material É gravado — falha sob neutralização)
    expect(a).not.toBe(JSON.stringify(neutroCanonico(nucleo([cubo], {}, {}, MAT))));
  });

  it('2) op material GRITA se `usa` não existe em MATERIAIS ou a face não existe — nunca corrompe', () => {
    const n1 = nucleo([cubo, ['material', { faces: [0], usa: 'fantasma' }]], {}, {}, MAT);
    expect(n1.orfaos.some((o: any) => o.op === 'material' && o.ref === 'fantasma')).toBe(true);
    expect(n1.F.get(0).material).toBe(null);                         // `usa` inválido: NÃO seta nada
    const n2 = nucleo([cubo, ['material', { faces: [0, 999], usa: 'casca' }]], {}, {}, MAT);
    expect(n2.orfaos.some((o: any) => o.op === 'material' && o.ref === 999)).toBe(true);
    expect(n2.F.get(0).material).toBe('casca');                      // a face válida recebeu; a inválida gritou
    expect(n2.V.size).toBe(8); expect(n2.F.size).toBe(6);            // malha do cubo INTACTA
    const n3 = nucleo([cubo, ['material', { faces: [0], usa: 'casca' }]], {}, {}, {});   // MATERIAIS vazio (ex.: colisaoDe sem materiais)
    expect(n3.orfaos).toHaveLength(1);
    expect(n3.F.size).toBe(6);
  });

  it('3) adaptarV3 AGRUPA por material: 2 materiais -> 3 lotes (2 + o padrão), faces certas em cada, params carregados', () => {
    const passos = [cubo, ['material', { faces: [0, 1], usa: 'casca' }], ['material', { faces: [2], usa: 'brasa' }]];
    const r: any = adaptarV3(nucleo(passos, {}, {}, MAT), fakeCtx, MAT);
    expect(r.lotes).toHaveLength(3);
    const brasa = r.lotes.find((L: any) => L.emissivo);
    const casca = r.lotes.find((L: any) => L.aspereza);
    const padrao = r.lotes.find((L: any) => !L.emissivo && !L.aspereza && !L.corMul && !L.semLuz);
    expect(brasa && casca && padrao).toBeTruthy();
    // params do material carregados no lote (os nomes CASAM os uniforms do render)
    expect(brasa.emissivo).toBeCloseTo(1.4, 6);
    expect(brasa.semLuz).toBe(1);
    expect(brasa.corMul.map((c: number) => Math.round(c * 255))).toEqual([0xff, 0x73, 0x26]);   // #ff7326 -> corMul
    expect(casca.aspereza).toBeCloseTo(0.9, 6);
    expect(casca.emissivo).toBeUndefined();                          // casca não tem emissivo -> ausente (no-op)
    expect(casca.corMul.map((c: number) => Math.round(c * 255))).toEqual([0x6b, 0x4a, 0x2f]);
    // subconjunto de triângulos por lote (quad -> 2 tris -> 6 v -> 48 floats): casca 2 faces, brasa 1, padrão 3
    expect(casca.mesh.v.length).toBe(96);
    expect(brasa.mesh.v.length).toBe(48);
    expect(padrao.mesh.v.length).toBe(144);
    expect(casca.mesh.v.length + brasa.mesh.v.length + padrao.mesh.v.length).toBe(288);   // o cubo inteiro, repartido
  });

  it('4) compat: peça SEM material -> UM lote só, params no-op (byte-idêntico ao 11a)', () => {
    const semMat: any = executar([cubo, ['pincel', { modo: 'face', faces: [0], cor: '#123456' }]], {}, {}, fakeCtx);
    expect(semMat.lotes).toHaveLength(1);
    const L = semMat.lotes[0];
    expect(L.emissivo).toBeUndefined(); expect(L.aspereza).toBeUndefined();
    expect(L.semLuz).toBeUndefined(); expect(L.corMul).toBeUndefined();   // nenhum param de material -> render no-op
    expect(L.mesh.v.length).toBe(288);                                    // o cubo inteiro num lote só
    // executar COM material devolve mais de um lote (a face 0 vira o seu próprio lote)
    const comMat: any = executar([cubo, ['material', { faces: [0], usa: 'casca' }]], {}, {}, fakeCtx, MAT);
    expect(comMat.lotes.length).toBe(2);
  });
});

/* PASSO 12b — MISTURA TRANSPARENTE (núcleo + adaptador; o render — passada extra
   ordenada + byte-idêntico com o recurso desligado — é provado por cmp/probe à parte).
   Prova por MEDIÇÃO: `mistura:'transparente'` marca o lote (transparente:true +
   opacidade, clamp em [0,1], default 1); `opaco`/`recorte`/ausente NÃO marcam (seguem
   opacos); o material entra na canon (por nome) e o replay bate; e executar propaga
   os campos pro lote (o render lê daí). Cada asserção falha sob neutralização. */
describe('passo 12b — mistura transparente', () => {
  const cubo: any[] = ['cubo', { id: 0, lado: 1 }];
  const fakeCtx = { tex: { texCanvas: (w: number, h: number) => ({ width: w, height: h }) }, m4: { ident: () => new Float32Array(16) } };
  const MAT = {
    vidro: { cor: '#7fdfff', mistura: 'transparente', opacidade: 0.42 },
    fumaca: { mistura: 'transparente' },              // sem opacidade -> default 1
    pedra: { cor: '#888888' },                        // opaco (mistura ausente)
    parede: { cor: '#777777', mistura: 'opaco' },     // opaco explícito
    janela: { cor: '#66ccff', mistura: 'recorte' },   // recorte (o de hoje) = opaco
  };

  it('1) adaptarV3 marca SÓ o lote transparente (transparente:true + opacidade); opaco/recorte/ausente NÃO marcam', () => {
    const passos = [cubo,
      ['material', { faces: [0], usa: 'vidro' }],
      ['material', { faces: [1], usa: 'pedra' }],
      ['material', { faces: [2], usa: 'parede' }],
      ['material', { faces: [3], usa: 'janela' }]];
    const r: any = adaptarV3(nucleo(passos, {}, {}, MAT), fakeCtx, MAT);
    const vidro = r.lotes.find((L: any) => L.transparente);
    expect(vidro).toBeTruthy();
    expect(vidro.opacidade).toBeCloseTo(0.42, 6);
    expect(r.lotes.filter((L: any) => L.transparente)).toHaveLength(1);          // só o vidro
    for (const L of r.lotes) if (L !== vidro) { expect(L.transparente).toBeUndefined(); expect(L.opacidade).toBeUndefined(); }
  });

  it('2) opacidade: default 1 quando ausente; clamp em [0,1]', () => {
    const t = adaptarV3(nucleo([cubo, ['material', { faces: [0], usa: 'fumaca' }]], {}, {}, MAT), fakeCtx, MAT).lotes.find((L: any) => L.transparente);
    expect(t.opacidade).toBe(1);   // 'transparente' sem opacidade -> 1
    const M2 = { a: { mistura: 'transparente', opacidade: 2 }, b: { mistura: 'transparente', opacidade: -0.5 } };
    const ra: any = adaptarV3(nucleo([cubo, ['material', { faces: [0], usa: 'a' }]], {}, {}, M2), fakeCtx, M2);
    const rb: any = adaptarV3(nucleo([cubo, ['material', { faces: [0], usa: 'b' }]], {}, {}, M2), fakeCtx, M2);
    expect(ra.lotes.find((L: any) => L.transparente).opacidade).toBe(1);   // 2 -> 1
    expect(rb.lotes.find((L: any) => L.transparente).opacidade).toBe(0);   // -0.5 -> 0
  });

  it('3) determinismo/replay: a canon carrega o material transparente (por nome), bate bit-a-bit, e a marcação é determinística', () => {
    const passos = [cubo, ['material', { faces: [0, 1], usa: 'vidro' }]];
    const canon = neutroCanonico(nucleo(passos, {}, {}, MAT));
    expect((canon.F.find((row: any[]) => row[0] === 0) as any[])[3]).toBe('vidro');   // material na canon (índice 3)
    const a = JSON.stringify(neutroCanonico(nucleo(passos, {}, {}, MAT)));
    const b = JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(passos)), {}, {}, MAT)));
    expect(a).toBe(b);                                                                 // replay bit-a-bit (2x + round-trip JSON)
    const o1 = adaptarV3(nucleo(passos, {}, {}, MAT), fakeCtx, MAT).lotes.find((L: any) => L.transparente).opacidade;
    const o2 = adaptarV3(nucleo(passos, {}, {}, MAT), fakeCtx, MAT).lotes.find((L: any) => L.transparente).opacidade;
    expect(o1).toBe(o2);
    expect(a).not.toBe(JSON.stringify(neutroCanonico(nucleo([cubo], {}, {}, MAT))));   // neutralização: sem o passo, a canon difere
  });

  it('4) executar propaga transparente/opacidade pro lote (o render lê daí)', () => {
    const obj: any = executar([cubo, ['material', { faces: [0], usa: 'vidro' }]], {}, {}, fakeCtx, MAT);
    const t = obj.lotes.find((L: any) => L.transparente);
    expect(t).toBeTruthy();
    expect(t.opacidade).toBeCloseTo(0.42, 6);
    const semTransp: any = executar([cubo, ['material', { faces: [0], usa: 'pedra' }]], {}, {}, fakeCtx, MAT);
    expect(semTransp.lotes.some((L: any) => L.transparente)).toBe(false);             // material opaco: nenhum lote transparente
  });

  it('5) peça-exemplo _oficina-transp: sem órfãos, 1 lote transparente (opacidade 0.42), núcleo opaco', async () => {
    const pUrl = new URL('../../prototipos/fps/v3/pecas/_oficina-transp.js', import.meta.url);
    const peca: any = await import(fileURLToPath(pUrl));
    const n = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO, peca.MATERIAIS);
    expect(n.orfaos).toHaveLength(0);
    const r: any = adaptarV3(n, fakeCtx, peca.MATERIAIS);
    const transp = r.lotes.filter((L: any) => L.transparente);
    expect(transp).toHaveLength(1);
    expect(transp[0].opacidade).toBeCloseTo(0.42, 6);
    expect(r.lotes.some((L: any) => L.emissivo && !L.transparente)).toBe(true);       // núcleo aceso é OPACO
  });
});

/* PASSO 13a — ANIMAÇÃO RÍGIDA POR PARTE (motor headless; a prova de MOVIMENTO na tela
   — relógio congelado — é da bancada). Prova por MEDIÇÃO: a op `parte` nomeia faces e
   registra o pivô (canon carrega f.parte, byte-compat pra face sem parte); adaptarV3
   agrupa por (parte, material) e resolve o pivô (explícito ou CENTROIDE); o interpolador
   bate valores conhecidos (inclusive antes/depois/meio); montarAnimar casa parte<->lote
   por ÍNDICE (infoPorLote) e escreve a matriz determinística; executar fia ANIMACOES. */
describe('passo 13a — animação rígida por parte', () => {
  const cubo: any[] = ['cubo', { id: 0, lado: 1 }];
  const fakeCtx = { tex: { texCanvas: (w: number, h: number, fn: any) => ({ width: w, height: h, fn }) }, m4: { ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) } };
  const J = (x: any) => JSON.stringify(x);
  const aplica = (M: number[], p: number[]) => [
    M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12],
    M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13],
    M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
  ];

  it('1) op parte: seta f.parte; registra pivô; face inexistente GRITA sem corromper; reatribuir = última vence', () => {
    const n = nucleo([cubo, ['parte', { nome: 'x', faces: [0, 1], pivo: [0.1, 0.2, 0.3] }]], {}, {});
    expect(n.orfaos).toHaveLength(0);
    expect(n.F.get(0).parte).toBe('x');
    expect(n.F.get(1).parte).toBe('x');
    expect(n.F.get(2).parte).toBe(null);                     // face não citada intacta
    expect(n.partes.x.pivo).toEqual([0.1, 0.2, 0.3]);        // pivô registrado (passa por vec)
    // face inexistente: grita, malha e demais faces intactas
    const orf = nucleo([cubo, ['parte', { nome: 'x', faces: [0, 999] }]], {}, {});
    expect(orf.orfaos.some((o: any) => o.op === 'parte' && o.ref === 999)).toBe(true);
    expect(orf.F.get(0).parte).toBe('x'); expect(orf.V.size).toBe(8); expect(orf.F.size).toBe(6);
    expect(orf.partes.x.pivo).toBe(null);                    // sem pivo -> null (adaptador usa centroide)
    // reatribuir: a última parte que cita a face manda
    const re = nucleo([cubo, ['parte', { nome: 'a', faces: [0] }], ['parte', { nome: 'b', faces: [0] }]], {}, {});
    expect(re.F.get(0).parte).toBe('b');
  });

  it('2) canon inclui f.parte (guardado); face SEM parte fica byte-idêntica (linha de 6); determinismo/replay', () => {
    const n = nucleo([cubo, ['parte', { nome: 'x', faces: [0] }]], {}, {});
    const canon = neutroCanonico(n);
    const r0 = canon.F.find((r: any[]) => r[0] === 0) as any[];
    const r1 = canon.F.find((r: any[]) => r[0] === 1) as any[];
    expect(r0[r0.length - 1]).toBe('x');                     // f.parte anexado (cauda)
    expect(r0.length).toBe(7);
    expect(r1.length).toBe(6);                               // face sem parte: linha inalterada (byte-compat)
    // determinismo (2x) + round-trip JSON da LISTA; e a canon COM parte difere da SEM (parte é gravado)
    const a = J(neutroCanonico(nucleo([cubo, ['parte', { nome: 'x', faces: [0] }]], {}, {})));
    const b = J(neutroCanonico(nucleo(JSON.parse(J([cubo, ['parte', { nome: 'x', faces: [0] }]])), {}, {})));
    expect(a).toBe(b);
    expect(a).not.toBe(J(neutroCanonico(nucleo([cubo], {}, {}))));
    // a compat NÃO é frágil: uma peça só-material/tinta (sem parte) segue com a MESMA canon do 12b
    const semParte = nucleo([cubo, ['pincel', { modo: 'face', faces: [0], cor: '#123456' }]], {}, {});
    for (const row of neutroCanonico(semParte).F) expect((row as any[]).every((c) => typeof c !== 'string' || c !== 'x')).toBe(true);
  });

  it('3) adaptarV3 agrupa por (parte, material); centroide default; pivô explícito; L.parte no lote; compat 1-lote', () => {
    const MAT = { metal: { cor: '#888888' }, marca: { cor: '#ff7326', emissivo: 1 } };
    // 1 parte 'roda' abrangendo 2 materiais -> 2 lotes, AMBOS com L.parte='roda'
    const passos = [['cubo', { id: 0, lado: 2 }], ['parte', { nome: 'roda', faces: [0, 1, 2, 3, 4, 5] }],
      ['material', { faces: [0], usa: 'marca' }], ['material', { faces: [1, 2, 3, 4, 5], usa: 'metal' }]];
    const r: any = adaptarV3(nucleo(passos, {}, {}, MAT), fakeCtx, MAT);
    expect(r.lotes).toHaveLength(2);
    expect(r.lotes.every((L: any) => L.parte === 'roda')).toBe(true);
    expect(r.lotes.reduce((s: number, L: any) => s + L.mesh.v.length, 0)).toBe(288);   // triângulos conservados (cubo inteiro)
    // centroide default = média dos verts distintos da parte. Cubo lado 2: verts em x,z∈[-1,1], y∈[0,2] -> centro (0,1,0)
    expect(r.partes.roda.pivo).toEqual([0, 1, 0]);
    // pivô EXPLÍCITO sobrepõe o centroide
    const rEx: any = adaptarV3(nucleo([['cubo', { id: 0, lado: 2 }], ['parte', { nome: 'roda', faces: [0], pivo: [5, 6, 7] }]], {}, {}), fakeCtx);
    expect(rEx.partes.roda.pivo).toEqual([5, 6, 7]);
    // compat: sem parte E sem material -> 1 lote, L.parte null, partes {}
    const rc: any = adaptarV3(nucleo([cubo], {}, {}), fakeCtx);
    expect(rc.lotes).toHaveLength(1);
    expect(rc.lotes[0].parte).toBe(null);
    expect(rc.partes).toEqual({});
  });

  it('4) interpolador (avaliarChaves): antes/depois das pontas, na chave, meio e quarto de segmento (smoothstep)', () => {
    const K = [[0, 10], [2, 20]];
    expect(avaliarChaves(K, -1)).toBe(10);        // antes da 1ª -> 1º valor
    expect(avaliarChaves(K, 5)).toBe(20);         // depois da última -> último valor
    expect(avaliarChaves(K, 0)).toBe(10);         // na chave
    expect(avaliarChaves(K, 2)).toBe(20);
    expect(avaliarChaves(K, 1)).toBe(15);         // meio: smoothstep(0.5)=0.5 -> 15
    expect(avaliarChaves(K, 0.5)).toBeCloseTo(11.5625, 9);   // quarto: s=0.15625 (DISCRIMINA de linear=12.5)
    // três chaves: encontra o segmento certo
    const K3 = [[0, 0], [1, 100], [2, 0]];
    expect(avaliarChaves(K3, 1)).toBe(100);       // na chave do meio
    expect(avaliarChaves(K3, 0.5)).toBeCloseTo(50, 9);       // meio do 1º segmento
    expect(avaliarChaves(K3, 1.5)).toBeCloseTo(50, 9);       // meio do 2º segmento
    expect(avaliarChaves([], 3)).toBe(0);         // sem chaves -> 0 (defensivo)
  });

  it('5) montarAnimar: casa parte<->lote por ÍNDICE, matriz determinística, pivô fixo, vazio->undefined, canal ruim GRITA', () => {
    const infoPorLote = ['roda', 'roda', 'braco', null];   // paralelo aos lotes (o 4º sem parte)
    const partes = { roda: { pivo: [0, 1, 0] }, braco: { pivo: [1, 0, 0] } };
    const ANIM = { girar: { duracao: 4, repete: true, trilhas: [{ parte: 'roda', canal: 'rotY', chaves: [[0, 0], [4, Math.PI * 2]] }] } };
    const animar = montarAnimar(ANIM, infoPorLote, partes);
    expect(typeof animar).toBe('function');
    const mk = () => infoPorLote.map(() => ({ matriz: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }));
    const A = mk(); animar(0, A);
    const B = mk(); animar(0, B);
    expect(J(A.map((l) => l.matriz))).toBe(J(B.map((l) => l.matriz)));   // determinismo: mesmo T -> mesma matriz
    const C = mk(); animar(1, C);
    expect(J(A.map((l) => l.matriz))).not.toBe(J(C.map((l) => l.matriz)));   // T=0 != T=1 (moveu)
    expect(J(C[0].matriz)).toBe(J(C[1].matriz));    // os 2 lotes da 'roda' recebem A MESMA matriz
    expect(J(C[2].matriz)).toBe(J([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));   // 'braco' não animado aqui -> ident intacta
    expect(J(C[3].matriz)).toBe(J([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));   // lote sem parte -> ident intacta
    // o PIVÔ fica FIXO sob a matriz (a parte gira EM TORNO dele)
    const fixo = aplica(C[0].matriz, [0, 1, 0]);
    expect(fixo[0]).toBeCloseTo(0, 9); expect(fixo[1]).toBeCloseTo(1, 9); expect(fixo[2]).toBeCloseTo(0, 9);
    // valor esperado do rotY em T=1: lt=1, u=0.25, s=0.15625 -> ang=2π·0.15625 (bloco rotacional bate cos/sin float64)
    const ang = 2 * Math.PI * 0.15625;
    expect(C[0].matriz[0]).toBeCloseTo(Math.cos(ang), 9);
    expect(C[0].matriz[2]).toBeCloseTo(-Math.sin(ang), 9);
    // ANIMACOES vazio -> undefined (o render vê peca.animar||null = null -> byte-idêntico)
    expect(montarAnimar({}, infoPorLote, partes)).toBeUndefined();
    // canal desconhecido GRITA ao montar (erro alto e cedo, como op desconhecida)
    expect(() => montarAnimar({ x: { trilhas: [{ parte: 'roda', canal: 'giroZ', chaves: [[0, 0]] }] } }, infoPorLote, partes)).toThrow(/canal/);
    // trilha aponta pra parte SEM lote -> no-op (nada a mover, sem quebrar)
    const semLote = montarAnimar({ y: { repete: true, duracao: 2, trilhas: [{ parte: 'fantasma', canal: 'posX', chaves: [[0, 0], [2, 9]] }] } }, infoPorLote, partes);
    const D = mk(); expect(() => semLote(1, D)).not.toThrow();
    expect(J(D.map((l) => l.matriz))).toBe(J(mk().map((l) => l.matriz)));   // ninguém mexeu
  });

  it('6) executar fia ANIMACOES -> animar; sem ANIMACOES -> undefined (compat); canais pos/escala compõem', () => {
    const MAT = { m: { cor: '#888888' } };
    const passos = [cubo, ['parte', { nome: 'p', faces: [0, 1, 2, 3, 4, 5], pivo: [0, 0, 0] }], ['material', { faces: [0, 1, 2, 3, 4, 5], usa: 'm' }]];
    // repete:false pra o fim da linha do tempo (lt=min(T,dur)=dur) dar os valores de PONTA exatos
    const ANIM = { mover: { duracao: 2, repete: false, trilhas: [{ parte: 'p', canal: 'posY', chaves: [[0, 0], [2, 1]] }, { parte: 'p', canal: 'escala', chaves: [[0, 1], [2, 2]] }] } };
    const obj: any = executar(passos, {}, {}, fakeCtx, MAT, ANIM);
    expect(typeof obj.animar).toBe('function');
    const semAnim: any = executar(passos, {}, {}, fakeCtx, MAT);
    expect(semAnim.animar).toBeUndefined();   // ANIMACOES omitido -> undefined
    // no fim (T=2 -> lt=min(2,2)=2): posY=1, escala=2 -> a matriz translada Y e escala 2
    const lotes = obj.lotes.map((L: any) => ({ matriz: L.matriz }));
    obj.animar(2, lotes);
    const M = lotes[0].matriz;
    // um ponto (1,0,0): escala 2 -> (2,0,0); +posY 1 -> (2,1,0). Pivô [0,0,0] não desloca.
    const p = aplica(M, [1, 0, 0]);
    expect(p[0]).toBeCloseTo(2, 9); expect(p[1]).toBeCloseTo(1, 9); expect(p[2]).toBeCloseTo(0, 9);
    // e o WRAP do laço: repete:true em T=dur volta pro início (lt = dur % dur = 0) -> valores iniciais
    const ANIMr = { mover: { duracao: 2, repete: true, trilhas: [{ parte: 'p', canal: 'posY', chaves: [[0, 0], [2, 1]] }] } };
    const objR: any = executar(passos, {}, {}, fakeCtx, MAT, ANIMr);
    const lotesR = objR.lotes.map((L: any) => ({ matriz: L.matriz }));
    objR.animar(2, lotesR);   // T=2 % 2 = 0 -> posY=0 -> identidade
    expect(aplica(lotesR[0].matriz, [1, 0, 0])).toEqual([1, 0, 0]);
  });

  it('7) peça-exemplo _oficina-anim: sem órfãos, 2 partes (roda centroide, braco pivô explícito), animar presente', async () => {
    const pUrl = new URL('../../prototipos/fps/v3/pecas/_oficina-anim.js', import.meta.url);
    const peca: any = await import(fileURLToPath(pUrl));
    const n = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO, peca.MATERIAIS);
    expect(n.orfaos).toHaveLength(0);
    expect(n.partes.roda.pivo).toBe(null);                       // roda SEM pivo -> centroide no adaptador
    expect(n.partes.braco.pivo).toEqual([peca.PARAMS.bracoX, 0, 0]);   // braco COM pivo explícito na base
    const r: any = adaptarV3(n, fakeCtx, peca.MATERIAIS);
    expect(r.lotes.map((L: any) => L.parte)).toEqual(['roda', 'roda', 'braco']);   // infoPorLote paralelo
    expect(r.partes.braco.pivo).toEqual([peca.PARAMS.bracoX, 0, 0]);
    expect(r.partes.roda.pivo[0]).toBeGreaterThan(0);             // centroide puxado pro dente (+x): prova o default
    const obj: any = executar(peca.PASSOS, peca.PARAMS, peca.TOPO, fakeCtx, peca.MATERIAIS, peca.ANIMACOES);
    expect(typeof obj.animar).toBe('function');
    expect(peca.meta.colisao.forma).toBe('cilindro');
  });
});

/* PASSO 14a — ESQUELETO com DEFORMAÇÃO SUAVE (linear blend skinning; motor headless — a
   prova de que DEFORMA na tela, relógio congelado, é da bancada). Prova por MEDIÇÃO: a op
   `pesar` acumula peso por (vértice, osso) e grita órfão (osso/vértice/face) sem corromper;
   a canon anexa o peso do vértice (compat: sem peso -> byte-idêntica); resolverEsqueleto
   grita ciclo/pai/teto; adaptarV3 emite o mesh de 16 floats + top-4 normalizado (8 floats
   sem esqueleto — compat); o skinning é LBS determinístico (bind pose = identidade; filho
   gira no pivô; raiz fica; MISTO = combinação convexa); executar fia ESQUELETO. */
describe('passo 14a — esqueleto com deformação suave', () => {
  const cubo: any[] = ['cubo', { id: 0, lado: 1 }];
  const fakeCtx = { tex: { texCanvas: (w: number, h: number, fn: any) => ({ width: w, height: h, fn }) }, m4: { ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) } };
  const J = (x: any) => JSON.stringify(x);
  const ESQ = { ossos: [{ nome: 'b0' }, { nome: 'b1', pai: 'b0', pivo: [0, 1, 0] }] };   // b0 raiz, b1 filho na junta y=1
  const aplica = (M: ArrayLike<number>, p: number[]) => [
    M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12],
    M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13],
    M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
  ];

  it('1) op pesar: acumula por (vértice,osso); órfão de osso/vértice/face GRITA sem corromper; peso viaja por ID', () => {
    // acumula: dois pesar no mesmo (v,osso) somam
    const n = nucleo([cubo, ['pesar', { osso: 'b0', vs: [0], peso: 0.3 }], ['pesar', { osso: 'b0', vs: [0], peso: 0.2 }], ['pesar', { osso: 'b1', vs: [0], peso: 0.5 }]], {}, {}, {}, ESQ);
    expect(n.orfaos).toHaveLength(0);
    expect(n.pesos.get(0).get('b0')).toBeCloseTo(0.5, 9);   // 0.3 + 0.2 ACUMULADOS
    expect(n.pesos.get(0).get('b1')).toBeCloseTo(0.5, 9);
    // faces: pesa TODOS os vértices distintos da face
    const nf = nucleo([cubo, ['pesar', { osso: 'b0', faces: [0], peso: 1 }]], {}, {}, {}, ESQ);
    expect([...nf.pesos.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);   // a face 0 (fundo) tem 4 cantos
    // órfão: osso fora do ESQUELETO grita, malha intacta, nada pesado
    const o1 = nucleo([cubo, ['pesar', { osso: 'fantasma', vs: [0], peso: 1 }]], {}, {}, {}, ESQ);
    expect(o1.orfaos.some((x: any) => x.op === 'pesar' && x.ref === 'fantasma')).toBe(true);
    expect(o1.pesos.size).toBe(0); expect(o1.V.size).toBe(8);
    // órfão: vértice inexistente grita, o VÁLIDO ainda é pesado
    const o2 = nucleo([cubo, ['pesar', { osso: 'b0', vs: [0, 999], peso: 1 }]], {}, {}, {}, ESQ);
    expect(o2.orfaos.some((x: any) => x.op === 'pesar' && x.ref === 999)).toBe(true);
    expect(o2.pesos.has(0)).toBe(true); expect(o2.V.size).toBe(8);
    // órfão: face inexistente grita
    const o3 = nucleo([cubo, ['pesar', { osso: 'b0', faces: [999], peso: 1 }]], {}, {}, {}, ESQ);
    expect(o3.orfaos.some((x: any) => x.op === 'pesar' && x.ref === 999)).toBe(true);
    // sem ESQUELETO, pesar grita (não há osso pra pesar)
    const sem = nucleo([cubo, ['pesar', { osso: 'b0', vs: [0], peso: 1 }]], {}, {});
    expect(sem.orfaos.some((x: any) => x.op === 'pesar')).toBe(true);
    expect(sem.pesos.size).toBe(0);
  });

  it('2) canon: peso do vértice na CAUDA (compat: sem peso -> linha de 4 byte-idêntica); determinismo/replay', () => {
    const passos = [cubo, ['pesar', { osso: 'b0', vs: [0], peso: 0.5 }], ['pesar', { osso: 'b1', vs: [0], peso: 0.5 }]];
    const canon = neutroCanonico(nucleo(passos, {}, {}, {}, ESQ));
    const r0 = canon.V.find((r: any[]) => r[0] === 0) as any[];
    const r1 = canon.V.find((r: any[]) => r[0] === 1) as any[];
    expect(r0.length).toBe(5);                                   // [id,x,y,z, PESO]
    expect(r0[4]).toEqual([['b0', 0.5], ['b1', 0.5]]);           // pares [osso,peso] ORDENADOS por nome do osso (o peso CRU acumulado)
    expect(r1.length).toBe(4);                                   // vértice SEM peso: linha de 4 (byte-compat)
    // determinismo (2x) + round-trip JSON da LISTA; e a canon COM peso difere da SEM
    const a = J(neutroCanonico(nucleo(passos, {}, {}, {}, ESQ)));
    const b = J(neutroCanonico(nucleo(JSON.parse(J(passos)), {}, {}, {}, ESQ)));
    expect(a).toBe(b);
    expect(a).not.toBe(J(neutroCanonico(nucleo([cubo], {}, {}, {}, ESQ))));
    // COMPAT NÃO-FRÁGIL: uma peça SEM esqueleto/pesar canoniza IGUAL ao de antes (toda linha V de 4)
    const semEsq = neutroCanonico(nucleo([cubo, ['pincel', { modo: 'face', faces: [0], cor: '#123456' }]], {}, {}));
    for (const row of semEsq.V) expect((row as any[]).length).toBe(4);
  });

  it('3) resolverEsqueleto: ciclo, pai inexistente e teto de ossos GRITAM (alto e cedo, malha não corrompe)', () => {
    expect(() => nucleo([cubo], {}, {}, {}, { ossos: [{ nome: 'a', pai: 'b' }, { nome: 'b', pai: 'a' }] })).toThrow(/ciclo/);
    expect(() => nucleo([cubo], {}, {}, {}, { ossos: [{ nome: 'a', pai: 'naoexiste' }] })).toThrow(/pai/);
    expect(() => nucleo([cubo], {}, {}, {}, { ossos: Array.from({ length: 33 }, (_, i) => ({ nome: 'o' + i })) })).toThrow(/teto/);
    // pivô passa por vec -> cita PARAM
    const n = nucleo([cubo], { alt: 1.7 }, {}, {}, { ossos: [{ nome: 'x', pivo: [0, 'alt', 0] }] });
    expect(n.esqueleto.ossos[0].pivo).toEqual([0, 1.7, 0]);
  });

  it('4) adaptarV3: mesh de 16 floats + top-4 normalizado quando há esqueleto; 8 floats (byte-compat) sem ele', () => {
    // sem esqueleto: 8 floats/vértice, lote SEM esqueleto (o caminho de hoje, intocado)
    const rc: any = adaptarV3(nucleo([cubo], {}, {}), fakeCtx);
    expect(rc.lotes[0].mesh.v.length % 8).toBe(0);
    expect(rc.lotes[0].esqueleto).toBeUndefined();
    expect(rc.esqueleto).toBe(null);
    // com esqueleto: 16 floats/vértice, lote marcado, nOssos correto
    const n = nucleo([cubo, ['pesar', { osso: 'b0', vs: [0, 1, 2, 3], peso: 1 }], ['pesar', { osso: 'b1', vs: [4, 5, 6, 7], peso: 1 }]], {}, {}, {}, ESQ);
    const r: any = adaptarV3(n, fakeCtx, {});
    expect(r.lotes[0].mesh.v.length % 16).toBe(0);
    expect(r.lotes[0].esqueleto).toBe(true);
    expect(r.lotes[0].nOssos).toBe(2);
    // vértice 0 (100% b0) -> boneIndex 0, peso 1; vértice sem peso -> tudo 0 (o shader cai na identidade)
    // primeiro triângulo da face 0 (fundo): canto 0 primeiro. layout: pos3 uv2 nrm3 idx4 w4
    const v0 = r.lotes[0].mesh.v.slice(0, 16);
    expect(v0.slice(8, 12)).toEqual([0, 0, 0, 0]);   // boneIndex (b0 = 0)
    expect(v0.slice(12, 16)).toEqual([1, 0, 0, 0]);  // peso normalizado
    // TOP-4 + normaliza: 5 ossos num vértice -> só os 4 maiores, somando 1
    const ESQ5 = { ossos: [{ nome: 'a' }, { nome: 'b' }, { nome: 'c' }, { nome: 'd' }, { nome: 'e' }] };
    const n5 = nucleo([cubo,
      ['pesar', { osso: 'a', vs: [0], peso: 5 }], ['pesar', { osso: 'b', vs: [0], peso: 4 }],
      ['pesar', { osso: 'c', vs: [0], peso: 3 }], ['pesar', { osso: 'd', vs: [0], peso: 2 }],
      ['pesar', { osso: 'e', vs: [0], peso: 1 }]], {}, {}, {}, ESQ5);
    const r5: any = adaptarV3(n5, fakeCtx, {});
    const w0 = r5.lotes[0].mesh.v.slice(12, 16) as number[];   // pesos do vértice 0
    expect(w0.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);   // normalizado (soma 1)
    expect((r5.lotes[0].mesh.v.slice(8, 12) as number[]).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);   // os 4 MAIORES (a,b,c,d), 'e' (o menor) fora
    expect(w0[0]).toBeCloseTo(5 / 14, 9);   // a=5 sobre a soma dos top-4 (5+4+3+2=14)
  });

  it('5) skinning (montarAnimar+skin): bind pose = identidade; filho gira no pivô; raiz fica; MISTO = combinação convexa; determinístico', () => {
    const infoPorLote = [null];   // 1 lote skinado
    const esqR = nucleo([cubo], {}, {}, {}, ESQ).esqueleto;   // esqueleto RESOLVIDO (pivô default + idx) — o que executar passa
    const ANIM = { curl: { duracao: 2, repete: false, trilhas: [{ parte: 'b1', canal: 'rotZ', chaves: [[0, 0], [2, Math.PI / 2]] }] } };
    const animar = montarAnimar(ANIM, infoPorLote, {}, esqR);
    expect(typeof animar).toBe('function');
    const mk = () => [{ matriz: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], ossos: new Float32Array(32) }];
    // T=0: bind pose -> AMBOS os ossos identidade (deforma 0)
    const A = mk(); animar(0, A);
    const I16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(Array.from(A[0].ossos.slice(0, 16))).toEqual(I16);    // b0 identidade
    expect(Array.from(A[0].ossos.slice(16, 32))).toEqual(I16);   // b1 identidade (bind pose)
    // T=2 (fim, rotZ=90°): b0 fica identidade; b1 gira EM TORNO do pivô [0,1,0]
    const B = mk(); animar(2, B);
    expect(Array.from(B[0].ossos.slice(0, 16))).toEqual(I16);    // raiz FICA
    const skB1 = B[0].ossos.slice(16, 32);
    const piv = aplica(skB1, [0, 1, 0]);                          // o pivô é PONTO FIXO da rotação do osso
    expect(piv[0]).toBeCloseTo(0, 9); expect(piv[1]).toBeCloseTo(1, 9); expect(piv[2]).toBeCloseTo(0, 9);
    // um ponto do filho (topo [0,2,0]) gira 90° em torno de [0,1,0]: (0,2,0)->(-1,1,0)
    const topo = aplica(skB1, [0, 2, 0]);
    expect(topo[0]).toBeCloseTo(-1, 9); expect(topo[1]).toBeCloseTo(1, 9); expect(topo[2]).toBeCloseTo(0, 9);
    // MISTO 50/50: um ponto vale 0.5·skinB0·p + 0.5·skinB1·p -> ESTRITAMENTE ENTRE os dois (convexo, não rígido)
    const p = [0, 2, 0];
    const a0 = aplica(B[0].ossos.slice(0, 16), p), a1 = aplica(skB1, p);
    const mix = [0.5 * a0[0] + 0.5 * a1[0], 0.5 * a0[1] + 0.5 * a1[1], 0.5 * a0[2] + 0.5 * a1[2]];
    const d0 = Math.hypot(mix[0] - a0[0], mix[1] - a0[1], mix[2] - a0[2]);
    const d1 = Math.hypot(mix[0] - a1[0], mix[1] - a1[1], mix[2] - a1[2]);
    expect(d0).toBeGreaterThan(1e-6); expect(d1).toBeGreaterThan(1e-6);   // não é rígido de NENHUM dos dois
    expect(mix[0]).toBeCloseTo((a0[0] + a1[0]) / 2, 9);                    // é a MÉDIA exata (peso 50/50)
    // determinismo: mesmo T -> mesmas matrizes bit-a-bit
    const C = mk(); animar(2, C);
    expect(J(Array.from(B[0].ossos))).toBe(J(Array.from(C[0].ossos)));
    // ANIMACOES vazio -> undefined (mesmo com esqueleto: o render vê animar||null=null)
    expect(montarAnimar({}, infoPorLote, {}, esqR)).toBeUndefined();
  });

  it('6) osso vs parte: a trilha resolve o alvo — nome de OSSO dirige skinning (L.ossos), nome de PARTE dirige L.matriz', () => {
    // um lote skinado (parte null) + uma trilha que mira o OSSO b1: escreve L.ossos, NÃO L.matriz
    const ANIM = { a: { duracao: 2, repete: false, trilhas: [{ parte: 'b1', canal: 'rotZ', chaves: [[0, 0], [2, 1]] }] } };
    const esqR = nucleo([cubo], {}, {}, {}, ESQ).esqueleto;
    const animar = montarAnimar(ANIM, [null], {}, esqR);
    const L = [{ matriz: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], ossos: new Float32Array(32) }];
    animar(2, L);
    expect(J(L[0].matriz)).toBe(J([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));   // matriz INTOCADA (b1 é osso, não parte)
    expect(Array.from(L[0].ossos.slice(16, 32))).not.toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);   // mas o osso b1 mexeu
  });

  it('7) executar fia ESQUELETO -> lotes skinados com L.ossos bind pose; SEM ESQUELETO byte-compat (sem L.ossos, mesh 8 floats)', () => {
    const passos = [cubo, ['pesar', { osso: 'b0', vs: [0, 1, 2, 3], peso: 1 }], ['pesar', { osso: 'b1', vs: [4, 5, 6, 7], peso: 1 }]];
    const obj: any = executar(passos, {}, {}, fakeCtx, {}, {}, ESQ);   // sem ANIMACOES: bind pose estática
    expect(obj.lotes[0].esqueleto).toBe(true);
    expect(obj.lotes[0].ossos).toBeInstanceOf(Float32Array);
    expect(obj.lotes[0].ossos.length).toBe(32);                        // 2 ossos × 16
    expect(Array.from(obj.lotes[0].ossos)).toEqual(Array.from(bindPoseOssos(2)));   // bind pose = identidades
    expect(obj.animar).toBeUndefined();                                // sem ANIMACOES
    // SEM esqueleto: nenhum L.ossos, lote não-skinado, mesh 8 floats (o caminho de hoje)
    const semEsq: any = executar([cubo], {}, {}, fakeCtx);
    expect(semEsq.lotes[0].esqueleto).toBeUndefined();
    expect(semEsq.lotes[0].ossos).toBeUndefined();
    expect(semEsq.lotes[0].mesh.v.length % 8).toBe(0);
  });

  it('8) peça-exemplo _oficina-esqueleto: sem órfãos, 3 ossos encadeados, 16 vértices pesados, todos os lotes skinados, animar presente', async () => {
    const pUrl = new URL('../../prototipos/fps/v3/pecas/_oficina-esqueleto.js', import.meta.url);
    const peca: any = await import(fileURLToPath(pUrl));
    const n = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO, peca.MATERIAIS, peca.ESQUELETO);
    expect(n.orfaos).toHaveLength(0);
    expect(n.esqueleto.ossos.map((o: any) => o.nome)).toEqual(['b0', 'b1', 'b2']);
    expect(n.esqueleto.ossos[1].pai).toBe('b0');
    expect(n.esqueleto.ossos[2].pai).toBe('b1');                       // cadeia b0<-b1<-b2
    expect(n.pesos.size).toBe(16);                                     // 4 anéis × 4 cantos
    const obj: any = executar(peca.PASSOS, peca.PARAMS, peca.TOPO, fakeCtx, peca.MATERIAIS, peca.ANIMACOES, peca.ESQUELETO);
    expect(obj.lotes.every((L: any) => L.esqueleto)).toBe(true);       // peça skinada -> TODO lote é skinado
    expect(obj.lotes.every((L: any) => L.mesh.v.length % 16 === 0)).toBe(true);
    expect(typeof obj.animar).toBe('function');
    expect(peca.meta.colisao.forma).toBe('cilindro');
    // anima de verdade: T=0 (bind) != T=1.5 (pico) nas matrizes de osso
    const rodar = (T: number) => { const L = obj.lotes.map((l: any) => ({ matriz: l.matriz, ossos: new Float32Array(l.ossos) })); obj.animar(T, L); return J(Array.from(L[0].ossos)); };
    expect(rodar(0)).not.toBe(rodar(1.5));
    expect(rodar(1.5)).toBe(rodar(1.5));                               // determinístico
  });
});

/* P1 do PLAYGROUND — PRIMITIVAS esfera/cone/plano (só o NÚCLEO; interface é onda
   separada). NUMERAÇÃO É FORMATO SALVO (playground regra 4): os ids de vértice e
   de face documentados no comentário de cada op ficam TRAVADOS aqui — mudar
   qualquer um quebra estes testes de propósito. Prova por MEDIÇÃO: contagens,
   ids-chave EXATOS (polos, ápice, cantos), winding pra FORA por Newell (a lição
   D1), determinismo/replay round-trip, órfão grita, guarda de overflow (D3) e
   params por NOME. */
describe('P1 — primitivas esfera/cone/plano', () => {
  const J = (x: any) => JSON.stringify(x);
  const fakeCtx = { tex: { texCanvas: (w: number, h: number, fn: any) => ({ width: w, height: h, fn }) }, m4: { ident: () => new Float32Array(16) } };
  // Newell inline (a do núcleo não é exportada) — o MESMO teste de direção do D1
  const newell = (V: any, vs: number[]) => {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < vs.length; k++) {
      const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]);
      nx += (c[1] - n[1]) * (c[2] + n[2]); ny += (c[2] - n[2]) * (c[0] + n[0]); nz += (c[0] - n[0]) * (c[1] + n[1]);
    }
    return [nx, ny, nz];
  };
  const centroide = (V: any, vs: number[]) => {
    const c = [0, 0, 0];
    for (const v of vs) { const p = V.get(v); c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    return c.map((x) => x / vs.length);
  };

  it('esfera: contagem V/F e numeração EXATA travada (polos, anéis, as três faixas de face)', () => {
    const { V, F, orfaos } = nucleo([['esfera', { id: 0, raio: 'r', aneis: 'a', lados: 'l' }]], { r: 0.5 }, { a: 6, l: 8 });
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(42);                            // 2 polos + (6-1)·8
    expect(F.size).toBe(48);                            // 6·8 (leque + 4 faixas + leque)
    // polos (formato salvo): sul = b+0 em y=0; norte = b+1+(aneis-1)·lados = 41 em y=2·raio
    expect(V.get(0)).toEqual([0, 0, 0]);
    expect(V.get(41)).toEqual([0, 1, 0]);
    // anel k=1 (φ=π/6), j=0: id 1 = b+1+(k-1)·lados+j — em +x (mesmo ângulo do cilindro)
    const v1 = V.get(1);
    expect(v1[0]).toBeCloseTo(0.5 * Math.sin(Math.PI / 6), 12);
    expect(v1[1]).toBeCloseTo(0.5 * (1 - Math.cos(Math.PI / 6)), 12);
    expect(v1[2]).toBeCloseTo(0, 12);
    // equador (k=3, φ=π/2): id 17 (j=0) em [+raio, raio, 0]; id 19 (j=2, θ=π/2) em [0, raio, +raio]
    const v17 = V.get(17), v19 = V.get(19);
    expect(v17[0]).toBeCloseTo(0.5, 12); expect(v17[1]).toBeCloseTo(0.5, 12); expect(v17[2]).toBeCloseTo(0, 12);
    expect(v19[0]).toBeCloseTo(0, 12); expect(v19[1]).toBeCloseTo(0.5, 12); expect(v19[2]).toBeCloseTo(0.5, 12);
    // FACES por faixa (b + k·lados + j), cantos EXATOS — o formato salvo travado:
    expect(F.get(0).vs).toEqual([0, 1, 2]);             // leque sul j=0: [polo, anel1[0], anel1[1]]
    expect(F.get(7).vs).toEqual([0, 8, 1]);             // leque sul j=7 fecha o ciclo
    expect(F.get(8).vs).toEqual([1, 9, 10, 2]);         // faixa k=1 j=0: [anel1[0], anel2[0], anel2[1], anel1[1]]
    expect(F.get(40).vs).toEqual([41, 34, 33]);         // leque norte j=0: [polo, anel5[1], anel5[0]] (invertido, como a tampa de cima)
    expect(F.get(47).vs).toEqual([41, 33, 40]);         // leque norte j=7 fecha o ciclo
  });

  it('esfera: winding pra FORA em TODA face (Newell·(centroide−centro) > 0 — a lição D1, agora na esfera inteira)', () => {
    const { V, F } = nucleo([['esfera', { id: 0, raio: 0.5, aneis: 6, lados: 8 }]], {}, {});
    for (const f of F.values()) {
      const n = newell(V, f.vs), c = centroide(V, f.vs);
      const d = [c[0], c[1] - 0.5, c[2]];               // centro da esfera em (0, raio, 0)
      expect(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]).toBeGreaterThan(0);
    }
  });

  it('cone: contagem V/F, numeração EXATA (anel, ápice), laterais pra fora e tampa -y (MESMO winding do fundo do cilindro)', () => {
    const { V, F, orfaos } = nucleo([['cone', { id: 0, raio: 'r', altura: 'h', lados: 'l' }]], { r: 0.4, h: 1.2 }, { l: 8 });
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(9);                             // lados + ápice
    expect(F.size).toBe(9);                             // lados laterais + tampa
    expect(V.get(0)).toEqual([0.4, 0, 0]);              // anel j=0 em +x, y=0
    expect(V.get(8)).toEqual([0, 1.2, 0]);              // ápice = b+lados, y=altura
    expect(F.get(0).vs).toEqual([0, 8, 1]);             // lateral j=0: [base[0], ápice, base[1]]
    expect(F.get(7).vs).toEqual([7, 8, 0]);             // lateral j=7 fecha o ciclo
    expect(F.get(8).vs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);   // tampa da base: ângulo crescente
    // tampa -y (fundo do cilindro) e laterais radiais pra fora
    expect(newell(V, F.get(8).vs)[1]).toBeLessThan(0);
    for (let j = 0; j < 8; j++) {
      const n = newell(V, F.get(j).vs), c = centroide(V, F.get(j).vs);
      expect(n[0] * c[0] + n[2] * c[2]).toBeGreaterThan(0);   // componente radial no XZ aponta pra fora
    }
  });

  it('plano: contagem V/F, grade linha-a-linha EXATA (cantos), quads todos +y (o ciclo da tampa de cima do cubo)', () => {
    const { V, F, orfaos } = nucleo([['plano', { id: 0, largura: 'w', profundidade: 'p', seg: 's' }]], { w: 2, p: 4 }, { s: 2 });
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(9);                             // (seg+1)²
    expect(F.size).toBe(4);                             // seg²
    // linha a linha (b + iz·(seg+1) + ix), centrado na origem, y=0:
    expect(V.get(0)).toEqual([-1, 0, -2]);              // (ix=0, iz=0)
    expect(V.get(2)).toEqual([1, 0, -2]);               // (ix=2, iz=0)
    expect(V.get(4)).toEqual([0, 0, 0]);                // o centro da grade
    expect(V.get(6)).toEqual([-1, 0, 2]);               // (ix=0, iz=2)
    expect(V.get(8)).toEqual([1, 0, 2]);                // (ix=2, iz=2)
    // faces (b + iz·seg + ix), cantos EXATOS:
    expect(F.get(0).vs).toEqual([0, 3, 4, 1]);          // célula (0,0)
    expect(F.get(3).vs).toEqual([4, 7, 8, 5]);          // célula (1,1)
    for (const f of F.values()) expect(newell(V, f.vs)[1]).toBeGreaterThan(0);   // TODO quad com normal +y
  });

  it('determinismo e replay: 2 execuções idênticas bit-a-bit + round-trip JSON da LISTA (as 3 ops juntas)', () => {
    const passos = [
      ['plano', { id: 0, largura: 2, profundidade: 2, seg: 3 }],
      ['esfera', { id: 1000, raio: 0.4, aneis: 5, lados: 7 }],
      ['cone', { id: 2000, raio: 0.3, altura: 0.9, lados: 6 }],
      ['moveV', { v: 2006, d: [0.8, 0, 0] }],           // o ápice do cone (b+lados) — id da numeração documentada
    ];
    const a = J(neutroCanonico(nucleo(passos, {}, {})));
    const b = J(neutroCanonico(nucleo(passos, {}, {})));
    expect(a).toBe(b);                                                            // 2 execuções idênticas
    expect(J(neutroCanonico(nucleo(JSON.parse(J(passos)), {}, {})))).toBe(a);     // replay do salvo (round-trip JSON) bit-a-bit
  });

  it('params por NOME (PARAMS/TOPO) resolvem como nas outras ops; mudar PARAM NÃO renumera', () => {
    // raio:'meuRaio' resolve de PARAMS — o polo norte sobe pra 2·meuRaio
    const n = nucleo([['esfera', { id: 0, raio: 'meuRaio', aneis: 'an', lados: 'la' }]], { meuRaio: 0.7 }, { an: 4, la: 6 });
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.get(1 + 3 * 6)[1]).toBeCloseTo(1.4, 12);                           // norte = b+1+(aneis-1)·lados
    const c = nucleo([['cone', { id: 0, raio: 'cr', altura: 'ch', lados: 'cl' }]], { cr: 0.2, ch: 2.5 }, { cl: 5 });
    expect(c.V.get(5)).toEqual([0, 2.5, 0]);                                      // ápice em y=altura
    const p = nucleo([['plano', { id: 0, largura: 'w', profundidade: 'pr', seg: 'sg' }]], { w: 6, pr: 3 }, { sg: 2 });
    expect(p.V.get(8)).toEqual([3, 0, 1.5]);                                      // canto (+x,+z) = [largura/2, 0, profundidade/2]
    // nome que NÃO existe em PARAMS/TOPO grita ALTO (o contrato do st.num)
    expect(() => nucleo([['esfera', { id: 0, raio: 'fantasma' }]], {}, {})).toThrow(/fantasma/);
    // PARAM não renumera: mesmos ids, posições diferentes (a lei que separa PARAMS de TOPO)
    const e1 = neutroCanonico(nucleo([['esfera', { id: 0, raio: 'r' }]], { r: 0.5 }, {}));
    const e2 = neutroCanonico(nucleo([['esfera', { id: 0, raio: 'r' }]], { r: 0.9 }, {}));
    expect(e2.V.map((row: any[]) => row[0])).toEqual(e1.V.map((row: any[]) => row[0]));
    expect(e2.F).toEqual(e1.F);
    expect(J(e2.V)).not.toBe(J(e1.V));
  });

  it('órfão grita, nunca corrompe: moveV num id que a numeração das 3 ops NÃO criou', () => {
    // esfera 6×8: maior vértice = 41 (o norte) -> 42 não existe
    const e = nucleo([['esfera', { id: 0, raio: 0.5, aneis: 6, lados: 8 }], ['moveV', { v: 42, d: [0, 1, 0] }]], {}, {});
    expect(e.orfaos).toHaveLength(1);
    expect(e.orfaos[0]).toMatchObject({ passo: 1, op: 'moveV', ref: 42 });
    expect(e.V.size).toBe(42);                          // malha intacta
    // cone 8 lados: maior vértice = 8 (ápice) -> 9 não existe
    const c = nucleo([['cone', { id: 0, lados: 8 }], ['moveV', { v: 9, d: [1, 0, 0] }]], {}, {});
    expect(c.orfaos.some((o: any) => o.op === 'moveV' && o.ref === 9)).toBe(true);
    expect(c.V.size).toBe(9);
    // plano seg 2: maior vértice = 8 -> 9 não existe
    const p = nucleo([['plano', { id: 0, seg: 2 }], ['moveV', { v: 9, d: [0, 1, 0] }]], {}, {});
    expect(p.orfaos.some((o: any) => o.op === 'moveV' && o.ref === 9)).toBe(true);
    expect(p.V.size).toBe(9);
  });

  it('guarda de overflow (D3): aneis/lados/seg gigantes estouram o bloco com throw; o limite exato ainda passa', () => {
    expect(() => nucleo([['esfera', { id: 0, aneis: 200, lados: 10 }]], {}, {})).toThrow(/estoura o bloco/);   // 2000 faces
    expect(() => nucleo([['esfera', { id: 0, aneis: 2, lados: 501 }]], {}, {})).toThrow(/estoura o bloco/);    // 503 vértices MAS 1002 faces — a guarda de FACE pega
    expect(() => nucleo([['esfera', { id: 0, aneis: 125, lados: 8 }]], {}, {})).not.toThrow();                 // 994 V / 1000 F: no limite, passa
    expect(() => nucleo([['cone', { id: 0, lados: 1000 }]], {}, {})).toThrow(/estoura o bloco/);               // 1001 vértices/faces
    expect(() => nucleo([['cone', { id: 0, lados: 999 }]], {}, {})).not.toThrow();                             // 1000: no limite, passa
    expect(() => nucleo([['plano', { id: 0, seg: 31 }]], {}, {})).toThrow(/estoura o bloco/);                  // 32² = 1024 vértices
    expect(() => nucleo([['plano', { id: 0, seg: 30 }]], {}, {})).not.toThrow();                               // 31² = 961: passa
  });

  it('TOPO muda a CONTAGEM (renumera) e o id de primitiva incompatível com a posição grita — as leis valem pras ops novas', () => {
    expect(nucleo([['esfera', { id: 0, aneis: 6, lados: 8 }]], {}, {}).V.size).toBe(42);
    expect(nucleo([['esfera', { id: 0, aneis: 6, lados: 10 }]], {}, {}).V.size).toBe(52);
    const n = nucleo([['plano', { id: 0 }], ['esfera', { id: 999 }]], {}, {});    // id escrito ≠ base da posição (1000)
    expect(n.orfaos.some((o: any) => o.op === 'esfera' && o.motivo.includes('posição'))).toBe(true);
  });

  it('adaptarV3 come o mix triângulo/quad/n-gon das 3 ops (leque por face) — contagem de floats EXATA', () => {
    const passos = [
      ['plano', { id: 0, largura: 3, profundidade: 2, seg: 4 }],      // 16 quads -> 32 tris
      ['esfera', { id: 1000, raio: 0.5, aneis: 6, lados: 10 }],       // 10 + 40·2 + 10 = 100 tris
      ['cone', { id: 2000, raio: 0.35, altura: 0.85, lados: 8 }],     // 8 laterais + 8-gon (6 tris) = 14 tris
    ];
    const r: any = adaptarV3(nucleo(passos, {}, {}), fakeCtx);
    expect(r.lotes).toHaveLength(1);                                  // sem parte/material -> um lote só
    expect(r.lotes[0].mesh.v.length).toBe(146 * 3 * 8);               // 3504 floats (8/vértice, sem esqueleto)
  });

  it('peça-exemplo _primitivas: sem órfãos, contagens certas, colisão = o chão (raio meia-diagonal, altura 0)', async () => {
    const pUrl = new URL('../../prototipos/fps/v3/pecas/_primitivas.js', import.meta.url);
    const peca: any = await import(fileURLToPath(pUrl));
    const n = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO);
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.size).toBe(25 + 52 + 9);                 // plano seg4 + esfera 6×10 + cone 8
    expect(n.F.size).toBe(16 + 60 + 9);
    // o cone foi DESLOCADO por moveV usando a numeração documentada: ápice em x=1.0
    expect(n.V.get(2008)).toEqual([1, peca.PARAMS.coneAlt, 0]);
    // colisão calculada nas faces solido (o chão): meia-diagonal do plano, altura 0
    expect(peca.meta.colisao.forma).toBe('cilindro');
    expect(peca.meta.colisao.raio).toBeCloseTo(Math.hypot(peca.PARAMS.chaoL / 2, peca.PARAMS.chaoP / 2), 6);
    expect(peca.meta.colisao.altura).toBeCloseTo(0, 9);
    const obj: any = executar(peca.PASSOS, peca.PARAMS, peca.TOPO, fakeCtx);
    expect(obj.lotes).toHaveLength(1);
    expect(obj.lotes[0].mesh.v.length % 8).toBe(0);
  });
});

/* P2 do playground — `lathe` (perfil `[[raio,y],...]` girado em torno do eixo Y).
   Prova por MEDIÇÃO: numeração EXATA de vértice/face (formato salvo, travada aqui)
   num perfil MISTO (polo+anel+anel+polo, a "coluna" do doc) e num perfil só-anéis;
   determinismo/replay; a reserva do 3º elemento GRITA sem corromper (2 elementos =
   reto, PRA SEMPRE); raio<0 e perfil<2 pontos GRITAM e não constroem nada nesse
   passo; polo↔polo adjacente GRITA e só aquele segmento fica sem face; guarda de
   overflow no limite EXATO (vértice e face, independentes, como a esfera);
   params por NOME; e um teste de MANIFOLD no `_torno` (fechado nas duas pontas)
   — toda aresta dirigida a→b pareada com b→a exatamente 1×, prova watertight +
   winding consistente, como o revisor fez no P1 (D-114). */
describe('P2 — lathe (perfil de revolução)', () => {
  const J = (x: any) => JSON.stringify(x);
  const fakeCtx = { tex: { texCanvas: (w: number, h: number, fn: any) => ({ width: w, height: h, fn }) }, m4: { ident: () => new Float32Array(16) } };
  // Newell inline (a do núcleo não é exportada) — o MESMO teste do D1/P1
  const newell = (V: any, vs: number[]) => {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < vs.length; k++) {
      const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]);
      nx += (c[1] - n[1]) * (c[2] + n[2]); ny += (c[2] - n[2]) * (c[0] + n[0]); nz += (c[0] - n[0]) * (c[1] + n[1]);
    }
    return [nx, ny, nz];
  };

  it('numeração EXATA num perfil MISTO (polo→anel→anel→polo, a "coluna" do doc): ids de vértice e de face travados', () => {
    // [[0,0],[1,0],[1,2],[0,2]] com lados=4: polo, anel, anel, polo — as tampas nascem dos leques de polo, de graça
    const { V, F, orfaos } = nucleo([['lathe', { id: 0, perfil: [[0, 0], [1, 0], [1, 2], [0, 2]], lados: 4 }]], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(10);   // polo(1) + anel(4) + anel(4) + polo(1)
    expect(F.size).toBe(12);   // 3 segmentos não-degenerados × 4 lados
    // VÉRTICES: polo0=b+0; anel1 j=0..3 -> b+1..b+4; anel2 j=0..3 -> b+5..b+8; polo1=b+9
    expect(V.get(0)).toEqual([0, 0, 0]);
    expect(V.get(1)).toEqual([1, 0, 0]);                       // anel1 j=0 em +x
    expect(V.get(5)).toEqual([1, 2, 0]);                       // anel2 j=0 em +x (mesmo ângulo)
    expect(V.get(9)).toEqual([0, 2, 0]);
    // FACES: seg0 (polo→anel) leque SUL da esfera: [polo, anel[j], anel[j+1]]
    expect(F.get(0).vs).toEqual([0, 1, 2]);
    expect(F.get(3).vs).toEqual([0, 4, 1]);                    // fecha o ciclo (j=3, n=0)
    // seg1 (anel→anel) quad, a faixa da esfera: [baixo[j], cima[j], cima[j+1], baixo[j+1]]
    expect(F.get(4).vs).toEqual([1, 5, 6, 2]);
    expect(F.get(7).vs).toEqual([4, 8, 5, 1]);                 // fecha o ciclo
    // seg2 (anel→polo) leque NORTE da esfera (invertido): [polo, anel[j+1], anel[j]]
    expect(F.get(8).vs).toEqual([9, 6, 5]);
    expect(F.get(11).vs).toEqual([9, 5, 8]);                   // fecha o ciclo
  });

  it('numeração EXATA num perfil SÓ-ANÉIS (sem polo nenhum): vira uma faixa cilíndrica só de quads', () => {
    const { V, F, orfaos } = nucleo([['lathe', { id: 0, perfil: [[1, 0], [2, 1]], lados: 4 }]], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(8);    // 2 anéis × 4 lados, nenhum polo
    expect(F.size).toBe(4);    // 1 segmento × 4 lados
    expect(V.get(0)).toEqual([1, 0, 0]);
    expect(V.get(4)).toEqual([2, 1, 0]);
    expect(F.get(0).vs).toEqual([0, 4, 5, 1]);
    expect(F.get(3).vs).toEqual([3, 7, 4, 0]);
  });

  it('winding pra FORA em TODA face dos dois perfis acima (Newell·raio-XZ > 0 nas paredes; a tampa achatada usa Y — como o D1)', () => {
    // perfil misto: as duas faces do MEIO (quads, seg1) são radiais puras — teste direto, igual ao cone/esfera
    const { V, F } = nucleo([['lathe', { id: 0, perfil: [[0, 0], [1, 0], [1, 2], [0, 2]], lados: 8 }]], {}, {});
    for (let j = 0; j < 8; j++) {
      const f = F.get(8 + j);   // seg1 (anel->anel) começa em 8 com lados=8 (leque sul 0..7, quads 8..15, leque norte 16..23)
      const c = [0, 0, 0]; for (const v of f.vs) { const p = V.get(v); c[0] += p[0]; c[2] += p[2]; }
      const n = newell(V, f.vs);
      expect(n[0] * c[0] + n[2] * c[2]).toBeGreaterThan(0);   // radial pra fora, sem ambiguidade (parede vertical)
    }
  });

  it('determinismo (2×) + replay round-trip JSON da lista (o formato salvo)', () => {
    const passos = [['lathe', { id: 0, perfil: [[0, 0], [1, 0], [1, 1], [0, 1]], lados: 5 }]];
    const a = J(neutroCanonico(nucleo(passos, {}, {})));
    const b = J(neutroCanonico(nucleo(passos, {}, {})));
    expect(a).toBe(b);
    expect(J(neutroCanonico(nucleo(JSON.parse(J(passos)), {}, {})))).toBe(a);
  });

  it('3º elemento do ponto GRITA (a reserva da alça de curva) e NÃO corrompe: constrói RETO, idêntico a um ponto de 2 elementos', () => {
    const comAlca = nucleo([['lathe', { id: 0, perfil: [[0, 0], [1, 0, { tipo: 'curva' }], [1, 1], [0, 1]], lados: 4 }]], {}, {});
    expect(comAlca.orfaos).toHaveLength(1);
    expect(comAlca.orfaos[0]).toMatchObject({ op: 'lathe', ref: 1 });
    expect(comAlca.orfaos[0].motivo).toMatch(/reserva/i);
    // a malha É a mesma de sem o 3º elemento — a reserva GRITA mas constrói reto (nunca ignora em silêncio, nunca corrompe)
    const semAlca = nucleo([['lathe', { id: 0, perfil: [[0, 0], [1, 0], [1, 1], [0, 1]], lados: 4 }]], {}, {});
    expect(J(neutroCanonico(comAlca))).not.toBe(J(neutroCanonico(semAlca)));   // difere só pelo orfaos registrado...
    expect(comAlca.V.size).toBe(semAlca.V.size);
    expect(comAlca.F.size).toBe(semAlca.F.size);
    expect([...comAlca.V.values()]).toEqual([...semAlca.V.values()]);         // ...a GEOMETRIA é idêntica (2 elementos == reto, pra sempre)
    // um ponto NORMAL de 2 elementos nunca dispara a reserva (sem falso-positivo)
    expect(semAlca.orfaos).toHaveLength(0);
  });

  it('raio<0 GRITA e a op inteira não constrói NADA neste passo (não dá pra classificar polo/anel — nunca corrompe)', () => {
    const n = nucleo([['lathe', { id: 0, perfil: [[0, 0], [-1, 0], [1, 1], [0, 2]], lados: 4 }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'lathe', ref: 1 });
    expect(n.orfaos[0].motivo).toMatch(/raio negativo/i);
    expect(n.V.size).toBe(0);
    expect(n.F.size).toBe(0);
  });

  it('perfil com menos de 2 pontos GRITA (0 e 1 ponto) e não constrói nada', () => {
    const vazio = nucleo([['lathe', { id: 0, perfil: [], lados: 4 }]], {}, {});
    expect(vazio.orfaos).toHaveLength(1);
    expect(vazio.orfaos[0]).toMatchObject({ op: 'lathe', motivo: expect.stringMatching(/ao menos 2 pontos/i) });
    expect(vazio.V.size).toBe(0);
    const um = nucleo([['lathe', { id: 0, perfil: [[1, 0]], lados: 4 }]], {}, {});
    expect(um.orfaos).toHaveLength(1);
    expect(um.V.size).toBe(0);
  });

  it('polo↔polo adjacente GRITA (perfil degenerado): só AQUELE segmento fica sem face — o resto do perfil segue normal', () => {
    // dois polos seguidos (y diferentes) + 1 anel: só o segmento polo-polo não gera face
    const n = nucleo([['lathe', { id: 0, perfil: [[0, 0], [0, 1], [1, 2]], lados: 4 }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'lathe', ref: 0 });
    expect(n.orfaos[0].motivo).toMatch(/polo.*polo|degenerado/i);
    expect(n.V.size).toBe(6);     // os 2 polos + o anel de 4 ainda existem (só a FACE entre os polos que falta)
    expect(n.F.size).toBe(4);     // só o segmento polo->anel contribuiu (o leque de 4)
    expect([...n.F.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);   // cursor de face não pulou id nenhum
  });

  it('guarda de overflow (D3) no limite EXATO — vértice (perfil só-anéis) e face (perfil alternando polo/anel) de forma independente', () => {
    // limite de VÉRTICE: 2 anéis × lados=500 -> 1000 vértices exatos (passa); 501 -> 1002 (estoura)
    expect(() => nucleo([['lathe', { id: 0, perfil: [[1, 0], [1, 1]], lados: 500 }]], {}, {})).not.toThrow();
    expect(() => nucleo([['lathe', { id: 0, perfil: [[1, 0], [1, 1]], lados: 501 }]], {}, {})).toThrow(/estoura o bloco/);
    // limite de FACE, independente do de vértice: perfil ALTERNANDO anel/polo (barato em vértice, caro em face —
    // todo segmento é anel<->polo, nunca degenerado) com lados=8. N=126 pontos (63 anéis+63 polos) -> 567 V / 1000 F exatos (passa);
    // N=127 -> 575 V / 1008 F (a guarda de FACE estoura primeiro, o vértice nem chegou perto do bloco)
    const alternado = (nPontos: number) => Array.from({ length: nPontos }, (_, k) => (k % 2 === 0 ? [1, k] : [0, k]));
    expect(() => nucleo([['lathe', { id: 0, perfil: alternado(126), lados: 8 }]], {}, {})).not.toThrow();
    expect(() => nucleo([['lathe', { id: 0, perfil: alternado(127), lados: 8 }]], {}, {})).toThrow(/estoura o bloco/);
  });

  it('params por NOME (raio e y) resolvem como nas outras ops; mudar o VALOR do PARAM não renumera', () => {
    const n = nucleo([['lathe', { id: 0, perfil: [[0, 'baseY'], ['r1', 'y1'], [0, 'topoY']], lados: 6 }]], { baseY: 0, r1: 0.5, y1: 1, topoY: 2 }, {});
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.get(0)).toEqual([0, 0, 0]);
    expect(n.V.get(7)).toEqual([0, 2, 0]);                     // polo do topo em y=topoY
    // nome que não existe em PARAMS/TOPO grita ALTO (o contrato do st.num, igual às outras ops)
    expect(() => nucleo([['lathe', { id: 0, perfil: [[0, 0], ['fantasma', 1]] }]], {}, {})).toThrow(/fantasma/);
    // mudar o VALOR do PARAM não renumera: mesmos ids, mesma topologia, só a posição muda
    const passos = [['lathe', { id: 0, perfil: [[0, 0], ['r', 1], [0, 2]], lados: 6 }]];
    const pequeno = neutroCanonico(nucleo(passos, { r: 0.3 }, {}));
    const grande = neutroCanonico(nucleo(passos, { r: 0.9 }, {}));
    expect(grande.V.map((row: any[]) => row[0])).toEqual(pequeno.V.map((row: any[]) => row[0]));
    expect(grande.F).toEqual(pequeno.F);
    expect(J(grande.V)).not.toBe(J(pequeno.V));
  });

  it('adaptarV3 come o mix quad/triângulo do lathe (leque por face) — contagem de floats EXATA, sem tocar em adaptarV3', () => {
    // perfil misto lados=6: 2 leques (6 tris) + 1 faixa de quads (6 quads -> 12 tris) = 24 triângulos
    const passos = [['lathe', { id: 0, perfil: [[0, 0], [1, 0], [1, 1], [0, 1]], lados: 6 }]];
    const r: any = adaptarV3(nucleo(passos, {}, {}), fakeCtx);
    expect(r.lotes).toHaveLength(1);
    expect(r.lotes[0].mesh.v.length).toBe(24 * 3 * 8);   // 24 triângulos × 3 vértices × 8 floats
  });

  it('peça-exemplo _torno (peão de xadrez): sem órfãos, V/F exatos, watertight+winding por MANIFOLD (toda aresta a→b pareada com b→a 1×)', async () => {
    const pUrl = new URL('../../prototipos/fps/v3/pecas/_torno.js', import.meta.url);
    const peca: any = await import(fileURLToPath(pUrl));
    const { V, F, orfaos } = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO);
    expect(orfaos).toHaveLength(0);
    // 10 pontos (2 polos + 8 anéis) × lados=12: V=2+8·12=98; 9 segmentos não-degenerados: F=9·12=108
    expect(V.size).toBe(2 + 8 * peca.TOPO.lados);
    expect(F.size).toBe(9 * peca.TOPO.lados);
    expect(V.size).toBe(98);
    expect(F.size).toBe(108);

    // MANIFOLD: toda aresta DIRIGIDA a->b (cada canto de cada face) tem exatamente 1 par reverso b->a.
    // Prova watertight (nenhuma aresta desemparelhada = nenhum buraco) E winding CONSISTENTE (nenhuma
    // aresta duplicada no MESMO sentido = nenhuma face virada ao contrário da vizinha) — o mesmo método
    // que o revisor adversarial usou no P1 (D-114) pra esfera/cone.
    const dirigidas = new Map<string, number>();
    let cantos = 0;
    for (const f of F.values()) {
      const vs = f.vs; cantos += vs.length;
      for (let k = 0; k < vs.length; k++) {
        const key = `${vs[k]}>${vs[(k + 1) % vs.length]}`;
        dirigidas.set(key, (dirigidas.get(key) || 0) + 1);
      }
    }
    expect(dirigidas.size).toBe(cantos);          // nenhuma aresta dirigida duplicada (não-manifold local)
    let semPar = 0;
    for (const key of dirigidas.keys()) {
      const [a, b] = key.split('>');
      if (!dirigidas.has(`${b}>${a}`)) semPar++;
    }
    expect(semPar).toBe(0);                        // nenhuma aresta sem par reverso -> ESTANQUE (watertight)

    // semente de ORIENTAÇÃO: o leque da base (F0, achatado em y=0) aponta pra -y — como a tampa de
    // baixo do cilindro (D1). Manifold consistente + esta semente pra fora => TODA face aponta pra fora.
    expect(newell(V, F.get(0)!.vs)[1]).toBeLessThan(0);

    // colisão sã (encaixa o peão inteiro via `solido`) e executar/adaptarV3 saem limpos
    expect(peca.meta.colisao.forma).toBe('cilindro');
    expect(peca.meta.colisao.raio).toBeCloseTo(peca.PARAMS.pesR, 6);
    expect(peca.meta.colisao.altura).toBeCloseTo(peca.PARAMS.topoY, 6);
    const obj: any = executar(peca.PASSOS, peca.PARAMS, peca.TOPO, fakeCtx);
    expect(obj.lotes).toHaveLength(1);
    expect(obj.lotes[0].mesh.v.length % 8).toBe(0);
  });
});
