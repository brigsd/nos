import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/* tree3d-core.js é script clássico (o jogo carrega via <script src>);
   no Node entra por vm com shim de module — mesmo truque dos QA scripts */
const ctx: any = { module: { exports: {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'tree3d-core.js'), 'utf8'), ctx);
const { growTree3D, renderTreeView3D, growTreeViews3D, T3_SPECIES, T3_PALETTE } = ctx.module.exports;

describe('tree3d-core', () => {
  it('é determinístico por seed (mesma árvore, byte a byte, em qualquer vista)', () => {
    const a = growTreeViews3D({ species: 'carvalho', seed: 42, W: 64, H: 84, views: 4 });
    const b = growTreeViews3D({ species: 'carvalho', seed: 42, W: 64, H: 84, views: 4 });
    const c = growTreeViews3D({ species: 'carvalho', seed: 43, W: 64, H: 84, views: 4 });
    for (let i = 0; i < 4; i++) {
      expect(Buffer.from(a[i].buf.buffer).equals(Buffer.from(b[i].buf.buffer))).toBe(true);
    }
    expect(Buffer.from(a[0].buf.buffer).equals(Buffer.from(c[0].buf.buffer))).toBe(false);
  });

  it('toda espécie emite só índices da paleta (ou -1) e vistas não-vazias', () => {
    for (const sp of Object.keys(T3_SPECIES)) {
      const tree = growTree3D({ species: sp, seed: 7, sizeMul: 1 });
      tree.seedTag = 7;
      for (const az of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const v = renderTreeView3D(tree, az, { W: 104, H: 136 });
        let painted = 0, bad = 0;
        for (const idx of v.buf) {
          if (idx < -1 || idx >= T3_PALETTE.length) bad++;
          else if (idx >= 0) painted++;
        }
        expect(bad, `${sp} @${az.toFixed(2)}: índice fora da paleta`).toBe(0);
        expect(painted, `${sp} @${az.toFixed(2)}`).toBeGreaterThan(400);
      }
    }
  });

  it('vistas opostas diferem (a árvore é 3D de verdade, não um sprite girado)', () => {
    const tree = growTree3D({ species: 'anciao', seed: 99, sizeMul: 1 });
    tree.seedTag = 99;
    const v0 = renderTreeView3D(tree, 0, { W: 104, H: 136 });
    const v4 = renderTreeView3D(tree, Math.PI, { W: 104, H: 136 });
    let diff = 0;
    for (let i = 0; i < v0.buf.length; i++) if (v0.buf[i] !== v4.buf[i]) diff++;
    expect(diff).toBeGreaterThan(v0.buf.length * 0.05);
  });

  it('o sol é fixo no mundo: o lado iluminado troca de lado da tela entre vistas opostas', () => {
    /* sol do mundo em az -2.2; olhando de -2.2-π/2 o sol fica todo à
       direita da tela, da vista oposta fica todo à esquerda -> o centroide
       do tom mais claro cruza de metade */
    const tree = growTree3D({ species: 'carvalho', seed: 4021, sizeMul: 1 });
    tree.seedTag = 4021;
    const ramp = [29, 30, 31, 32, 27];
    const hi = ramp[ramp.length - 1];
    const centroidX = (v: { buf: Int16Array }) => {
      let sx = 0, n = 0;
      for (let y = 0; y < 136; y++) for (let x = 0; x < 104; x++) {
        if (v.buf[y * 104 + x] === hi) { sx += x; n++; }
      }
      return sx / (n || 1);
    };
    const azSide = -2.2 - Math.PI / 2; // sol lateral máximo
    const cA = centroidX(renderTreeView3D(tree, azSide, { W: 104, H: 136 }));
    const cB = centroidX(renderTreeView3D(tree, azSide + Math.PI, { W: 104, H: 136 }));
    expect(Math.abs(cA - cB)).toBeGreaterThan(8);
  });
});
