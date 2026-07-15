import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { hashString, tileableFbm } = require('./lib/noise.cjs');
const { generatePreset, generateTexture, PRESETS } = require('./lib/texgen.cjs');
const { audit, checkSeams, checkOrphans } = require('./lib/lints.cjs');
const { magnifiedView, tiledView, contactSheet, diffView } = require('./lib/views.cjs');
const { renderPreview, W, H } = require('./lib/preview3d.cjs');
const { humanoidFigure, turnaroundStrip } = require('./lib/turntable.cjs');
const { loadPalette } = require('../../assets/tools/lib/canvas.cjs');
const { loadSpriteSrc } = require('../../assets/tools/lib/spritesrc.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const palette = loadPalette(path.join(ROOT, 'assets', 'palette.json'));

describe('noise', () => {
  it('is deterministic by seed', () => {
    expect(hashString('a')).toBe(hashString('a'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(tileableFbm(1, 3.3, 4.4, 64, 64, 4, 3)).toBe(tileableFbm(1, 3.3, 4.4, 64, 64, 4, 3));
  });

  it('stays within [0,1)', () => {
    for (let i = 0; i < 500; i++) {
      const v = tileableFbm(42, i * 1.37, i * 0.61, 64, 64, 5, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('texgen', () => {
  it('same seed => byte-identical texture; different seed => different', () => {
    const a = generatePreset('ruina_pedra', { size: 32, seed: 's1' });
    const b = generatePreset('ruina_pedra', { size: 32, seed: 's1' });
    const c = generatePreset('ruina_pedra', { size: 32, seed: 's2' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('every preset emits only in-palette indices and audits clean at 64px', () => {
    for (const name of Object.keys(PRESETS)) {
      const t = generatePreset(name, { size: 64, seed: 'test' });
      expect(t.width).toBe(64);
      const findings = audit(t, palette, { tileable: true });
      expect(findings.filter((f: { level: string }) => f.level === 'error'), `${name}: ${JSON.stringify(findings)}`).toHaveLength(0);
    }
  });

  it('rejects unknown presets and prototype-pollution names safely', () => {
    expect(() => generatePreset('nao_existe')).toThrow(/desconhecido/);
    expect(() => generatePreset('__proto__')).toThrow(/desconhecido/);
    expect(() => generatePreset('constructor')).toThrow(/desconhecido/);
  });

  it('requires a ramp of at least 2 palette indices', () => {
    expect(() => generateTexture({ name: 'x', ramp: [1] })).toThrow(/ramp/);
  });
});

describe('lints', () => {
  it('flags a deliberate hard seam', () => {
    // left half dark, right half light => violent X-wrap discontinuity is
    // absent (wraps dark->dark), but a hard vertical stripe at x=0 vs x=w-1
    // IS the wrap; build a gradient that does not wrap instead
    const size = 16;
    const pixels = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => (x < 8 ? 0 : 9)),
    );
    // shift so the wrap edge x=15 -> x=0 jumps 9->0 hard while interior is soft
    const grad = Array.from({ length: size }, () =>
      Array.from({ length: size }, (_, x) => [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 8, 9, 9, 9, 9, 9][x]),
    );
    const sprite = { name: 't', kind: 'wall', width: size, height: size, frames: [{ pixels: grad }] };
    const findings = checkSeams(sprite, palette);
    expect(findings.some((f: { msg: string }) => f.msg.includes('wrap X'))).toBe(true);
    void pixels;
  });

  it('passes the shipped, art-reviewed game sprites without error-level findings', () => {
    const dir = path.join(ROOT, 'assets', 'sprites', 'src');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const sprite = loadSpriteSrc(path.join(dir, file));
      const findings = audit(sprite, palette, { tileable: false });
      expect(findings.filter((f: { level: string }) => f.level === 'error'), `${file}: ${JSON.stringify(findings)}`).toHaveLength(0);
    }
  });

  it('orphan check only judges object/billboard kinds (terrain speckle is material)', () => {
    const noisy = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x + y * 7) % 9)));
    const asTile = { name: 'n', kind: 'tile', width: 16, height: 16, frames: [{ pixels: noisy }] };
    const asObject = { ...asTile, kind: 'object' };
    expect(checkOrphans(asTile)).toHaveLength(0);
    expect(checkOrphans(asObject).length).toBeGreaterThan(0);
  });
});

describe('views and previews', () => {
  const wall = generatePreset('tijolo_rubro', { size: 32, seed: 'view-test' });

  it('magnified/tiled/diff/sheet render non-empty canvases of the expected geometry', () => {
    const mag = magnifiedView(wall, palette, 4);
    expect(mag.width).toBeGreaterThan(32 * 4);
    const tiled = tiledView(wall, palette);
    expect(tiled.width).toBe(32 * 3 * 2); // 3x3 wrap at 2x
    const after = generatePreset('tijolo_rubro', { size: 32, seed: 'view-test-2' });
    const d = diffView(wall, after, palette, 2);
    expect(d.width).toBeGreaterThan(32 * 2 * 3);
    const sheetC = contactSheet([wall, after], palette, 2);
    expect(sheetC.width).toBeGreaterThan(0);
    expect(() => diffView(wall, generatePreset('tijolo_rubro', { size: 64, seed: 'x' }), palette)).toThrow(/tamanho/);
  });

  it('in-engine preview renders at prototype resolution with fog applied', () => {
    const frame = renderPreview({ wall, palette });
    expect(frame.width).toBe(W);
    expect(frame.height).toBe(H);
    // far row of sky is near the fog void, bottom rows are lit floor
    const topIdx = (2 * W + W / 2) * 4;
    expect(frame.data[topIdx]).toBeLessThan(30);
    const botIdx = ((H - 2) * W + W / 2) * 4;
    expect(frame.data[botIdx + 3]).toBe(255);
  });

  it('turnaround emits 8 labeled views and is deterministic', () => {
    const strip1 = turnaroundStrip(humanoidFigure(), 16, 1);
    const strip2 = turnaroundStrip(humanoidFigure(), 16, 1);
    expect(strip1.width).toBe(4 + 8 * (16 + 4));
    expect(Buffer.from(strip1.data).equals(Buffer.from(strip2.data))).toBe(true);
  });
});

describe('MCP server protocol', () => {
  it('answers initialize, tools/list and tools/call over stdio', async () => {
    const { spawn } = await import('node:child_process');
    const server = spawn('node', [path.join(__dirname, 'server.cjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artmcp-'));
    const lines: string[] = [];
    const done = new Promise<void>((resolve) => {
      let buf = '';
      server.stdout.on('data', (d: Buffer) => {
        buf += d.toString();
        let ix;
        while ((ix = buf.indexOf('\n')) >= 0) {
          lines.push(buf.slice(0, ix));
          buf = buf.slice(ix + 1);
          if (lines.length >= 3) resolve();
        }
      });
    });
    server.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'gen_texture', arguments: { preset: 'musgo_vivo', params: { size: 16, seed: 't' }, srcOut: path.join(outDir, 's.json'), viewOut: path.join(outDir, 'v.png') } } }) + '\n',
    );
    await done;
    server.kill();
    const init = JSON.parse(lines[0]);
    expect(init.result.serverInfo.name).toBe('nos-art-toolkit');
    const list = JSON.parse(lines[1]);
    expect(list.result.tools.map((t: { name: string }) => t.name)).toContain('preview_scene');
    const call = JSON.parse(lines[2]);
    const payload = JSON.parse(call.result.content[0].text);
    expect(fs.existsSync(payload.src)).toBe(true);
    expect(fs.existsSync(payload.view)).toBe(true);
    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
