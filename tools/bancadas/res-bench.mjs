#!/usr/bin/env node
/**
 * res-bench.mjs — experimento B do D-44: o custo real de subir a resolução
 * INTERNA do render (a alavanca ?res=). Para cada degrau, mede o FPS de
 * verdade (contando rAF por 3s) e tira um recorte da MESMA região da cena
 * pra comparar nitidez. Roda também com a CPU estrangulada 4× (proxy de
 * celular). Uso: node tools/bancadas/res-bench.mjs [--no-build]
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BUILT = join(REPO, 'site/public/fps/index.html');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

if (!process.argv.includes('--no-build') || !existsSync(BUILT)) {
  execFileSync('node', [join(REPO, 'site/scripts/build-fps.mjs')], { stdio: 'inherit', cwd: REPO });
}

const html = readFileSync(BUILT);
const server = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('res-bench: rode `cd site && npm ci` primeiro.'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch();

const CAM = process.env.CAM || '34.0,11.2,0.18'; // carreiro: fileiras de árvore dos 2 lados (billboard-pesado = onde o stutter mora)
const TIERS = [
  ['320x180', 'Baixo (padrão)'],
  ['480x270', 'Médio'],
  ['640x360', 'Alto'],
  ['960x540', 'Ultra'],
];

async function medir(res, throttle) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  await page.goto(`${base}?cam=${CAM}&tod=0.3&res=${res}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600); // texturas + assentamento
  await page.evaluate(() => { window.__nosPerf && window.__nosPerf(); }); // zera o acumulador
  const fps = await page.evaluate(() => new Promise((done) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; const dt = performance.now() - t0; if (dt >= 3000) done(+(n / (dt / 1000)).toFixed(1)); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  const perf = await page.evaluate(() => (window.__nosPerf ? window.__nosPerf() : null)); // ms médios por fase
  let shot = null;
  if (throttle === 1) {
    const bb = await page.locator('#view').boundingBox();
    // recorte fixo da MESMA região da cena (centro-direita: chafariz + portal)
    const clip = { x: bb.x + bb.width * 0.50, y: bb.y + bb.height * 0.26, width: bb.width * 0.34, height: bb.height * 0.42 };
    shot = join(OUT, `res-${res}.png`);
    await page.screenshot({ path: shot, clip });
  }
  await page.close();
  return { fps, perf, shot, errs };
}

const rows = [];
for (const [res, label] of TIERS) {
  const desk = await medir(res, 1);
  const mob = await medir(res, 4);
  rows.push({ res, label, fpsDesktop: desk.fps, fpsThrottled4x: mob.fps, shot: desk.shot, errs: [...desk.errs, ...mob.errs] });
  const ph = desk.perf ? `  fases(ms): céu=${desk.perf.sky} chão=${desk.perf.floor} paredes=${desk.perf.walls} bill=${desk.perf.bill ?? '-'} resto=${desk.perf.resto} · pior=${desk.perf.maxMs}ms lentos=${desk.perf.slow}` : '';
  console.log(`${res.padEnd(9)} (${label})  desktop=${desk.fps}fps  cpu/4=${mob.fps}fps${ph}${desk.errs.length || mob.errs.length ? '  ⚠ ' + [...desk.errs, ...mob.errs][0] : ''}`);
}

/* compõe a comparação de nitidez numa página só (recortes + FPS) */
const compare = `<!doctype html><body style="margin:0;background:#100c15;color:#d7e7e2;font:14px ui-monospace,monospace">
${rows.map((r) => `<div style="display:flex;align-items:center;gap:14px;padding:6px 10px">
  <div style="width:340px"><b style="color:#30e1b9">${r.res}</b> — ${r.label}<br>desktop <b>${r.fpsDesktop} fps</b> · cpu÷4 <b>${r.fpsThrottled4x} fps</b></div>
  <img src="file://${r.shot}" style="height:216px;image-rendering:auto"></div>`).join('')}
</body>`;
const page = await browser.newPage({ viewport: { width: 1080, height: 940 } });
await page.setContent(compare, { waitUntil: 'load' });
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'res-compare.png'), fullPage: true });
console.log('comparação: ' + join(OUT, 'res-compare.png'));

await browser.close();
server.close();
