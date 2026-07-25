/* Vitest do NÚCLEO PURO da bancada de gabarito (P5 do playground, D-118):
   máscara por diferença de fundo (+ o corte do HUD), filtro de componente
   pequeno (o piso de ruído do render — partículas/grama ao vento), rasterização
   do contorno de referência (scanline par-ímpar) e IoU. Tudo síncrono, sem
   Playwright/browser — os números batem com o scratchpad usado pra calibrar
   LIMIAR_IOU antes deste arquivo existir (ver o comentário da constante). */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — módulo .mjs sem tipos (roda puro no vitest/esbuild)
import {
  mascaraPorDiferenca, filtrarComponentesPequenos, extrairSilhueta,
  rasterizarContorno, iou, areaMascara, validarContorno, LIMIAR_IOU,
} from './gabarito-nucleo.mjs';

function imagemPlana(W: number, H: number, [r, g, b]: number[]) {
  const pixels = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { pixels[i * 3] = r; pixels[i * 3 + 1] = g; pixels[i * 3 + 2] = b; }
  return { W, H, ch: 3, pixels };
}
function pintarRetangulo(img: any, x0: number, y0: number, x1: number, y1: number, [r, g, b]: number[]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * img.W + x) * 3; img.pixels[o] = r; img.pixels[o + 1] = g; img.pixels[o + 2] = b; }
  return img;
}

describe('mascaraPorDiferenca', () => {
  it('marca só os pixels que diferem além do limiar — imagens idênticas dão máscara vazia', () => {
    const fundo = imagemPlana(20, 20, [30, 120, 200]);
    const obj = imagemPlana(20, 20, [30, 120, 200]);
    const m = mascaraPorDiferenca(fundo, obj, 40, 0);
    expect([...m.m].every((v) => v === 0)).toBe(true);
  });

  it('um bloco pintado diferente vira máscara EXATA daquele bloco (sem corte de topo)', () => {
    const fundo = imagemPlana(20, 20, [0, 0, 0]);
    const obj = pintarRetangulo(imagemPlana(20, 20, [0, 0, 0]), 5, 5, 10, 12, [255, 255, 255]);
    const m = mascaraPorDiferenca(fundo, obj, 40, 0);
    let n = 0; for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (m.m[y * 20 + x]) { n++; expect(x >= 5 && x < 10 && y >= 5 && y < 12).toBe(true); }
    expect(n).toBe(5 * 7);
  });

  it('diferença ABAIXO do limiar não conta (ruído de dither/sombra não é objeto)', () => {
    const fundo = imagemPlana(10, 10, [100, 100, 100]);
    const obj = pintarRetangulo(imagemPlana(10, 10, [100, 100, 100]), 2, 2, 5, 5, [120, 120, 120]);   // diff=20
    const m = mascaraPorDiferenca(fundo, obj, 40, 0);
    expect([...m.m].every((v) => v === 0)).toBe(true);
  });

  it('ignorarTopo zera a faixa do HUD (o texto do #hud vaza no diff — achado do P5)', () => {
    const fundo = imagemPlana(20, 20, [0, 0, 0]);
    const obj = pintarRetangulo(imagemPlana(20, 20, [0, 0, 0]), 0, 0, 20, 8, [255, 255, 255]);   // "texto" nas linhas 0..7
    const m = mascaraPorDiferenca(fundo, obj, 40, 8);
    expect(areaMascara(m)).toBe(0);
  });
});

describe('filtrarComponentesPequenos', () => {
  it('descarta componente conexo abaixo do mínimo (partícula isolada) e mantém o grande (o objeto)', () => {
    const W = 30, H = 30, m = new Uint8Array(W * H);
    // "objeto": bloco 10x10 = 100px
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * W + x] = 1;
    // "partícula": 2 pixels isolados no canto
    m[0 * W + 0] = 1; m[0 * W + 1] = 1;
    const out = filtrarComponentesPequenos({ W, H, m }, 60);
    expect(areaMascara(out)).toBe(100);
    expect(out.m[0]).toBe(0);
  });

  it('dois componentes grandes (silhueta com buraco/dois lóbulos) sobrevivem os DOIS — não é só "o maior"', () => {
    const W = 30, H = 10, m = new Uint8Array(W * H);
    for (let x = 0; x < 8; x++) m[5 * W + x] = 1;        // lóbulo A: 8px numa linha
    for (let x = 20; x < 28; x++) m[5 * W + x] = 1;       // lóbulo B: 8px, DESCONECTADO do A
    const out = filtrarComponentesPequenos({ W, H, m }, 5);
    expect(areaMascara(out)).toBe(16);
  });
});

describe('extrairSilhueta (diferença + filtro, combinados)', () => {
  it('duas imagens IDÊNTICAS (o A/B de fundo vazio) dão silhueta de área ZERO — nunca "objeto fantasma"', () => {
    const fundo = imagemPlana(50, 50, [80, 160, 90]);
    const quaseIgual = pintarRetangulo(imagemPlana(50, 50, [80, 160, 90]), 3, 3, 5, 5, [95, 170, 95]);   // diff pequeno, tipo ruído de grama
    const sil = extrairSilhueta(fundo, quaseIgual);
    expect(areaMascara(sil)).toBe(0);
  });

  it('um objeto de verdade (bloco grande, contraste alto) sobrevive ao filtro inteiro', () => {
    const fundo = imagemPlana(50, 50, [0, 0, 200]);
    const obj = pintarRetangulo(imagemPlana(50, 50, [0, 0, 200]), 10, 10, 30, 30, [200, 0, 0]);
    // ignorarTopo:0 — a imagem sintética é MENOR que o corte de HUD padrão (90px, ver IGNORAR_TOPO); o
    // corte em si já tem teste próprio acima ("ignorarTopo zera a faixa do HUD").
    const sil = extrairSilhueta(fundo, obj, { ignorarTopo: 0 });
    expect(areaMascara(sil)).toBe(20 * 20);
  });
});

describe('rasterizarContorno', () => {
  it('retângulo alinhado aos eixos dá a área EXATA (contagem de pixel, não aproximação)', () => {
    const m = rasterizarContorno([[0, 0], [0.5, 0], [0.5, 1], [0, 1]], 100, 100);
    expect(areaMascara(m)).toBe(5000);
  });

  it('triângulo reto (metade de um quadrado) dá ~metade da área do quadrado equivalente', () => {
    const quad = rasterizarContorno([[0, 0], [1, 0], [1, 1], [0, 1]], 100, 100);
    const tri = rasterizarContorno([[0, 0], [1, 0], [1, 1]], 100, 100);
    expect(areaMascara(tri)).toBeGreaterThan(areaMascara(quad) * 0.47);
    expect(areaMascara(tri)).toBeLessThan(areaMascara(quad) * 0.53);
  });

  it('fecha o polígono IMPLICITAMENTE (não precisa repetir o primeiro ponto)', () => {
    const a = rasterizarContorno([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]], 50, 50);
    const b = rasterizarContorno([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]], 50, 50);
    expect(areaMascara(a)).toBe(areaMascara(b));
  });
});

describe('iou', () => {
  it('máscara consigo mesma = 1.0 exato', () => {
    const m = rasterizarContorno([[0.1, 0.1], [0.6, 0.1], [0.6, 0.6], [0.1, 0.6]], 100, 100);
    expect(iou(m, m)).toBe(1);
  });

  it('sem sobreposição nenhuma = 0', () => {
    const a = rasterizarContorno([[0, 0], [0.2, 0], [0.2, 0.2], [0, 0.2]], 100, 100);
    const b = rasterizarContorno([[0.8, 0.8], [1, 0.8], [1, 1], [0.8, 1]], 100, 100);
    expect(iou(a, b)).toBe(0);
  });

  it('sobreposição parcial bate com a conta À MÃO (dois quadrados 0,5 deslocados 0,25 -> IoU = 1/3)', () => {
    const a = rasterizarContorno([[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], 100, 100);
    const b = rasterizarContorno([[0.25, 0], [0.75, 0], [0.75, 0.5], [0.25, 0.5]], 100, 100);
    expect(iou(a, b)).toBeCloseTo(1 / 3, 2);
  });

  it('máscaras de tamanhos diferentes GRITA (throw) — nunca compara em silêncio', () => {
    const a = { W: 10, H: 10, m: new Uint8Array(100) };
    const b = { W: 20, H: 20, m: new Uint8Array(400) };
    expect(() => iou(a, b)).toThrow(/tamanhos diferentes/);
  });
});

describe('validarContorno (a lei fail-closed do P5 — mesma classe do lathe/loft, D-115)', () => {
  it('contorno válido (≥3 pontos [x,y]) passa e devolve os pontos', () => {
    const c = validarContorno([[0, 0], [1, 0], [1, 1]]);
    expect(c).toEqual([[0, 0], [1, 0], [1, 1]]);
  });

  it('menos de 3 pontos lança', () => {
    expect(() => validarContorno([[0, 0], [1, 1]])).toThrow(/ao menos 3 pontos/);
  });

  it('ponto com aridade ≠ 2 lança — a alça de curva (3º elemento) é RESERVADA', () => {
    expect(() => validarContorno([[0, 0], [1, 0, 99], [1, 1]])).toThrow(/2 elementos/);
    expect(() => validarContorno([[0, 0], [1], [1, 1]])).toThrow(/2 elementos/);
  });

  it('coordenada não-finita lança', () => {
    expect(() => validarContorno([[0, 0], [NaN, 0], [1, 1]])).toThrow(/não-finita/);
    expect(() => validarContorno([[0, 0], [Infinity, 0], [1, 1]])).toThrow(/não-finita/);
  });
});

it('LIMIAR_IOU fica no vale medido entre bom (≥0,65) e ruim (≤0,44) — ver o comentário da constante', () => {
  expect(LIMIAR_IOU).toBeGreaterThan(0.44);
  expect(LIMIAR_IOU).toBeLessThan(0.65);
});
