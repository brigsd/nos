/* Vitest do EXPORTADOR da ABA SOM (S5a), SEM browser: prova a camada de DADOS da
   serialização — que a STRING .js de um evento-som REABRE o MESMO grafo (somCanonico
   bit-a-bit) porque os números saem via String(double), NÃO toFixed (arredondar QUEBRA o
   round-trip — a lição do passo 10 / D-89), e que a anatomia da string bate com as peças de
   pecas-som/ (cabeçalho + 2 imports + PARAMS/semente/PASSOS + meta.duracao como CHAMADA +
   construir). O round-trip pela UI real (gesto + servidor gravando + re-import do módulo
   inteiro) é a bancada `somexportar.mjs` (precisa de browser); aqui é o núcleo, puro. */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — módulo .js do motor v3 (sem tipos; roda puro no vitest/esbuild)
import { serializarEvento, jsNum, jsVal, jsPasso } from '../../prototipos/fps/v3/motor/somexport.js';
// @ts-expect-error — idem
import { somNucleo, somCanonico } from '../../prototipos/fps/v3/motor/somnucleo.js';

/* avalia a fonte JS de um VALOR (dado puro: número/string/array/objeto) de volta pro valor —
   o "re-import" da camada de dados, sem tocar disco nem os imports do módulo gerado. */
const evalVal = (s: string) => new Function('return (' + s + ')')();
const carregar = (nome: string) => import(fileURLToPath(new URL(`../../prototipos/fps/v3/pecas-som/${nome}.js`, import.meta.url)));
const PRESETS = ['_passo', '_vento', '_bolha', '_agua'];

describe('serialização round-trip (String(double), não toFixed)', () => {
  it.each(PRESETS)('%s: jsVal(PARAMS) e jsPasso(PASSOS) reabrem os MESMOS dados (somCanonico bit-a-bit)', async (nome) => {
    const p: any = await carregar(nome);
    const PARAMS = evalVal(jsVal(p.PARAMS));
    const PASSOS = p.PASSOS.map((passo: any) => evalVal(jsPasso(passo)));
    expect(PARAMS).toEqual(p.PARAMS);            // os dimensionais reabrem idênticos
    expect(PASSOS).toEqual(p.PASSOS);            // as ops reabrem na ordem, idênticas
    const orig = JSON.stringify(somCanonico(somNucleo(p.PASSOS, p.PARAMS, p.semente)));
    const rt = JSON.stringify(somCanonico(somNucleo(PASSOS, PARAMS, p.semente)));
    expect(rt).toBe(orig);                       // o grafo REABRE bit-a-bit
  });

  it('String(double) reabre EXATO um valor de alta precisão; toFixed(3) DIVERGE (o mecanismo certo)', () => {
    const passo = ['oscilador', { id: 'o', tipo: 'seno', freq: 440.123456789 }];
    const bom = evalVal(jsPasso(passo));                                // String(x)
    const mau = evalVal(jsPasso(passo, (x: number) => x.toFixed(3)));   // x.toFixed(3) — NEUTRALIZADO
    expect(bom[1].freq).toBe(440.123456789);                           // reabre exato
    expect(mau[1].freq).not.toBe(440.123456789);                       // arredondou → diverge
    expect(mau[1].freq).toBe(440.123);
  });

  it('jsNum é round-trip-safe pra doubles (não arredonda) e não vaza NaN/Infinity', () => {
    for (const x of [0, 0.006, 0.07, 1900.567, 440.123456789, 1e-4, 44100, 0.1 + 0.2]) {
      expect(evalVal(jsNum(x))).toBe(x);
    }
    expect(jsNum(NaN)).toBe('0');
    expect(jsNum(Infinity)).toBe('0');
  });
});

describe('anatomia da string exportada (o formato de pecas-som/)', () => {
  it.each(PRESETS)('%s: cabeçalho + 2 imports + PARAMS/semente/PASSOS + meta.duracao CHAMADA + construir', async (nome) => {
    const p: any = await carregar(nome);
    const str: string = serializarEvento({ meta: p.meta, PARAMS: p.PARAMS, PASSOS: p.PASSOS, semente: p.semente });
    expect(str.startsWith('/*')).toBe(true);                                                       // cabeçalho gerado (mapa:check)
    expect(str).toContain("import { somNucleo, duracaoDoGrafo } from '../motor/somnucleo.js';");
    expect(str).toContain("import { construirGrafo } from '../motor/somweb.js';");
    expect(str).toMatch(/export const PARAMS = /);
    expect(str).toContain(`export const semente = ${p.semente >>> 0};`);
    expect(str).toMatch(/export const PASSOS = \[/);
    const metaBloco = str.slice(str.indexOf('export const meta'));                                 // só o bloco meta (evita o PARAMS.duracao dos presets)
    expect(metaBloco).toMatch(/duracao: duracaoDoGrafo\(somNucleo\(PASSOS, PARAMS, semente\)\),/);  // a CHAMADA, recalculada no load
    expect(metaBloco).not.toMatch(/duracao:\s*[0-9]/);                                             // NUNCA o valor numérico
    expect(str).toContain("tipo: 'som',");
    expect(str).toContain('export function construir(ctx, quando = 0) { return construirGrafo(somNucleo(PASSOS, PARAMS, semente), ctx, quando); }');
  });
});
