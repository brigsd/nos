#!/usr/bin/env node
/* porteiro.mjs — o GATE de render da OFICINA (D-60). Renderiza peça(s) do v3 e
   FALHA (exit≠0) se: houve pageerror, window.__ready ≠ true, ou o frame é
   DEGENERADO (tela chapada — render quebrado que "passou verde"). Pra CI e pro
   "shader quebrado nunca mais passa".
     node tools/bancadas/porteiro.mjs                 # todas as peças de pecas/
     node tools/bancadas/porteiro.mjs arvore3d ilha-chao */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngStats } from './bench/pngstats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PECAS = join(REPO, 'prototipos/fps/v3/pecas');
let alvos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!alvos.length) alvos = readdirSync(PECAS).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.replace(/\.js$/, ''));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/prototipos/fps/v3/visor.html`;

const PW = join(REPO, 'node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('Playwright não encontrado. Rode: cd site && npm ci'); process.exit(2); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

let falhas = 0;
for (const nome of alvos) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  const motivos = [];
  try {
    await page.goto(`${base}?peca=${nome}&res=640`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const ready = await page.evaluate(() => window.__ready === true);
    if (!ready) motivos.push('window.__ready ≠ true (peça não abriu)');
    const buf = await page.screenshot();
    try {
      const s = pngStats(buf);
      if (s.cores < 4 || s.fracDominante > 0.985 || s.lumaRange < 6)
        motivos.push(`frame degenerado (cores=${s.cores}, dominante=${(s.fracDominante * 100 | 0)}%, luma=${s.lumaRange})`);
    } catch (e) { motivos.push('frame ilegível: ' + e.message); }
    if (erros.length) motivos.push(`${erros.length} erro(s) de página: ${erros.slice(0, 2).join(' ; ')}`);
  } catch (e) { motivos.push('navegação falhou: ' + e.message); }
  await page.close();
  if (motivos.length) { falhas++; console.log(`✗ ${nome}\n    ${motivos.join('\n    ')}`); }
  else console.log(`✓ ${nome}`);
}
await browser.close(); server.close();
console.log(`\nporteiro: ${alvos.length - falhas}/${alvos.length} passaram`);
process.exit(falhas ? 1 : 0);
