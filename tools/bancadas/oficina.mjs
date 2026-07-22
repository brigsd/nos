#!/usr/bin/env node
/**
 * oficina.mjs — a bancada da CÂMERA DO EDITOR (Oficina, passo 2).
 *
 * Abre oficina.html?peca=_oficina-toco headless (server estático + Chromium do
 * site), simula arrasto de ÓRBITA e roda de ZOOM com eventos REAIS de mouse, e
 * AFIRMA, com números:
 *   (a) a cena MUDOU por causa da CÂMERA — diff de pixels na região do objeto
 *       MUITO maior que o piso de animação (pólen/vento), medido num par de
 *       controle sem input; e o azimute/distância mudaram pelo gesto;
 *   (b) document.pointerLockElement === null durante E depois (cursor LIVRE);
 *   (c) o objeto fica CENTRADO ao orbitar — o alvo, projetado pelo PRÓPRIO
 *       motor (visor.projetar), cai no centro da tela em vários azimutes, e um
 *       ponto fora do eixo varre a tela (a câmera de fato dá a volta).
 * Screenshots em scratchpad/passo2/. Sai 1 se qualquer AFIRMA falhar.
 *
 *   npm run oficina
 */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import zlib from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = resolve(REPO, 'scratchpad/passo2');
const VW = 1100, VH = 620;
const PECA = '_oficina-toco';

/* ---- PNG mínimo (node:zlib, zero dependências): decodifica RGB/RGBA 8-bit sem
   interlace — o que o Playwright cospe — pra medir diferença de pixel de verdade. */
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, colorType = 6;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++], o = y * stride, po = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[o + x - ch] : 0;              // esquerda
      const b = y > 0 ? out[po + x] : 0;                    // cima
      const c = (x >= ch && y > 0) ? out[po + x - ch] : 0;  // cima-esquerda
      let v = raw[pos + x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
      out[o + x] = v;
    }
    pos += stride;
  }
  return { w, h, ch, data: out };
}
function diffPix(A, B, thr = 24) {
  const n = Math.min(A.data.length, B.data.length), ch = A.ch;
  let count = 0;
  for (let i = 0; i + 3 <= n; i += ch) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d > thr) count++;
  }
  return count;
}

/* ---- server estático mínimo (o mesmo padrão de olhar-peca.mjs) ------------ */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/prototipos/fps/v3/oficina.html`;

const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('Playwright não encontrado. Rode: cd site && npm ci'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
page.on('pageerror', (e) => console.error('PAGEERR:', e.message));
mkdirSync(OUT, { recursive: true });

/* ---- afirmações ---------------------------------------------------------- */
const falhas = [];
const ok = (nome, cond, detalhe = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
  if (!cond) falhas.push(nome);
};
const rAF2 = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
const CLIP = { x: 340, y: 140, width: 420, height: 340 };   // caixa central: contém o objeto, à esquerda do painel
const snapClip = async () => decodePNG(await page.screenshot({ clip: CLIP }));

await page.goto(`${base}?peca=${PECA}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const ready = await page.evaluate(() => window.__ready === true);
ok('carrega e renderiza (window.__ready)', ready);
if (!ready) { console.error('  peça não abriu — abortando'); await browser.close(); server.close(); process.exit(1); }
await page.waitForTimeout(500);

const cx = VW / 2, cy = VH / 2;
ok('(b) cursor livre no início (pointerLockElement null)', (await page.evaluate(() => window.__oficina.travado())) === null);

await page.screenshot({ path: join(OUT, 'oficina-antes.png') });

// piso de animação: dois quadros SEM input (pólen/vento) — o confundidor a bater
const s0 = await snapClip();
await page.waitForTimeout(280);
const s1 = await snapClip();
const pisoDiff = diffPix(s0, s1);

const est0 = await page.evaluate(() => window.__oficina.estado());

// GESTO de órbita com eventos reais de mouse (botão esquerdo)
await page.mouse.move(cx - 240, cy - 30);
await page.mouse.down();
ok('(b) cursor livre DURANTE o arrasto (pointerLockElement null)', (await page.evaluate(() => window.__oficina.travado())) === null);
await page.mouse.move(cx, cy + 40, { steps: 18 });   // arrasta ~240px em x
await page.mouse.up();
const est1 = await page.evaluate(() => window.__oficina.estado());
ok('(a) o arrasto MEXEU o azimute', Math.abs(est1.az - est0.az) > 0.5, `az ${est0.az.toFixed(2)} -> ${est1.az.toFixed(2)}`);
ok('(b) cursor livre DEPOIS do arrasto (pointerLockElement null)', (await page.evaluate(() => window.__oficina.travado())) === null);

// ZOOM com a roda
await page.mouse.move(cx - 200, cy);
await page.mouse.wheel(0, -340);
const est2 = await page.evaluate(() => window.__oficina.estado());
ok('(a) a roda aproximou (dist caiu)', est2.dist < est0.dist - 0.1, `dist ${est0.dist.toFixed(2)} -> ${est2.dist.toFixed(2)}`);

await page.waitForTimeout(280);
const s2 = await snapClip();
const gestoDiff = diffPix(s1, s2);
ok('(a) a CÂMERA mexeu a cena bem além do piso de animação',
   gestoDiff > pisoDiff * 4 && gestoDiff > 400, `gesto ${gestoDiff}px vs piso ${pisoDiff}px`);

await page.screenshot({ path: join(OUT, 'oficina-depois.png') });

// (c) ÓRBITA CORRETA + LENTE: o alvo, projetado pelo MOTOR, fica ESTÁVEL ao
//     orbitar (não varre); a lente o leva pra a ÁREA LIVRE (à esquerda do painel);
//     e um ponto fora do eixo varre a tela (a câmera dá a volta mesmo).
const R = await page.evaluate(async () => {
  const alvo = window.__oficina.estado().alvo;
  const fora = [alvo[0] + 0.6, alvo[1], alvo[2]];
  const espera = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))));
  const ax = [], ay = [], forasX = [];
  for (const az of [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
    window.__oficina.orbitar({ az, el: 0.4, dist: 2.6, alvo });
    await espera();
    const pa = window.__oficina.projetar(alvo);
    if (!pa) { ax.push(99999); continue; }
    ax.push(pa.x); ay.push(pa.y);
    const pf = window.__oficina.projetar(fora);
    if (pf) forasX.push(pf.x);
  }
  const spread = (a) => (a.length > 1 ? Math.max(...a) - Math.min(...a) : 0);
  const media = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    estab: Math.max(spread(ax), spread(ay)),   // o alvo NÃO deve andar ao orbitar (invariante da órbita, agnóstico à lente)
    alvoMedX: media(ax), centroX: innerWidth / 2,
    painel: document.getElementById('props').getBoundingClientRect().width,
    forasSpread: spread(forasX), nForas: forasX.length,
  };
});
ok('(c) alvo ESTÁVEL ao orbitar (projeção do motor não varre)', R.estab <= 3, `variação ${R.estab.toFixed(2)}px em 7 azimutes`);
ok('(c) LENTE leva o alvo pra a área livre (à esquerda do centro, ~metade do painel)', R.centroX - R.alvoMedX > R.painel * 0.35, `alvo ${Math.round(R.alvoMedX)}px · centro ${Math.round(R.centroX)}px · painel ${Math.round(R.painel)}px`);
ok('(c) a câmera dá a VOLTA (ponto fora do eixo varre a tela)', R.forasSpread > 80, `varredura ${Math.round(R.forasSpread)}px em ${R.nForas} ângulos`);

const projAlvo = await page.evaluate(() => window.__oficina.projetar());
ok('(c) objeto VISÍVEL após orbitar (alvo projeta na tela)', !!projAlvo);

await browser.close();
server.close();

console.log(`\n  screenshots: ${join(OUT, 'oficina-antes.png')}\n               ${join(OUT, 'oficina-depois.png')}`);
if (falhas.length) { console.error(`\nBANCADA FALHOU — ${falhas.length}: ${falhas.join('; ')}`); process.exit(1); }
console.log(`\nBANCADA OK — órbita/pan/zoom + cursor livre + objeto centrado (piso ${pisoDiff}px, gesto ${gestoDiff}px).`);
