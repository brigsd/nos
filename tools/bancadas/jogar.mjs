#!/usr/bin/env node
/**
 * jogar.mjs — o olho do ALICERCE jogável do v3 (D-61).
 *
 * Screenshot de jogo.html num ponto de vista dado, com overrides de tier —
 * sem rede: server estático local + Chromium do site. Irmão do olhar-peca.mjs
 * (peça isolada) pra a CENA inteira (câmera livre, menu, tiers).
 *
 *   npm run jogar                                  # ponto padrão
 *   npm run jogar -- --cam=-19,0,1.85,0             # x,z,yaw,pitch
 *   npm run jogar -- --pausado                      # abre o menu de pausa
 *   npm run jogar -- --ts=8 --sombra=0 --luz=2 --particulas=2   # tiers
 *
 * Saída: tools/bancadas/out/jogo-<nome>.png
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = join(HERE, 'out');

const args = process.argv.slice(2);
const arg = (nome, def) => { const m = args.find((a) => a.startsWith(`--${nome}=`)); return m ? m.split('=')[1] : def; };
const flag = (nome) => args.includes(`--${nome}`);
const nome = arg('nome', 'padrao');
const cam = arg('cam', '-19,0,1.85,0');

const qs = new URLSearchParams({ cam });
for (const k of ['ts', 'sombra', 'luz', 'particulas']) { const v = arg(k, null); if (v !== null) qs.set(k, v); }
if (flag('pausado')) qs.set('pausado', '1');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/prototipos/fps/v3/jogo.html`;

const PW = join(REPO, 'node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('Playwright não encontrado. Rode: cd site && npm ci'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

mkdirSync(OUT, { recursive: true });
await page.goto(`${base}?${qs}`, { waitUntil: 'load' });
await page.waitForTimeout(1300);
if (flag('pausado') && arg('aba', null)) {
  await page.click('#btnAbrirConfig');
  await page.waitForTimeout(150);
  await page.click(`[data-aba="${arg('aba')}"]`);
  await page.waitForTimeout(200);
}
const ok = await page.evaluate(() => !!window.__ready);
const fps = await page.evaluate(() => document.getElementById('fps')?.textContent);
const file = join(OUT, `jogo-${nome}.png`);
await page.screenshot({ path: file });
console.log(`jogar ${nome} — ready=${ok} — ${fps} — erros=${erros.length}`);
erros.forEach((e) => console.log('  ERRO:', e));
console.log(`  ${file}`);

await browser.close();
server.close();
process.exit(erros.length || !ok ? 1 : 0);
