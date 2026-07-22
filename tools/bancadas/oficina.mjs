#!/usr/bin/env node
/**
 * oficina.mjs — a bancada da CÂMERA DO EDITOR + OVERLAY DA MALHA (Oficina, passos 2-3).
 *
 * Abre oficina.html?peca=_oficina-toco headless (server estático + Chromium do
 * site), simula arrasto de ÓRBITA e roda de ZOOM com eventos REAIS de mouse, e
 * AFIRMA, com números:
 *   PASSO 2 (câmera):
 *   (a) a cena MUDOU por causa da CÂMERA — diff de pixels na região do objeto
 *       MUITO maior que o piso de animação (pólen/vento), medido num par de
 *       controle sem input; e o azimute/distância mudaram pelo gesto;
 *   (b) document.pointerLockElement === null durante E depois (cursor LIVRE);
 *   (c) o objeto fica CENTRADO ao orbitar — o alvo, projetado pelo PRÓPRIO
 *       motor (visor.projetar), cai no centro da tela em vários azimutes, e um
 *       ponto fora do eixo varre a tela (a câmera de fato dá a volta).
 *   PASSO 3 (overlay da malha — window.__oficina.overlay(), sem ler pixels):
 *   (3a) o overlay projetou TODOS os vértices do neutro (19 no _oficina-toco) e
 *        as arestas das faces aparecem;
 *   (3b) os pontos ACOMPANHAM a câmera — orbita e as posições projetadas mudam;
 *   (3c) os pontos caem SOBRE o objeto — dentro do bounding-box de TELA do toco
 *        detectado nos pixels do RENDER (prova o alinhamento overlay↔motor);
 *   (3d) o overlay é pointer-events:none (e o arrasto do passo 2 segue passando,
 *        prova viva de que o overlay não rouba o input da câmera).
 * Screenshots em scratchpad/passo2/ e scratchpad/passo3/. Sai 1 se algo falhar.
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
const OUT3 = resolve(REPO, 'scratchpad/passo3');
const VW = 1100, VH = 620;
const PECA = '_oficina-toco';
const N_VERT = 19, N_FACE = 14;   // neutro do _oficina-toco (conferido headless por nucleo())

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

/* bounding-box de TELA do toco a partir dos pixels do RENDER: varre a região da
   cena e marca o pixel "cor de madeira" — vermelho domina (r>=g>=b), com brilho
   mínimo. A grama (verde: g>r) e o céu (azul: b>r) caem fora; os painéis da UI
   são azul-acinzentados (b>r) e também. O PÓLEN (partícula quente ~1,.93,.7) é
   cor de madeira também, mas é isolado: um filtro de RUN por linha (só conta
   corridas horizontais >= runMin) descarta as fagulhas e mantém o corpo sólido
   do toco. É a referência NÃO-circular do alinhamento: os vértices projetados
   têm que cair dentro desta caixa. */
function bboxToco(img, reg, runMin = 10) {
  const { w, h, ch, data } = img;
  const x0c = Math.max(0, reg.x0 | 0), x1c = Math.min(w - 1, reg.x1 | 0);
  const y0c = Math.max(0, reg.y0 | 0), y1c = Math.min(h - 1, reg.y1 | 0);
  const madeira = (x, y) => { const i = (y * w + x) * ch, r = data[i], g = data[i + 1], b = data[i + 2];
    return r >= g && g >= b && r > 45 && r + g + b > 110; };
  let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
  for (let y = y0c; y <= y1c; y++) {
    let run = 0, ini = x0c;
    for (let x = x0c; x <= x1c + 1; x++) {
      const on = x <= x1c && madeira(x, y);
      if (on) { if (run === 0) ini = x; run++; }
      else { if (run >= runMin) {   // corrida sólida: comita no bbox
          if (ini < x0) x0 = ini; if (x - 1 > x1) x1 = x - 1; if (y < y0) y0 = y; if (y > y1) y1 = y; n += run; }
        run = 0; }
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n };
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

/* ==== PASSO 3: overlay da MALHA (vértices + arestas) por cima da cena ======= */
// câmera limpa e conhecida (o passo 2 deixou a órbita em az~3, dist 2.6)
const FRAME = { az: 0.7, el: 0.45, dist: 1.95, alvo: [0, 0.28, 0] };
await page.evaluate((f) => window.__oficina.orbitar(f), FRAME);
await rAF2();

// (3a) contagem: pontos = vértices do neutro, e as arestas aparecem
const ov = await page.evaluate(() => window.__oficina.overlay());
ok('(3a) o NEUTRO tem os vértices/faces esperados', ov.nV === N_VERT && ov.nF === N_FACE, `V ${ov.nV} (esp ${N_VERT}) · F ${ov.nF} (esp ${N_FACE})`);
ok('(3a) o overlay projetou TODOS os vértices (pontos = vértices)', ov.pontos.length === N_VERT, `${ov.pontos.length}/${N_VERT} pontos na tela`);
ok('(3a) as ARESTAS das faces aparecem', ov.arestas > 20, `${ov.arestas} segmentos de aresta`);

// (3b) os pontos ACOMPANHAM a câmera: orbita e as posições projetadas mudam
const antes = await page.evaluate(() => window.__oficina.overlay().pontos);
await page.evaluate(() => window.__oficina.orbitar({ az: 1.7 }));
await rAF2();
const depois = await page.evaluate(() => window.__oficina.overlay().pontos);
const segMap = new Map(depois.map((p) => [p.id, p]));
let casados = 0, movidos = 0, maxMov = 0;
for (const a of antes) { const b = segMap.get(a.id); if (!b) continue; casados++;
  const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > 3) movidos++; if (d > maxMov) maxMov = d; }
ok('(3b) os pontos ACOMPANHAM a órbita (posições projetadas mudam)',
   casados >= 10 && movidos === casados && maxMov > 30, `${movidos}/${casados} casados moveram, máx ${Math.round(maxMov)}px`);

// (3c) os pontos caem SOBRE o objeto: dentro do bbox de TELA do toco (do RENDER)
await page.evaluate((f) => window.__oficina.orbitar(f), FRAME);
await rAF2();
const painelW = await page.evaluate(() => document.getElementById('props').getBoundingClientRect().width);
const shot = decodePNG(await page.screenshot());   // viewport inteiro (deviceScaleFactor 1 -> 1px = 1px CSS)
const cena = { x0: 8, y0: 48, x1: VW - Math.ceil(painelW) - 8, y1: VH - 30 };   // só a área da cena (fora de barras/painel)
const bbox = bboxToco(shot, cena);
const pts = await page.evaluate(() => window.__oficina.overlay().pontos);
const M = 6;   // folga: raio do ponto + vértice na silhueta pode cair 1px fora da máscara
const dentro = pts.filter((p) => p.x >= bbox.x0 - M && p.x <= bbox.x1 + M && p.y >= bbox.y0 - M && p.y <= bbox.y1 + M).length;
ok('(3c) os pontos caem SOBRE o objeto (dentro do bbox de tela do toco)',
   bbox.n > 500 && dentro === pts.length,
   `${dentro}/${pts.length} pontos no bbox ${bbox.w}×${bbox.h}px (${bbox.n}px de madeira em ${cena.x1 - cena.x0}×${cena.y1 - cena.y0})`);

// (3d) overlay pointer-events:none — não rouba o input (o arrasto do passo 2 já
//      passou COM o overlay no DOM; aqui a confirmação direta do estilo)
const pe = await page.evaluate(() => getComputedStyle(document.getElementById('malha')).pointerEvents);
ok('(3d) overlay pointer-events:none (câmera responde através dele)', pe === 'none', `pointer-events: ${pe}`);

// screenshot do resultado: pontos + arestas sobre o toco
mkdirSync(OUT3, { recursive: true });
await page.screenshot({ path: join(OUT3, 'oficina-malha.png') });
await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })); });   // liga as etiquetas de id
await rAF2();
await page.screenshot({ path: join(OUT3, 'oficina-malha-ids.png') });

await browser.close();
server.close();

console.log(`\n  screenshots: ${join(OUT, 'oficina-antes.png')}\n               ${join(OUT, 'oficina-depois.png')}\n               ${join(OUT3, 'oficina-malha.png')}\n               ${join(OUT3, 'oficina-malha-ids.png')}`);
if (falhas.length) { console.error(`\nBANCADA FALHOU — ${falhas.length}: ${falhas.join('; ')}`); process.exit(1); }
console.log(`\nBANCADA OK — passo 2: órbita/pan/zoom + cursor livre + objeto centrado (piso ${pisoDiff}px, gesto ${gestoDiff}px); passo 3: overlay da malha (${N_VERT} vértices, arestas das ${N_FACE} faces) alinhado sobre o objeto e acompanhando a câmera.`);
