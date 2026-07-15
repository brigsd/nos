#!/usr/bin/env node
/**
 * site/gl/qa/bench-and-screens.mjs
 *
 * R3 measurement harness: serves the production build of site/gl/
 * (`npm run build:gl` must have run first) over a local static server (no
 * external fetches - the prototype only ever reads its own local copy of
 * world/heart.json, see gl/world-load.ts), drives every renderer x scene x
 * sprite-count x time-of-day combination through the `window.glProto` API
 * exposed by gl/main.ts, and writes:
 *
 *   - site/qa/r3/results.json   - FPS/frame-time/heap table + bundle sizes
 *   - site/qa/r3/*.png          - canvas vs. pixi screenshots, day + night
 *
 * Chromium is launched with SwiftShader software-GL flags because this
 * sandbox has no real GPU (see docs/R3_COMPARATIVO_RENDER.md for the
 * caveat this puts on the absolute FPS numbers - relative/scaling
 * comparisons stay meaningful, absolute numbers are a conservative floor).
 *
 * Usage:
 *   cd site && npm run build:gl && node gl/qa/bench-and-screens.mjs
 */
import { chromium } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(SITE_ROOT, 'dist-gl');
const OUT_DIR = path.join(SITE_ROOT, 'qa', 'r3');
const PORT = 5299;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startServer() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DIST_DIR)) {
      reject(new Error(`dist-gl não existe (${DIST_DIR}) - rode "npm run build:gl" primeiro.`));
      return;
    }
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const relPath = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = path.join(DIST_DIR, relPath);
      if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`not found: ${relPath}`);
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function gzipSize(filePath) {
  return zlib.gzipSync(fs.readFileSync(filePath), { level: 9 }).length;
}

function bundleSizeReport() {
  const assetsDir = path.join(DIST_DIR, 'assets');
  const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
  let totalRaw = 0;
  let totalGzip = 0;
  const items = files
    .map((f) => {
      const full = path.join(assetsDir, f);
      const raw = fs.statSync(full).size;
      const gzip = gzipSize(full);
      totalRaw += raw;
      totalGzip += gzip;
      return { file: f, raw, gzip };
    })
    .sort((a, b) => b.gzip - a.gzip);
  return { items, totalRaw, totalGzip };
}

async function readHeapBytes(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const jsHeap = metrics.find((m) => m.name === 'JSHeapUsedSize');
  return jsHeap ? jsHeap.value : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A single long measurement window is fragile in this sandbox: one GC
 * pause or scheduler hiccup anywhere in a 3s window drags the whole
 * average down and produces non-monotonic, non-reproducible numbers
 * (confirmed empirically - a first pass showed pixi 10k FASTER than pixi
 * 5k, which is not physically sensible and vanished once this changed).
 * Instead: take SAMPLES short 1s windows after warm-up and report the
 * median - resilient to a single bad window, still real measured data.
 */
async function benchScenario(page, cdp, renderer, mode, opts) {
  await page.evaluate(
    ({ renderer, mode, stress, time, crt }) => {
      const api = window.glProto;
      api.setRenderer(renderer);
      api.setMode(mode);
      if (stress !== undefined) api.setStressCount(stress);
      if (time !== undefined) api.setTimeOfDay(time);
      if (crt !== undefined) api.setCrt(crt);
    },
    { renderer, mode, stress: opts.stress, time: opts.time, crt: opts.crt },
  );

  // Discard warm-up frames (scene rebuild hitch, JIT warm-up).
  await page.waitForTimeout(1500);

  const SAMPLES = 6;
  const WINDOW_MS = 1000;
  const fpsSamples = [];
  const avgFrameMsSamples = [];
  const p95FrameMsSamples = [];
  for (let i = 0; i < SAMPLES; i++) {
    await page.evaluate(() => window.glProto.resetFps());
    await page.waitForTimeout(WINDOW_MS);
    const s = await page.evaluate(() => window.glProto.getStats());
    fpsSamples.push(s.fps);
    avgFrameMsSamples.push(s.avgFrameMs);
    p95FrameMsSamples.push(s.p95FrameMs);
  }
  const jsHeapUsedBytes = await readHeapBytes(cdp);

  return {
    fps: median(fpsSamples),
    avgFrameMs: median(avgFrameMsSamples),
    p95FrameMs: Math.max(...p95FrameMsSamples), // worst observed tail, not median - a real UX concern even if rare
    fpsSamples: fpsSamples.map((v) => Number(v.toFixed(1))),
    jsHeapUsedBytes,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await startServer();
  const url = `http://127.0.0.1:${PORT}/`;

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');

    const navStart = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!window.glProto && window.glProto.ready === true, { timeout: 20000 });
    const loadTimeMs = Date.now() - navStart;
    const baselineHeapBytes = await readHeapBytes(cdp);

    console.log(`[load] pronto em ${loadTimeMs}ms, heap inicial ${(baselineHeapBytes / 1e6).toFixed(1)}MB`);

    const results = {
      generatedAt: new Date().toISOString(),
      loadTimeMs,
      baselineHeapBytes,
      note:
        'Chromium headless sem GPU real (SwiftShader software WebGL) - números absolutos são um piso conservador; comparação relativa canvas vs. pixi e a curva 1k->10k continuam válidas. Ver docs/R3_COMPARATIVO_RENDER.md.',
      stress: [],
      screenshots: [],
      consoleErrors: [],
      world: [],
    };

    const counts = [1000, 5000, 10000];
    for (const renderer of ['canvas', 'pixi']) {
      for (const count of counts) {
        const r = await benchScenario(page, cdp, renderer, 'stress', { stress: count });
        results.stress.push({ renderer, count, ...r });
        console.log(
          `[bench] ${renderer.padEnd(6)} stress=${String(count).padStart(5)}: ${r.fps.toFixed(1).padStart(6)} fps` +
            ` | avg ${r.avgFrameMs.toFixed(2)}ms | p95 ${r.p95FrameMs.toFixed(2)}ms | heap ${(r.jsHeapUsedBytes / 1e6).toFixed(1)}MB`,
        );
      }
    }

    // Real world/heart.json scene (tiles + Nativos + player + lighting), not
    // the synthetic stress field - this isolates the COST OF THE LIGHTING
    // ITSELF (ambient tint, point light, bloom, water shimmer, CRT) rather
    // than raw sprite-count throughput.
    const worldScenarios = [
      { renderer: 'canvas', time: 'day', crt: false, label: 'canvas dia' },
      { renderer: 'canvas', time: 'night', crt: false, label: 'canvas noite' },
      { renderer: 'pixi', time: 'day', crt: false, label: 'pixi dia' },
      { renderer: 'pixi', time: 'night', crt: false, label: 'pixi noite' },
      { renderer: 'pixi', time: 'night', crt: true, label: 'pixi noite+CRT' },
    ];
    for (const sc of worldScenarios) {
      const r = await benchScenario(page, cdp, sc.renderer, 'world', { time: sc.time, crt: sc.crt });
      results.world.push({ renderer: sc.renderer, time: sc.time, crt: sc.crt, ...r });
      console.log(
        `[bench] ${sc.label.padEnd(15)}: ${r.fps.toFixed(1).padStart(6)} fps | avg ${r.avgFrameMs.toFixed(2)}ms | p95 ${r.p95FrameMs.toFixed(2)}ms`,
      );
    }

    for (const renderer of ['canvas', 'pixi']) {
      for (const time of ['day', 'night']) {
        await page.evaluate(
          ({ renderer, time }) => {
            const api = window.glProto;
            api.setRenderer(renderer);
            api.setMode('world');
            api.setTimeOfDay(time);
            api.setCrt(false);
          },
          { renderer, time },
        );
        await page.waitForTimeout(600);
        const fname = `${renderer}-${time}.png`;
        await page.screenshot({ path: path.join(OUT_DIR, fname) });
        results.screenshots.push(fname);
        console.log(`[screenshot] ${fname}`);
      }
    }

    // Bonus shot: PixiJS with the CRT/bloom post-pass on, at night (best case for showing the lighting stack).
    await page.evaluate(() => {
      const api = window.glProto;
      api.setRenderer('pixi');
      api.setMode('world');
      api.setTimeOfDay('night');
      api.setCrt(true);
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, 'pixi-night-crt.png') });
    results.screenshots.push('pixi-night-crt.png');
    console.log('[screenshot] pixi-night-crt.png');

    results.consoleErrors = consoleErrors;
    results.bundle = bundleSizeReport();

    fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`\nResultados salvos em ${path.join(OUT_DIR, 'results.json')}`);

    if (consoleErrors.length > 0) {
      console.warn(`${consoleErrors.length} erro(s) de console durante o teste:`);
      for (const e of consoleErrors) console.warn(' -', e);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('bench-and-screens failed:', err);
  process.exit(1);
});
