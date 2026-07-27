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

describe('Fase 3 - fixture de invalidacao estrutural por apagaFace', () => {
  const ctx = { tex: { texCanvas: (w: number, h: number) => ({ width: w, height: h }) }, m4: { ident: () => new Float32Array(16) } };
  const topo = { op: 'cubo', id: 70, face: 'topo' }, frente = { op: 'cubo', id: 70, face: 'frente' };
  const aliases: any = [['topo', { origem: topo }], ['frente', { origem: frente }], ['topoEfrente', { unir: [{ origem: topo }, { origem: frente }] }]];
  const cubo = (id = 0, origemId = 70): any => ['cubo', { id, lado: 1, origemId }];
  const geo = (n: any) => { const c: any = neutroCanonico(n); return JSON.stringify({ V: c.V, F: c.F }); };

  it('apaga topo pelo nome, invalida-o por inteiro e preserva frente', () => {
    const antes = nucleo([cubo(), ['pincel', { modo: 'face', sel: { alias: 'topo' }, cor: '#123456' }]], {}, {}, {}, null, aliases);
    expect(antes.orfaos).toHaveLength(0); expect(antes.F.get(1)!.cor).toBe('#123456');
    const soRemocao = nucleo([cubo(), ['apagaFace', { sel: { alias: 'topo' } }]], {}, {}, {}, null, aliases);
    const depois = nucleo([cubo(), ['apagaFace', { sel: { alias: 'topo' } }], ['pincel', { modo: 'face', sel: { alias: 'topo' }, cor: '#f00' }], ['parte', { nome: 'sumiu', sel: { alias: 'topo' } }], ['transladar', { d: [3, 0, 0], sel: { alias: 'topo' } }], ['pincel', { modo: 'face', sel: { alias: 'frente' }, cor: '#0f0' }]], {}, {}, {}, null, aliases);
    expect(soRemocao.orfaos).toHaveLength(0); expect(soRemocao.F.has(1)).toBe(false);
    for (const op of ['pincel', 'parte', 'transladar']) expect(depois.orfaos.some((o: any) => o.op === op && /removida/.test(o.motivo))).toBe(true);
    expect(depois.F.get(4)!.cor).toBe('#0f0'); expect([...depois.F.values()].filter((f: any) => f.id !== 4 && (f.cor || f.parte || f.liso))).toEqual([]);
    const semPinturaFrente = { ...depois, F: new Map([...depois.F].map(([id, f]: any) => [id, { ...f, cor: id === 4 ? null : f.cor }])) };
    expect(geo(semPinturaFrente)).toBe(geo(soRemocao));
  });

  it('nunca recalcula topo para vizinha, face posterior ou outro cubo, inclusive com insercao anterior', () => {
    const tentativas: any[] = [[cubo(), ['apagaFace', { sel: { alias: 'topo' } }], ['pincel', { modo: 'face', sel: { alias: 'topo' }, cor: '#f00' }]], [cubo(), ['apagaFace', { sel: { alias: 'topo' } }], cubo(BLOCO, 80), ['pincel', { modo: 'face', sel: { alias: 'topo' }, cor: '#f00' }]], [['cubo', { id: 0, lado: 0.25 }], cubo(BLOCO), ['apagaFace', { sel: { alias: 'topo' } }], ['cubo', { id: BLOCO * 2, lado: 1 }], ['pincel', { modo: 'face', sel: { alias: 'topo' }, cor: '#f00' }]]];
    for (const passos of tentativas) { const n = nucleo(passos, {}, {}, {}, null, aliases); expect(n.orfaos.some((o: any) => /removida/.test(o.motivo))).toBe(true); expect([...n.F.values()].filter((f: any) => f.cor === '#f00')).toEqual([]); }
  });

  it('uniao e origem direta falham por inteiro; nao aplicam somente frente', () => {
    const composta = nucleo([cubo(), ['apagaFace', { sel: { alias: 'topo' } }], ['pincel', { modo: 'face', sel: { alias: 'topoEfrente' }, cor: '#f00' }], ['parte', { nome: 'parcial', sel: { alias: 'topoEfrente' } }], ['transladar', { d: [2, 0, 0], sel: { alias: 'topoEfrente' } }]], {}, {}, {}, null, aliases);
    const direta = nucleo([cubo(), ['apagaFace', { sel: { origem: topo } }], ['pincel', { modo: 'face', sel: { origem: topo }, cor: '#f00' }]], {}, {});
    for (const n of [composta, direta]) expect(n.orfaos.some((o: any) => /removida/.test(o.motivo))).toBe(true);
    expect(composta.F.get(4)!.cor).toBeNull(); expect(composta.F.get(4)!.parte).toBeNull(); expect(geo(composta)).toBe(geo(nucleo([cubo(), ['apagaFace', { sel: { alias: 'topo' } }]], {}, {}, {}, null, aliases))); expect([...direta.F.values()].some((f: any) => f.cor === '#f00')).toBe(false);
  });

  it('apagaFace aceita uma face pelo resolvedor comum e preserva face:id legado', () => {
    const legado = nucleo([cubo(), ['apagaFace', { face: 1 }]], {}, {}); expect(legado.orfaos).toHaveLength(0); expect(legado.F.has(1)).toBe(false);
    for (const args of [{ face: 1, sel: { alias: 'topo' } }, { sel: { f: [] } }, { sel: { alias: 'topoEfrente' } }]) { const n = nucleo([cubo(), ['apagaFace', args]], {}, {}, {}, null, aliases); expect(n.orfaos.length).toBeGreaterThan(0); expect(n.F.size).toBe(6); }
    const viaApi: any = executar([cubo(), ['apagaFace', { sel: { alias: 'topo' } }]], {}, {}, ctx, {}, {}, null, aliases); expect(viaApi.lotes.reduce((s: number, l: any) => s + l.mesh.v.length, 0)).toBe(5 * 6 * 8);
    const passos: any[] = [cubo(), ['apagaFace', { sel: { alias: 'topo' } }]]; expect(JSON.stringify(neutroCanonico(nucleo(passos, {}, {}, {}, null, aliases)))).toBe(JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(passos)), {}, {}, {}, null, JSON.parse(JSON.stringify(aliases))))));
  });

  it('aborta atomico quando a selecao tem alvo valido e qualquer diagnostico', () => {
    const base = nucleo([cubo()], {}, {}, {}, null, aliases);
    const casos: any[] = [
      { f: [1, 999999] },
      { origem: topo, f: [999999] },
      { f: [1], campoInvalido: true },
      { grupo: 'nao-existe', f: [1] },
    ];
    for (const sel of casos) {
      const n = nucleo([cubo(), ['apagaFace', { sel }],
        ['pincel', { modo: 'face', sel: { f: [999999] }, cor: '#f00' }],
        ['parte', { nome: 'nao-esconde', sel: { f: [999999] } }],
        ['transladar', { d: [2, 0, 0], sel: { f: [999999] } }],
      ], {}, {}, {}, null, aliases);
      expect(n.orfaos.some((o: any) => o.op === 'apagaFace')).toBe(true);
      for (const op of ['pincel', 'parte', 'transladar']) expect(n.orfaos.some((o: any) => o.op === op)).toBe(true);
      expect(n.F.has(1)).toBe(true);
      expect(geo(n)).toBe(geo(base));
    }
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

  /* 2º achado adversarial do P4, mas a rede é do NÚCLEO INTEIRO (todo `st.num`/
     `st.vec`): NaN/Infinity vazava por TODA op. O caso (b) — TOPO não-finito —
     é o pior porque NENHUM gate pega: a malha sai LIMPA, só com contagem
     DIFERENTE (`NaN|0` = 0 -> `Math.max(3,0)` = 3), e todo id de face dos
     passos seguintes passa a apontar pra outra face. */
  it.each([
    ['cubo (larg dimensional)', [['cubo', { id: 0, larg: NaN, alt: 1, prof: 1 }]]],
    ['cilindro (raio dimensional)', [['cilindro', { id: 0, raio: NaN, altura: 1, lados: 6 }]]],
    ['esfera (raio Infinity)', [['esfera', { id: 0, raio: Infinity, aneis: 3, lados: 6 }]]],
    ['cone (altura)', [['cone', { id: 0, raio: 0.5, altura: NaN, lados: 6 }]]],
    ['plano (largura)', [['plano', { id: 0, largura: NaN, seg: 2 }]]],
    ['lathe (raio do perfil)', [['lathe', { id: 0, lados: 6, perfil: [[0, 0], [NaN, 1], [0, 2]] }]]],
    ['loft (raio da seção)', [['loft', { id: 0, lados: 6, secoes: [{ pos: [0, 0, 0], raio: 0 }, { pos: [0, 1, 0], raio: NaN }] }]]],
    ['moveV (deslocamento)', [['cubo', { id: 0, lado: 1 }], ['moveV', { v: 0, d: [NaN, 0, 0] }]]],
    ['cilindro (lados = TOPO!)', [['cilindro', { id: 0, raio: 0.5, altura: 1, lados: NaN }]]],
  ])('valor não-finito falha ALTO (throw) em %s — nunca coordenada NaN nem contagem degradada em silêncio', (_nome, passos) => {
    expect(() => nucleo(passos as any, {}, {})).toThrow(/não-finito/);
  });

  it('TOPO não-finito NÃO degrada a contagem em silêncio (o caso que nenhum gate pegava: V=16/F=10 virava V=6/F=5 com malha limpa)', () => {
    const bom = nucleo([['cilindro', { id: 0, raio: 0.5, altura: 1, lados: 'L' }]], {}, { L: 8 });
    expect([bom.V.size, bom.F.size]).toEqual([16, 10]);
    expect(() => nucleo([['cilindro', { id: 0, raio: 0.5, altura: 1, lados: 'L' }]], {}, { L: NaN })).toThrow(/não-finito/);
  });

  it('ponto com aridade ≠ 3 falha ALTO no st.vec (rede central) — sem isso o z virava undefined -> NaN calado', () => {
    expect(() => nucleo([['cubo', { id: 0, lado: 1 }], ['moveV', { v: 0, d: [1, 2] as any }]], {}, {})).toThrow(/3 elementos/);
    expect(() => nucleo([['cubo', { id: 0, lado: 1 }], ['moveV', { v: 0, d: { x: 1 } as any }]], {}, {})).toThrow(/3 elementos/);
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

  it('3º elemento do ponto GRITA e ABORTA o passo (a reserva da alça de curva é FAIL-CLOSED — D-115: não constrói malha "reservada" que mudaria quando a curva chegar)', () => {
    const comAlca = nucleo([['lathe', { id: 0, perfil: [[0, 0], [1, 0, { tipo: 'curva' }], [1, 1], [0, 1]], lados: 4 }]], {}, {});
    expect(comAlca.orfaos).toHaveLength(1);
    expect(comAlca.orfaos[0]).toMatchObject({ op: 'lathe', ref: 1 });
    expect(comAlca.orfaos[0].motivo).toMatch(/reservad/i);
    // FAIL-CLOSED: NADA construído (0 V/0 F), como o raio<0 — impossível shipar hoje uma peça de 3º elemento
    // que renderiza reta agora e mudaria pra curva depois (o fail-open que o revisor pegou no P2)
    expect(comAlca.V.size).toBe(0);
    expect(comAlca.F.size).toBe(0);
    // um ponto NORMAL de 2 elementos nunca dispara a reserva (sem falso-positivo) e constrói de verdade
    const semAlca = nucleo([['lathe', { id: 0, perfil: [[0, 0], [1, 0], [1, 1], [0, 1]], lados: 4 }]], {}, {});
    expect(semAlca.orfaos).toHaveLength(0);
    expect(semAlca.V.size).toBeGreaterThan(0);
  });

  it('ponto malformado (aridade ≠ 2, ex. [1]) GRITA e ABORTA — não estoura com throw (NIT-3: fail-closed uniforme, não exceção crua)', () => {
    const n = nucleo([['lathe', { id: 0, perfil: [[0, 0], [1], [1, 1]], lados: 4 }]], {}, {});   // ponto do meio tem 1 elemento
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'lathe', ref: 1 });
    expect(n.V.size).toBe(0);
    expect(n.F.size).toBe(0);
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

/* P3 do playground — `rotaciona` (gira uma seleção, SIMPLES: NUNCA cria id) +
   `espelha` (duplica uma seleção refletida, ids NOVOS — formato salvo). Prova
   por MEDIÇÃO: rotaciona — posições EXATAS (90°/180°, cada eixo), pivô
   default=CENTROIDE vs explícito (resultado diferente), seleção por v e por
   f, NUNCA cria vértice/face, `graus` por NOME de PARAM, id/eixo inválido
   grita. espelha — contagem V/F nova exata, a numeração orig->espelho
   id-a-id (o WELD comprovado: vértice EXATAMENTE no plano compartilha id,
   fora do plano duplica), winding REVERTIDO medido por Newell (comparado
   contra a face real equivalente do cubo — a lição D1), herança de
   atributo, determinismo/replay, face/eixo inválido grita, guarda de
   overflow (D3) no limite EXATO isolando cada dimensão (face sozinha via
   base 100% soldada — zero vértice novo; vértice sozinho via plano de seg
   ÍMPAR, que não tem coluna central coincidindo com o plano), e o teste de
   MANIFOLD na peça-exemplo `_espelhado` (a costura soldada fecha o par de
   chifres — o mesmo método que o revisor usou no P1/P2 pra esfera/torno). */
describe('P3 — espelha + rotaciona (seleção transformada)', () => {
  const J = (x: any) => JSON.stringify(x);
  const fakeCtx = { tex: { texCanvas: (w: number, h: number, fn: any) => ({ width: w, height: h, fn }) }, m4: { ident: () => new Float32Array(16) } };
  // Newell inline (a do núcleo não é exportada) — o MESMO teste de direção do D1/P1/P2
  const newell = (V: any, vs: number[]) => {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < vs.length; k++) {
      const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]);
      nx += (c[1] - n[1]) * (c[2] + n[2]); ny += (c[2] - n[2]) * (c[0] + n[0]); nz += (c[0] - n[0]) * (c[1] + n[1]);
    }
    return [nx, ny, nz];
  };

  describe('rotaciona', () => {
    it('90°/180° em torno de cada eixo dá as posições EXATAS (pivô explícito na origem)', () => {
      // cubo lado=2: v1 = (1,0,-1) (canto conhecido) — gira a malha INTEIRA (sel ausente)
      const rot = (eixo: string, graus: number) => nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo, graus, pivo: [0, 0, 0] }]], {}, {}).V.get(1)!;
      const x90 = rot('x', 90); expect(x90[0]).toBeCloseTo(1, 12); expect(x90[1]).toBeCloseTo(1, 12); expect(x90[2]).toBeCloseTo(0, 12);
      const y90 = rot('y', 90); expect(y90[0]).toBeCloseTo(-1, 12); expect(y90[1]).toBeCloseTo(0, 12); expect(y90[2]).toBeCloseTo(-1, 12);
      const z90 = rot('z', 90); expect(z90[0]).toBeCloseTo(0, 12); expect(z90[1]).toBeCloseTo(1, 12); expect(z90[2]).toBeCloseTo(-1, 12);
      const y180 = rot('y', 180); expect(y180[0]).toBeCloseTo(-1, 12); expect(y180[1]).toBeCloseTo(0, 12); expect(y180[2]).toBeCloseTo(1, 12);
    });

    it('pivô default = CENTROIDE da seleção (medido ANTES de girar); pivô explícito dá resultado DIFERENTE', () => {
      // v1=(1,0,-1), v2=(1,0,1) -> centroide (1,0,0): girar 90° em Y ao redor do centroide leva os dois
      // pontos pra posições fáceis de conferir (x=0 e x=2, z~0) — não-trivial, prova a MÉDIA de verdade
      const { V } = nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo: 'y', graus: 90, sel: { v: [1, 2] } }]], {}, {});
      expect(V.get(1)![0]).toBeCloseTo(0, 12); expect(V.get(1)![1]).toBeCloseTo(0, 12); expect(V.get(1)![2]).toBeCloseTo(0, 12);
      expect(V.get(2)![0]).toBeCloseTo(2, 12); expect(V.get(2)![1]).toBeCloseTo(0, 12); expect(V.get(2)![2]).toBeCloseTo(0, 12);
      // MESMA seleção, pivô EXPLÍCITO na origem -> resultado DIFERENTE (prova que o default é a média, não coincidência)
      const { V: V2 } = nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo: 'y', graus: 90, pivo: [0, 0, 0], sel: { v: [1, 2] } }]], {}, {});
      expect(Math.abs(V2.get(1)![0] - V.get(1)![0])).toBeGreaterThan(0.5);
    });

    it('seleção por v e por f (face contribui os ids dos seus PRÓPRIOS cantos); fora da seleção fica INTOCADO', () => {
      const base = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
      // sel por v: só v1 gira
      const porV = nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo: 'y', graus: 90, pivo: [0, 0, 0], sel: { v: [1] } }]], {}, {});
      expect(porV.V.get(0)).toEqual(base.V.get(0));             // intocado
      expect(porV.V.get(1)![0]).toBeCloseTo(-1, 12);            // girado

      // sel por f: face 3 (+x, cantos [2,1,5,6]) gira os 4 cantos DELA; o resto do cubo fica intacto
      const porF = nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo: 'y', graus: 90, pivo: [0, 0, 0], sel: { f: [3] } }]], {}, {});
      expect(porF.V.get(0)).toEqual(base.V.get(0));             // fora da seleção, intocado
      for (const v of [1, 2, 5, 6]) expect(porF.V.get(v)).not.toEqual(base.V.get(v));   // os 4 cantos da face giraram
    });

    it('NUNCA cria vértice/face — mesma contagem e mesmos ids antes/depois', () => {
      const antes = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
      const depois = nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo: 'y', graus: 37 }]], {}, {});
      expect(depois.V.size).toBe(antes.V.size);
      expect(depois.F.size).toBe(antes.F.size);
      expect([...depois.V.keys()].sort((a, b) => a - b)).toEqual([...antes.V.keys()].sort((a, b) => a - b));
      expect([...depois.F.keys()].sort((a, b) => a - b)).toEqual([...antes.F.keys()].sort((a, b) => a - b));
    });

    it('`graus` por NOME de PARAM (como as outras ops dimensionais); nome inexistente grita ALTO', () => {
      const { V } = nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo: 'x', graus: 'meuAngulo', pivo: [0, 0, 0] }]], { meuAngulo: 90 }, {});
      expect(V.get(1)![1]).toBeCloseTo(1, 12);
      expect(() => nucleo([['cubo', { id: 0, lado: 1 }], ['rotaciona', { eixo: 'x', graus: 'fantasma' }]], {}, {})).toThrow(/fantasma/);
    });

    it('id/face inexistente na seleção e eixo desconhecido GRITAM (órfão) — nunca corrompem', () => {
      const { orfaos, V } = nucleo([['cubo', { id: 0, lado: 2 }], ['rotaciona', { eixo: 'y', graus: 90, pivo: [0, 0, 0], sel: { v: [1, 999] } }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ passo: 1, op: 'rotaciona', ref: 999 });
      expect(V.size).toBe(8);                    // malha intacta
      expect(V.get(1)![0]).toBeCloseTo(-1, 12);   // o id válido da seleção girou normalmente

      const f = nucleo([['cubo', { id: 0, lado: 1 }], ['rotaciona', { eixo: 'y', graus: 10, sel: { f: [999] } }]], {}, {});
      expect(f.orfaos.some((o: any) => o.op === 'rotaciona' && o.ref === 999)).toBe(true);

      const e = nucleo([['cubo', { id: 0, lado: 1 }], ['rotaciona', { eixo: 'w', graus: 10 }]], {}, {});
      expect(e.orfaos[0]).toMatchObject({ op: 'rotaciona', ref: 'w' });
      expect(e.orfaos[0].motivo).toMatch(/desconhecido/);
      expect(e.V.size).toBe(8);
    });
  });

  describe('espelha', () => {
    it('contagem V/F nova EXATA (sem weld: plano do espelho longe de tudo)', () => {
      const { V, F, orfaos } = nucleo([['plano', { id: 0, largura: 2, profundidade: 2, seg: 1 }], ['espelha', { eixo: 'x', pos: 5 }]], {}, {});
      expect(orfaos).toHaveLength(0);
      expect(V.size).toBe(8);    // 4 originais + 4 novos (nenhum solda, pos=5 longe de x=±1)
      expect(F.size).toBe(2);    // 1 original + 1 nova
      // reflexão EXATA: coord' = 2·pos − coord, só o eixo x muda
      expect(V.get(1000)).toEqual([2 * 5 - -1, 0, -1]);   // era v(0,0)=(-1,0,-1)
      expect(V.get(1003)).toEqual([2 * 5 - 1, 0, 1]);     // era v(1,1)=(1,0,1)
    });

    it('numeração orig->espelho id-a-id (formato salvo): weld dos cantos EXATOS no plano + id novo pros de fora', () => {
      // cubo lado=2; move 2 cantos da face +x pro plano x=0 EXATO (soldam); os outros 2 ficam em x=1 (duplicam)
      const passos = [
        ['cubo', { id: 0, lado: 2 }],
        ['moveV', { v: 1, d: [-1, 0, 0] }],   // v1 (1,0,-1) -> (0,0,-1) EXATO
        ['moveV', { v: 2, d: [-1, 0, 0] }],   // v2 (1,0,1)  -> (0,0,1)  EXATO
        ['espelha', { eixo: 'x', pos: 0, sel: { f: [3] } }],   // face +x, cantos [2,1,5,6] (2,1 no plano; 5,6 fora)
      ];
      const { V, F, orfaos } = nucleo(passos, {}, {});
      expect(orfaos).toHaveLength(0);
      // mapa (ordem CRESCENTE de id original 1,2,5,6): 1->1 (solda) 2->2 (solda) 5->3000 (1º livre) 6->3001 (2º livre)
      expect(V.size).toBe(10);                                 // 8 originais + só 2 novos (1,2 soldaram)
      expect(V.get(3000)).toEqual([-1, 2, -1]);                // espelho de v5=(1,2,-1) em x=0 -> (-1,2,-1)
      expect(V.get(3001)).toEqual([-1, 2, 1]);                 // espelho de v6=(1,2,1)
      // face nova (b=baseDoPasso(3)=3000): cantos = mapa([2,1,5,6]) = [2,1,3000,3001], REVERTIDO = [3001,3000,1,2]
      expect(F.get(3000)!.vs).toEqual([3001, 3000, 1, 2]);
    });

    it('WELD: vértice EXATAMENTE no plano é COMPARTILHADO (a contagem prova); vértice fora duplica', () => {
      // uma parede (quad lateral) do cilindro: 2 cantos na base (y=0) soldam, 2 no topo (y=2) duplicam
      const n = nucleo([['cilindro', { id: 0, raio: 1, altura: 2, lados: 3 }], ['espelha', { eixo: 'y', pos: 0, sel: { f: [0] } }]], {}, {});
      const base = 1000;   // baseDoPasso(1)
      // a face lateral tem 2 cantos em y=0 (soldam) e 2 em y=2 (duplicam) -> só 2 vértices novos
      expect([...n.V.keys()].filter((k) => k >= base).length).toBe(2);
      expect(n.F.get(base)).toBeDefined();                    // a face espelhada existe (não é degenerada — não está toda no plano)
    });

    it('BLOQUEIA-consertado: face INTEIRAMENTE no plano GRITA e é PULADA (sem duplicata coincidente — o polo↔polo do lathe pro espelho)', () => {
      const semWeld = nucleo([['plano', { id: 0, largura: 2, profundidade: 2, seg: 1 }], ['espelha', { eixo: 'y', pos: 5 }]], {}, {});   // pos=5 -> nada solda, espelho REAL
      expect(semWeld.V.size).toBe(8);
      expect(semWeld.F.size).toBe(2);                         // original + espelhada (legítima, em y=10)
      const degen = nucleo([['plano', { id: 0, largura: 2, profundidade: 2, seg: 1 }], ['espelha', { eixo: 'y', pos: 0 }]], {}, {});   // pos=0 == y do plano -> a espelhada seria coincidente
      expect(degen.V.size).toBe(4);                           // nenhum vértice novo (todos soldados)
      expect(degen.F.size).toBe(1);                           // a face degenerada foi PULADA — só a original resta
      expect(degen.F.has(1000)).toBe(false);                  // NÃO criou a coincidente
      expect(degen.orfaos.some((o: any) => o.op === 'espelha' && /degenerad|no plano/i.test(o.motivo))).toBe(true);
    });

    it('winding REVERTIDO: a normal Newell da face espelhada aponta pra FORA (medida contra a face real equivalente)', () => {
      // face +x do cubo espelhada em x=0 deve dar a MESMA orientação (Newell·x < 0) da face -x REAL do
      // cubo na mesma posição — prova por comparação direta, não por suposição
      const cuboReal = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
      const nRealMenosX = newell(cuboReal.V, cuboReal.F.get(5)!.vs);   // face -x de verdade
      expect(nRealMenosX[0]).toBeLessThan(0);                          // confere a premissa (D1)

      const espelhado = nucleo([['cubo', { id: 0, lado: 2 }], ['espelha', { eixo: 'x', pos: 0, sel: { f: [3] } }]], {}, {});   // espelha a face +x (passo 1 -> base 1000)
      const nEspelhado = newell(espelhado.V, espelhado.F.get(1000)!.vs);
      expect(nEspelhado[0]).toBeLessThan(0);                           // MESMO sinal da -x real -> winding correto pra fora
    });

    it('herança de atributo (cor/liso/parte/solido) — a face espelhada copia do original, só `vs` muda', () => {
      const passos = [
        ['plano', { id: 0, largura: 2, profundidade: 2, seg: 1 }],
        ['pincel', { modo: 'face', faces: [0], cor: '#4d9be6' }],
        ['liso', { faces: [0] }],
        ['parte', { nome: 'asa', faces: [0] }],
        ['solido', { faces: [0] }],
        ['espelha', { eixo: 'z', pos: 0 }],
      ];
      const { F } = nucleo(passos, {}, {});
      const orig = F.get(0)!, esp = F.get(5000)!;   // espelha é o passo 5 -> base 5000
      expect(esp.cor).toBe(orig.cor);
      expect(esp.liso).toBe(orig.liso);
      expect(esp.parte).toBe(orig.parte);
      expect(esp.solido).toBe(orig.solido);
      expect(esp.vs).not.toEqual(orig.vs);   // só os cantos mudam
    });

    it('determinismo (2×) + replay round-trip JSON da lista (o formato salvo)', () => {
      const passos = [['plano', { id: 0, largura: 2, profundidade: 2, seg: 1 }], ['espelha', { eixo: 'x', pos: 0 }]];
      const a = J(neutroCanonico(nucleo(passos, {}, {})));
      const b = J(neutroCanonico(nucleo(passos, {}, {})));
      expect(a).toBe(b);
      expect(J(neutroCanonico(nucleo(JSON.parse(J(passos)), {}, {})))).toBe(a);
    });

    it('face inexistente na seleção GRITA (órfão); as demais faces válidas seguem processadas; eixo desconhecido grita', () => {
      const { orfaos, F } = nucleo([['cubo', { id: 0, lado: 1 }], ['espelha', { eixo: 'x', pos: 0, sel: { f: [3, 999] } }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ passo: 1, op: 'espelha', ref: 999 });
      expect(F.has(1000)).toBe(true);   // a face 3 (válida) foi espelhada normalmente apesar do 999 ruim

      const e = nucleo([['cubo', { id: 0, lado: 1 }], ['espelha', { eixo: 'w' }]], {}, {});
      expect(e.orfaos[0]).toMatchObject({ op: 'espelha', ref: 'w' });
      expect(e.V.size).toBe(8);
    });

    it('guarda de overflow (D3) no limite EXATO — FACE isolada (zero vértice novo) e VÉRTICE isolado (face longe do limite)', () => {
      // FACE isolada: N planos-semente de 1 face cada, TODOS em y=0 -> espelhar em eixo=y,pos=0 solda
      // 100% (0 vértice novo). Cada face espelhada seria coincidente (todos os cantos no plano) -> é
      // PULADA como degenerada (B1). O que fica isolado é a GUARDA de FACE: ela conta as faces
      // SELECIONADAS (faceIds.length) ANTES de pular, então o limite de FACE dispara independente do de vértice.
      const muitosPlanos = (n: number) => { const p: any[] = []; for (let k = 0; k < n; k++) p.push(['plano', { id: k * 1000, largura: 1, profundidade: 1, seg: 1 }]); p.push(['espelha', { eixo: 'y', pos: 0 }]); return p; };
      const noLimite = nucleo(muitosPlanos(1000), {}, {});                                    // 1000 faces selecionadas: no limite, a guarda passa
      expect([...noLimite.V.keys()].filter((id) => id >= 1000 * 1000)).toHaveLength(0);       // 0 vértice novo (100% soldado)
      expect([...noLimite.F.keys()].filter((id) => id >= 1000 * 1000)).toHaveLength(0);       // 0 face nova — todas degeneradas, puladas (B1)
      expect(noLimite.orfaos.filter((o: any) => o.op === 'espelha').length).toBe(1000);       // cada face degenerada GRITOU
      expect(() => nucleo(muitosPlanos(1001), {}, {})).toThrow(/estoura o bloco/);            // 1001: a guarda de FACE estoura (antes de qualquer skip)

      // VÉRTICE isolado: 1 plano grande, eixo=x pos=0 (nada solda: seg ÍMPAR não tem coluna central em x=0).
      // seg=30 (900 faces, <1000 vértices novos) passa; seg=31 (961 faces, 1024 vértices novos) estoura SÓ por vértice.
      expect(() => nucleo([['plano', { id: 0, largura: 10, profundidade: 10, seg: 30 }], ['espelha', { eixo: 'x', pos: 0 }]], {}, {})).not.toThrow();
      expect(() => nucleo([['plano', { id: 0, largura: 10, profundidade: 10, seg: 31 }], ['espelha', { eixo: 'x', pos: 0 }]], {}, {})).toThrow(/estoura o bloco/);
    });

    it('peça-exemplo _espelhado (cabeça + par de chifres): sem órfãos, V/F exatos, MANIFOLD (costura soldada -> watertight)', async () => {
      const pUrl = new URL('../../prototipos/fps/v3/pecas/_espelhado.js', import.meta.url);
      const peca: any = await import(fileURLToPath(pUrl));
      const { V, F, orfaos } = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO);
      expect(orfaos).toHaveLength(0);
      // esfera (6 aneis×10 lados: 52V/60F) + chifre original (5V: 4 base+1 ponta / 4F) + espelho (1V nova: só a ponta / 4F)
      expect(V.size).toBe(52 + 5 + 1);
      expect(F.size).toBe(60 + 4 + 4);
      expect(V.size).toBe(58);
      expect(F.size).toBe(68);

      // a base do chifre soldou: os 4 cantos (1000..1003) são COMPARTILHADOS pelas 8 faces-triângulo
      // dos dois lados (nenhum id novo pra base — só a ponta duplicou)
      const usamBase = [...F.values()].filter((f: any) => f.vs.some((v: number) => v >= 1000 && v < 1004));
      expect(usamBase.length).toBe(8);

      // NUMERAÇÃO travada por MEDIÇÃO (formato salvo — D1 do revisor): o `espelha` é o passo 15,
      // então baseDoPasso(15)=15000; a ponta espelhada (único vértice fora do plano) é 15000,
      // e as 4 faces novas são 15000..15003. (Antes o comentário da peça dizia 10000, sem teste travando.)
      expect([...V.keys()].filter((k: number) => k >= 15000 && k < 16000)).toEqual([15000]);
      expect([...F.keys()].filter((k: number) => k >= 15000 && k < 16000).sort((a: number, b: number) => a - b)).toEqual([15000, 15001, 15002, 15003]);

      // MANIFOLD: toda aresta dirigida a->b pareada com b->a exatamente 1× (mesmo método do P1/P2)
      const dirigidas = new Map<string, number>();
      let cantos = 0;
      for (const f of F.values()) {
        const vs = f.vs; cantos += vs.length;
        for (let k = 0; k < vs.length; k++) {
          const key = `${vs[k]}>${vs[(k + 1) % vs.length]}`;
          dirigidas.set(key, (dirigidas.get(key) || 0) + 1);
        }
      }
      expect(dirigidas.size).toBe(cantos);          // nenhuma aresta dirigida duplicada
      let semPar = 0;
      for (const key of dirigidas.keys()) { const [a, b] = key.split('>'); if (!dirigidas.has(`${b}>${a}`)) semPar++; }
      expect(semPar).toBe(0);                        // watertight — a costura soldou de verdade, sem furo

      // colisão sã e executar/adaptarV3 saem limpos
      expect(peca.meta.colisao.forma).toBe('cilindro');
      expect(peca.meta.colisao.raio).toBeCloseTo(peca.PARAMS.cabecaRaio, 6);
      const obj: any = executar(peca.PASSOS, peca.PARAMS, peca.TOPO, fakeCtx);
      expect(obj.lotes.length).toBeGreaterThan(0);
      expect(obj.lotes[0].mesh.v.length % 8).toBe(0);
    });
  });
});

/* P4 do playground — `loft`: conecta uma sequência de SEÇÕES (círculo de raio
   variável, ou POLO quando raio=0) ao longo de um CAMINHO 3D — tubo/casco/
   galho/membro. O `lathe` é o TEMPLATE (mesmo cursor/polo/anel/leque/guarda);
   a peça NOVA é o FRAME por TRANSPORTE PARALELO (reimplementado local,
   byte-equivalente ao `quadro`/`transporta` de motor/arvore-cartoon.js) que
   acompanha a tangente do caminho sem torcer o tubo numa curva. Prova por
   MEDIÇÃO: numeração EXATA (caminho misto anel→anel→polo e só-anéis),
   winding pra fora, ANTI-TORÇÃO (todo quad anel↔anel não-borboleta, medido
   pelo pior produto escalar entre os dois triângulos do quad — comparado com
   um caminho reto, onde o resultado é analiticamente conhecido: anéis
   alinhados), reserva `secao`/seção malformada/raio<0/<2 seções/segmento de
   comprimento zero GRITAM e ABORTAM o passo (fail-closed, a mesma lei do
   lathe), polo↔polo adjacente grita e só aquele segmento fica sem face,
   determinismo/replay, `pos`/`raio` por NOME de PARAM, guarda de overflow
   (D3) no limite EXATO, e MANIFOLD + volume assinado na peça-exemplo
   `_galho` (fechada nas duas pontas, caminho curvando em mais de um eixo). */
describe('P4 — loft (seções ao longo de um caminho 3D)', () => {
  const J = (x: any) => JSON.stringify(x);
  const fakeCtx = { tex: { texCanvas: (w: number, h: number, fn: any) => ({ width: w, height: h, fn }) }, m4: { ident: () => new Float32Array(16) } };
  // Newell inline (a do núcleo não é exportada) — o MESMO teste de direção do D1/P1/P2/P3
  const newell = (V: any, vs: number[]) => {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < vs.length; k++) {
      const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]);
      nx += (c[1] - n[1]) * (c[2] + n[2]); ny += (c[2] - n[2]) * (c[0] + n[0]); nz += (c[0] - n[0]) * (c[1] + n[1]);
    }
    return [nx, ny, nz];
  };

  it('numeração EXATA num caminho MISTO (anel→anel→polo): ids de vértice e de face travados', () => {
    const { V, F, orfaos } = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: [0, 0, 0], raio: 1 },
      { pos: [0, 2, 0], raio: 1 },
      { pos: [0, 4, 0], raio: 0 },
    ] }]], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(9);   // anel(4) + anel(4) + polo(1)
    expect(F.size).toBe(8);   // segmento anel<->anel (4 quads) + anel->polo (4 triângulos)
    // vértices j=0 de cada anel (sem resíduo de ponto-flutuante: cos(0)=1, sin(0)=0 exatos) + o polo
    expect(V.get(0)).toEqual([0, 0, 1]);
    expect(V.get(4)).toEqual([0, 2, 1]);
    expect(V.get(8)).toEqual([0, 4, 0]);
    // seg0 (anel<->anel) quad — a MESMA faixa do lathe/esfera: [baixo[j], cima[j], cima[j+1], baixo[j+1]]
    expect(F.get(0)!.vs).toEqual([0, 4, 5, 1]);
    expect(F.get(3)!.vs).toEqual([3, 7, 4, 0]);          // fecha o ciclo (j=3, n=0)
    // seg1 (anel->polo) leque NORTE do lathe (invertido): [polo, anel[j+1], anel[j]]
    expect(F.get(4)!.vs).toEqual([8, 5, 4]);
    expect(F.get(7)!.vs).toEqual([8, 4, 7]);             // fecha o ciclo
  });

  it('numeração EXATA num caminho SÓ-ANÉIS (sem polo nenhum): vira uma faixa cilíndrica só de quads', () => {
    const { V, F, orfaos } = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: [0, 0, 0], raio: 1 },
      { pos: [0, 2, 0], raio: 0.5 },
    ] }]], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(8);   // 2 anéis × 4 lados, nenhum polo
    expect(F.size).toBe(4);   // 1 segmento × 4 lados
    expect(V.get(0)).toEqual([0, 0, 1]);
    expect(V.get(4)).toEqual([0, 2, 0.5]);
    expect(F.get(0)!.vs).toEqual([0, 4, 5, 1]);
    expect(F.get(3)!.vs).toEqual([3, 7, 4, 0]);
  });

  it('winding pra FORA no caminho reto (Newell·raio-XZ > 0 — a lição D1, generalizada pro loft)', () => {
    const { V, F } = nucleo([['loft', { id: 0, lados: 8, secoes: [{ pos: [0, 0, 0], raio: 1 }, { pos: [0, 2, 0], raio: 0.6 }] }]], {}, {});
    for (let j = 0; j < 8; j++) {
      const f = F.get(j)!;
      const c = [0, 0, 0]; for (const v of f.vs) { const p = V.get(v)!; c[0] += p[0]; c[2] += p[2]; }
      const n = newell(V, f.vs);
      expect(n[0] * c[0] + n[2] * c[2]).toBeGreaterThan(0);   // radial pra fora, sem ambiguidade (parede vertical)
    }
  });

  it('ANTI-TORÇÃO: caminho RETO (analítico — anéis alinhados) dá quads planares (pior dot ≈ 1); caminho FORTEMENTE curvo (3 eixos) continua NÃO-borboleta (pior dot > 0) — a prova do transporte paralelo', () => {
    const piorDotDosQuads = (secoes: any[], lados = 8) => {
      const { V, F } = nucleo([['loft', { id: 0, lados, secoes }]], {}, {});
      const normalTri = (p: number[], q: number[], r: number[]) => {
        const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
        return [nx / l, ny / l, nz / l];
      };
      let pior = Infinity;
      for (const f of F.values()) {
        if (f.vs.length !== 4) continue;   // só quads anel<->anel (não os leques polo↔anel)
        const [a, b, c, d] = f.vs;
        const n1 = normalTri(V.get(a)!, V.get(b)!, V.get(c)!);
        const n2 = normalTri(V.get(a)!, V.get(c)!, V.get(d)!);
        const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
        if (dot < pior) pior = dot;
      }
      return pior;
    };

    // caminho RETO (eixo Y, raio constante): TODO anel no MESMO frame (transportaLoft não gira nada
    // quando a tangente não muda) -> quads PLANARES, dot = 1 até resíduo de ponto-flutuante
    const reto: any[] = []; for (let k = 0; k < 8; k++) reto.push({ pos: [0, k * 0.3, 0], raio: 0.3 });
    expect(piorDotDosQuads(reto)).toBeCloseTo(1, 6);

    // ziguezague FORTE em 3 eixos (ângulo grande entre segmentos vizinhos, inclusive uma virada de
    // quase 180° no plano XY entre os 2 primeiros segmentos) — o caso que TORCERIA sem transporte
    // paralelo (medido à parte, fora do commit: sem ele o pior dot cai pra ≈ −0.99, um quad
    // literalmente invertido — com o transporte, fica positivo)
    const curvo = [
      { pos: [0, 0, 0], raio: 0.25 },
      { pos: [0.5, 0.15, 0], raio: 0.25 },
      { pos: [0.5, 0.65, 0.05], raio: 0.22 },
      { pos: [0.1, 0.85, 0.55], raio: 0.20 },
      { pos: [-0.4, 0.70, 0.85], raio: 0.16 },
      { pos: [-0.55, 0.20, 0.60], raio: 0.12 },
      { pos: [-0.30, -0.05, 0.10], raio: 0.08 },
    ];
    const piorCurvo = piorDotDosQuads(curvo);
    expect(piorCurvo).toBeGreaterThan(0);    // NÃO-borboleta apesar da curva forte — o transporte segura
    expect(piorCurvo).toBeLessThan(0.99);    // e de fato ESTRESSOU (não é um caminho quase-reto disfarçado)
  });

  /* P5 (docs/playground.md): a chave `secao` reservada virou `contorno` de
     verdade — seção NÃO-circular no núcleo do loft. Geometria conferida por
     MEDIÇÃO (harness, não recontada no olho — a lição do D-116): caminho reto
     em Y, quadrado [[1,1],[-1,1],[-1,-1],[1,-1]] (CCW por shoelace) entre dois
     polos, lados=4. u,w do frame reto = [0,0,1],[-1,0,0] (mesma conta do
     lathe/P4); vértice = pos + u·ca + w·sa. */
  it('CONTORNO explícito (P5): substitui o círculo por pontos [u,w] exatos — numeração e POSIÇÃO conferidas por medição', () => {
    const quadrado = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: [0, 0, 0], raio: 0 },
      { pos: [0, 1, 0], contorno: quadrado },
      { pos: [0, 2, 0], raio: 0 },
    ] }]], {}, {});
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.size).toBe(6);   // 1 polo + 4 anel + 1 polo — IDÊNTICO à contagem de um raio>0 (só a origem da coordenada muda)
    expect(n.F.size).toBe(8);   // 4 leque sul + 4 leque norte
    expect(n.V.get(0)).toEqual([0, 0, 0]);
    expect(n.V.get(1)).toEqual([-1, 1, 1]);    // (ca,sa)=(1,1)  -> pos + u·1 + w·1  = [0,1,0]+[0,0,1]+[-1,0,0]
    expect(n.V.get(2)).toEqual([-1, 1, -1]);   // (ca,sa)=(-1,1)
    expect(n.V.get(3)).toEqual([1, 1, -1]);    // (ca,sa)=(-1,-1)
    expect(n.V.get(4)).toEqual([1, 1, 1]);     // (ca,sa)=(1,-1)
    expect(n.V.get(5)).toEqual([0, 2, 0]);
    expect(n.F.get(0).vs).toEqual([0, 1, 2]);
    expect(n.F.get(4).vs).toEqual([5, 2, 1]);
  });

  it('raio E contorno na mesma seção GRITA e ABORTA (ambíguo — nunca escolhe um dos dois em silêncio)', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: [0, 0, 0], raio: 0 },
      { pos: [0, 1, 0], raio: 1, contorno: [[1, 0], [0, 1], [-1, 0], [0, -1]] },
      { pos: [0, 2, 0], raio: 0 },
    ] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0].motivo).toMatch(/ambíguo/);
    expect(n.V.size).toBe(0);
  });

  it('nem raio nem contorno GRITA e ABORTA (não dá pra classificar polo/anel)', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [{ pos: [0, 0, 0], raio: 0 }, { pos: [0, 1, 0] }, { pos: [0, 2, 0], raio: 0 }] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0].motivo).toMatch(/sem 'raio' nem 'contorno'/);
    expect(n.V.size).toBe(0);
  });

  it('contorno com contagem ≠ lados GRITA e ABORTA (a numeração exige EXATAMENTE `lados` pontos)', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: [0, 0, 0], raio: 0 }, { pos: [0, 1, 0], contorno: [[1, 0], [0, 1], [-1, 0]] }, { pos: [0, 2, 0], raio: 0 },
    ] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0].motivo).toMatch(/exatamente 'lados' \(4\)/);
    expect(n.V.size).toBe(0);
  });

  it.each([
    ['3 elementos (alça de curva reservada)', [[1, 1], [-1, 1, 99], [-1, -1], [1, -1]]],
    ['1 elemento', [[1, 1], [-1], [-1, -1], [1, -1]]],
  ])('ponto do contorno malformado (%s) GRITA e ABORTA — a mesma lei do ponto do perfil no lathe (D-115)', (_nome, contorno) => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [{ pos: [0, 0, 0], raio: 0 }, { pos: [0, 1, 0], contorno }, { pos: [0, 2, 0], raio: 0 }] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0].motivo).toMatch(/2 elementos/);
    expect(n.V.size).toBe(0);
  });

  it.each([
    ['CW (revertido)', [[1, 1], [1, -1], [-1, -1], [-1, 1]]],
    ['degenerado (todos os pontos iguais)', [[0, 0], [0, 0], [0, 0], [0, 0]]],
    ['degenerado (colinear)', [[0, 0], [1, 0], [2, 0], [3, 0]]],
  ])('contorno com winding %s GRITA e ABORTA — produziria normal invertida ou nula SILENCIOSA (a classe do achado do P3, cega ao manifold)', (_nome, contorno) => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [{ pos: [0, 0, 0], raio: 0 }, { pos: [0, 1, 0], contorno }, { pos: [0, 2, 0], raio: 0 }] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0].motivo).toMatch(/CCW ou é degenerado/);
    expect(n.V.size).toBe(0);
  });

  it('uma seção NORMAL ({pos,raio}) segue construindo igual — o `contorno` não é fail-open pro círculo (sem falso-positivo)', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [{ pos: [0, 0, 0], raio: 0 }, { pos: [0, 1, 0], raio: 1 }, { pos: [0, 2, 0], raio: 0 }] }]], {}, {});
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.size).toBeGreaterThan(0);
  });

  it('seção malformada — não-objeto, sem `pos`, sem `raio` — GRITA e ABORTA o passo inteiro (0 V/0 F)', () => {
    const naoObjeto = nucleo([['loft', { id: 0, lados: 4, secoes: [[0, 0, 0], { pos: [0, 1, 0], raio: 1 }] }]], {}, {});
    expect(naoObjeto.orfaos).toHaveLength(1);
    expect(naoObjeto.orfaos[0]).toMatchObject({ op: 'loft', ref: 0 });
    expect(naoObjeto.V.size).toBe(0);
    expect(naoObjeto.F.size).toBe(0);

    const semPos = nucleo([['loft', { id: 0, lados: 4, secoes: [{ raio: 1 }, { pos: [0, 1, 0], raio: 1 }] }]], {}, {});
    expect(semPos.orfaos).toHaveLength(1);
    expect(semPos.orfaos[0].motivo).toMatch(/sem 'pos'/);
    expect(semPos.V.size).toBe(0);

    const semRaio = nucleo([['loft', { id: 0, lados: 4, secoes: [{ pos: [0, 0, 0] }, { pos: [0, 1, 0], raio: 1 }] }]], {}, {});
    expect(semRaio.orfaos).toHaveLength(1);
    expect(semRaio.orfaos[0].motivo).toMatch(/sem 'raio'/);
    expect(semRaio.V.size).toBe(0);
  });

  it('raio<0 GRITA e a op inteira não constrói NADA neste passo (não dá pra classificar polo/anel — nunca corrompe)', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [{ pos: [0, 0, 0], raio: -1 }, { pos: [0, 1, 0], raio: 1 }] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'loft', ref: 0 });
    expect(n.orfaos[0].motivo).toMatch(/raio negativo/i);
    expect(n.V.size).toBe(0);
    expect(n.F.size).toBe(0);
  });

  it('secoes com menos de 2 seções GRITA (0 e 1) e não constrói nada', () => {
    const vazio = nucleo([['loft', { id: 0, lados: 4, secoes: [] }]], {}, {});
    expect(vazio.orfaos).toHaveLength(1);
    expect(vazio.orfaos[0]).toMatchObject({ op: 'loft', motivo: expect.stringMatching(/ao menos 2/i) });
    expect(vazio.V.size).toBe(0);
    const uma = nucleo([['loft', { id: 0, lados: 4, secoes: [{ pos: [0, 0, 0], raio: 1 }] }]], {}, {});
    expect(uma.orfaos).toHaveLength(1);
    expect(uma.V.size).toBe(0);
  });

  it('segmento de comprimento zero (duas seções na mesma posição) GRITA e ABORTA o passo inteiro — tangente indefinida, fail-closed', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: [0, 0, 0], raio: 1 },
      { pos: [0, 0, 0], raio: 1 },
      { pos: [0, 2, 0], raio: 0.5 },
    ] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'loft', ref: 0 });
    expect(n.orfaos[0].motivo).toMatch(/comprimento zero/i);
    expect(n.V.size).toBe(0);
    expect(n.F.size).toBe(0);
  });

  it('CUSP (o caminho dobra ~180°) GRITA e ABORTA — o anel colapsaria numa linha (achado adversarial do P4, fail-closed)', () => {
    // vai pra +x e VOLTA: na seção do meio a tangente = média de [1,0,0] e [-1,0,0] = [0,0,0];
    // sem a guarda, w = cross(u,0) = 0 e o anel do meio vira uma reta (degenerado silencioso, não-NaN)
    const n = nucleo([['loft', { id: 0, lados: 6, secoes: [
      { pos: [0, 0, 0], raio: 0.3 },
      { pos: [1, 0, 0], raio: 0.3 },
      { pos: [0, 0, 0], raio: 0.3 },
    ] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'loft', ref: 1 });
    expect(n.orfaos[0].motivo).toMatch(/cusp/i);
    expect(n.V.size).toBe(0);   // fail-closed: nada construído (nem o anel colapsado)
    expect(n.F.size).toBe(0);
  });

  /* 2º achado adversarial do P4: a ARIDADE do `pos` não era validada — a mesma
     lei que o lathe já aplica no ponto do perfil (NIT-3 do P2). Sem ela,
     `pos:[0,1]` construía com z=undefined -> 12 coordenadas NaN e ZERO órfãos
     (o `lint-de-malha` do auditar pegava a jusante, mas sem dizer qual seção),
     e `pos:{x:0}` estourava `a.map is not a function` (throw cru). */
  it.each([
    ['2 elementos', [0, 1]],
    ['4 elementos', [0, 1, 0, 99]],
    ['1 elemento', [1]],
    ['vazio', []],
    ['não-array (objeto)', { x: 0 } as unknown as number[]],
    ['não-array (string)', 'alt' as unknown as number[]],
  ])('pos com aridade errada (%s) GRITA e ABORTA o passo (0 V/0 F) — nunca coordenada NaN calada nem throw cru', (_nome, pos) => {
    const n = nucleo([['loft', { id: 0, lados: 6, secoes: [
      { pos: [0, 0, 0], raio: 0.3 },
      { pos, raio: 0.3 },
    ] }]], { alt: 1 }, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'loft', ref: 1 });
    expect(n.orfaos[0].motivo).toMatch(/3 elementos/);
    expect(n.V.size).toBe(0);   // fail-closed: 0 V/0 F — antes eram 12 vértices, todos com coordenada NaN
    expect(n.F.size).toBe(0);
  });

  it('polo↔polo adjacente GRITA (seção degenerada): só AQUELE segmento fica sem face — o resto do caminho segue normal', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: [0, 0, 0], raio: 1 },
      { pos: [0, 1, 0], raio: 0 },
      { pos: [0, 2, 0], raio: 0 },
      { pos: [0, 3, 0], raio: 1 },
    ] }]], {}, {});
    expect(n.orfaos).toHaveLength(1);
    expect(n.orfaos[0]).toMatchObject({ op: 'loft', ref: 1 });
    expect(n.orfaos[0].motivo).toMatch(/polo.*polo|degenerad/i);
    expect(n.V.size).toBe(10);   // anel(4) + polo(1) + polo(1) + anel(4)
    expect(n.F.size).toBe(8);    // só os dois segmentos anel<->polo contribuíram (4+4); o polo<->polo não
    expect([...n.F.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);   // cursor de face contíguo, sem buraco
  });

  it('determinismo (2×) + replay round-trip JSON da lista (o formato salvo)', () => {
    const passos = [['loft', { id: 0, lados: 6, secoes: [
      { pos: [0, 0, 0], raio: 0 },
      { pos: [0.2, 0.4, 0.1], raio: 0.3 },
      { pos: [0.35, 0.8, 0.5], raio: 0.15 },
      { pos: [0.2, 1.1, 0.9], raio: 0 },
    ] }]];
    const a = J(neutroCanonico(nucleo(passos, {}, {})));
    const b = J(neutroCanonico(nucleo(passos, {}, {})));
    expect(a).toBe(b);
    expect(J(neutroCanonico(nucleo(JSON.parse(J(passos)), {}, {})))).toBe(a);
  });

  it('`pos`/`raio` por NOME de PARAM resolvem como nas outras ops; nome inexistente grita ALTO; mudar o VALOR do PARAM não renumera', () => {
    const n = nucleo([['loft', { id: 0, lados: 4, secoes: [
      { pos: ['x0', 'y0', 'z0'], raio: 'r0' },
      { pos: ['x1', 'y1', 'z1'], raio: 'r1' },
    ] }]], { x0: 0, y0: 0, z0: 0, r0: 1, x1: 0, y1: 2, z1: 0, r1: 0.5 });
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.get(0)).toEqual([0, 0, 1]);
    expect(n.V.get(4)).toEqual([0, 2, 0.5]);
    // nome que não existe em PARAMS/TOPO grita ALTO (o contrato do st.num, igual às outras ops)
    expect(() => nucleo([['loft', { id: 0, secoes: [{ pos: [0, 0, 0], raio: 'fantasma' }, { pos: [0, 1, 0], raio: 1 }] }]], {}, {})).toThrow(/fantasma/);
    // mudar o VALOR do PARAM não renumera: mesmos ids, mesma topologia, só a posição muda
    const passos = [['loft', { id: 0, lados: 6, secoes: [{ pos: [0, 0, 0], raio: 'r' }, { pos: [0, 1, 0], raio: 'r' }] }]];
    const pequeno = neutroCanonico(nucleo(passos, { r: 0.3 }, {}));
    const grande = neutroCanonico(nucleo(passos, { r: 0.9 }, {}));
    expect(grande.V.map((row: any[]) => row[0])).toEqual(pequeno.V.map((row: any[]) => row[0]));
    expect(grande.F).toEqual(pequeno.F);
    expect(J(grande.V)).not.toBe(J(pequeno.V));
  });

  it('guarda de overflow (D3) no limite EXATO — vértice (2 anéis, lados grande) e face (caminho alternando anel/polo) de forma independente', () => {
    // limite de VÉRTICE: 2 anéis × lados=500 -> 1000 vértices exatos (passa); 501 -> 1002 (estoura)
    expect(() => nucleo([['loft', { id: 0, lados: 500, secoes: [{ pos: [0, 0, 0], raio: 1 }, { pos: [0, 1, 0], raio: 1 }] }]], {}, {})).not.toThrow();
    expect(() => nucleo([['loft', { id: 0, lados: 501, secoes: [{ pos: [0, 0, 0], raio: 1 }, { pos: [0, 1, 0], raio: 1 }] }]], {}, {})).toThrow(/estoura o bloco/);
    // limite de FACE, independente do de vértice: caminho ALTERNANDO anel/polo (barato em vértice, caro
    // em face — todo segmento é anel<->polo, nunca degenerado), lados=8. N=126 seções (63 anéis+63
    // polos) -> 567 V / 1000 F exatos (passa); N=127 -> 575 V / 1008 F (a guarda de FACE estoura
    // primeiro, o vértice nem chegou perto do bloco) — os MESMOS números do lathe (o custo por
    // seção/segmento é idêntico; só a forma do ponto mudou de [raio,y] pra {pos,raio}).
    const alternado = (nPontos: number) => Array.from({ length: nPontos }, (_, k) => ({ pos: [0, k, 0], raio: k % 2 === 0 ? 1 : 0 }));
    expect(() => nucleo([['loft', { id: 0, lados: 8, secoes: alternado(126) }]], {}, {})).not.toThrow();
    expect(() => nucleo([['loft', { id: 0, lados: 8, secoes: alternado(127) }]], {}, {})).toThrow(/estoura o bloco/);
  });

  it('peça-exemplo _galho (galho curvo, afinando, fechado nas duas pontas): sem órfãos, V/F exatos, MANIFOLD (watertight+winding consistente) e volume assinado > 0', async () => {
    const pUrl = new URL('../../prototipos/fps/v3/pecas/_galho.js', import.meta.url);
    const peca: any = await import(fileURLToPath(pUrl));
    const { V, F, orfaos } = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO);
    expect(orfaos).toHaveLength(0);
    // 7 seções (2 polos + 5 anéis) × lados=10: V=2+5·10=52; 6 segmentos não-degenerados: F=6·10=60
    expect(V.size).toBe(2 + 5 * peca.TOPO.lados);
    expect(F.size).toBe(6 * peca.TOPO.lados);
    expect(V.size).toBe(52);
    expect(F.size).toBe(60);

    // MANIFOLD: toda aresta DIRIGIDA a->b (cada canto de cada face) tem exatamente 1 par reverso b->a.
    // Prova watertight (nenhuma aresta desemparelhada = nenhum buraco — as duas pontas fecharam de
    // verdade) E winding CONSISTENTE (nenhuma aresta duplicada no MESMO sentido) — o mesmo método do
    // revisor adversarial no P1/P2/P3.
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
    for (const key of dirigidas.keys()) { const [a, b] = key.split('>'); if (!dirigidas.has(`${b}>${a}`)) semPar++; }
    expect(semPar).toBe(0);                        // nenhuma aresta sem par reverso -> ESTANQUE (watertight)

    // volume assinado > 0 (soma de tetraedros a partir da origem, leque de cada face): nenhuma face invertida
    let vol = 0;
    for (const f of F.values()) {
      const vs = f.vs, p0 = V.get(vs[0])!;
      for (let k = 1; k < vs.length - 1; k++) {
        const p1 = V.get(vs[k])!, p2 = V.get(vs[k + 1])!;
        vol += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
      }
    }
    expect(vol).toBeGreaterThan(0);

    // colisão sã (encaixa o galho inteiro via `solido`) e executar/adaptarV3 saem limpos
    expect(peca.meta.colisao.forma).toBe('cilindro');
    expect(peca.meta.colisao.raio).toBeGreaterThan(0);
    expect(peca.meta.colisao.altura).toBeCloseTo(peca.PARAMS.pontaY, 6);   // base(y=0) -> ponta(y=pontaY), medido: o caminho é monótono em Y
    const obj: any = executar(peca.PASSOS, peca.PARAMS, peca.TOPO, fakeCtx);
    expect(obj.lotes).toHaveLength(1);
    expect(obj.lotes[0].mesh.v.length % 8).toBe(0);
  });
});

describe('P6 — inflate (dois contornos 2D -> volume por interseção de prismas)', () => {
  const QUAD: number[][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const circ = (r: number, n = 24) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const newell = (V: any, vs: number[]) => {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < vs.length; k++) {
      const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]);
      nx += (c[1] - n[1]) * (c[2] + n[2]); ny += (c[2] - n[2]) * (c[0] + n[0]); nz += (c[0] - n[0]) * (c[1] + n[1]);
    }
    return [nx, ny, nz];
  };
  const manifoldRuim = (F: any) => {
    const m = new Map<string, number>();
    for (const f of F.values()) for (let k = 0; k < (f as any).vs.length; k++) { const a = (f as any).vs[k], b = (f as any).vs[(k + 1) % (f as any).vs.length]; m.set(`${a},${b}`, (m.get(`${a},${b}`) ?? 0) + 1); }
    let ruim = 0;
    for (const [k, c] of m) { const [a, b] = k.split(','); if (c !== 1 || (m.get(`${b},${a}`) ?? 0) !== 1) ruim++; }
    return ruim;
  };
  const volume = (V: any, F: any) => {
    let vol = 0;
    for (const f of F.values()) { const vs = (f as any).vs; for (let k = 1; k + 1 < vs.length; k++) {
      const a = V.get(vs[0]), b = V.get(vs[k]), c = V.get(vs[k + 1]);
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    } }
    return vol;
  };

  it('numeração EXATA — grade 1×1×1 (1 voxel isolado, 8 cantos, 6 faces): derivada à mão, medida — não recontada no olho', () => {
    // divisoes clampado no MÍNIMO 2 (a mesma lei do lados/aneis) -> essa caixa cai numa grade 2×2×2 (8 voxels
    // cheios), não 1×1×1; o caso de 1 voxel isolado é provado à parte pelo teste de winding abaixo (Newell
    // por face bate a direção certa mesmo numa grade maior).
    const { V, F, orfaos } = nucleo([['inflate', { id: 0, contornoLado: QUAD, contornoTopo: QUAD, divisoes: 2 }]], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(26);   // (2+1)³ cantos − 1 canto estritamente interior (o centro, nunca tocado por face nenhuma)
    expect(F.size).toBe(24);   // 6 · 2² faces (a superfície externa de um cubo sólido 2×2×2 de voxels)
    expect(manifoldRuim(F)).toBe(0);
    expect(volume(V, F)).toBeCloseTo(8, 6);   // caixa 2×2×2 de aresta 1 cada = volume 8 exato
  });

  it('caixa (retângulos): volume bate a conta ANALÍTICA exata (largura·altura·profundidade — sem aproximação de voxel numa forma já axis-aligned)', () => {
    const lado = [[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]];   // z em [-1,1], y em [-0.5,0.5]
    const topo = [[-1, -0.7], [1, -0.7], [1, 0.7], [-1, 0.7]];   // z em [-1,1], x em [-0.7,0.7]
    const { V, F, orfaos } = nucleo([['inflate', { id: 0, contornoLado: lado, contornoTopo: topo, divisoes: 4 }]], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(manifoldRuim(F)).toBe(0);
    expect(volume(V, F)).toBeCloseTo(2 * 1 * 1.4, 6);   // dx=1.4, dy=1, dz=2 — os voxels cobrem a caixa exata quando ela já é axis-aligned
  });

  it('winding: TODA face aponta pra FORA do voxel — Newell por direção, não só o volume agregado', () => {
    const { V, F } = nucleo([['inflate', { id: 0, contornoLado: circ(1), contornoTopo: circ(1), divisoes: 10 }]], {}, {});
    for (const f of F.values()) {
      const n = newell(V, (f as any).vs);
      const p = (f as any).vs.map((id: number) => V.get(id));
      const cx = (p[0][0] + p[2][0]) / 2, cy = (p[0][1] + p[2][1]) / 2, cz = (p[0][2] + p[2][2]) / 2;   // forma convexa centrada na origem -> centro da face aponta pra fora
      expect(n[0] * cx + n[1] * cy + n[2] * cz).toBeGreaterThan(0);
    }
  });

  it('manifold + volume>0 em formas côncavas e assimétricas (estrela, retângulo alongado, misto)', () => {
    const estrela: number[][] = []; for (let j = 0; j < 10; j++) { const a = (j / 10) * Math.PI * 2, r = j % 2 === 0 ? 1 : 0.4; estrela.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const retLongo = [[-2, -0.3], [2, -0.3], [2, 0.3], [-2, 0.3]];
    for (const [lado, topo] of [[estrela, estrela], [estrela, retLongo], [retLongo, circ(0.5)]] as const) {
      const { V, F, orfaos } = nucleo([['inflate', { id: 0, contornoLado: lado, contornoTopo: topo, divisoes: 10 }]], {}, {});
      expect(orfaos).toHaveLength(0);
      expect(manifoldRuim(F)).toBe(0);
      expect(volume(V, F)).toBeGreaterThan(0);
    }
  });

  it('contornoLado/contornoTopo malformado GRITA e ABORTA (0 V/0 F) — a mesma lei do contorno do loft (D-118)', () => {
    const casos: Array<[string, any]> = [
      ['contornoLado ausente', { contornoTopo: QUAD, divisoes: 4 }],
      ['contornoLado com <3 pontos', { contornoLado: [[0, 0], [1, 1]], contornoTopo: QUAD, divisoes: 4 }],
      ['contornoLado não-array', { contornoLado: 'oi', contornoTopo: QUAD, divisoes: 4 }],
      ['ponto com aridade 3 (alça de curva reservada)', { contornoLado: [[0, 0], [1, 0, 99], [1, 1]], contornoTopo: QUAD, divisoes: 4 }],
      ['ponto com aridade 1', { contornoLado: [[0, 0], [1], [1, 1]], contornoTopo: QUAD, divisoes: 4 }],
    ];
    for (const [, args] of casos) {
      const { V, F, orfaos } = nucleo([['inflate', { id: 0, ...args }]], {}, {});
      expect(orfaos.length).toBeGreaterThan(0);
      expect(V.size).toBe(0);
      expect(F.size).toBe(0);
    }
  });

  it('contornoLado e contornoTopo sem NENHUM overlap (ou contorno degenerado num único ponto) GRITA — volume vazio nunca é "passou"', () => {
    const longe = nucleo([['inflate', { id: 0, contornoLado: QUAD, contornoTopo: [[10, -1], [12, -1], [12, 1], [10, 1]], divisoes: 4 }]], {}, {});
    expect(longe.orfaos).toHaveLength(1);
    expect(longe.orfaos[0].motivo).toMatch(/não se cruzam/);
    expect(longe.V.size).toBe(0);

    const degenerado = nucleo([['inflate', { id: 0, contornoLado: [[0, 0], [0, 0], [0, 0]], contornoTopo: QUAD, divisoes: 4 }]], {}, {});
    expect(degenerado.orfaos.length).toBeGreaterThan(0);
    expect(degenerado.V.size).toBe(0);
  });

  it('guarda de overflow (D3): grade que produziria >1000 vértices/faces falha ALTO (throw), não vaza pro bloco seguinte', () => {
    expect(() => nucleo([['inflate', { id: 0, contornoLado: circ(1), contornoTopo: circ(1), divisoes: 30 }]], {}, {})).toThrow(/estoura o bloco/);
  });

  it('guarda de SANIDADE de voxel (200000): divisoes absurdo falha ALTO antes de rodar o scan, independe do bloco de ids', () => {
    expect(() => nucleo([['inflate', { id: 0, contornoLado: circ(1), contornoTopo: circ(1), divisoes: 100 }]], {}, {})).toThrow(/200000/);
  });

  it('pos/divisoes citam PARAM/TOPO por nome (a mesma lei do resto do núcleo)', () => {
    const { V, F, orfaos } = nucleo([['inflate', { id: 0,
      contornoLado: [['zNeg', 'yNeg'], ['zPos', 'yNeg'], ['zPos', 'yPos'], ['zNeg', 'yPos']],
      contornoTopo: QUAD, divisoes: 'div' }]],
      { zNeg: -1, zPos: 1, yNeg: -1, yPos: 1 }, { div: 4 });
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBeGreaterThan(0);
    expect(F.size).toBeGreaterThan(0);
  });

  it('determinismo: mesma entrada -> forma canônica bit-a-bit idêntica em duas rodadas', () => {
    const canon = () => { const n = nucleo([['inflate', { id: 0, contornoLado: circ(1), contornoTopo: circ(1), divisoes: 6 }]], {}, {});
      return JSON.stringify([[...n.V.entries()].sort((a, b) => a[0] - b[0]), [...n.F.entries()].sort((a, b) => a[0] - b[0]).map(([k, f]) => [k, (f as any).vs])]); };
    expect(canon()).toBe(canon());
  });

  it('composição: extruda/rotaciona/espelha/mescla/pincel/liso/solido/parte em cima do inflate — sem NaN, manifold intacto onde não deveria mudar', () => {
    const base = { id: 0, contornoLado: QUAD, contornoTopo: QUAD, divisoes: 2 };
    for (const passos of [
      [['inflate', base], ['rotaciona', { eixo: 'y', graus: 30 }]],
      [['inflate', base], ['mescla', { de: [1], para: 0 }]],
      [['inflate', base], ['pincel', { modo: 'face', faces: [0, 1, 2], cor: '#7a3045' }], ['liso', { faces: [0, 1] }], ['solido', { faces: [0, 1, 2, 3] }], ['parte', { nome: 'corpo', faces: [0, 1] }]],
    ] as const) {
      const { V, orfaos } = nucleo(passos as any, {}, {});
      expect(orfaos).toHaveLength(0);
      expect([...V.values()].every((p: any) => p.every((c: number) => Number.isFinite(c)))).toBe(true);
    }
  });
});

describe('P8 — edição restante (moveF/moveA/vira/apagaFace + seleção por região/grupo)', () => {
  // cubo lado 1: 0..3 base (y=0), 4..7 topo (y=1); F0 fundo, F1 topo (0,1,2,3 / 4,5,6,7)
  const newell = (V: any, vs: number[]) => {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < vs.length; k++) {
      const c = V.get(vs[k]), n = V.get(vs[(k + 1) % vs.length]);
      nx += (c[1] - n[1]) * (c[2] + n[2]); ny += (c[2] - n[2]) * (c[0] + n[0]); nz += (c[0] - n[0]) * (c[1] + n[1]);
    }
    return [nx, ny, nz];
  };

  describe('moveF', () => {
    it('move TODOS os cantos da face (compartilhados com outras faces, movem junto) — ADITIVO', () => {
      const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['moveF', { face: 1, d: [0, 0.5, 0] }]], {}, {});
      expect(orfaos).toHaveLength(0);
      for (const id of [4, 5, 6, 7]) expect(V.get(id)![1]).toBeCloseTo(1.5, 6);   // topo (y=1) + 0.5 -> y=1.5
      for (const id of [0, 1, 2, 3]) expect(V.get(id)![1]).toBe(0);              // base intacta
    });

    it('face inexistente GRITA — nunca corrompe', () => {
      const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['moveF', { face: 999, d: [1, 0, 0] }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ op: 'moveF', ref: 999 });
      expect(V.size).toBe(8);   // a peça segue intacta, só o passo do moveF que não fez nada
    });

    it('delta não-finito falha ALTO (throw) — a lei do st.vec (D-118)', () => {
      expect(() => nucleo([['cubo', { id: 0, lado: 1 }], ['moveF', { face: 1, d: [NaN, 0, 0] }]], {}, {})).toThrow(/não-finito/);
    });
  });

  describe('moveA', () => {
    it('move as DUAS pontas pelo mesmo delta — açúcar sobre dois moveV', () => {
      const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['moveA', { a: 0, b: 1, d: [0, 0.3, 0] }]], {}, {});
      expect(orfaos).toHaveLength(0);
      expect(V.get(0)![1]).toBeCloseTo(0.3, 6);
      expect(V.get(1)![1]).toBeCloseTo(0.3, 6);
      expect(V.get(2)![1]).toBe(0);   // vértice fora da aresta, intacto
    });

    it('uma ponta inexistente GRITA pra ela, mas a outra AINDA move (nunca aborta o passo inteiro)', () => {
      const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['moveA', { a: 0, b: 999, d: [1, 0, 0] }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ op: 'moveA', ref: 999 });
      expect(V.get(0)![0]).toBeCloseTo(0.5, 6);   // v0 moveu mesmo com a outra ponta inválida
    });
  });

  describe('vira', () => {
    it('INVERTE o winding (a normal aponta pro lado oposto) sem mudar V/F', () => {
      const antes = nucleo([['cubo', { id: 0, lado: 1 }]], {}, {});
      const depois = nucleo([['cubo', { id: 0, lado: 1 }], ['vira', { face: 1 }]], {}, {});
      const nAntes = newell(antes.V, antes.F.get(1)!.vs);
      const nDepois = newell(depois.V, depois.F.get(1)!.vs);
      expect(nAntes[1]).toBeGreaterThan(0);    // topo do cubo: normal +y antes
      expect(nDepois[1]).toBeLessThan(0);      // e -y depois de virar
      expect(depois.V.size).toBe(antes.V.size);
      expect(depois.F.size).toBe(antes.F.size);
    });

    it('face inexistente GRITA', () => {
      const { orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['vira', { face: 999 }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ op: 'vira', ref: 999 });
    });

    it('CARACTERÍSTICA (não bug, documentada no núcleo): virar uma face JÁ consistente desalinha o pareamento de aresta com as vizinhas — o uso responsável é o oposto (consertar face já de costas)', () => {
      const manifoldRuim = (F: any) => {
        const m = new Map<string, number>();
        for (const f of F.values()) for (let k = 0; k < (f as any).vs.length; k++) { const a = (f as any).vs[k], b = (f as any).vs[(k + 1) % (f as any).vs.length]; m.set(`${a},${b}`, (m.get(`${a},${b}`) ?? 0) + 1); }
        let ruim = 0; for (const [k, c] of m) { const [a, b] = k.split(','); if (c !== 1 || (m.get(`${b},${a}`) ?? 0) !== 1) ruim++; } return ruim;
      };
      const cuboLimpo = nucleo([['cubo', { id: 0, lado: 1 }]], {}, {});
      expect(manifoldRuim(cuboLimpo.F)).toBe(0);   // baseline: o cubo sozinho é watertight

      const viraFaceCorreta = nucleo([['cubo', { id: 0, lado: 1 }], ['vira', { face: 1 }]], {}, {});
      expect(manifoldRuim(viraFaceCorreta.F)).toBe(4);   // virar o topo (já correto) quebra as 4 arestas com as paredes

      const viraDeVoltaERestaura = nucleo([['cubo', { id: 0, lado: 1 }], ['vira', { face: 1 }], ['vira', { face: 1 }]], {}, {});
      expect(manifoldRuim(viraDeVoltaERestaura.F)).toBe(0);   // virar de novo desfaz — prova que é sobre CONSISTÊNCIA local, não sobre `vira` ser destrutivo
    });
  });

  describe('apagaFace', () => {
    it('remove a face; os vértices dela CONTINUAM existindo (mesmo sem face nenhuma usando)', () => {
      const { V, F, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['apagaFace', { face: 1 }]], {}, {});
      expect(orfaos).toHaveLength(0);
      expect(F.size).toBe(5);
      expect(V.size).toBe(8);   // 4,5,6,7 continuam vivos mesmo sem nenhuma face
      expect(F.has(1)).toBe(false);
    });

    it('face inexistente GRITA', () => {
      const { orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['apagaFace', { face: 999 }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ op: 'apagaFace', ref: 999 });
    });
  });

  describe('resolverAlvosV — seleção por região/grupo (via rotaciona)', () => {
    it('sel.regiao seleciona por caixa delimitadora INCLUSIVA (min/max, os dois obrigatórios)', () => {
      // cubo lado 1: `ly` = `lado` DIRETO (não /2, ao contrário de lx/lz) -> topo em y=1 exato
      const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }],
        ['rotaciona', { eixo: 'y', graus: 90, pivo: [0, 0, 0], sel: { regiao: { min: [-2, 0.9, -2], max: [2, 1.1, 2] } } }],
      ], {}, {});
      expect(orfaos).toHaveLength(0);
      // só o topo (y=1) cai na faixa 0.9..1.1 -> só 4..7 giram; base (y=0) fica intacta (medido, não recontado no olho)
      expect(V.get(0)).toEqual([-0.5, 0, -0.5]);
      expect(V.get(4)![0]).toBeCloseTo(-0.5, 6);
      expect(V.get(4)![2]).toBeCloseTo(0.5, 6);
    });

    it('sel.regiao SEM min OU sem max GRITA e não seleciona nada por essa região (mas ainda roda o resto normal)', () => {
      const { orfaos, V } = nucleo([['cubo', { id: 0, lado: 1 }],
        ['rotaciona', { eixo: 'y', graus: 90, sel: { regiao: { min: [0, -1, -1] } } }],   // sem max
      ], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0].motivo).toMatch(/min E max/);
      expect(V.size).toBe(8);   // não corrompeu nada
    });

    it('sel.grupo seleciona as faces daquele f.parte (reusa a op `parte`, D-95)', () => {
      const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }],
        ['parte', { nome: 'topo', faces: [1] }],
        ['rotaciona', { eixo: 'y', graus: 45, pivo: [0, 0, 0], sel: { grupo: 'topo' } }],
      ], {}, {});
      expect(orfaos).toHaveLength(0);
      expect(V.get(0)).toEqual([-0.5, 0, -0.5]);   // base fora do grupo, intacta
      expect(V.get(4)).not.toEqual([-0.5, 1, -0.5]);   // topo girou
    });

    it('sel.grupo com nome que não tem NENHUMA face GRITA', () => {
      const { orfaos, V } = nucleo([['cubo', { id: 0, lado: 1 }], ['rotaciona', { eixo: 'y', graus: 45, sel: { grupo: 'naoexiste' } }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0].motivo).toMatch(/grupo 'naoexiste'/);
      expect(V.size).toBe(8);
    });

    it('sel.v/sel.f (o formato do P3) seguem funcionando byte-idêntico depois do refactor pra resolverAlvosV', () => {
      const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['rotaciona', { eixo: 'y', graus: 90, pivo: [0, 0, 0], sel: { v: [0] } }]], {}, {});
      expect(orfaos).toHaveLength(0);
      expect(V.get(0)![0]).toBeCloseTo(-0.5, 6);
      expect(V.get(1)).toEqual([0.5, 0, -0.5]);   // fora da seleção, intacto
    });
  });

  it('composição: moveF/moveA/vira/apagaFace com extruda/mescla/espelha/rotaciona/pincel/liso/solido/parte — sem NaN nem órfão em nenhum caso; manifold intacto nos que continuam FECHADOS', () => {
    const manifoldRuim = (F: any) => {
      const m = new Map<string, number>();
      for (const f of F.values()) for (let k = 0; k < (f as any).vs.length; k++) { const a = (f as any).vs[k], b = (f as any).vs[(k + 1) % (f as any).vs.length]; m.set(`${a},${b}`, (m.get(`${a},${b}`) ?? 0) + 1); }
      let ruim = 0; for (const [k, c] of m) { const [a, b] = k.split(','); if (c !== 1 || (m.get(`${b},${a}`) ?? 0) !== 1) ruim++; } return ruim;
    };
    for (const [passos, fechado] of [
      [[['cubo', { id: 0, lado: 1 }], ['extruda', { face: 1, dist: 0.3 }], ['moveF', { face: 1, d: [0.1, 0, 0] }]], true],
      [[['cubo', { id: 0, lado: 1 }], ['moveA', { a: 0, b: 1, d: [0, 0.3, 0] }], ['rotaciona', { eixo: 'y', graus: 20 }]], true],
      // vira numa face JÁ consistente desalinha o pareamento com as vizinhas (não é bug — ver o teste
      // dedicado abaixo, que trava e explica); a checagem aqui é só "não corrompe" (sem NaN/órfão)
      [[['cubo', { id: 0, lado: 1 }], ['vira', { face: 1 }], ['pincel', { modo: 'face', faces: [1], cor: '#7a3045' }], ['liso', { faces: [1] }], ['solido', { faces: [0, 1, 2, 3, 4, 5] }], ['parte', { nome: 'topo', faces: [1] }]], false],
      // apagaFace abre o topo DE PROPÓSITO e o espelha (pos=0.5, não bate em nenhum vértice do cubo — nada
      // solda) NÃO fecha o buraco por acidente — 2 bordas abertas sobrepostas, não uma peça watertight; a
      // prova aqui é só "não corrompe" (sem NaN/órfão), não "ficou fechado" (medido antes de travar: 8 arestas soltas)
      [[['cubo', { id: 0, lado: 1 }], ['apagaFace', { face: 1 }], ['espelha', { eixo: 'y', pos: 0.5 }]], false],
      [[['cubo', { id: 0, lado: 1 }], ['moveF', { face: 0, d: [0.2, 0, 0] }], ['mescla', { de: [0], para: 1 }]], true],
    ] as const) {
      const { V, F, orfaos } = nucleo(passos as any, {}, {});
      expect(orfaos).toHaveLength(0);
      if (fechado) expect(manifoldRuim(F)).toBe(0);
      expect([...V.values()].every((p: any) => p.every((c: number) => Number.isFinite(c)))).toBe(true);
    }
  });

  it('determinismo: mesma entrada -> forma canônica bit-a-bit idêntica', () => {
    const passos = [['cubo', { id: 0, lado: 1 }], ['moveF', { face: 1, d: [0.1, 0, 0] }], ['moveA', { a: 2, b: 3, d: [0, 0.1, 0] }], ['vira', { face: 2 }]];
    const canon = () => { const n = nucleo(passos as any, {}, {}); return JSON.stringify([[...n.V.entries()].sort((a, b) => a[0] - b[0]), [...n.F.entries()].sort((a, b) => a[0] - b[0]).map(([k, f]) => [k, (f as any).vs])]); };
    expect(canon()).toBe(canon());
  });
});

/* D-129 — seleção semântica para atributos e espelho. O contrato é deliberado:
   `sel.v` alcança as faces incidentes; `sel.regiao` só alcança faces INTEIRAS na
   caixa inclusiva. Assim o autor nunca pinta metade inesperada de uma face. */
describe('D-129 — seleção semântica uniforme (atributos + espelha)', () => {
  const cubo: any = ['cubo', { id: 0, lado: 1 }];

  it('pincel por grupo e região atinge as faces previstas; material, solido, liso e parte reutilizam a mesma seleção', () => {
    const n = nucleo([
      cubo,
      ['parte', { nome: 'topo', faces: [1] }],                         // assinatura legada preservada
      ['pincel', { modo: 'face', sel: { grupo: 'topo' }, cor: '#ff0000' }],
      ['material', { sel: { grupo: 'topo' }, usa: 'brilho' }],
      ['solido', { sel: { regiao: { min: [-1, 0.9, -1], max: [1, 1.1, 1] } } }],
      ['liso', { sel: { v: [4] } }],
      ['parte', { nome: 'cantoTopo', sel: { v: [4] } }],
    ] as any, {}, {}, { brilho: { cor: '#ffffff' } });
    expect(n.orfaos).toHaveLength(0);
    expect(n.F.get(1)).toMatchObject({ cor: '#ff0000', material: 'brilho', solido: true, liso: true });
    expect(n.F.get(0)).toMatchObject({ cor: null, material: null, solido: false });
    // v4 é canto do topo e de duas paredes: seleção por vértice alcança as três faces incidentes.
    expect([...n.F.values()].filter((f: any) => f.parte === 'cantoTopo').map((f: any) => f.id).sort()).toEqual([1, 2, 5]);
  });

  it('espelha por grupo e por região cria a metade nova, com a mesma contagem que sel.f', () => {
    const porGrupo = nucleo([cubo, ['parte', { nome: 'topo', faces: [1] }], ['espelha', { eixo: 'x', sel: { grupo: 'topo' } }]], {}, {});
    const porRegiao = nucleo([cubo, ['espelha', { eixo: 'x', sel: { regiao: { min: [-1, 0.9, -1], max: [1, 1.1, 1] } } }]], {}, {});
    const legado = nucleo([cubo, ['espelha', { eixo: 'x', sel: { f: [1] } }]], {}, {});
    for (const n of [porGrupo, porRegiao, legado]) { expect(n.orfaos).toHaveLength(0); expect(n.V.size).toBe(12); expect(n.F.size).toBe(7); }
    expect(JSON.stringify(neutroCanonico(legado))).toBe(JSON.stringify(neutroCanonico(porRegiao))); // f antigo = região que contém só o topo
  });

  it('faces:[ids] legado permanece byte-idêntico ao sel.f; rotaciona e transladar preservam a seleção antiga', () => {
    const legado = nucleo([cubo, ['pincel', { modo: 'face', faces: [1], cor: '#123456' }], ['liso', { faces: [1] }], ['solido', { faces: [1] }]], {}, {});
    const novo = nucleo([cubo, ['pincel', { modo: 'face', sel: { f: [1] }, cor: '#123456' }], ['liso', { sel: { f: [1] } }], ['solido', { sel: { f: [1] } }]], {}, {});
    expect(JSON.stringify(neutroCanonico(legado))).toBe(JSON.stringify(neutroCanonico(novo)));
    const movido = nucleo([cubo, ['transladar', { d: [1, 0, 0], sel: { f: [1] } }], ['rotaciona', { eixo: 'z', graus: 0, sel: { f: [1] } }]], {}, {});
    expect(movido.orfaos).toHaveLength(0);
    expect(movido.V.get(4)).toEqual([0.5, 1, -0.5]); expect(movido.V.get(0)).toEqual([-0.5, 0, -0.5]);
  });

  it('seleções inválidas, vazias, ambíguas, fora da peça e desconhecidas GRITAM sem corromper', () => {
    const casos: any[] = [
      ['pincel', { modo: 'face', sel: { grupo: 'naoexiste' }, cor: '#f00' }],
      ['pincel', { modo: 'face', sel: { regiao: { min: [9, 9, 9], max: [10, 10, 10] } }, cor: '#f00' }],
      ['pincel', { modo: 'face', sel: { regiao: { min: [-0.51, -0.1, -0.51], max: [-0.49, 0.1, -0.49] } }, cor: '#f00' }], // só v0: nenhuma face INTEIRA
      ['pincel', { modo: 'face', sel: { regiao: { min: [0, 0, 0] } }, cor: '#f00' }],
      ['pincel', { modo: 'face', sel: { regiao: { min: [0, 0, 0], max: [Infinity, 1, 1] } }, cor: '#f00' }],
      ['pincel', { modo: 'face', sel: { surpresa: [1] }, cor: '#f00' }],
      ['pincel', { modo: 'face', sel: { f: [] }, cor: '#f00' }],
      ['pincel', { modo: 'face', faces: [1], sel: { f: [1] }, cor: '#f00' }],
      ['pincel', { modo: 'face', sel: { f: [999] }, cor: '#f00' }],
    ];
    for (const passo of casos) {
      const n = nucleo([cubo, passo], {}, {});
      expect(n.orfaos.length).toBeGreaterThan(0);
      expect(n.orfaos.every((o: any) => o.op === 'pincel')).toBe(true);
      expect(n.F.get(1).cor).toBeNull();
    }
  });

  it('grupo sem face viva e órfãos não viram sucesso silencioso nem deixam estado parcial', () => {
    const n = nucleo([cubo, ['parte', { nome: 'sumiu', faces: [1] }], ['apagaFace', { face: 1 }], ['espelha', { eixo: 'x', sel: { grupo: 'sumiu' } }]], {}, {});
    expect(n.orfaos.some((o: any) => o.op === 'espelha' && /grupo 'sumiu'/.test(o.motivo))).toBe(true);
    expect(n.V.size).toBe(8); expect(n.F.size).toBe(5);  // espelho não chegou a alocar nada
  });

  it('medição na moto: os 32 ids de farol/lanterna viram duas regiões sem mudar a forma canônica', async () => {
    const url = new URL('../../prototipos/fps/v3/pecas/moto.js', import.meta.url);
    const moto: any = await import(fileURLToPath(url));
    const regioes: any = {
      farol: { min: [-0.058, 0.9499099168006007, 0.8691819833601201], max: [0.058, 1.0580900831993993, 0.914] },
      lanterna: { min: [-0.078, 0.9520002755842918, -1.19], max: [0.078, 1.0299997244157082, -1.1298533865667473] },
    };
    const derivados = moto.PASSOS.map((p: any) => p[0] === 'material' && regioes[p[1].usa]
      ? ['material', { sel: { regiao: regioes[p[1].usa] }, usa: p[1].usa }]
      : p);
    const original = nucleo(moto.PASSOS, moto.PARAMS, moto.TOPO, moto.MATERIAIS);
    const semantica = nucleo(derivados, moto.PARAMS, moto.TOPO, moto.MATERIAIS);
    expect(moto.PASSOS.find((p: any) => p[0] === 'material' && p[1].usa === 'farol')[1].faces.length).toBe(20);
    expect(moto.PASSOS.find((p: any) => p[0] === 'material' && p[1].usa === 'lanterna')[1].faces.length).toBe(12);
    expect(semantica.orfaos).toHaveLength(0);
    expect(JSON.stringify(neutroCanonico(semantica))).toBe(JSON.stringify(neutroCanonico(original)));
  });
});

/* P8b do playground — `chamferBox` (caixa com cantos/arestas chanfrados, o cubo
   cantelado). Prova por MEDIÇÃO, não recontagem de cabeça: a primeira derivação à
   mão desta topologia (puxar o vértice de canto por UM eixo só — "truncagem") dava
   uma malha que NÃO fecha (V−E+F ≠ 2, provado num script fora do repo antes de
   escrever esta op); a fórmula certa puxa os DOIS eixos que não são o da própria
   face ("cantelação" — cada FACE encolhe, não cada canto vira 1 corte). Os testes
   abaixo travam a numeração EXATA, o manifold+winding nas 26 faces (não numa
   amostra) e a fronteira exata do `chanfro` válido — a mesma disciplina do P1/P6. */
/* D-130 — proveniência local de loft. `origemId` é identidade declarada do
   gerador; o índice `st.origens` só existe durante nucleo e nunca entra no
   canônico. Faixa é zero-based: 2 liga as seções 2 e 3. */
describe('D-130 — seleção por origem local de loft', () => {
  const secoes = [0, 1, 2, 3].map((y) => ({ pos: [0, y, 0], raio: 1 }));
  const loft = (id: number, origemId = 1000): any => ['loft', { id, origemId, lados: 4, secoes }];
  const pintaOrigem = (extra: any = {}): any => ['pincel', { modo: 'face', sel: { origem: { op: 'loft', id: 1000, faixa: 2, ...extra } }, cor: '#123456' }];
  const canon = (passos: any[]) => JSON.stringify(neutroCanonico(nucleo(passos, {}, {})));

  it('fixture: faces:[ids] e sel.origem selecionam a mesma faixa, byte a byte', () => {
    const legado = [loft(0), ['pincel', { modo: 'face', faces: [8, 9, 10, 11], cor: '#123456' }]];
    const origem = [loft(0), pintaOrigem()];
    expect(canon(origem)).toBe(canon(legado));
    expect(canon([loft(0)])).toBe(canon([['loft', { id: 0, lados: 4, secoes }]])); // índice não entra no canônico
    expect(nucleo(origem, {}, {}).orfaos).toHaveLength(0);
  });

  it('faixa+lado resolve uma só face lateral local', () => {
    const n = nucleo([loft(0), pintaOrigem({ lado: 2 })], {}, {});
    expect(n.orfaos).toHaveLength(0);
    expect([...n.F.values()].filter((f: any) => f.cor === '#123456').map((f: any) => f.id)).toEqual([10]);
  });

  it('sobrevive à geometria não relacionada antes do loft; literal antigo é posicional e precisa ser recalculado', () => {
    const comAntes = [['cubo', { id: 0, lado: 1 }], loft(BLOCO), pintaOrigem()];
    const semRecalcular = [['cubo', { id: 0, lado: 1 }], loft(BLOCO), ['pincel', { modo: 'face', faces: [8, 9, 10, 11], cor: '#123456' }]];
    const recalculado = [['cubo', { id: 0, lado: 1 }], loft(BLOCO), ['pincel', { modo: 'face', faces: [1008, 1009, 1010, 1011], cor: '#123456' }]];
    const porOrigem = nucleo(comAntes, {}, {}), literalVelho = nucleo(semRecalcular, {}, {});
    expect(porOrigem.orfaos).toHaveLength(0);
    expect([...porOrigem.F.values()].filter((f: any) => f.cor === '#123456').map((f: any) => f.id)).toEqual([1008, 1009, 1010, 1011]);
    expect(literalVelho.orfaos.some((o: any) => o.op === 'pincel' && /inexistente|vazia/.test(o.motivo))).toBe(true);
    expect(canon(comAntes)).toBe(canon(recalculado));
  });

  it('replay, round-trip e seleção literal legada continuam determinísticos', () => {
    const passos = [loft(0), pintaOrigem()];
    expect(canon(passos)).toBe(canon(JSON.parse(JSON.stringify(passos))));
    expect(canon(passos)).toBe(canon(passos));
    const legado = [loft(0), ['pincel', { modo: 'face', faces: [8, 9, 10, 11], cor: '#123456' }]];
    expect(canon(legado)).toBe(canon(passos));
  });

  it('origem inválida, vazia, desconhecida ou ambígua GRITA e não pinta por acidente', () => {
    const casos: any[] = [
      { op: 'loft', id: 999, faixa: 2 },
      { op: 'cone', id: 1000, faixa: 2 },
      { op: 'loft', id: 1000, faixa: 9 },
      { op: 'loft', id: 1000, faixa: 2, lado: 9 },
      { op: 'loft', id: 1000, faixa: 2, surpresa: true },
      {},
    ];
    for (const origem of casos) {
      const n = nucleo([loft(0), ['pincel', { modo: 'face', sel: { origem }, cor: '#123456' }]], {}, {});
      expect(n.orfaos.some((o: any) => o.op === 'pincel')).toBe(true);
      expect([...n.F.values()].some((f: any) => f.cor === '#123456')).toBe(false);
    }
    const ambiguo = nucleo([loft(0), loft(BLOCO), pintaOrigem()], {}, {});
    expect(ambiguo.orfaos.some((o: any) => o.op === 'pincel' && /ambígua/.test(o.motivo))).toBe(true);
  });

  it('rotaciona, transladar e seleção semântica atual não regressam ao usar o mesmo resolvedor', () => {
    const n = nucleo([loft(0), ['transladar', { d: [1, 0, 0], sel: { origem: { op: 'loft', id: 1000, faixa: 2 } } }], ['rotaciona', { eixo: 'y', graus: 0, sel: { origem: { op: 'loft', id: 1000, faixa: 2 } } }]], {}, {});
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.get(8)![0]).toBe(nucleo([loft(0)], {}, {}).V.get(8)![0] + 1);
    const grupo = nucleo([['cubo', { id: 0, lado: 1 }], ['parte', { nome: 'topo', faces: [1] }], ['pincel', { modo: 'face', sel: { grupo: 'topo' }, cor: '#123456' }]], {}, {});
    expect(grupo.orfaos).toHaveLength(0);
  });
});

describe('Fase 2 — fixture de aliases estáveis de loft', () => {
  const ctx = { tex: { texCanvas: (w: number, h: number) => ({ width: w, height: h }) }, m4: { ident: () => new Float32Array(16) } };
  const secoes = [0, 1, 2, 3].map((y) => ({ pos: [0, y, 0], raio: 1 }));
  const loft = (id: number, origemId: number, x = 0): any => ['loft', { id, origemId, lados: 4, secoes: secoes.map((s) => ({ ...s, pos: [x, s.pos[1], s.pos[2]] })) }];
  const aliases: any = [
    ['faixaA', { origem: { op: 'loft', id: 10, faixa: 1 } }],
    ['duasFaixas', { unir: [{ origem: { op: 'loft', id: 10, faixa: 1 } }, { origem: { op: 'loft', id: 20, faixa: 2 } }] }],
  ];
  it('alias direto e união sobrevivem inserção anterior e transformação, sem IDs globais', () => {
    const base: any[] = [loft(0, 10), loft(BLOCO, 20), ['pincel', { modo: 'face', sel: { alias: 'duasFaixas' }, cor: '#123456' }], ['transladar', { d: [1, 0, 0], sel: { alias: 'faixaA' } }], ['liso', { sel: { alias: 'faixaA' } }]];
    const antes = nucleo(base, {}, {}, {}, null, aliases);
    const depois = nucleo([['cubo', { id: 0, lado: 1 }], loft(BLOCO, 10), loft(BLOCO * 2, 20), ...base.slice(2)], {}, {}, {}, null, aliases);
    expect(antes.orfaos).toHaveLength(0); expect(depois.orfaos).toHaveLength(0);
    expect([...antes.F.values()].filter((f: any) => f.cor === '#123456')).toHaveLength(8);
    expect([...depois.F.values()].filter((f: any) => f.cor === '#123456')).toHaveLength(8);
    expect([...antes.F.values()].filter((f: any) => f.liso)).toHaveLength(4); // mesmo alias DEPOIS de transladar
    expect(JSON.stringify(aliases)).not.toMatch(/\b1000\b|\b1004\b/);
    expect(JSON.stringify(neutroCanonico(nucleo(base, {}, {}, {}, null, JSON.parse(JSON.stringify(aliases)))))).toBe(JSON.stringify(neutroCanonico(antes)));
  });
  it('executar encaminha ALIASES: parte retorna lote nomeado só com a faixa do alias', () => {
    const porAlias: any[] = [loft(0, 10), loft(BLOCO, 20), ['parte', { nome: 'faixa-da-alias', sel: { alias: 'faixaA' } }]];
    const porFaces: any[] = [loft(0, 10), loft(BLOCO, 20), ['parte', { nome: 'faixa-da-alias', faces: [4, 5, 6, 7] }]];
    const obj: any = executar(porAlias, {}, {}, ctx, {}, {}, null, aliases);
    const literal: any = executar(porFaces, {}, {}, ctx);
    const lote = obj.lotes.find((L: any) => L.parte === 'faixa-da-alias');
    const loteLiteral = literal.lotes.find((L: any) => L.parte === 'faixa-da-alias');
    expect(lote).toBeDefined(); // sem encaminhar ALIASES, `parte` não cria este lote
    expect(lote.mesh.v.length).toBe(4 * 6 * 8); // quatro quads da faixa, triangulados no adaptador
    expect(Array.from(lote.mesh.v)).toEqual(Array.from(loteLiteral.mesh.v));
    expect(obj.lotes.filter((L: any) => L.parte === 'faixa-da-alias')).toHaveLength(1);
  });
  it('colisaoDe encaminha ALIASES: sólido da faixa ignora o loft distante e iguala seleção literal', () => {
    const porAlias: any[] = [loft(0, 10), loft(BLOCO, 20, 100), ['solido', { sel: { alias: 'faixaA' } }]];
    const porFaces: any[] = [loft(0, 10), loft(BLOCO, 20, 100), ['solido', { faces: [4, 5, 6, 7] }]];
    const viaAlias = colisaoDe(porAlias, {}, {}, {}, aliases);
    const literal = colisaoDe(porFaces, {}, {});
    expect(viaAlias).toEqual(literal);
    expect(viaAlias).toEqual({ forma: 'cilindro', raio: 1, altura: 1, base: 1 });
  });
  it('duplicatas, cadeia, origem/faixa inválida gritam e alias não aplica parcialmente', () => {
    const valido = { origem: { op: 'loft', id: 10, faixa: 1 } };
    expect(() => nucleo([], {}, {}, {}, null, [['x', valido], ['x', valido]])).toThrow(/duplicado/);
    expect(() => nucleo([], {}, {}, {}, null, [['x', { alias: 'faixaA' }]])).toThrow(/inválido/);
    const casos: any[] = [
      [['x', { origem: { op: 'loft', id: 99, faixa: 1 } }]],
      [['x', { origem: { op: 'loft', id: 10, faixa: 99 } }]],
    ];
    for (const a of casos) { const n = nucleo([loft(0, 10), loft(BLOCO, 10), ['pincel', { modo: 'face', sel: { alias: 'x' }, cor: '#f00' }]], {}, {}, {}, null, a); expect(n.orfaos.length).toBeGreaterThan(0); expect([...n.F.values()].some((f: any) => f.cor === '#f00')).toBe(false); }
    for (const escondido of [
      { v: [0] }, { f: [0] }, { faces: [0] }, { origem: { op: 'loft', id: 10, faixa: 1 }, extra: true }, { unir: [] },
      { origem: { op: 'loft', id: 10, faixa: 1, v: [0] } }, { origem: { op: 'loft', id: 10, faixa: 1, f: [0] } }, { origem: { op: 'loft', id: 10, faixa: 1, faces: [0] } },
      { origem: null }, { origem: { op: 'loft', id: 10 } }, { origem: { op: 'cilindro', id: 10, faixa: 1 } },
      { unir: [{ origem: { op: 'loft', id: 10, faixa: 1, faces: [0] } }] }, { unir: [{ alias: 'faixaA' }] },
    ]) expect(() => nucleo([['cubo', { id: 0, lado: Infinity }]], {}, {}, {}, null, [['x', escondido]])).toThrow(/alias.*inválido/);
  });
});

describe('Fase 2 — fixture de aliases estáveis de cubo', () => {
  const ctx = { tex: { texCanvas: (w: number, h: number) => ({ width: w, height: h }) }, m4: { ident: () => new Float32Array(16) } };
  const secoes = [0, 1, 2, 3].map((y) => ({ pos: [0, y, 0], raio: 1 }));
  const cubo = (id: number, origemId: number, extra: any = {}): any => ['cubo', { id, origemId, ...extra }];
  const loft = (id: number, origemId: number, x = 0): any => ['loft', { id, origemId, lados: 4, secoes: secoes.map((s) => ({ ...s, pos: [x, s.pos[1], s.pos[2]] })) }];
  const aliases: any = [
    ['topoCubo', { origem: { op: 'cubo', id: 30, face: 'topo' } }],
    ['frenteCubo', { origem: { op: 'cubo', id: 30, face: 'frente' } }],
    ['topoEFaixa', { unir: [{ origem: { op: 'cubo', id: 30, face: 'topo' } }, { origem: { op: 'loft', id: 40, faixa: 1 } }] }],
  ];
  const facesCom = (n: any, chave: string, valor: any) => [...n.F.values()].filter((f: any) => f[chave] === valor);

  it('topo do cubo seleciona uma única face e sobrevive inserção anterior e dimensões', () => {
    const passos: any[] = [cubo(0, 30), ['pincel', { modo: 'face', sel: { alias: 'topoCubo' }, cor: '#123456' }]];
    const base = nucleo(passos, {}, {}, {}, null, aliases);
    const inserido = nucleo([['cubo', { id: 0, lado: 2 }], cubo(BLOCO, 30), ...passos.slice(1)], {}, {}, {}, null, aliases);
    expect(base.orfaos).toHaveLength(0); expect(facesCom(base, 'cor', '#123456').map((f: any) => f.id)).toEqual([1]);
    expect(inserido.orfaos).toHaveLength(0); expect(facesCom(inserido, 'cor', '#123456').map((f: any) => f.id)).toEqual([BLOCO + 1]);
    expect(JSON.stringify(neutroCanonico(base))).toBe(JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(passos)), {}, {}, {}, null, JSON.parse(JSON.stringify(aliases))))));
    for (const extra of [{ larg: 3, alt: 2, prof: 0.5 }, { larg: 0.25, alt: 4, prof: 5 }]) {
      const n = nucleo([cubo(0, 30, extra), ['parte', { nome: 'topo', sel: { alias: 'topoCubo' } }]], {}, {}, {}, null, aliases);
      expect(n.orfaos).toHaveLength(0); expect(facesCom(n, 'parte', 'topo').map((f: any) => f.id)).toEqual([1]);
    }
  });

  it('frente é local: rotação preserva o nome e o alias pinta a antiga face +z', () => {
    const n = nucleo([cubo(0, 30), ['rotaciona', { eixo: 'y', graus: 180 }], ['pincel', { modo: 'face', sel: { alias: 'frenteCubo' }, cor: '#f00' }]], {}, {}, {}, null, aliases);
    const frente = n.F.get(4)!;
    const zMedio = frente.vs.reduce((s: number, v: number) => s + n.V.get(v)![2], 0) / frente.vs.length;
    expect(n.orfaos).toHaveLength(0); expect(frente.cor).toBe('#f00'); expect(n.F.get(2)!.cor).toBeNull();
    expect(zMedio).toBeLessThan(0); // depois de girar, a frente estrutural não é a direção +z do mundo
  });

  it('compõe topo do cubo e faixa de loft sem uma origem artificial', () => {
    const n = nucleo([cubo(0, 30), loft(BLOCO, 40), ['pincel', { modo: 'face', sel: { alias: 'topoEFaixa' }, cor: '#0f0' }]], {}, {}, {}, null, aliases);
    expect(n.orfaos).toHaveLength(0); expect(facesCom(n, 'cor', '#0f0').map((f: any) => f.id)).toEqual([1, BLOCO + 4, BLOCO + 5, BLOCO + 6, BLOCO + 7]);
  });

  it('executar e colisaoDe reutilizam o alias do cubo pela API pública', () => {
    const porAlias: any[] = [cubo(0, 30), loft(BLOCO, 40, 100), ['parte', { nome: 'tampo', sel: { alias: 'topoCubo' } }], ['solido', { sel: { alias: 'topoCubo' } }]];
    const porFaces: any[] = [cubo(0, 30), loft(BLOCO, 40, 100), ['parte', { nome: 'tampo', faces: [1] }], ['solido', { faces: [1] }]];
    const obj: any = executar(porAlias, {}, {}, ctx, {}, {}, null, aliases);
    const literal: any = executar(porFaces, {}, {}, ctx);
    const lote = obj.lotes.find((L: any) => L.parte === 'tampo');
    const loteLiteral = literal.lotes.find((L: any) => L.parte === 'tampo');
    expect(lote.mesh.v.length).toBe(6 * 8); expect(Array.from(lote.mesh.v)).toEqual(Array.from(loteLiteral.mesh.v));
    expect(colisaoDe(porAlias, {}, {}, {}, aliases)).toEqual(colisaoDe(porFaces, {}, {}));
    expect(colisaoDe(porAlias, {}, {}, {}, aliases).raio).toBeLessThan(2); // não inclui o loft distante
  });

  it('duplicatas e origem errada gritam; alias inválido não pinta, nomeia ou transforma parcialmente', () => {
    const duplicadoCubo = nucleo([cubo(0, 30), cubo(BLOCO, 30), ['pincel', { modo: 'face', sel: { alias: 'topoCubo' }, cor: '#f00' }]], {}, {}, {}, null, aliases);
    const duplicadoMisto = nucleo([cubo(0, 30), loft(BLOCO, 30), ['pincel', { modo: 'face', sel: { alias: 'topoCubo' }, cor: '#f00' }]], {}, {}, {}, null, aliases);
    for (const n of [duplicadoCubo, duplicadoMisto]) {
      expect(n.orfaos.some((o: any) => /duplicado/.test(o.motivo))).toBe(true);
      expect(n.orfaos.some((o: any) => /origemId 30.*duplicado/.test(o.motivo))).toBe(true);
      expect(facesCom(n, 'cor', '#f00')).toHaveLength(0);
    }
    expect(() => nucleo([], {}, {}, {}, null, [['x', { origem: { op: 'cubo', id: 30, face: 'inexistente' } }]])).toThrow(/inválido/);
    expect(() => nucleo([], {}, {}, {}, null, [['x', { origem: { op: 'cubo', id: 30, face: 'topo', faces: [1] } }]])).toThrow(/inválido/);
    const nomeRuim = nucleo([cubo(0, 30), ['pincel', { modo: 'face', sel: { origem: { op: 'cubo', id: 30, face: 'inexistente' } }, cor: '#f00' }]], {}, {});
    expect(nomeRuim.orfaos.some((o: any) => o.op === 'pincel' && /origem inválida/.test(o.motivo))).toBe(true); expect(facesCom(nomeRuim, 'cor', '#f00')).toHaveLength(0);
    const quebrado: any = [['misto', { unir: [{ origem: { op: 'cubo', id: 30, face: 'topo' } }, { origem: { op: 'loft', id: 99, faixa: 1 } }] }]];
    const passos: any[] = [cubo(0, 30), ['pincel', { modo: 'face', sel: { alias: 'misto' }, cor: '#f00' }], ['parte', { nome: 'nao-aplica', sel: { alias: 'misto' } }], ['transladar', { d: [3, 0, 0], sel: { alias: 'misto' } }]];
    const n = nucleo(passos, {}, {}, {}, null, quebrado), puro = nucleo([cubo(0, 30)], {}, {});
    for (const op of ['pincel', 'parte', 'transladar']) expect(n.orfaos.some((o: any) => o.op === op)).toBe(true);
    expect(facesCom(n, 'cor', '#f00')).toHaveLength(0); expect(facesCom(n, 'parte', 'nao-aplica')).toHaveLength(0);
    expect(JSON.stringify(neutroCanonico(n).V)).toBe(JSON.stringify(neutroCanonico(puro).V));
    const errada = nucleo([loft(0, 30), ['pincel', { modo: 'face', sel: { alias: 'topoCubo' }, cor: '#f00' }]], {}, {}, {}, null, aliases);
    expect(errada.orfaos.some((o: any) => /foi declarada por 'loft'/.test(o.motivo))).toBe(true); expect(facesCom(errada, 'cor', '#f00')).toHaveLength(0);
  });

  it('declaração duplicada posterior invalida alias e sel.origem desde o início, sem bloquear outra identidade', () => {
    const comSeguro: any = [...aliases, ['topoSeguro', { origem: { op: 'cubo', id: 40, face: 'topo' } }]];
    const ordemA: any[] = [
      cubo(0, 30),
      ['pincel', { modo: 'face', sel: { alias: 'topoCubo' }, cor: '#f00' }],
      ['parte', { nome: 'nao-nasce', sel: { alias: 'topoCubo' } }],
      ['transladar', { d: [3, 0, 0], sel: { alias: 'topoCubo' } }],
      ['liso', { sel: { origem: { op: 'cubo', id: 30, face: 'topo' } } }],
      cubo(BLOCO * 5, 30),
      cubo(BLOCO * 6, 40),
      ['pincel', { modo: 'face', sel: { alias: 'topoSeguro' }, cor: '#0f0' }],
    ];
    const a = nucleo(ordemA, {}, {}, {}, null, comSeguro), puro = nucleo([cubo(0, 30)], {}, {});
    const motivoA = a.orfaos.find((o: any) => o.op === 'pincel' && /duplicado nas declarações/.test(o.motivo))?.motivo;
    expect(motivoA).toMatch(/passos 0 \(cubo\), 5 \(cubo\)/);
    for (const op of ['pincel', 'parte', 'transladar', 'liso']) expect(a.orfaos.some((o: any) => o.op === op && /duplicado nas declarações/.test(o.motivo))).toBe(true);
    expect(facesCom(a, 'cor', '#f00')).toHaveLength(0); expect(facesCom(a, 'parte', 'nao-nasce')).toHaveLength(0); expect(facesCom(a, 'liso', true)).toHaveLength(0);
    expect(JSON.stringify([...a.V.entries()].filter(([id]) => id < BLOCO))).toBe(JSON.stringify([...puro.V.entries()]));
    expect(facesCom(a, 'cor', '#0f0').map((f: any) => f.id)).toEqual([BLOCO * 6 + 1]); // identidade 40 segue independente

    const ordemB: any[] = [
      cubo(0, 30),
      ['pincel', { modo: 'face', sel: { alias: 'topoCubo' }, cor: '#f00' }],
      ['parte', { nome: 'tambem-nao', sel: { alias: 'topoCubo' } }],
      loft(BLOCO * 3, 30),
    ];
    const b = nucleo(ordemB, {}, {}, {}, null, aliases);
    expect(b.orfaos.some((o: any) => o.op === 'pincel' && /passos 0 \(cubo\), 3 \(loft\)/.test(o.motivo))).toBe(true);
    expect(b.orfaos.some((o: any) => o.op === 'parte' && /duplicado nas declarações/.test(o.motivo))).toBe(true);
    expect(facesCom(b, 'cor', '#f00')).toHaveLength(0); expect(facesCom(b, 'parte', 'tambem-nao')).toHaveLength(0);
  });
});

describe('Fase 3 — fixture de origem derivada por espelha', () => {
  const ctx = { tex: { texCanvas: (w: number, h: number) => ({ width: w, height: h }) }, m4: { ident: () => new Float32Array(16) } };
  const original = { op: 'cubo', id: 30, face: 'topo' };
  const copia = { op: 'espelha', id: 50, de: original };
  const aliases: any = [
    ['topoOriginal', { origem: original }],
    ['topoEspelhado', { origem: copia }],
    ['doisTopos', { unir: [{ origem: original }, { origem: copia }] }],
  ];
  const base = (): any[] => [
    ['cubo', { id: 0, lado: 1, origemId: 30 }],
    ['transladar', { d: [2, 0, 0] }],
    ['espelha', { eixo: 'x', pos: 0, origemId: 50, derivaDe: original, sel: { origem: original } }],
  ];
  const facesCom = (n: any, chave: string, valor: any) => [...n.F.values()].filter((f: any) => f[chave] === valor).map((f: any) => f.id).sort((a: number, b: number) => a - b);

  it('separa topo original e cópia, preserva os dois nomes após transformação e inserção anterior', () => {
    const passos: any[] = [...base(),
      ['pincel', { modo: 'face', sel: { alias: 'topoOriginal' }, cor: '#f00' }],
      ['pincel', { modo: 'face', sel: { alias: 'topoEspelhado' }, cor: '#00f' }],
      ['transladar', { d: [0, 1, 0], sel: { alias: 'topoEspelhado' } }],
      ['liso', { sel: { alias: 'topoEspelhado' } }],
    ];
    const n = nucleo(passos, {}, {}, {}, null, aliases);
    expect(n.orfaos).toHaveLength(0);
    expect(facesCom(n, 'cor', '#f00')).toEqual([1]);
    expect(facesCom(n, 'cor', '#00f')).toEqual([2000]);
    expect(n.F.get(1)!.liso).toBe(false); expect(n.F.get(2000)!.liso).toBe(true);
    const yOriginal = n.F.get(1)!.vs.reduce((s: number, v: number) => s + n.V.get(v)![1], 0) / 4;
    const yCopia = n.F.get(2000)!.vs.reduce((s: number, v: number) => s + n.V.get(v)![1], 0) / 4;
    expect(yCopia).toBe(yOriginal + 1);

    const inserido = nucleo([
      ['cubo', { id: 0, lado: 0.25 }],
      ['cubo', { id: BLOCO, lado: 1, origemId: 30 }],
      ['transladar', { d: [2, 0, 0] }],
      ['espelha', { eixo: 'x', pos: 0, origemId: 50, derivaDe: original, sel: { origem: original } }],
      ...passos.slice(3),
    ], {}, {}, {}, null, aliases);
    expect(inserido.orfaos).toHaveLength(0);
    expect(facesCom(inserido, 'cor', '#f00')).toEqual([BLOCO + 1]);
    expect(facesCom(inserido, 'cor', '#00f')).toEqual([BLOCO * 3]);

    const ambos = nucleo([...base(), ['pincel', { modo: 'face', sel: { alias: 'doisTopos' }, cor: '#0f0' }]], {}, {}, {}, null, aliases);
    expect(facesCom(ambos, 'cor', '#0f0')).toEqual([1, 2000]);
    const canon = JSON.stringify(neutroCanonico(nucleo(passos, {}, {}, {}, null, aliases)));
    expect(JSON.stringify(neutroCanonico(nucleo(passos, {}, {}, {}, null, aliases)))).toBe(canon);
    expect(JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(passos)), {}, {}, {}, null, JSON.parse(JSON.stringify(aliases)))))).toBe(canon);
  });

  it('executar recebe a origem espelhada pela API pública e nomeia só a cópia', () => {
    const porAlias: any[] = [...base(), ['parte', { nome: 'tampo-espelhado', sel: { alias: 'topoEspelhado' } }]];
    const literal: any[] = [...base(), ['parte', { nome: 'tampo-espelhado', faces: [2000] }]];
    const viaApi: any = executar(porAlias, {}, {}, ctx, {}, {}, null, aliases);
    const lote = viaApi.lotes.find((l: any) => l.parte === 'tampo-espelhado');
    const loteLiteral = executar(literal, {}, {}, ctx).lotes.find((l: any) => l.parte === 'tampo-espelhado');
    expect(lote).toBeDefined();
    expect(lote.mesh.v.length).toBe(6 * 8);
    expect(Array.from(lote.mesh.v)).toEqual(Array.from(loteLiteral.mesh.v));
  });

  it('declaração repetida da saída e fonte inexistente ou ambígua bloqueiam a origem derivada antes de qualquer uso', () => {
    const duplicada: any[] = [
      ['cubo', { id: 0, lado: 1, origemId: 30 }],
      ['espelha', { eixo: 'x', origemId: 50, derivaDe: original, sel: { origem: original } }],
      ['pincel', { modo: 'face', sel: { alias: 'topoEspelhado' }, cor: '#f00' }],
      ['parte', { nome: 'nao-nasce', sel: { alias: 'topoEspelhado' } }],
      ['transladar', { d: [2, 0, 0], sel: { alias: 'topoEspelhado' } }],
      ['espelha', { eixo: 'x', origemId: 50, derivaDe: original, sel: { origem: original } }],
    ];
    const d = nucleo(duplicada, {}, {}, {}, null, aliases), puro = nucleo([duplicada[0]], {}, {});
    expect(d.orfaos.some((o: any) => /passos 1 \(espelha\), 5 \(espelha\)/.test(o.motivo))).toBe(true);
    for (const op of ['pincel', 'parte', 'transladar']) expect(d.orfaos.some((o: any) => o.op === op)).toBe(true);
    expect(facesCom(d, 'cor', '#f00')).toEqual([]); expect(facesCom(d, 'parte', 'nao-nasce')).toEqual([]);
    expect(neutroCanonico(d).V).toEqual(neutroCanonico(puro).V);
    expect(neutroCanonico(d).F).toEqual(neutroCanonico(puro).F);

    const inexistente = nucleo([['espelha', { eixo: 'x', origemId: 50, derivaDe: original, sel: { origem: original } }]], {}, {}, {}, null, aliases);
    expect(inexistente.F.size).toBe(0); expect(inexistente.orfaos.some((o: any) => /inexistente/.test(o.motivo))).toBe(true);
    const fonteDuplicada = nucleo([
      ['cubo', { id: 0, lado: 1, origemId: 30 }], ['cubo', { id: BLOCO, lado: 1, origemId: 30 }],
      ['espelha', { eixo: 'x', origemId: 50, derivaDe: original, sel: { origem: original } }],
    ], {}, {}, {}, null, aliases);
    expect(fonteDuplicada.F.has(2000)).toBe(false); expect(fonteDuplicada.orfaos.some((o: any) => /ambígua|duplicado/.test(o.motivo))).toBe(true);
  });

  it('modo estrutural rejeita fonte diferente, fontes literais e IDs escondidos sem criar cópia', () => {
    const frente = { op: 'cubo', id: 30, face: 'frente' };
    const casos: any[] = [
      { origemId: 50 }, { derivaDe: original },
      { origemId: 50, derivaDe: original, sel: { origem: frente } },
      { origemId: 50, derivaDe: original, sel: { alias: 'topoOriginal' } },
      { origemId: 50, derivaDe: original, sel: { regiao: { min: [0, 0, 0], max: [1, 1, 1] } } },
      { origemId: 50, derivaDe: original, sel: { f: [1] } },
      { origemId: 50, derivaDe: original, faces: [1], sel: { origem: original } },
      ...['v', 'f', 'faces'].map((chave) => ({ origemId: 50, derivaDe: { ...original, [chave]: [1] }, sel: { origem: original } })),
    ];
    for (const args of casos) {
      const n = nucleo([['cubo', { id: 0, lado: 1, origemId: 30 }], ['espelha', { eixo: 'x', ...args }]], {}, {}, {}, null, aliases);
      expect(n.F.size).toBe(6); expect(n.orfaos.some((o: any) => o.op === 'espelha')).toBe(true);
    }
  });

  it('face inteiramente no plano aborta a saída estrutural antes de alocar geometria e qualquer uso posterior grita sem efeito parcial', () => {
    const plano: any[] = [
      ['cubo', { id: 0, lado: 1, origemId: 30 }],
      ['espelha', { eixo: 'y', pos: 1, origemId: 50, derivaDe: original, sel: { origem: original } }],
      ['pincel', { modo: 'face', sel: { alias: 'topoEspelhado' }, cor: '#f00' }],
      ['parte', { nome: 'nao-copia', sel: { alias: 'topoEspelhado' } }],
      ['transladar', { d: [0, 2, 0], sel: { alias: 'topoEspelhado' } }],
    ];
    const n = nucleo(plano, {}, {}, {}, null, aliases), puro = nucleo([plano[0]], {}, {});
    expect(n.F.size).toBe(6);
    for (const op of ['pincel', 'parte', 'transladar']) expect(n.orfaos.some((o: any) => o.op === op && /inexistente/.test(o.motivo))).toBe(true);
    expect(facesCom(n, 'cor', '#f00')).toEqual([]); expect(facesCom(n, 'parte', 'nao-copia')).toEqual([]);
    expect(neutroCanonico(n).V).toEqual(neutroCanonico(puro).V);
    expect(neutroCanonico(n).F).toEqual(neutroCanonico(puro).F);
  });

  it('uma fonte estrutural com faces copiáveis e uma face no plano produz zero cópias e não deixa saída parcial utilizável', () => {
    const faixa = { op: 'loft', id: 40, faixa: 0 };
    const saida = { op: 'espelha', id: 50, de: faixa };
    const aliasesDaSaida: any = [['faixaEspelhada', { origem: saida }]];
    const secoes = [
      { pos: [0, 0, 0], contorno: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
      { pos: [0, 1, 0], contorno: [[-1, -1], [1, -1], [1, 1], [-1, 1]] },
    ];
    const fonte: any[] = [['loft', { id: 0, origemId: 40, lados: 4, secoes }]];
    const passos: any[] = [...fonte,
      ['espelha', { eixo: 'x', pos: 1, origemId: 50, derivaDe: faixa, sel: { origem: faixa } }],
      ['pincel', { modo: 'face', sel: { alias: 'faixaEspelhada' }, cor: '#f00' }],
      ['parte', { nome: 'nao-copia', sel: { alias: 'faixaEspelhada' } }],
      ['transladar', { d: [3, 0, 0], sel: { alias: 'faixaEspelhada' } }],
    ];
    const puro = nucleo(fonte, {}, {});
    const fonteFaces = [...puro.F.values()];
    expect(fonteFaces).toHaveLength(4);
    expect(fonteFaces.filter((f: any) => f.vs.every((v: number) => puro.V.get(v)![0] === 1))).toHaveLength(1);
    expect(fonteFaces.some((f: any) => f.vs.some((v: number) => puro.V.get(v)![0] !== 1))).toBe(true);

    const n = nucleo(passos, {}, {}, {}, null, aliasesDaSaida);
    expect(n.orfaos.some((o: any) => o.op === 'espelha' && /nenhuma cópia foi criada/.test(o.motivo))).toBe(true);
    for (const op of ['pincel', 'parte', 'transladar']) expect(n.orfaos.some((o: any) => o.op === op && /inexistente/.test(o.motivo))).toBe(true);
    expect(n.V.size).toBe(puro.V.size); expect(n.F.size).toBe(puro.F.size);
    expect(neutroCanonico(n).V).toEqual(neutroCanonico(puro).V);
    expect(neutroCanonico(n).F).toEqual(neutroCanonico(puro).F);
    expect(facesCom(n, 'cor', '#f00')).toEqual([]); expect(facesCom(n, 'parte', 'nao-copia')).toEqual([]);
  });
});

/* P8b do playground — chamferBox. */
describe('P8b — chamferBox (caixa cantelada: cantos e arestas chanfrados)', () => {
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
  const manifoldRuim = (F: any) => {
    const m = new Map<string, number>();
    for (const f of F.values()) for (let k = 0; k < (f as any).vs.length; k++) { const a = (f as any).vs[k], b = (f as any).vs[(k + 1) % (f as any).vs.length]; m.set(`${a},${b}`, (m.get(`${a},${b}`) ?? 0) + 1); }
    let ruim = 0; for (const [k, c] of m) { const [a, b] = k.split(','); if (c !== 1 || (m.get(`${b},${a}`) ?? 0) !== 1) ruim++; } return ruim;
  };
  const volume = (V: any, F: any) => {
    let vol = 0;
    for (const f of F.values()) { const vs = (f as any).vs; for (let k = 1; k + 1 < vs.length; k++) {
      const a = V.get(vs[0]), b = V.get(vs[k]), c = V.get(vs[k + 1]);
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    } }
    return vol;
  };

  it('numeração EXATA travada — vértices dos cantos 0 e 6, faces das 3 famílias (derivado da fórmula documentada, medido)', () => {
    // larg=alt=prof=2 -> lx=1,ly=2,lz=1 (o mesmo ly CHEIO do cubo, não /2); chanfro=0.3
    const { V, F, orfaos } = nucleo([['chamferBox', { id: 0, larg: 2, alt: 2, prof: 2, chanfro: 0.3 }]], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(24);
    expect(F.size).toBe(26);
    // canto 0 = (sx=-1,sy=0,sz=-1): X=b+0, Y=b+1, Z=b+2
    expect(V.get(0)).toEqual([-1, 0.3, -0.7]);    // X: x CHEIO (-lx), y/z encolhidos (+oy·c no y pois sy=0 empurra pra dentro)
    expect(V.get(1)).toEqual([-0.7, 0, -0.7]);    // Y: y CHEIO (0), x/z encolhidos
    expect(V.get(2)).toEqual([-0.7, 0.3, -1]);    // Z: z CHEIO (-lz), x/y encolhidos
    // canto 6 = (sx=1,sy=1,sz=1): X=b+18, Y=b+19, Z=b+20
    expect(V.get(18)).toEqual([1, 1.7, 0.7]);
    expect(V.get(19)).toEqual([0.7, 2, 0.7]);
    expect(V.get(20)).toEqual([0.7, 1.7, 1]);
    // uma face de cada família (ids fixos, formato salvo)
    expect(F.get(0)!.vs).toEqual([1, 4, 7, 10]);      // fundo -y: os 4 vértices Y dos cantos 0..3
    expect(F.get(6)!.vs.length).toBe(4);              // 1a aresta (retângulo)
    expect(F.get(18)!.vs.length).toBe(3);             // 1o triângulo de canto
  });

  it('manifold + winding pra FORA em TODAS as 26 faces (não numa amostra) + volume < caixa reta, em geometrias variadas (não só cúbica)', () => {
    for (const [larg, alt, prof, chanfro] of [[2.6, 2.1, 1.6, 0.25], [2, 2, 2, 0.01], [4, 1, 4, 0.2], [0.6, 5, 3.4, 0.1]] as const) {
      const { V, F, orfaos } = nucleo([['chamferBox', { id: 0, larg, alt, prof, chanfro }]], {}, {});
      expect(orfaos).toHaveLength(0);
      expect(manifoldRuim(F)).toBe(0);
      const centro = [0, alt / 2, 0];
      for (const f of F.values()) {
        const n = newell(V, (f as any).vs), c = centroide(V, (f as any).vs);
        const dot = n[0] * (c[0] - centro[0]) + n[1] * (c[1] - centro[1]) + n[2] * (c[2] - centro[2]);
        expect(dot).toBeGreaterThan(0);
      }
      const vol = volume(V, F), volReto = larg * alt * prof;
      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(volReto);   // chanfro sempre CORTA volume, nunca adiciona
    }
  });

  it('fronteira EXATA de `chanfro` válido (lado=1 -> limite=min(0.5,0.5,0.5)=0.5): dentro passa, no limite e além GRITA e não constrói nada', () => {
    const dentro = nucleo([['chamferBox', { id: 0, lado: 1, chanfro: 0.499999 }]], {}, {});
    expect(dentro.orfaos).toHaveLength(0);
    expect(dentro.V.size).toBe(24);

    for (const chanfro of [0.5, 0.500001, 0, -0.1]) {
      const { V, F, orfaos } = nucleo([['chamferBox', { id: 0, lado: 1, chanfro }]], {}, {});
      expect(orfaos).toHaveLength(1);
      expect(orfaos[0]).toMatchObject({ op: 'chamferBox' });
      expect(V.size).toBe(0);   // fail-closed: NADA se constrói, não uma malha degenerada
      expect(F.size).toBe(0);
    }
  });

  it('larg/alt/prof/chanfro citam PARAM por nome; determinismo bit-a-bit em 2 rodadas', () => {
    const { V, orfaos } = nucleo([['chamferBox', { id: 0, larg: 'w', alt: 'h', prof: 'p', chanfro: 'c' }]], { w: 3, h: 2, p: 1.5, c: 0.2 }, {});
    expect(orfaos).toHaveLength(0);
    expect(V.size).toBe(24);
    const canon = () => { const n = nucleo([['chamferBox', { id: 0, larg: 2, alt: 1.4, prof: 1.8, chanfro: 0.15 }]], {}, {});
      return JSON.stringify([[...n.V.entries()].sort((a, b) => a[0] - b[0]), [...n.F.entries()].sort((a, b) => a[0] - b[0]).map(([k, f]) => [k, (f as any).vs])]); };
    expect(canon()).toBe(canon());
  });

  it('guarda de id da posição (o mesmo confereId de toda primitiva) e órfão não corrompe passo seguinte', () => {
    const n = nucleo([['plano', { id: 0 }], ['chamferBox', { id: 999 }]], {}, {});   // id escrito ≠ base da posição (1000)
    expect(n.orfaos.some((o: any) => o.op === 'chamferBox' && o.motivo.includes('posição'))).toBe(true);
    expect(n.V.size).toBe(4 + 24);   // plano seg=1 default -> (1+1)²=4 + chamferBox: segue construindo normal, só o AVISO de id
  });
});

/* P8c do playground — `displace` (desloca uma seleção ao longo da normal média por
   ruído seedado). O ruído (`hash3`/`ruido3`, no núcleo) é reimplementado AQUI —
   igual ao `newell` de todo describe acima — porque não é exportado; os testes
   provam determinismo/semente por MEDIÇÃO (recomputando o valor esperado com a
   MESMA fórmula, não só comparando contra si mesmo). */
describe('P8c — displace (deslocamento por ruído seedado ao longo da normal)', () => {
  const hash3 = (x: number, y: number, z: number, seed: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 269.5) * 43758.5453123; return s - Math.floor(s); };
  const ruido3 = (x: number, y: number, z: number, seed: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const c000 = hash3(xi, yi, zi, seed), c100 = hash3(xi + 1, yi, zi, seed);
    const c010 = hash3(xi, yi + 1, zi, seed), c110 = hash3(xi + 1, yi + 1, zi, seed);
    const c001 = hash3(xi, yi, zi + 1, seed), c101 = hash3(xi + 1, yi, zi + 1, seed);
    const c011 = hash3(xi, yi + 1, zi + 1, seed), c111 = hash3(xi + 1, yi + 1, zi + 1, seed);
    const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };
  const manifoldRuim = (F: any) => {
    const m = new Map<string, number>();
    for (const f of F.values()) for (let k = 0; k < (f as any).vs.length; k++) { const a = (f as any).vs[k], b = (f as any).vs[(k + 1) % (f as any).vs.length]; m.set(`${a},${b}`, (m.get(`${a},${b}`) ?? 0) + 1); }
    let ruim = 0; for (const [k, c] of m) { const [a, b] = k.split(','); if (c !== 1 || (m.get(`${b},${a}`) ?? 0) !== 1) ruim++; } return ruim;
  };

  it('desloca CADA vértice ao longo da normal média — magnitude bate a fórmula EXATA recomputada (cubo: normal por vértice é a média de 3 faces axis-aligned)', () => {
    const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }], ['displace', { amplitude: 0.2, frequencia: 1.5, semente: 7 }]], {}, {});
    expect(orfaos).toHaveLength(0);
    // vértice 0 do cubo lado=1: [-0.5,0,-0.5], tocado pelas faces fundo(-y), -z, -x -> normal média = norm3(-1,-1,-1) = cada eixo -1/√3
    const nrm = 1 / Math.sqrt(3);
    const p0 = [-0.5, 0, -0.5];
    const r = ruido3(p0[0] * 1.5, p0[1] * 1.5, p0[2] * 1.5, 7);
    const d = (r * 2 - 1) * 0.2;
    expect(V.get(0)![0]).toBeCloseTo(p0[0] + -nrm * d, 9);
    expect(V.get(0)![1]).toBeCloseTo(p0[1] + -nrm * d, 9);
    expect(V.get(0)![2]).toBeCloseTo(p0[2] + -nrm * d, 9);
  });

  it('amplitude=0 é no-op determinístico (posição intacta)', () => {
    const antes = nucleo([['cubo', { id: 0, lado: 1 }]], {}, {});
    const depois = nucleo([['cubo', { id: 0, lado: 1 }], ['displace', { amplitude: 0, semente: 42 }]], {}, {});
    for (const id of antes.V.keys()) expect(depois.V.get(id)).toEqual(antes.V.get(id));
  });

  it('determinismo: mesma semente -> 2 rodadas idênticas bit-a-bit; semente diferente diverge em pelo menos um vértice', () => {
    const passos = (semente: number) => [['cubo', { id: 0, lado: 1 }], ['displace', { amplitude: 0.3, semente }]];
    const canon = (semente: number) => { const n = nucleo(passos(semente) as any, {}, {}); return JSON.stringify([...n.V.entries()].sort((a, b) => a[0] - b[0])); };
    expect(canon(5)).toBe(canon(5));
    expect(canon(5)).not.toBe(canon(6));
  });

  it('seleção parcial (sel.regiao) só desloca os vértices ATINGIDOS — o resto fica intacto', () => {
    // topo do cubo (y=1 exato, ly não /2) via regiao — o mesmo teste do resolverAlvosV do P8
    const { V, orfaos } = nucleo([['cubo', { id: 0, lado: 1 }],
      ['displace', { amplitude: 0.4, semente: 1, sel: { regiao: { min: [-2, 0.9, -2], max: [2, 1.1, 2] } } }],
    ], {}, {});
    expect(orfaos).toHaveLength(0);
    expect(V.get(0)).toEqual([-0.5, 0, -0.5]);   // base fora da região, intacta
    expect(V.get(4)).not.toEqual([-0.5, 1, -0.5]);   // topo deslocado
  });

  it('vértice sem NENHUMA face (apagaFace deixou solto) GRITA e fica parado — nunca desloca às cegas', () => {
    const passos: any[] = [['cubo', { id: 0, lado: 1 }]];
    for (let f = 0; f < 6; f++) passos.push(['apagaFace', { face: f }]);   // apaga as 6 faces -> todo vértice fica sem face
    passos.push(['displace', { amplitude: 0.5, semente: 1 }]);
    const { V, orfaos } = nucleo(passos, {}, {});
    expect(orfaos.filter((o: any) => o.op === 'displace')).toHaveLength(8);   // os 8 vértices, um órfão cada
    expect(V.get(0)).toEqual([-0.5, 0, -0.5]);   // nenhum moveu
  });

  it('composição: displace em cima de inflate/loft/rotaciona/espelha — sem NaN nem órfão indevido; manifold PRESERVADO (só move posição, nunca muda topologia)', () => {
    const QUAD = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const passos of [
      [['cubo', { id: 0, lado: 1 }], ['rotaciona', { eixo: 'y', graus: 25 }], ['displace', { amplitude: 0.1, semente: 3 }]],
      [['inflate', { id: 0, contornoLado: QUAD, contornoTopo: QUAD, divisoes: 3 }], ['displace', { amplitude: 0.05, frequencia: 2, semente: 9 }]],
      [['cubo', { id: 0, lado: 1 }], ['espelha', { eixo: 'x', pos: 0 }], ['displace', { amplitude: 0.1, semente: 2 }]],
    ] as const) {
      const { V, F, orfaos } = nucleo(passos as any, {}, {});
      expect(orfaos).toHaveLength(0);
      expect(manifoldRuim(F)).toBe(0);
      expect([...V.values()].every((p: any) => p.every((c: number) => Number.isFinite(c)))).toBe(true);
    }
  });

  it('peça-exemplo _pedra (chamferBox + displace): sem órfãos, V/F exatos (24/26 — displace não cria/apaga), MANIFOLD intacto por cima do relevo, colisão calculada', async () => {
    const pUrl = new URL('../../prototipos/fps/v3/pecas/_pedra.js', import.meta.url);
    const peca: any = await import(fileURLToPath(pUrl));
    const n = nucleo(peca.PASSOS, peca.PARAMS, peca.TOPO);
    expect(n.orfaos).toHaveLength(0);
    expect(n.V.size).toBe(24);
    expect(n.F.size).toBe(26);
    expect(manifoldRuim(n.F)).toBe(0);
    expect([...n.V.values()].every((p: any) => p.every((c: number) => Number.isFinite(c)))).toBe(true);
    expect(peca.meta.colisao.forma).toBe('cilindro');
    expect(peca.meta.colisao.raio).toBeGreaterThan(0);
  });
});

/* D-128 — `transladar` (soma um deslocamento a uma seleção). O IRMÃO do
   `rotaciona`: mesma semântica de `sel`, e igualmente SIMPLES (NUNCA cria id).
   Nasceu do experimento do TETO (docs/TETO.md): o vocabulário girava a malha
   inteira mas não transladava nada maior que UMA face, e as 7 primitivas presas
   à origem ficavam inutilizáveis em composição.

   Prova por MEDIÇÃO: posições EXATAS (o delta somado, não "mudou"), seleção
   ausente = malha inteira, seleção por v/f/regiao/grupo, fora da seleção
   INTOCADO, NUNCA cria vértice/face, `d` por NOME de PARAM, aditividade
   (transladar 2× == transladar pela soma), órfão grita sem corromper, e o caso
   que MOTIVOU a op: posicionar uma primitiva inteira num passo só, com manifold
   preservado (transladar não pode rasgar malha — é rígido). */
describe('D-128 — transladar (posiciona uma seleção; o que faltava pra compor com primitiva)', () => {
  // manifold local: a convenção deste arquivo é redefinir por bloco (o do P6/P8 vive
  // no escopo DELES, não no do módulo — um `describe` novo não o alcança)
  const manifoldRuim = (F: any) => {
    const m = new Map<string, number>();
    for (const f of F.values()) for (let k = 0; k < (f as any).vs.length; k++) { const a = (f as any).vs[k], b = (f as any).vs[(k + 1) % (f as any).vs.length]; m.set(`${a},${b}`, (m.get(`${a},${b}`) ?? 0) + 1); }
    let ruim = 0;
    for (const [k, c] of m) { const [a, b] = k.split(','); if (c !== 1 || (m.get(`${b},${a}`) ?? 0) !== 1) ruim++; }
    return ruim;
  };

  it('soma o delta EXATO em cada vértice da malha (sel AUSENTE = malha inteira)', () => {
    const base = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
    const d: [number, number, number] = [1.5, -0.25, 3];
    const mov = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d }]], {}, {});
    expect(mov.V.size).toBe(base.V.size);
    for (const [id, p] of base.V) {
      const q = mov.V.get(id)!;
      // valor esperado DERIVADO da base (não hardcoded à mão — a lição D-116)
      expect(q[0]).toBeCloseTo(p[0] + d[0], 12);
      expect(q[1]).toBeCloseTo(p[1] + d[1], 12);
      expect(q[2]).toBeCloseTo(p[2] + d[2], 12);
    }
  });

  it('seleção por v e por f: só os alvos movem, o resto fica INTOCADO (bit-a-bit)', () => {
    const base = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
    const porV = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d: [0, 5, 0], sel: { v: [1] } }]], {}, {});
    expect(porV.V.get(1)![1]).toBeCloseTo(base.V.get(1)![1] + 5, 12);
    for (const id of [...base.V.keys()].filter((k) => k !== 1)) expect(porV.V.get(id)).toEqual(base.V.get(id));   // intocados EXATOS

    // face 3 (+x do cubo, cantos [2,1,5,6]) move os 4 cantos DELA
    const porF = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d: [0, 0, 7], sel: { f: [3] } }]], {}, {});
    const cantos = new Set(base.F.get(3)!.vs);
    for (const id of base.V.keys()) {
      const esperado = cantos.has(id) ? base.V.get(id)![2] + 7 : base.V.get(id)![2];
      expect(porF.V.get(id)![2]).toBeCloseTo(esperado, 12);
    }
  });

  it('seleção por REGIÃO e por GRUPO (a mesma lei do resolverAlvosV que o rotaciona usa)', () => {
    // região: só o topo do cubo (y >= 0.5) — o conjunto é DERIVADO da base, não assumido
    const base = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
    const noTopo = [...base.V.entries()].filter(([, p]) => p[1] >= 0.5).map(([id]) => id);
    expect(noTopo.length).toBeGreaterThan(0);   // a fixture tem que ter alvo, senão o teste não prova nada
    const reg = nucleo([['cubo', { id: 0, lado: 2 }],
      ['transladar', { d: [0, 2, 0], sel: { regiao: { min: [-9, 0.5, -9], max: [9, 9, 9] } } }]], {}, {});
    for (const id of base.V.keys()) {
      const esperado = noTopo.includes(id) ? base.V.get(id)![1] + 2 : base.V.get(id)![1];
      expect(reg.V.get(id)![1]).toBeCloseTo(esperado, 12);
    }

    // grupo: nomeia uma parte e translada por nome
    const grp = nucleo([['cubo', { id: 0, lado: 2 }], ['parte', { nome: 'tampa', faces: [4] }],
      ['transladar', { d: [0, 0, -3], sel: { grupo: 'tampa' } }]], {}, {});
    const cantosTampa = new Set(base.F.get(4)!.vs);
    for (const id of base.V.keys()) {
      const esperado = cantosTampa.has(id) ? base.V.get(id)![2] - 3 : base.V.get(id)![2];
      expect(grp.V.get(id)![2]).toBeCloseTo(esperado, 12);
    }
  });

  it('NUNCA cria vértice/face — mesmos ids e mesmas contagens antes/depois', () => {
    const antes = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
    const depois = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d: [3, 3, 3] }]], {}, {});
    expect(depois.V.size).toBe(antes.V.size);
    expect(depois.F.size).toBe(antes.F.size);
    expect([...depois.V.keys()].sort((a, b) => a - b)).toEqual([...antes.V.keys()].sort((a, b) => a - b));
    expect([...depois.F.keys()].sort((a, b) => a - b)).toEqual([...antes.F.keys()].sort((a, b) => a - b));
  });

  it('`d` por NOME de PARAM (mexer no PARAM remodela sem tocar em passo); nome inexistente grita ALTO', () => {
    const { V } = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d: ['dx', 0, 0] }]], { dx: 4 }, {});
    const base = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
    expect(V.get(1)![0]).toBeCloseTo(base.V.get(1)![0] + 4, 12);
    expect(() => nucleo([['cubo', { id: 0, lado: 1 }], ['transladar', { d: ['fantasma', 0, 0] }]], {}, {})).toThrow(/fantasma/);
  });

  it('ADITIVO: transladar 2× == transladar 1× pela soma (acompanha a base, como o moveV)', () => {
    const duas = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d: [1, 2, 3] }], ['transladar', { d: [10, 20, 30] }]], {}, {});
    const uma = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d: [11, 22, 33] }]], {}, {});
    expect(JSON.stringify(neutroCanonico(duas))).toBe(JSON.stringify(neutroCanonico(uma)));
  });

  it('`d` ausente/zero é NO-OP silencioso (a lei do moveV/moveF/moveA) — canônico bit-a-bit', () => {
    const base = JSON.stringify(neutroCanonico(nucleo([['cubo', { id: 0, lado: 2 }]], {}, {})));
    for (const passo of [['transladar', {}], ['transladar', { d: [0, 0, 0] }]] as any[]) {
      expect(JSON.stringify(neutroCanonico(nucleo([['cubo', { id: 0, lado: 2 }], passo], {}, {})))).toBe(base);
    }
  });

  it('id/face/grupo inexistente GRITA (órfão) e é IGNORADO — malha intacta, alvo válido move normalmente', () => {
    const base = nucleo([['cubo', { id: 0, lado: 2 }]], {}, {});
    const { orfaos, V } = nucleo([['cubo', { id: 0, lado: 2 }], ['transladar', { d: [0, 1, 0], sel: { v: [1, 999] } }]], {}, {});
    expect(orfaos).toHaveLength(1);
    expect(orfaos[0]).toMatchObject({ passo: 1, op: 'transladar', ref: 999 });
    expect(V.size).toBe(8);                                              // malha intacta
    expect(V.get(1)![1]).toBeCloseTo(base.V.get(1)![1] + 1, 12);         // o id válido moveu

    const f = nucleo([['cubo', { id: 0, lado: 1 }], ['transladar', { d: [1, 0, 0], sel: { f: [999] } }]], {}, {});
    expect(f.orfaos.some((o: any) => o.op === 'transladar' && o.ref === 999)).toBe(true);
    expect(f.V.size).toBe(8);

    const g = nucleo([['cubo', { id: 0, lado: 1 }], ['transladar', { d: [1, 0, 0], sel: { grupo: 'nao-existe' } }]], {}, {});
    expect(g.orfaos.some((o: any) => o.op === 'transladar')).toBe(true);
    // GEOMETRIA intacta (V/F apenas — o canônico COMPLETO difere de propósito: o órfão ENTRA nele, é o registro do grito)
    const soGeo = (n: any) => { const c: any = neutroCanonico(n); return JSON.stringify({ V: c.V, F: c.F }); };
    expect(soGeo(g)).toBe(soGeo(nucleo([['cubo', { id: 0, lado: 1 }]], {}, {})));   // seleção vazia = no-op geométrico
  });

  it('★ O CASO QUE MOTIVOU A OP: duas primitivas iguais em posições DIFERENTES, um passo de transladar cada — manifold preservado nas duas', () => {
    // era isto que custava 32 moveV por peça e fez a moto do TETO virar 100% loft
    const n = nucleo([
      ['cilindro', { id: 0, raio: 0.4, altura: 0.2, lados: 12 }],
      ['transladar', { d: [0, 0, -1] }],                              // sel ausente = a malha TODA (só o cilindro existe)
      ['cilindro', { id: 2000, raio: 0.4, altura: 0.2, lados: 12 }],   // `id` = a BASE do bloco da posição (posição 2 × BLOCO 1000), não um contador próprio
      ['transladar', { d: [0, 0, 1], sel: { regiao: { min: [-9, -9, -0.5], max: [9, 9, 0.5] } } }],   // só a 2ª (a 1ª já saiu da caixa)
    ], {}, {});
    expect(n.orfaos).toHaveLength(0);
    expect(manifoldRuim(n.F)).toBe(0);                                // rígido: não rasga malha
    const zs = [...n.V.values()].map((p: any) => p[2]);
    expect(Math.min(...zs)).toBeLessThan(-0.5);                       // uma roda atrás
    expect(Math.max(...zs)).toBeGreaterThan(0.5);                     // outra na frente
    expect([...n.V.values()].every((p: any) => p.every((c: number) => Number.isFinite(c)))).toBe(true);
  });

  it('determinismo + round-trip: mesma lista 2× dá canônico idêntico, e o JSON da lista sobrevive', () => {
    const passos: any[] = [['cubo', { id: 0, lado: 1 }], ['transladar', { d: [0.3, -0.7, 1.1], sel: { f: [0, 1] } }]];
    const a = JSON.stringify(neutroCanonico(nucleo(passos, {}, {})));
    const b = JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(passos)), {}, {})));
    expect(a).toBe(b);
  });
});
