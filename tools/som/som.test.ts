/* Vitest do NÚCLEO da ABA SOM (passo 1), SEM browser: prova os invariantes do
   grafo de som em dados — resolução de nome->número por PARAMS, identidade por
   `id` (órfão grita, id duplicado grita, ciclo grita — nunca corrompe), a
   convenção de SAÍDA (o único nó de áudio livre), o canônico ida-e-volta idêntico
   (base do replay), e o determinismo do rng/ruído (mesma semente = mesmas
   amostras; semente diferente = amostras diferentes). O render byte-a-byte via
   OfflineAudioContext é a bancada `sintetizar.mjs` (precisa de browser); aqui é a
   camada de DADOS, que roda puro no vitest. */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — módulo .js do motor v3 (sem tipos; roda puro no vitest/esbuild)
import { somNucleo, somCanonico, rng, sementeDe, ruidoAmostras, duracaoDoGrafo } from '../../prototipos/fps/v3/motor/somnucleo.js';

// grafo de bolha mínimo, reusado; PARAMS nomeados citados pelos passos
const BOLHA = [
  ['oscilador', { id: 'corpo', tipo: 'seno', freq: 'f0' }],
  ['alturaEnv', { id: 'sweep', de: 'corpo', freq0: 'f0', freq1: 'f1', tempo: 't' }],
  ['envelope',  { id: 'saida', de: 'corpo', ataque: 0.006, pico: 0.9, decaimento: 0.16, duracao: 0.18 }],
];
const PB = { f0: 380, f1: 1000, t: 0.1 };

describe('resolução e identidade', () => {
  it('resolve nome->número por PARAMS (os passos citam o NOME, como na geometria)', () => {
    const g = somNucleo(BOLHA, PB, 0);
    const osc = g.nos.find((n: any) => n.id === 'corpo');
    const sweep = g.nos.find((n: any) => n.id === 'sweep');
    expect(osc.params.freq).toBe(380);
    expect(sweep.params.freq0).toBe(380);
    expect(sweep.params.freq1).toBe(1000);
    expect(g.orfaos).toHaveLength(0);
  });

  it('a saída é o único nó de ÁUDIO livre (o envelope; oscilador é consumido, alturaEnv é modulador)', () => {
    const g = somNucleo(BOLHA, PB, 0);
    expect(g.saida).toBe('saida');
  });

  it('PARAM inexistente é ERRO DURO (evento mal-formado), não órfão', () => {
    expect(() => somNucleo([['oscilador', { id: 'o', freq: 'naoexiste' }]], {}, 0)).toThrow();
  });
});

describe('órfão grita, nunca corrompe', () => {
  it('`de` apontando pra id inexistente grita e o resto do grafo fica intacto', () => {
    const g = somNucleo([
      ['oscilador', { id: 'o', freq: 440 }],
      ['envelope',  { id: 'e', de: 'o', duracao: 0.2 }],   // caminho bom
      ['filtro',    { id: 'f', de: 'fantasma', freq: 800 }], // órfão
    ], {}, 0);
    expect(g.orfaos.some((o: any) => o.motivo.includes('inexistente'))).toBe(true);
    expect(g.saida).toBe('e');                 // o caminho bom ainda tem saída
    expect(g.nos.find((n: any) => n.id === 'f').de).toEqual([]); // o filtro ficou sem entrada
  });

  it('id duplicado grita e o segundo é ignorado', () => {
    const g = somNucleo([
      ['oscilador', { id: 'o', freq: 440 }],
      ['oscilador', { id: 'o', freq: 880 }],   // dup
      ['envelope',  { id: 'e', de: 'o', duracao: 0.2 }],
    ], {}, 0);
    expect(g.orfaos.some((o: any) => o.motivo.includes('duplicado'))).toBe(true);
    expect(g.nos.filter((n: any) => n.id === 'o')).toHaveLength(1);
    expect(g.nos.find((n: any) => n.id === 'o').params.freq).toBe(440);  // o PRIMEIRO venceu
  });

  it('ciclo no grafo grita e derruba a aresta de volta (o resto renderiza)', () => {
    const g = somNucleo([
      ['ganho', { id: 'a', de: 'b', valor: 1 }],
      ['ganho', { id: 'b', de: 'a', valor: 1 }],
    ], {}, 0);
    expect(g.orfaos.some((o: any) => o.motivo.includes('ciclo'))).toBe(true);
    // a aresta de volta caiu: um dos ganhos perdeu a entrada, sem laço infinito
    const totalDe = g.nos.reduce((s: number, n: any) => s + n.de.length, 0);
    expect(totalDe).toBeLessThan(2);
  });

  it('enum inválido cai no padrão e grita (não corrompe)', () => {
    const g = somNucleo([['oscilador', { id: 'o', tipo: 'trianguloX', freq: 440 }], ['envelope', { id: 'e', de: 'o', duracao: 0.1 }]], {}, 0);
    expect(g.nos.find((n: any) => n.id === 'o').params.tipo).toBe('seno');  // padrão
    expect(g.orfaos.some((o: any) => o.motivo.includes('desconhecido'))).toBe(true);
  });

  it('modulador (lfo) como `de` de áudio grita — lfo não tem saída de áudio', () => {
    const g = somNucleo([
      ['oscilador', { id: 'o', freq: 440 }],
      ['lfo', { id: 'l', freq: 6, profundidade: 100, alvo: { no: 'o', param: 'freq' } }],
      ['ganho', { id: 'g', de: 'l', valor: 1 }],  // erro: ganho consumindo o lfo
    ], {}, 0);
    expect(g.orfaos.some((o: any) => o.motivo.includes('modulador'))).toBe(true);
  });
});

describe('canônico: a base do replay', () => {
  it('somCanonico do mesmo evento é IDÊNTICO ida-e-volta (JSON)', () => {
    const a = somCanonico(somNucleo(BOLHA, PB, 0));
    const b = somCanonico(somNucleo(JSON.parse(JSON.stringify(BOLHA)), { ...PB }, 0));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('mudar um PARAM muda o canônico (de fato reconstruiu), mas ids/estrutura ficam', () => {
    const a = somNucleo(BOLHA, PB, 0);
    const b = somNucleo(BOLHA, { ...PB, f1: 1500 }, 0);
    expect(JSON.stringify(somCanonico(a))).not.toBe(JSON.stringify(somCanonico(b)));
    expect(a.nos.map((n: any) => n.id)).toEqual(b.nos.map((n: any) => n.id));   // mesma identidade
    expect(a.saida).toBe(b.saida);
  });

  it('lfo e soma resolvem alvo/arestas e sobrevivem ao canônico', () => {
    const g = somNucleo([
      ['oscilador', { id: 'a', freq: 440 }],
      ['oscilador', { id: 'b', freq: 660 }],
      ['soma', { id: 'mix', de: ['a', 'b'] }],
      ['ganho', { id: 'vol', de: 'mix', valor: 0.8 }],
      ['lfo', { id: 'trem', freq: 8, profundidade: 0.5, alvo: { no: 'vol', param: 'ganho' } }],
    ], {}, 0);
    expect(g.orfaos).toHaveLength(0);
    expect(g.saida).toBe('vol');
    expect(g.nos.find((n: any) => n.id === 'trem').alvo).toEqual({ no: 'vol', param: 'ganho' });
    expect(g.nos.find((n: any) => n.id === 'mix').de.sort()).toEqual(['a', 'b']);
    // ida-e-volta idêntico
    expect(JSON.stringify(somCanonico(g))).toBe(JSON.stringify(somCanonico(somNucleo([
      ['oscilador', { id: 'a', freq: 440 }],
      ['oscilador', { id: 'b', freq: 660 }],
      ['soma', { id: 'mix', de: ['a', 'b'] }],
      ['ganho', { id: 'vol', de: 'mix', valor: 0.8 }],
      ['lfo', { id: 'trem', freq: 8, profundidade: 0.5, alvo: { no: 'vol', param: 'ganho' } }],
    ], {}, 0))));
  });
});

describe('determinismo do rng e do ruído', () => {
  it('rng(semente) é determinístico e a semente discrimina', () => {
    const seqA = Array.from({ length: 5 }, rng(7));
    const seqB = Array.from({ length: 5 }, rng(7));
    const seqC = Array.from({ length: 5 }, rng(8));
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('sementeDe separa nós (dois ruidos no mesmo evento não soam idênticos)', () => {
    expect(sementeDe(0, 'a')).not.toBe(sementeDe(0, 'b'));
    expect(sementeDe(0, 'a')).toBe(sementeDe(0, 'a'));
  });

  it('ruidoAmostras: mesma semente = mesmas amostras; semente diferente = diferentes', () => {
    const a = ruidoAmostras(2048, 'rosa', 0.05, rng(sementeDe(7, 'n')));
    const b = ruidoAmostras(2048, 'rosa', 0.05, rng(sementeDe(7, 'n')));
    const c = ruidoAmostras(2048, 'rosa', 0.05, rng(sementeDe(8, 'n')));
    let maxAB = 0, maxAC = 0;
    for (let i = 0; i < a.length; i++) { maxAB = Math.max(maxAB, Math.abs(a[i] - b[i])); maxAC = Math.max(maxAC, Math.abs(a[i] - c[i])); }
    expect(maxAB).toBe(0);        // byte-a-byte igual
    expect(maxAC).toBeGreaterThan(0);
    // não-silencioso e nível na casa do alvo (RMS ~0.183)
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    expect(Math.sqrt(s / a.length)).toBeGreaterThan(0.05);
  });
});

describe('a peça-som _bolha', () => {
  it('carrega, canoniza estável e declara duração coerente', async () => {
    const bolha: any = await import(fileURLToPath(new URL('../../prototipos/fps/v3/pecas-som/_bolha.js', import.meta.url)));
    expect(Array.isArray(bolha.PASSOS)).toBe(true);
    const g = somNucleo(bolha.PASSOS, bolha.PARAMS, bolha.semente);
    expect(g.orfaos).toHaveLength(0);
    expect(g.saida).toBe('saida');
    expect(JSON.stringify(somCanonico(g))).toBe(JSON.stringify(somCanonico(somNucleo(bolha.PASSOS, bolha.PARAMS, bolha.semente))));
    expect(bolha.meta.duracao).toBeCloseTo(duracaoDoGrafo(g), 6);
    expect(bolha.meta.duracao).toBeGreaterThan(0.1);
  });
});
