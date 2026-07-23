/* Vitest do NÚCLEO da OFICINA (passo 1): prova os invariantes de identidade —
   numeração determinística e POSICIONAL (re-rodar dá ids idênticos), identidade
   estável sob mudança de PARAM (mudar `raio` não renumera), mudança de TOPO
   renumera E reporta órfãos (lei "órfão grita, nunca corrompe"), e a mescla
   de/para (a interação mais delicada, a primeira a ganhar teste de verdade). */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — módulo .js do motor v3 (sem tipos; roda puro no vitest/esbuild)
import { nucleo, neutroCanonico, adaptarV3, executar, colisaoDe, BLOCO } from '../../prototipos/fps/v3/motor/oficina.js';

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
