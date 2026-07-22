#!/usr/bin/env node
/**
 * oficina.mjs — a bancada da CÂMERA DO EDITOR + OVERLAY DA MALHA + ARRASTO DE
 * VÉRTICE (Oficina, passos 2-4).
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
 *   PASSO 4 (arrasto de vértice gravado como moveV — o MILESTONE):
 *   (4a) SELECIONA: pointerdown a ≤10px de um vértice projetado seleciona AQUELE
 *        vértice; um ponto >10px de todos não seleciona nada (é câmera);
 *   (4b) SEGUE O CURSOR: arrasta o vértice por (Δx,Δy) px e, projetando-o DEPOIS
 *        pelo motor, ele cai a ≤ poucos px de onde o cursor soltou (número real);
 *   (4c) GRAVOU: PASSOS cresceu e o último é ['moveV',{v:id,d:[...]}] com d≠0;
 *   (4d) REPLAY: a lista EDITADA re-executada 2× (na página E em Node, à parte)
 *        dá o MESMO neutro canônico, e o vértice movido está na posição NOVA;
 *   (4e) CÂMERA INTACTA: arrasto em espaço VAZIO (longe de vértice) ainda orbita,
 *        cursor livre — o passo 2 segue valendo;
 *   (4f) CLIQUE SÓ SELECIONA: pointerdown+up sem passar do limiar seleciona mas
 *        NÃO grava moveV.
 *   PASSO 5 (desfazer/refazer — em cima do passo 4, teclas REAIS do Chromium):
 *   (5 teclas) Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z chamam preventDefault (o navegador
 *        rouba o Ctrl+Z); a tecla `i` (etiquetas) NÃO é interceptada;
 *   (5 desfaz) arrasta (PASSOS baseline→+1), Ctrl+Z volta PASSOS ao baseline E o
 *        neutro CANÔNICO volta a bater BIT-A-BIT com o de ANTES do arrasto;
 *   (5 refaz) Ctrl+Y (e o alternativo Ctrl+Shift+Z) devolve PASSOS +1 E o neutro
 *        bate com o de DEPOIS do arrasto;
 *   (5 piso) no baseline, Ctrl+Z é NO-OP — não remove a construção da peça;
 *   (5 limpa) arrasta, Ctrl+Z, arrasta de novo → pilha redo vazia (Ctrl+Y não
 *        ressuscita a 1ª desfeita — a edição nova invalidou o refazer);
 *   (5 vários) 3 arrastos → 3 Ctrl+Z voltam ao baseline (neutro == pristino do
 *        arquivo, conferido em Node à parte) → 3 refaz reconstroem o neutro
 *        IDÊNTICO ao estado com os 3.
 * Screenshots em scratchpad/passo2..5/. Sai 1 se algo falhar.
 *
 *   npm run oficina
 */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import zlib from 'node:zlib';
/* PASSO 4: replay INDEPENDENTE em Node — o núcleo neutro e o canônico, mais
   PARAMS/TOPO do toco, pra re-executar a lista EDITADA (vinda do navegador) e
   provar que refaz o mesmo objeto (o critério do doc), fora do browser. */
import { nucleo, neutroCanonico } from '../../prototipos/fps/v3/motor/oficina.js';
import * as toco from '../../prototipos/fps/v3/pecas/_oficina-toco.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = resolve(REPO, 'scratchpad/passo2');
const OUT3 = resolve(REPO, 'scratchpad/passo3');
const OUT4 = resolve(REPO, 'scratchpad/passo4');
const OUT5 = resolve(REPO, 'scratchpad/passo5');
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
await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })); });   // desliga de novo pro passo 4

/* ==== PASSO 4: SELECIONAR E ARRASTAR UM VÉRTICE (gravado como moveV) ========
   O MILESTONE. Tudo com eventos REAIS de mouse no #c (o overlay é só visual), e
   a prova de "segue o cursor" é por MEDIÇÃO: projeta o vértice DEPOIS do arrasto
   e confere que caiu onde o cursor soltou. */
const F4 = { az: 0.7, el: 0.45, dist: 1.95, alvo: [0, 0.28, 0] };   // câmera limpa e conhecida
await page.evaluate((f) => window.__oficina.orbitar(f), F4);
await rAF2(); await rAF2();

// escolhe um vértice BEM dentro da cena (à esquerda do painel) e o mais isolado
// possível dos vizinhos — clique limpo, sem ambiguidade de hit.
const painelW4 = await page.evaluate(() => document.getElementById('props').getBoundingClientRect().width);
function escolherVertice(pts) {
  const dentro = pts.filter((p) => p.x > 24 && p.x < VW - painelW4 - 24 && p.y > 60 && p.y < VH - 40);
  let melhor = dentro[0], sep = -1;
  for (const p of dentro) { let n = 1e9; for (const q of pts) if (q.id !== p.id) n = Math.min(n, Math.hypot(p.x - q.x, p.y - q.y)); if (n > sep) { sep = n; melhor = p; } }
  return { v: melhor, sep };
}
// um ponto de cena garantidamente VAZIO (>2·RAIO_HIT de todo vértice) pra provar câmera-intacta e o miss
function pontoVazio(pts) {
  for (let y = 90; y < VH - 60; y += 12) for (let x = 30; x < VW - painelW4 - 30; x += 12) {
    let n = 1e9; for (const q of pts) n = Math.min(n, Math.hypot(x - q.x, y - q.y));
    if (n > 24) return { x, y, sep: n };
  }
  return null;
}

let pts4 = await page.evaluate(() => window.__oficina.projMalha());
const { v: alvoV, sep } = escolherVertice(pts4);
const vazio = pontoVazio(pts4);

// (4a) SELECIONA: hit a ≤10px seleciona AQUELE vértice; >10px de todos não seleciona
const idNoPonto = await page.evaluate(([x, y]) => window.__oficina.hit(x, y), [alvoV.x + 8, alvoV.y]);
const idVazio = await page.evaluate(([x, y]) => window.__oficina.hit(x, y), [vazio.x, vazio.y]);
ok('(4a) hit a ≤10px de um vértice acerta AQUELE vértice', idNoPonto === alvoV.id, `hit(${Math.round(alvoV.x + 8)},${Math.round(alvoV.y)})=${idNoPonto} (vértice ${alvoV.id}, vizinho a ${sep.toFixed(0)}px)`);
ok('(4a) hit em espaço vazio (>10px) não acerta vértice', idVazio === null, `hit(${vazio.x},${vazio.y})=${idVazio} · vazio a ${vazio.sep.toFixed(0)}px do vértice mais perto`);

// (4f) CLIQUE SÓ SELECIONA: down+up com micro-movimento (<limiar) seleciona mas NÃO grava
const nP_antesClique = await page.evaluate(() => window.__oficina.nPassos());
await page.mouse.move(alvoV.x, alvoV.y);
await page.mouse.down();
const selNoDown = await page.evaluate(() => window.__oficina.selecionado());
await page.mouse.move(alvoV.x + 2, alvoV.y + 1, { steps: 2 });   // 2.2px < limiar 4px
await page.mouse.up();
const nP_depoisClique = await page.evaluate(() => window.__oficina.nPassos());
ok('(4a) pointerdown SELECIONA o vértice (selecionado exposto)', selNoDown === alvoV.id, `selecionado=${selNoDown}`);
ok('(4f) clique sem arrasto NÃO grava moveV (só seleciona)', nP_depoisClique === nP_antesClique, `PASSOS ${nP_antesClique} -> ${nP_depoisClique} (limiar ${await page.evaluate(() => window.__oficina.limiar)}px)`);

// (4e) CÂMERA INTACTA: arrasto em espaço VAZIO ainda ORBITA (passo 2 segue valendo), cursor livre
await page.evaluate((f) => window.__oficina.orbitar(f), F4);
await rAF2();
const estAntes = await page.evaluate(() => window.__oficina.estado());
await page.mouse.move(vazio.x, vazio.y);
await page.mouse.down();
const travadoNoArrasto = await page.evaluate(() => window.__oficina.travado());
await page.mouse.move(vazio.x + 180, vazio.y + 20, { steps: 14 });
await page.mouse.up();
const estDepois = await page.evaluate(() => window.__oficina.estado());
const nP_depoisVazio = await page.evaluate(() => window.__oficina.nPassos());
ok('(4e) arrasto em espaço vazio ORBITA (câmera idêntica ao passo 2)', Math.abs(estDepois.az - estAntes.az) > 0.5, `az ${estAntes.az.toFixed(2)} -> ${estDepois.az.toFixed(2)}`);
ok('(4e) arrasto de câmera não grava moveV', nP_depoisVazio === nP_depoisClique, `PASSOS ${nP_depoisClique} -> ${nP_depoisVazio}`);
ok('(4e) cursor LIVRE durante o arrasto de câmera (pointerLock null)', travadoNoArrasto === null);

// (4b/4c) SEGUE O CURSOR + GRAVA: volta pra câmera limpa, pega o vértice, arrasta (Δx,Δy),
//         projeta DEPOIS e mede o erro; confere o moveV gravado.
await page.evaluate((f) => window.__oficina.orbitar(f), F4);
await rAF2(); await rAF2();
pts4 = await page.evaluate(() => window.__oficina.projMalha());
const alvo2 = escolherVertice(pts4).v;   // re-projeta (a câmera é a mesma F4, mas relê fresco)
const pos0 = await page.evaluate((id) => window.__oficina.posV(id), alvo2.id);
const nP_antesGrava = await page.evaluate(() => window.__oficina.nPassos());
const DX = 82, DY = -56;
await page.mouse.move(alvo2.x, alvo2.y);
await page.mouse.down();
await page.mouse.move(alvo2.x + DX, alvo2.y + DY, { steps: 16 });
await page.mouse.up();
const soltouEm = { x: alvo2.x + DX, y: alvo2.y + DY };
const projDepois = await page.evaluate((id) => window.__oficina.projetarV(id), alvo2.id);
const erroSegue = Math.hypot(projDepois.x - soltouEm.x, projDepois.y - soltouEm.y);
ok('(4b) o vértice SEGUE o cursor (projeção pós-arrasto cai onde soltou)', erroSegue <= 3,
   `vértice caiu em (${projDepois.x.toFixed(1)},${projDepois.y.toFixed(1)}) · cursor soltou em (${soltouEm.x},${soltouEm.y}) · erro ${erroSegue.toFixed(2)}px`);
// sinal: cursor pra direita+cima -> vértice pra direita+cima na tela
ok('(4b) sinal correto (direita/cima do cursor = direita/cima do vértice)',
   projDepois.x > alvo2.x + 20 && projDepois.y < alvo2.y - 10, `Δtela (${(projDepois.x - alvo2.x).toFixed(0)},${(projDepois.y - alvo2.y).toFixed(0)})px`);

const nP_depoisGrava = await page.evaluate(() => window.__oficina.nPassos());
const ultimo = await page.evaluate(() => window.__oficina.ultimoPasso());
const dGrav = ultimo && ultimo[1] && ultimo[1].d;
const magD = dGrav ? Math.hypot(dGrav[0], dGrav[1], dGrav[2]) : 0;
ok('(4c) GRAVOU um moveV (PASSOS cresceu 1, último é moveV do vértice)',
   nP_depoisGrava === nP_antesGrava + 1 && ultimo && ultimo[0] === 'moveV' && ultimo[1].v === alvo2.id && magD > 0.01,
   `PASSOS ${nP_antesGrava} -> ${nP_depoisGrava} · último ${JSON.stringify(ultimo)} · |d|=${magD.toFixed(3)}`);

// (4d) REPLAY: a lista EDITADA re-executada 2× dá o MESMO neutro canônico —
//      na PÁGINA e, à parte, em NODE (núcleo importado) — e batem entre si.
const passosEd = await page.evaluate(() => window.__oficina.passos());
const canonPage1 = await page.evaluate(() => JSON.stringify(window.__oficina.canon()));
const canonPage2 = await page.evaluate(() => JSON.stringify(window.__oficina.canon()));
const canonNode = (ps) => JSON.stringify(neutroCanonico(nucleo(ps, toco.PARAMS, toco.TOPO)));
const canonNode1 = canonNode(passosEd), canonNode2 = canonNode(passosEd);
ok('(4d) replay na PÁGINA 2× idêntico (determinístico)', canonPage1 === canonPage2);
ok('(4d) replay em NODE 2× idêntico (mesmo núcleo, fora do browser)', canonNode1 === canonNode2);
ok('(4d) página e Node produzem o MESMO neutro (a lista editada refaz o objeto igual)', canonPage1 === canonNode1,
   `canônico ${canonPage1.length} chars, bit-a-bit igual`);
// o vértice movido está na posição NOVA, não na original
const Vcanon = JSON.parse(canonPage1).V;
const eV = Vcanon.find((e) => e[0] === alvo2.id);
const posNova = [eV[1], eV[2], eV[3]];
const desloc = Math.hypot(posNova[0] - pos0[0], posNova[1] - pos0[1], posNova[2] - pos0[2]);
const posV_agora = await page.evaluate((id) => window.__oficina.posV(id), alvo2.id);
const casaComOverlay = Math.hypot(posNova[0] - posV_agora[0], posNova[1] - posV_agora[1], posNova[2] - posV_agora[2]);
ok('(4d) o vértice movido está na posição NOVA, não na original', desloc > 0.05 && casaComOverlay < 1e-9,
   `original ${JSON.stringify(pos0.map((n) => +n.toFixed(3)))} -> nova ${JSON.stringify(posNova.map((n) => +n.toFixed(3)))} (deslocou ${desloc.toFixed(3)} em mundo)`);

// (4g) REGRESSÃO (passe adversarial): a roda do mouse DURANTE o arrasto de vértice
//      é IGNORADA. Senão a câmera zooma com a escala do arrasto congelada e grava um
//      moveV com escala velha — o vértice deriva do cursor. Guarda: `if (arrasto) return`.
await page.evaluate((f) => window.__oficina.orbitar(f), F4);
await rAF2(); await rAF2();
const pts4g = await page.evaluate(() => window.__oficina.projMalha());
const alvo4g = escolherVertice(pts4g).v;
const distAntes4g = await page.evaluate(() => window.__oficina.estado().dist);
await page.mouse.move(alvo4g.x, alvo4g.y);
await page.mouse.down();
await page.mouse.wheel(0, -300);            // tenta ZOOMAR no meio do arrasto de vértice
await rAF2();
const distDurante4g = await page.evaluate(() => window.__oficina.estado().dist);
await page.mouse.move(alvo4g.x + 70, alvo4g.y - 40, { steps: 12 });
await page.mouse.up();
const soltou4g = { x: alvo4g.x + 70, y: alvo4g.y - 40 };
const proj4g = await page.evaluate((id) => window.__oficina.projetarV(id), alvo4g.id);
const erro4g = Math.hypot(proj4g.x - soltou4g.x, proj4g.y - soltou4g.y);
ok('(4g) roda IGNORADA durante o arrasto de vértice (dist não muda)', Math.abs(distDurante4g - distAntes4g) < 1e-9,
   `dist ${distAntes4g.toFixed(3)} -> ${distDurante4g.toFixed(3)}`);
ok('(4g) e o vértice ainda SEGUE o cursor apesar da roda (escala não corrompida)', erro4g <= 3,
   `erro ${erro4g.toFixed(2)}px`);

// screenshot: a malha DEFORMADA (vértice arrastado) — o milestone visível
mkdirSync(OUT4, { recursive: true });
await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })); });   // etiquetas de id ligadas
await rAF2();
await page.screenshot({ path: join(OUT4, 'oficina-vertice-arrastado.png') });

/* ==== PASSO 5: DESFAZER e REFAZER (em cima do passo 4) ======================
   Como toda edição é uma operação no FIM de PASSOS, desfazer = tirar a última e
   reexec; refazer = pôr de volta. A prova é por MEDIÇÃO do neutro CANÔNICO (o
   replay determinístico): ao desfazer, tem que bater BIT-A-BIT com o de ANTES do
   arrasto; ao refazer, com o de DEPOIS. As teclas são REAIS (page.keyboard →
   eventos confiáveis do Chromium), não sintéticas. */
await page.evaluate((f) => window.__oficina.orbitar(f), F4);
await rAF2(); await rAF2();

// atalhos de tecla REAIS (eventos confiáveis) + leitura de estado por gancho
const ctrlZ = async () => { await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control'); await rAF2(); };
const ctrlY = async () => { await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control'); await rAF2(); };
const ctrlShiftZ = async () => { await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Shift'); await page.keyboard.up('Control'); await rAF2(); };
const canon = () => page.evaluate(() => JSON.stringify(window.__oficina.canon()));
const nP = () => page.evaluate(() => window.__oficina.nPassos());
const nRedo = () => page.evaluate(() => window.__oficina.nRedo());
// arrasta o vértice mais isolado por (dx,dy) e grava um moveV; devolve o id
async function arrastarVertice(dx, dy) {
  const pts = await page.evaluate(() => window.__oficina.projMalha());
  const a = escolherVertice(pts).v;
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + dx, a.y + dy, { steps: 14 }); await page.mouse.up();
  await rAF2();
  return a.id;
}

// (5 teclas) as três combinações chamam preventDefault (o navegador rouba o
// Ctrl+Z); a tecla `i` NÃO. Evento cancelável → defaultPrevented prova a guarda.
// (Muta o desfazer/refazer, mas o baseline é recomposto logo abaixo.)
const zPrev = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
const yPrev = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
const zsPrev = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
const iPrev = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'i', cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
ok('(5 teclas) Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z chamam preventDefault', zPrev && yPrev && zsPrev, `z ${zPrev} · y ${yPrev} · shift+z ${zsPrev}`);
ok('(5 teclas) a tecla i (etiquetas) NÃO é interceptada (sem conflito de tecla)', iPrev === false, `i defaultPrevented ${iPrev}`);

// PISO + volta ao baseline: Ctrl+Z repetido desfaz o que o passo 4 gravou e PARA
// exatamente no baseline (a construção da peça, vinda do arquivo, não se desfaz).
const baseN = await page.evaluate(() => window.__oficina.baseline());
let guard = 0;
while ((await nP()) > baseN && guard++ < 60) await ctrlZ();
const nLimpo = await nP();
ok('(5) Ctrl+Z desfaz as edições da sessão até o BASELINE', nLimpo === baseN, `PASSOS ${nLimpo} == baseline ${baseN}`);
const canonBase = await canon();   // neutro do baseline (a peça pura do arquivo)
// prova NÃO-circular: o baseline reproduz o objeto PRISTINO do arquivo (Node à parte)
const canonNodeBase = JSON.stringify(neutroCanonico(nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO)));
ok('(5) desfazer até o baseline reproduz a peça PURA do arquivo (página == Node pristino)', canonBase === canonNodeBase, `canônico ${canonBase.length} chars, bit-a-bit igual ao arquivo`);
// PISO: no baseline, mais um Ctrl+Z é NO-OP (PASSOS e neutro intactos)
await ctrlZ();
const nPiso = await nP(), canonPiso = await canon();
ok('(5 piso) no baseline, Ctrl+Z é NO-OP (não remove passo da peça)', nPiso === baseN && canonPiso === canonBase, `PASSOS ${nPiso}, neutro ${canonPiso === canonBase ? 'idêntico' : 'MUDOU'}`);

// (5 desfaz) arrasta (baseline→+1) e Ctrl+Z volta ao baseline com o neutro de ANTES
const nAntes = await nP();                     // == baseline
const canonAntes = await canon();              // == canonBase
const idA = await arrastarVertice(84, -52);    // grava 1 moveV (LIMPA o redo)
const nDepois = await nP();
const canonDepois = await canon();
ok('(5 desfaz) o arrasto gravou (PASSOS baseline→+1)', nDepois === nAntes + 1, `PASSOS ${nAntes} -> ${nDepois} (vértice ${idA})`);
ok('(5 desfaz) o arrasto MUDOU o neutro (edição de verdade)', canonDepois !== canonAntes);
ok('(5 desfaz) a edição nova LIMPOU o redo', (await nRedo()) === 0, `redo ${await nRedo()}`);
await ctrlZ();
const nPosUndo = await nP(), canonPosUndo = await canon();
ok('(5 desfaz) Ctrl+Z volta PASSOS ao baseline', nPosUndo === nAntes, `PASSOS ${nDepois} -> ${nPosUndo}`);
ok('(5 desfaz) e o neutro canônico VOLTA a bater BIT-A-BIT com o de ANTES do arrasto', canonPosUndo === canonAntes, `${canonPosUndo === canonAntes ? 'idêntico' : 'DIVERGE'}`);
ok('(5 desfaz) desfazer encheu o redo (1 pra refazer)', (await nRedo()) === 1, `redo ${await nRedo()}`);

// (5 refaz) Ctrl+Y devolve o passo e o neutro bate com o de DEPOIS
await ctrlY();
const nPosRedo = await nP(), canonPosRedo = await canon();
ok('(5 refaz) Ctrl+Y refez (PASSOS +1)', nPosRedo === nDepois, `PASSOS ${nPosUndo} -> ${nPosRedo}`);
ok('(5 refaz) e o neutro bate BIT-A-BIT com o de DEPOIS do arrasto', canonPosRedo === canonDepois, `${canonPosRedo === canonDepois ? 'idêntico' : 'DIVERGE'}`);
// o atalho ALTERNATIVO Ctrl+Shift+Z também refaz: desfaz e refaz por ele
await ctrlZ();
ok('(5 refaz) Ctrl+Z de novo volta ao baseline', (await canon()) === canonAntes);
await ctrlShiftZ();
ok('(5 refaz) Ctrl+Shift+Z também refaz (alternativa de Ctrl+Y)', (await nP()) === nDepois && (await canon()) === canonDepois, `PASSOS ${await nP()}, neutro ${(await canon()) === canonDepois ? 'idêntico' : 'DIVERGE'}`);

// (5 limpa) edição NOVA invalida o refazer: arrasta, Ctrl+Z, arrasta de novo →
// redo vazio, e Ctrl+Y não ressuscita a 1ª desfeita.
await ctrlZ();                                  // volta ao baseline; redo = [moveV idA]
const redoAposUndo = await nRedo();
const idC = await arrastarVertice(-72, 44);     // edição NOVA → deve LIMPAR o redo
const redoAposNova = await nRedo();
ok('(5 limpa) após desfazer, o redo tinha 1', redoAposUndo === 1, `redo ${redoAposUndo}`);
ok('(5 limpa) a edição nova LIMPA o redo (fica 0)', redoAposNova === 0, `redo ${redoAposNova} (vértice ${idC})`);
const nAntesNoop = await nP(), canonAntesNoop = await canon();
await ctrlY();                                   // redo vazio → no-op: não traz a 1ª de volta
ok('(5 limpa) Ctrl+Y com redo vazio é NO-OP (não ressuscita a edição desfeita)', (await nP()) === nAntesNoop && (await canon()) === canonAntesNoop, `PASSOS ${await nP()}, neutro ${(await canon()) === canonAntesNoop ? 'intacto' : 'MUDOU'}`);

// (5 vários) 3 arrastos → 3 desfaz → baseline; 3 refaz → neutro idêntico aos 3
guard = 0;
while ((await nP()) > baseN && guard++ < 60) await ctrlZ();
ok('(5 vários) partindo do baseline', (await nP()) === baseN, `PASSOS ${await nP()}`);
const canonV0 = await canon();
await arrastarVertice(62, -38); await arrastarVertice(-54, -28); await arrastarVertice(46, 52);
const nTres = await nP(), canonTres = await canon();
ok('(5 vários) 3 arrastos somam 3 passos', nTres === baseN + 3, `PASSOS ${baseN} -> ${nTres}`);
await ctrlZ(); await ctrlZ(); await ctrlZ();
ok('(5 vários) 3 Ctrl+Z voltam ao baseline', (await nP()) === baseN, `PASSOS ${nTres} -> ${await nP()}`);
ok('(5 vários) e o neutro bate com o baseline', (await canon()) === canonV0, `${(await canon()) === canonV0 ? 'idêntico' : 'DIVERGE'}`);
await ctrlY(); await ctrlY(); await ctrlY();
ok('(5 vários) 3 refaz reconstroem os 3 passos', (await nP()) === nTres, `PASSOS ${await nP()}`);
ok('(5 vários) e o neutro é IDÊNTICO ao estado com os 3 arrastos', (await canon()) === canonTres, `${(await canon()) === canonTres ? 'idêntico' : 'DIVERGE'}`);

// status reflete desfazer/refazer (feedback visível): "passos N · desfazer M · refazer K"
const statusTxt = await page.evaluate(() => document.getElementById('passos').textContent);
ok('(5 status) a barra mostra passos/desfazer/refazer', /passos \d+ · desfazer \d+ · refazer \d+/.test(statusTxt), `"${statusTxt}"`);

// (5 guarda) desfazer NÃO age no meio de um arrasto de vértice — senão a lista muda
//   com um moveV tentativo em voo e o commit cai numa lista encurtada (mesma classe
//   da brecha da roda no passo 4). Com PASSOS acima do baseline (há o que desfazer),
//   um Ctrl+Z DURANTE o arrasto tem que ser NO-OP.
const nAntesG = await page.evaluate(() => window.__oficina.nPassos());
const ptsG = await page.evaluate(() => window.__oficina.projMalha());
const alvoG = escolherVertice(ptsG).v;
await page.mouse.move(alvoG.x, alvoG.y);
await page.mouse.down();
await page.mouse.move(alvoG.x + 34, alvoG.y - 22, { steps: 6 });   // arrasto EM CURSO (não soltou)
await page.keyboard.press('Control+z');                            // tenta desfazer no meio
const nDuranteG = await page.evaluate(() => window.__oficina.nPassos());
await page.mouse.up();                                             // solta (aí sim commita)
ok('(5 guarda) Ctrl+Z no meio de um arrasto é IGNORADO (não desfaz com edição em voo)',
   nDuranteG === nAntesG && nAntesG > 10, `PASSOS durante o arrasto: ${nAntesG} -> ${nDuranteG} (baseline 10)`);

// screenshot do estado com os 3 refeitos — o milestone do passo 5 visível
mkdirSync(OUT5, { recursive: true });
await page.evaluate(() => { const e = document.getElementById('passos'); e.style.color = '#f9c22b'; });
await rAF2();
await page.screenshot({ path: join(OUT5, 'oficina-desfazer-refazer.png') });

await browser.close();
server.close();

console.log(`\n  screenshots: ${join(OUT, 'oficina-antes.png')}\n               ${join(OUT, 'oficina-depois.png')}\n               ${join(OUT3, 'oficina-malha.png')}\n               ${join(OUT3, 'oficina-malha-ids.png')}\n               ${join(OUT4, 'oficina-vertice-arrastado.png')}\n               ${join(OUT5, 'oficina-desfazer-refazer.png')}`);
if (falhas.length) { console.error(`\nBANCADA FALHOU — ${falhas.length}: ${falhas.join('; ')}`); process.exit(1); }
console.log(`\nBANCADA OK — passo 2: órbita/pan/zoom + cursor livre + objeto centrado (piso ${pisoDiff}px, gesto ${gestoDiff}px); passo 3: overlay da malha (${N_VERT} vértices, arestas das ${N_FACE} faces) alinhado sobre o objeto; passo 4: seleciona + arrasta (segue o cursor a ${erroSegue.toFixed(2)}px) + grava moveV + replay da lista editada idêntico (página == Node) + câmera intacta no vazio; passo 5: desfazer/refazer (Ctrl+Z/Y/Shift+Z, baseline ${baseN}) — neutro canônico bate bit-a-bit com antes/depois, piso do baseline no-op, edição nova limpa o redo, 3 arrastos↔3 desfaz↔3 refaz idêntico.`);
