#!/usr/bin/env node
/**
 * prancheta.mjs — a câmera de topo do coder (D-50, pedido do ideador).
 *
 * Planta técnica de qualquer recorte do mundo, lida da fonte VIVA (o cliente
 * expõe window.__nosMapa() — colisões, paredes, billboards reais; nada de
 * geometria duplicada). Pra AUDITAR estrutura antes/depois de criar: onde tem
 * colisão? o que tapa o quê? o arco ficou perpendicular mesmo?
 *
 *   npm run prancheta                     # A Clareira (40,9 -> 55,23)
 *   npm run prancheta -- 25,8,50,20      # recorte x0,y0,x1,y1
 *   npm run prancheta -- --no-build
 *
 * Legenda no PNG: tile sólido = hachura vermelha · parede da cidade = bloco
 * colorido com a ALTURA escrita · tronco/colisão = círculo vermelho exato ·
 * billboard = ponto + rótulo · orientado = traço na direção do plano (com a
 * espessura, se tiver depth). Saída: prototipos/fps/qa/out/prancheta.png
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

const args = process.argv.slice(2);
if (!args.includes('--no-build') || !existsSync(BUILT)) {
  execFileSync('node', [join(REPO, 'site/scripts/build-fps.mjs')], { stdio: 'inherit', cwd: REPO });
}
const rectArg = args.find((a) => /^\d+,\d+,\d+,\d+$/.test(a));
const [X0, Y0, X1, Y1] = rectArg ? rectArg.split(',').map(Number) : [40, 9, 55, 23];

const html = readFileSync(BUILT);
const server = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('prancheta: rode `cd site && npm ci` primeiro.'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

/* desenha a planta DENTRO da página (canvas), com os dados vivos */
await page.evaluate(([x0, y0, x1, y1]) => {
  const M = window.__nosMapa();
  const S = Math.min(64, Math.floor(1280 / (x1 - x0)));         // px por tile
  const Wp = (x1 - x0) * S + 120, Hp = (y1 - y0) * S + 80;
  const cv = document.createElement('canvas'); cv.id = 'prancheta';
  cv.width = Wp; cv.height = Hp;
  cv.style.cssText = 'position:fixed;inset:0;z-index:99;background:#12101a';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const px = (wx) => (wx - x0) * S + 60, py = (wy) => (wy - y0) * S + 40;
  g.fillStyle = '#12101a'; g.fillRect(0, 0, Wp, Hp);
  /* grade + coordenadas */
  g.strokeStyle = '#2a2438'; g.fillStyle = '#6b6675'; g.font = `${Math.max(9, S / 4)}px monospace`; g.textAlign = 'center';
  for (let tx = x0; tx <= x1; tx++) { g.beginPath(); g.moveTo(px(tx), py(y0)); g.lineTo(px(tx), py(y1)); g.stroke(); if (tx < x1) g.fillText(tx, px(tx + 0.5), py(y0) - 8); }
  for (let ty = y0; ty <= y1; ty++) { g.beginPath(); g.moveTo(px(x0), py(ty)); g.lineTo(px(x1), py(ty)); g.stroke(); if (ty < y1) { g.save(); g.textAlign = 'right'; g.fillText(ty, px(x0) - 6, py(ty + 0.5) + 3); g.restore(); } }
  /* tiles sólidos (água/ruína/núcleo): hachura vermelha */
  g.strokeStyle = 'rgba(232,59,59,0.55)';
  for (const idx of M.solid) {
    const tx = idx % M.w, ty = (idx / M.w) | 0;
    if (tx < x0 || tx >= x1 || ty < y0 || ty >= y1) continue;
    for (let k = 0; k <= 2 * S; k += 6) { g.beginPath(); g.moveTo(px(tx) + Math.max(0, k - S), py(ty) + Math.min(k, S)); g.lineTo(px(tx) + Math.min(k, S), py(ty) + Math.max(0, k - S)); g.stroke(); }
  }
  /* paredes da cidade: bloco na cor do minimapa + altura */
  for (const c of M.city) {
    if (c.tx < x0 || c.tx >= x1 || c.ty < y0 || c.ty >= y1) continue;
    g.fillStyle = c.mm || '#888'; g.globalAlpha = 0.8;
    g.fillRect(px(c.tx) + 1, py(c.ty) + 1, S - 2, S - 2);
    g.globalAlpha = 1; g.fillStyle = '#12101a'; g.font = `bold ${Math.max(10, S / 3)}px monospace`;
    g.fillText(c.h.toFixed(1), px(c.tx + 0.5), py(c.ty + 0.62));
  }
  /* colisões finas (troncos/pilares/anéis): círculo vermelho EXATO */
  g.strokeStyle = '#f04f78'; g.lineWidth = 1.5;
  for (const t of M.trunks) {
    if (t.x < x0 - 1 || t.x > x1 + 1 || t.y < y0 - 1 || t.y > y1 + 1) continue;
    g.beginPath(); g.arc(px(t.x), py(t.y), t.r * S, 0, Math.PI * 2); g.stroke();
  }
  /* billboards: ponto + rótulo; orientados = traço do plano (+ espessura) */
  g.font = `${Math.max(8, S / 4.6)}px monospace`;
  for (const b of M.bills) {
    if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
    const deco = ['arvore', 'tufo', 'flor', 'arbusto', 'rocha'].includes(b.label);
    if (b.orient !== undefined) {
      const hw = (b.scale || 1) / 2 * 1.33; /* aproximação da meia-largura */
      const co = Math.cos(b.orient), so = Math.sin(b.orient);
      g.strokeStyle = '#30e1b9'; g.lineWidth = Math.max(2, (b.depth || 0.05) * S);
      g.beginPath(); g.moveTo(px(b.x - co * hw), py(b.y - so * hw)); g.lineTo(px(b.x + co * hw), py(b.y + so * hw)); g.stroke();
      g.lineWidth = 1.5;
      g.fillStyle = '#8ff8e2'; g.fillText(b.label, px(b.x), py(b.y) - Math.max(6, S / 5));
    } else {
      g.fillStyle = deco ? 'rgba(146,169,132,0.8)' : '#fbb954';
      g.beginPath(); g.arc(px(b.x), py(b.y), deco ? 2.5 : 4, 0, Math.PI * 2); g.fill();
      if (!deco) g.fillText(b.label, px(b.x), py(b.y) - 7);
    }
  }
  /* âncoras */
  g.fillStyle = '#a884f3'; g.font = `bold ${Math.max(9, S / 4)}px monospace`;
  g.fillText('✛ PLAZA', px(M.ancoras.PLAZA.x), py(M.ancoras.PLAZA.y) + 4);
  g.fillText('◈ PORTAL', px(M.ancoras.PORTAL.x), py(M.ancoras.PORTAL.y) + 4);
  /* legenda */
  g.textAlign = 'left'; g.font = '12px monospace'; g.fillStyle = '#9b93a8';
  g.fillText(`PRANCHETA (${x0},${y0})→(${x1},${y1}) · hachura=tile sólido · bloco+nº=parede(altura) · círculo=colisão · traço teal=plano orientado`, 12, Hp - 12);
}, [X0, Y0, X1, Y1]);

const el = await page.locator('#prancheta');
await el.screenshot({ path: join(OUT, 'prancheta.png') });
console.log(`prancheta (${X0},${Y0})→(${X1},${Y1}): ${join(OUT, 'prancheta.png')}`);
await browser.close();
server.close();
