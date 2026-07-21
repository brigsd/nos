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

  it('executar devolve lotes com mesh de triângulos soltos (8 floats/vértice)', () => {
    const obj = executar([['cubo', { id: 0, lado: 1 }]], {}, {}, fakeCtx);
    expect(obj.lotes).toHaveLength(1);
    // cubo: 6 faces × (4-2 tris) × 3 vértices × 8 floats = 288
    expect(obj.lotes[0].mesh.v.length).toBe(288);
    expect(obj.lotes[0].mesh.v.length % 8).toBe(0);
  });

  it('cor por face vira UV distinto (textura-amostra), não atributo de vértice', () => {
    const semTinta = adaptarV3(nucleo([['cubo', { id: 0, lado: 1 }]], {}, {}), fakeCtx);
    const comTinta = adaptarV3(nucleo([['cubo', { id: 0, lado: 1 }], ['pincel', { modo: 'face', faces: [0], cor: '#ff0000' }]], {}, {}), fakeCtx);
    const usDe = (m: any) => new Set(m.mesh.v.filter((_: number, k: number) => k % 8 === 3)); // canal U
    expect(usDe(semTinta).size).toBe(1);   // uma cor -> um texel
    expect(usDe(comTinta).size).toBe(2);   // padrão + vermelho -> dois texels
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
