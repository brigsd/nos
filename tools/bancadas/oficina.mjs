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
 *   PASSO 6 (gizmo de eixos + painel — window.__oficina.gizmo/hitGizmo/painel):
 *   (6 aparece) sem seleção o gizmo é vazio; com um vértice selecionado saem 3
 *        setas X/Y/Z da MESMA base (o vértice projetado), nas cores certas;
 *   (6 travado k) arrasta a seta k (46px no eixo + 26px PERPENDICULAR) e o moveV
 *        gravado tem d NO EIXO k com VAZAMENTO ~0 nos outros dois (número real);
 *   (6 segue k) o vértice projetado anda AO LONGO da seta ≈ o quanto o cursor
 *        avançou no eixo (o perpendicular é descartado, mede-se along/perp);
 *   (6 trava) seta que aponta ~pra câmera (compr<12px/un) fica apagada e NÃO
 *        aceita arrasto (hitGizmo não a devolve);
 *   (6 integra) o arrasto do gizmo é a MESMA máquina (emArrasto.eixo != null), a
 *        roda e o Ctrl+Z DURANTE ele são ignorados (guardas do passo 4/5 cobrem),
 *        o arrasto LIVRE (centro do vértice, zona morta) e a câmera no vazio
 *        seguem passando, e o replay da lista editada bate página == Node;
 *   (6 painel) #props reflete o vértice (id + x,y,z, batendo com o mundo) e a
 *        caixa (largura/altura/profundidade), de LEITURA durante o arrasto;
 *   (6 valor) digitar X move o vértice pro alvo no eixo (d = alvo − atual).
 *   PASSO 7 (extrudar UMA face pelo handle da normal — hitFace/handleFace/extrude):
 *   (7 hit) clicar dentro de uma face a SELECIONA (modo face, limpa o vértice); e
 *        onde DUAS faces se sobrepõem na tela, hitFace pega a da FRENTE (menor
 *        profundidade de centroide) — provado por facesNoPonto (>=2 faces, front
 *        com menor prof); clicar num vértice depois volta pro modo vértice;
 *   (7 clique) clicar numa face sem passar do limiar SÓ seleciona, NÃO grava;
 *   (7 extrude) arrastar o handle da normal grava ['extruda',{face,dist}] no fim de
 *        PASSOS; dist·compr bate (≤ poucos px) o avanço do cursor na normal e, DEPOIS,
 *        o centroide da face projetado avança esse tanto (não-circular: o núcleo
 *        levou a tampa pra onde o handle apontava); o anel novo nasce nos ids do
 *        BLOCO do passo (idx·1000);
 *   (7 replay) a lista editada re-executada dá o MESMO neutro canônico (página ==
 *        Node à parte), como nos passos 4-6;
 *   (7 undo/redo) Ctrl+Z tira o extrude (neutro volta BIT-A-BIT ao de antes),
 *        Ctrl+Y devolve (bate com o de depois);
 *   (7 guardas) roda e Ctrl+Z DURANTE o arrasto do extrude são IGNORADOS (as
 *        guardas do passo 4/5 já cobrem — é a MESMA máquina), dist/lista intactos;
 *   (7 trava) face com a normal ~pra câmera: handle TRAVADO (compr<12px/un), hitHandle
 *        não pega, e arrastar ali NÃO extruda; a mesma face de través NÃO trava.
 *
 *   PASSO 8 (mesclar vértices + ímã — selecao/ativo/mesclar/imaAlvo, eventos REAIS):
 *   (8 multi) clique normal seleciona UM; Shift+clique ACUMULA (2, 3), o ativo é o
 *        último; Shift+clique num já-selecionado REMOVE; clique normal RESETA pra 1;
 *        selecionar uma FACE limpa a multi-seleção (XOR);
 *   (8 mescla) tecla M (e o botão do painel) com 2+ selecionados grava
 *        ['mescla',{de:[não-ativos],para:ATIVO}] no fim de PASSOS — a contagem de
 *        vértices cai, o `para` mantém a posição, as faces que usavam `de` passam a
 *        usar `para`, e a seleção vira só o `para`;
 *   (8 replay) a lista editada re-executada dá o MESMO neutro canônico (página ==
 *        Node), o critério do doc pra a operação "mais delicada";
 *   (8 undo/redo) Ctrl+Z tira a mescla (os 2 vértices VOLTAM bit-a-bit), Ctrl+Y devolve;
 *   (8 ímã) Ctrl+arrasto de A com o cursor sobre B → o moveV gravado põe A na posição
 *        EXATA de B (erro ≤ 1e-6 em mundo; d = posB − posOriginal), e imaAlvo aponta B
 *        durante o arrasto; SEM Ctrl, imaAlvo é null e A cai onde o cursor soltou (sem cola);
 *   (8 guarda) Ctrl+Z e a roda DURANTE o arrasto-com-ímã são IGNORADOS (guardas do
 *        passo 4/5, MESMA máquina); segurar Ctrl sozinho não desfaz;
 *   (8 área-zero) mesclar dois cantos ADJACENTES de uma face (o triângulo da parede
 *        1001) → o núcleo apaga a face de área-zero QUIETO (sem órfão), o replay segue
 *        idêntico e o resto da malha (V/F das outras faces) fica INTACTO.
 *
 *   PASSO 9 (pintar faces — selecaoFaces/faceAtiva/pintar/corDaFace/paleta, eventos REAIS):
 *   (9 multi) clique normal numa FACE seleciona UMA; Shift+clique ACUMULA (2, 3), a
 *        ativa é a última; Shift+clique numa já-selecionada REMOVE; clique normal RESETA
 *        pra 1; selecionar um VÉRTICE limpa as faces e selecionar face limpa vértices (XOR);
 *   (9 pinta) o `change` do <input type=color> grava ['pincel',{modo:'face',faces:[9],
 *        cor:'#hex'}] no fim de PASSOS — neutro.F.get(9).cor vira a cor, uma face NÃO
 *        selecionada fica intacta;
 *   (9 render) DEPOIS do reexec a cor aparece no render: a paleta REAL do swatch (pixels
 *        que o motor sobe pra GPU) passa a conter o hex, E um probe de pixel do topo pintado
 *        vira azul (b>r) onde antes era madeira (r>b) — não é só no dado;
 *   (9 replay) a lista editada re-executada dá o MESMO neutro canônico (página == Node);
 *   (9 undo/redo) Ctrl+Z tira o pincel (a face volta bit-a-bit à cor de antes), Ctrl+Y devolve;
 *   (9 várias) 3 faces selecionadas + 1 preset → 1 passo pincel com as 3 faces ORDENADAS,
 *        todas com a cor;
 *   (9 guarda) pintar no meio de um arrasto (extrude em curso) é IGNORADO (PASSOS não muda);
 *   (9 bordas) pintar a cor que a face já mostra é NO-OP (sem passo fantasma; null conta
 *        como COR_PADRAO), e pintar uma face SEM cor prévia (parede recém-extrudada, cor
 *        null) grava normalmente (null → hex).
 * Screenshots em scratchpad/passo2..9/. Sai 1 se algo falhar.
 *
 *   npm run oficina
 */
import { createServer } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve, extname, relative, sep as pathSep } from 'node:path';
import zlib from 'node:zlib';
import { criarServidor } from '../servir.mjs';   // PASSO 10: o servidor de dev REAL (grava em pecas/ + no-store) — a bancada o sobe com pecas/ num dir TEMP
/* PASSO 4: replay INDEPENDENTE em Node — o núcleo neutro e o canônico, mais
   PARAMS/TOPO do toco, pra re-executar a lista EDITADA (vinda do navegador) e
   provar que refaz o mesmo objeto (o critério do doc), fora do browser. */
import { nucleo, neutroCanonico, adaptarV3, executar, montarAnimar, avaliarChaves } from '../../prototipos/fps/v3/motor/oficina.js';   // PASSO 11a: adaptarV3 headless (ctx de mentira) pra medir a estrutura do atlas; 13a: executar/montarAnimar/avaliarChaves pra a animação rígida por parte
import * as toco from '../../prototipos/fps/v3/pecas/_oficina-toco.js';
import * as anim from '../../prototipos/fps/v3/pecas/_oficina-anim.js';   // PASSO 13a: a peça-exemplo da animação (engrenagem gira + braço balança)

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = resolve(REPO, 'scratchpad/passo2');
const OUT3 = resolve(REPO, 'scratchpad/passo3');
const OUT4 = resolve(REPO, 'scratchpad/passo4');
const OUT5 = resolve(REPO, 'scratchpad/passo5');
const OUT6 = resolve(REPO, 'scratchpad/passo6');
const OUT7 = resolve(REPO, 'scratchpad/passo7');
const OUT8 = resolve(REPO, 'scratchpad/passo8');
const OUT9 = resolve(REPO, 'scratchpad/passo9');
const OUT10 = resolve(REPO, 'scratchpad/passo10');
const OUT11 = resolve(REPO, 'scratchpad/passo11a');
const OUT11C = resolve(REPO, 'scratchpad/passo11c');
const OUT12 = resolve(REPO, 'scratchpad/passo12a');
const OUT13 = resolve(REPO, 'scratchpad/passo13a');
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

/* ==== PASSO 6: GIZMO DE EIXOS + PAINEL LATERAL =============================
   O gizmo (3 setas X/Y/Z no vértice selecionado) arrasta TRAVADO num eixo,
   reusando a MESMA máquina arrasto/malhaCtl/reexec do passo 4. A prova é por
   MEDIÇÃO: o moveV gravado tem d NO EIXO (vaza ~0 nos outros); o vértice anda AO
   LONGO da seta conforme o cursor projetado nela; a roda e o Ctrl+Z DURANTE o
   arrasto do gizmo são ignorados (as guardas de passo 4/5 já cobrem); e o painel
   reflete o vértice + a caixa, de leitura durante o arrasto. */
const F6 = { az: 0.7, el: 0.45, dist: 1.95, alvo: [0, 0.28, 0] };
const RH = await page.evaluate(() => window.__oficina.raioHit);       // = GIZMO_MORTO (zona morta na base)
const GTRAVA = await page.evaluate(() => window.__oficina.gizmoTrava); // px/un abaixo disto a seta trava
const IEIXO = { x: 0, y: 1, z: 2 };
const clicarV = async (v) => { await page.mouse.move(v.x, v.y); await page.mouse.down(); await page.mouse.move(v.x + 1, v.y + 1, { steps: 2 }); await page.mouse.up(); await rAF2(); };

// (6 aparece) SEM seleção não há gizmo; COM seleção, 3 setas X/Y/Z na base do vértice
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
const gizVazio = await page.evaluate(() => window.__oficina.gizmo());
ok('(6 aparece) sem vértice selecionado, NÃO há gizmo', gizVazio.length === 0, `${gizVazio.length} setas`);
let pts6 = await page.evaluate(() => window.__oficina.projMalha());
let alvo6 = escolherVertice(pts6).v;
await clicarV(alvo6);
const giz = await page.evaluate(() => window.__oficina.gizmo());
const eixosVistos = giz.map((s) => s.k).sort().join('');
const baseComum = giz.length > 0 && giz.every((s) => Math.hypot(s.o2.x - giz[0].o2.x, s.o2.y - giz[0].o2.y) < 0.01);
const corDe = (k) => (giz.find((s) => s.k === k) || {}).cor;
ok('(6 aparece) vértice selecionado mostra 3 setas X/Y/Z (segmentos projetados)', giz.length === 3 && eixosVistos === 'xyz', `setas ${giz.map((s) => `${s.k}:${Math.round(s.seg)}px`).join(' ')}`);
ok('(6 aparece) as 3 setas partem da MESMA base (o vértice projetado)', baseComum);
ok('(6 aparece) a base cai NO vértice selecionado', giz.length === 3 && Math.hypot(giz[0].o2.x - alvo6.x, giz[0].o2.y - alvo6.y) < 2, `base (${giz[0]?.o2.x.toFixed(1)},${giz[0]?.o2.y.toFixed(1)}) vs vértice (${alvo6.x.toFixed(1)},${alvo6.y.toFixed(1)})`);
ok('(6 aparece) cores X vermelho / Y verde / Z azul', corDe('x') === '#ff5a52' && corDe('y') === '#46d67f' && corDe('z') === '#5a8bff', `${corDe('x')} / ${corDe('y')} / ${corDe('z')}`);

// (6 travado + segue) arrasta cada seta e mede: d NO EIXO (vaza ~0), vértice anda AO LONGO da seta
async function arrastarSeta(k, alongPx, perpPx) {
  const segs = await page.evaluate(() => window.__oficina.gizmo());
  const s = segs.find((z) => z.k === k);
  const off = Math.max(RH + 6, Math.min(s.seg - 6, 34));                // ponto no cabo, fora da zona morta
  const g = { x: s.o2.x + s.dir[0] * off, y: s.o2.y + s.dir[1] * off };
  const perp = [-s.dir[1], s.dir[0]];
  const dest = { x: g.x + s.dir[0] * alongPx + perp[0] * perpPx, y: g.y + s.dir[1] * alongPx + perp[1] * perpPx };
  const id = await page.evaluate(() => window.__oficina.selecionado());
  const hit = await page.evaluate(([x, y]) => window.__oficina.hitGizmo(x, y), [g.x, g.y]);
  await page.mouse.move(g.x, g.y); await page.mouse.down();
  const emA = await page.evaluate(() => window.__oficina.emArrasto());
  await page.mouse.move(dest.x, dest.y, { steps: 16 }); await page.mouse.up(); await rAF2();
  const ultimo = await page.evaluate(() => window.__oficina.ultimoPasso());
  const projDepois = await page.evaluate((vid) => window.__oficina.projetarV(vid), id);
  return { o2: s.o2, dir: s.dir, perp, hit, emA, ultimo, projDepois };
}
const vazamentos = {};
for (const k of ['x', 'y', 'z']) {
  await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2(); await rAF2();
  pts6 = await page.evaluate(() => window.__oficina.projMalha());
  alvo6 = escolherVertice(pts6).v;
  await clicarV(alvo6);
  const r = await arrastarSeta(k, 46, 26);   // 46px AO LONGO do eixo + 26px PERPENDICULAR (tem que ser descartado)
  const d = r.ultimo && r.ultimo[0] === 'moveV' && r.ultimo[1] && r.ultimo[1].d;
  const idx = IEIXO[k];
  const noEixo = d ? Math.abs(d[idx]) : 0;
  const vaza = d ? [0, 1, 2].filter((i) => i !== idx).reduce((s, i) => s + Math.abs(d[i]), 0) : 999;
  vazamentos[k] = vaza;
  ok(`(6 travado ${k.toUpperCase()}) hitGizmo pegou a seta e o arrasto é TRAVADO no eixo`,
     r.hit === k && r.emA && !!r.emA.eixo, `hit=${r.hit} · emArrasto.eixo=${JSON.stringify(r.emA && r.emA.eixo)}`);
  ok(`(6 travado ${k.toUpperCase()}) o moveV gravado tem d NO EIXO ${k.toUpperCase()} — vaza ${vaza.toExponential(2)} nos outros`,
     noEixo > 0.02 && vaza < 1e-9, `d=[${d ? d.map((n) => n.toFixed(4)).join(', ') : '?'}] · |eixo ${k}|=${noEixo.toFixed(4)}`);
  const dxp = r.projDepois.x - r.o2.x, dyp = r.projDepois.y - r.o2.y;
  const along = dxp * r.dir[0] + dyp * r.dir[1], perp = dxp * r.perp[0] + dyp * r.perp[1];
  ok(`(6 segue ${k.toUpperCase()}) o vértice anda AO LONGO da seta conforme o cursor projetado nela`,
     Math.abs(along - 46) <= 6 && Math.abs(perp) <= 3, `along ${along.toFixed(1)}px (cursor 46) · perp ${perp.toFixed(2)}px`);
}

// (6 trava) olhando QUASE PELO eixo X (az≈90°, el 0) e de LONGE, a seta X aponta
//   ~pra câmera e projeta pouquíssimo px por unidade: fica APAGADA (compr<12px/un)
//   e NÃO aceita arrasto — senão o avanço = mouse/compr dispararia pro infinito.
await page.evaluate(() => window.__oficina.orbitar({ az: Math.PI / 2, el: 0, dist: 10, alvo: [0, 0.28, 0] })); await rAF2(); await rAF2();
const ptsEdge = await page.evaluate(() => window.__oficina.projMalha());
const alvoEdge = escolherVertice(ptsEdge).v;
await page.evaluate((id) => window.__oficina.selecionar(id), alvoEdge.id); await rAF2();
const gizEdge = await page.evaluate(() => window.__oficina.gizmo());
const sX = gizEdge.find((z) => z.k === 'x');
ok('(6 trava) olhando ~pelo eixo X, a seta X fica TRAVADA (compr < 12px/un, apagada)',
   !!sX && sX.travada && sX.compr < GTRAVA, `X compr ${sX ? sX.compr.toFixed(1) : '?'}px/un (limiar ${GTRAVA})`);
// e os OUTROS eixos, de través, seguem grabáveis (a trava é só da seta edge-on)
const sZedge = gizEdge.find((z) => z.k === 'z');
ok('(6 trava) as outras setas (Z de través) NÃO travam', !!sZedge && !sZedge.travada, `Z compr ${sZedge ? sZedge.compr.toFixed(1) : '?'}px/un`);
const meioX = sX ? { x: sX.o2.x + sX.dir[0] * sX.seg * 0.5, y: sX.o2.y + sX.dir[1] * sX.seg * 0.5 } : { x: 0, y: 0 };
const hitXtravada = await page.evaluate(([x, y]) => window.__oficina.hitGizmo(x, y), [meioX.x, meioX.y]);
ok('(6 trava) a seta travada NÃO aceita arrasto (hitGizmo não devolve X)', hitXtravada !== 'x', `hitGizmo no cabo X = ${hitXtravada}`);

// (6 integra) roda + Ctrl+Z IGNORADOS durante o arrasto do gizmo (guardas do passo 4/5 cobrem)
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2(); await rAF2();
pts6 = await page.evaluate(() => window.__oficina.projMalha());
alvo6 = escolherVertice(pts6).v;
await clicarV(alvo6);
const sxG = (await page.evaluate(() => window.__oficina.gizmo())).find((z) => z.k === 'x');
const offG = Math.max(RH + 6, Math.min(sxG.seg - 6, 34));
const gG = { x: sxG.o2.x + sxG.dir[0] * offG, y: sxG.o2.y + sxG.dir[1] * offG };
const distA6 = await page.evaluate(() => window.__oficina.estado().dist);
const nPA6 = await page.evaluate(() => window.__oficina.nPassos());
await page.mouse.move(gG.x, gG.y); await page.mouse.down();
const emA6 = await page.evaluate(() => window.__oficina.emArrasto());
await page.mouse.wheel(0, -300); await rAF2();
const distD6 = await page.evaluate(() => window.__oficina.estado().dist);
await page.keyboard.press('Control+z'); await rAF2();
const nPD6 = await page.evaluate(() => window.__oficina.nPassos());
await page.mouse.move(gG.x + sxG.dir[0] * 50, gG.y + sxG.dir[1] * 50, { steps: 12 }); await page.mouse.up(); await rAF2();
ok('(6 integra) o arrasto do gizmo usa a mesma máquina (emArrasto.eixo != null)', emA6 && !!emA6.eixo, `emArrasto ${JSON.stringify(emA6)}`);
ok('(6 integra) a RODA é IGNORADA durante o arrasto do gizmo (guarda do passo 4)', Math.abs(distD6 - distA6) < 1e-9, `dist ${distA6.toFixed(3)} -> ${distD6.toFixed(3)}`);
ok('(6 integra) Ctrl+Z é IGNORADO durante o arrasto do gizmo (guarda do passo 5)', nPD6 === nPA6, `PASSOS ${nPA6} -> ${nPD6} durante o arrasto`);

// (6 integra) o arrasto LIVRE do passo 4 segue no vértice selecionado (clicar no CENTRO, zona morta)
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2(); await rAF2();
pts6 = await page.evaluate(() => window.__oficina.projMalha());
alvo6 = escolherVertice(pts6).v;
await clicarV(alvo6);
const gizC = await page.evaluate(() => window.__oficina.gizmo());
const centro = { x: gizC[0].o2.x, y: gizC[0].o2.y };
const hitCentro = await page.evaluate(([x, y]) => window.__oficina.hitGizmo(x, y), [centro.x, centro.y]);
await page.mouse.move(centro.x, centro.y); await page.mouse.down();
const emAC = await page.evaluate(() => window.__oficina.emArrasto());
await page.mouse.move(centro.x + 42, centro.y - 30, { steps: 14 }); await page.mouse.up(); await rAF2();
const ultimoC = await page.evaluate(() => window.__oficina.ultimoPasso());
const dC = ultimoC && ultimoC[1] && ultimoC[1].d;
const naoZeroC = dC ? [0, 1, 2].filter((i) => Math.abs(dC[i]) > 1e-6).length : 0;
ok('(6 integra) no CENTRO do vértice o gizmo NÃO pega (zona morta → arrasto livre)', hitCentro === null, `hitGizmo(centro)=${hitCentro}`);
ok('(6 integra) arrasto LIVRE (passo 4) segue no vértice selecionado (d fora de um eixo só)',
   emAC && emAC.eixo === null && naoZeroC >= 2, `emArrasto ${JSON.stringify(emAC)} · d=${JSON.stringify(dC && dC.map((n) => +n.toFixed(3)))}`);

// (6 integra) câmera no VAZIO ainda orbita com um vértice selecionado (o gizmo não rouba o vazio)
const vazio6 = await page.evaluate(() => {
  const pts = window.__oficina.projMalha(), sel = window.__oficina.selecionado();
  const sp = sel != null ? window.__oficina.projetarV(sel) : null;
  for (let y = 90; y < innerHeight - 60; y += 10) for (let x = 30; x < innerWidth - 360; x += 10) {
    let n = 1e9; for (const q of pts) n = Math.min(n, Math.hypot(x - q.x, y - q.y));
    const dsel = sp ? Math.hypot(x - sp.x, y - sp.y) : 1e9;
    if (n > 28 && dsel > 95 && window.__oficina.hitGizmo(x, y) === null) return { x, y };
  }
  return null;
});
const estA6b = await page.evaluate(() => window.__oficina.estado());
await page.mouse.move(vazio6.x, vazio6.y); await page.mouse.down();
await page.mouse.move(vazio6.x + 170, vazio6.y + 14, { steps: 12 }); await page.mouse.up(); await rAF2();
const estB6 = await page.evaluate(() => window.__oficina.estado());
ok('(6 integra) câmera no VAZIO ainda ORBITA com um vértice selecionado', Math.abs(estB6.az - estA6b.az) > 0.5, `az ${estA6b.az.toFixed(2)} -> ${estB6.az.toFixed(2)}`);

// (6 integra) replay da lista EDITADA pelo gizmo idêntico (página == Node, fora do browser)
const passos6 = await page.evaluate(() => window.__oficina.passos());
const canonP6 = await page.evaluate(() => JSON.stringify(window.__oficina.canon()));
const canonN6 = JSON.stringify(neutroCanonico(nucleo(passos6, toco.PARAMS, toco.TOPO)));
ok('(6 integra) replay da lista editada pelo gizmo idêntico (página == Node)', canonP6 === canonN6, `canônico ${canonP6.length} chars, bit-a-bit igual`);

// (6 painel) reflete o vértice selecionado (id + coords) + as dimensões da caixa
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2(); await rAF2();
pts6 = await page.evaluate(() => window.__oficina.projMalha());
alvo6 = escolherVertice(pts6).v;
await clicarV(alvo6);
const pain = await page.evaluate(() => window.__oficina.painel());
const posSel = await page.evaluate((id) => window.__oficina.posV(id), alvo6.id);
const Vall = JSON.parse(canonP6).V;   // todos os vértices, pra a caixa esperada
const mn6 = [Infinity, Infinity, Infinity], mx6 = [-Infinity, -Infinity, -Infinity];
for (const e of Vall) for (let k = 0; k < 3; k++) { const v = e[k + 1]; if (v < mn6[k]) mn6[k] = v; if (v > mx6[k]) mx6[k] = v; }
const dimsEsp = [mx6[0] - mn6[0], mx6[1] - mn6[1], mx6[2] - mn6[2]].map((n) => n.toFixed(3));
ok('(6 painel) mostra o id do vértice selecionado', pain.sel === '#' + alvo6.id, `painel "${pain.sel}" vs #${alvo6.id}`);
ok('(6 painel) mostra as COORDS do vértice (x,y,z batem com o mundo)',
   pain.x === posSel[0].toFixed(3) && pain.y === posSel[1].toFixed(3) && pain.z === posSel[2].toFixed(3),
   `painel (${pain.x},${pain.y},${pain.z}) vs mundo (${posSel.map((n) => n.toFixed(3)).join(',')})`);
ok('(6 painel) mostra as DIMENSÕES da caixa (largura/altura/profundidade)',
   pain.dims[0] === dimsEsp[0] && pain.dims[1] === dimsEsp[1] && pain.dims[2] === dimsEsp[2],
   `painel [${pain.dims.join(', ')}] vs caixa [${dimsEsp.join(', ')}]`);
ok('(6 painel) fora do arrasto o painel é EDITÁVEL (não em leitura)', pain.leitura === false, `leitura=${pain.leitura}`);

// (6 painel) de LEITURA durante o arrasto (campos desabilitados)
const sxP = (await page.evaluate(() => window.__oficina.gizmo())).find((z) => z.k === 'x');
const offP = Math.max(RH + 6, Math.min(sxP.seg - 6, 32));
const gP = { x: sxP.o2.x + sxP.dir[0] * offP, y: sxP.o2.y + sxP.dir[1] * offP };
await page.mouse.move(gP.x, gP.y); await page.mouse.down();
await page.mouse.move(gP.x + sxP.dir[0] * 30, gP.y + sxP.dir[1] * 30, { steps: 8 });
const painDrag = await page.evaluate(() => window.__oficina.painel());
await page.mouse.up(); await rAF2();
const painApos = await page.evaluate(() => window.__oficina.painel());
ok('(6 painel) de LEITURA durante o arrasto (campos desabilitados, um dono por vez)', painDrag.leitura === true, `leitura=${painDrag.leitura} · dica "${painDrag.dica}"`);
ok('(6 painel) volta a EDITÁVEL após soltar', painApos.leitura === false, `leitura=${painApos.leitura}`);

// (6 valor) VALOR EXATO (opcional): digitar X move o vértice pro alvo NO EIXO (d = alvo − atual)
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2();
pts6 = await page.evaluate(() => window.__oficina.projMalha());
alvo6 = escolherVertice(pts6).v;
await clicarV(alvo6);
const antesVX = await page.evaluate((id) => window.__oficina.posV(id), alvo6.id);
const nPvx = await page.evaluate(() => window.__oficina.nPassos());
const alvoX = +(antesVX[0] + 0.2).toFixed(3);
await page.evaluate((val) => { const el = document.getElementById('pvx'); el.value = String(val); el.dispatchEvent(new Event('change', { bubbles: true })); }, alvoX);
await rAF2();
const aposVX = await page.evaluate((id) => window.__oficina.posV(id), alvo6.id);
const nPvx2 = await page.evaluate(() => window.__oficina.nPassos());
ok('(6 valor) digitar X move o vértice pro alvo (d = alvo − atual), grava 1 moveV, X isolado',
   nPvx2 === nPvx + 1 && Math.abs(aposVX[0] - alvoX) < 1e-6 && Math.abs(aposVX[1] - antesVX[1]) < 1e-9 && Math.abs(aposVX[2] - antesVX[2]) < 1e-9,
   `x ${antesVX[0].toFixed(3)} -> ${aposVX[0].toFixed(3)} (alvo ${alvoX}) · y/z intactos · PASSOS ${nPvx}->${nPvx2}`);

// (6 valor D3) re-digitar o valor EXIBIDO (3 casas) NÃO pode gravar um moveV fantasma
// sub-visual. Arrasta pra o X ficar fracionário, lê o display e re-digita esse mesmo texto.
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2();
pts6 = await page.evaluate(() => window.__oficina.projMalha());
const vD3 = escolherVertice(pts6).v;
await page.mouse.move(vD3.x, vD3.y); await page.mouse.down();
await page.mouse.move(vD3.x + 23, vD3.y - 17, { steps: 6 }); await page.mouse.up(); await rAF2();   // X vira fracionário
const posD3 = await page.evaluate((id) => window.__oficina.posV(id), vD3.id);
const nPd3 = await page.evaluate(() => window.__oficina.nPassos());
const exibido = posD3[0].toFixed(3);
await page.evaluate((val) => { const el = document.getElementById('pvx'); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, exibido);
await rAF2();
const nPd3b = await page.evaluate(() => window.__oficina.nPassos());
ok('(6 valor D3) re-digitar o valor EXIBIDO (3 casas) é no-op — sem moveV fantasma',
   nPd3b === nPd3, `X exibido "${exibido}" (real ${posD3[0].toFixed(6)}) · PASSOS ${nPd3}->${nPd3b}`);

// (6 valor D4) limite de sanidade: um valor absurdo (muito além de ±limValor) é
// RECUSADO — não move o vértice nem grava passo (mesmo tratamento do não-finito).
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2();
pts6 = await page.evaluate(() => window.__oficina.projMalha());
const vD4 = escolherVertice(pts6).v;
await clicarV(vD4);
const antesD4 = await page.evaluate((id) => window.__oficina.posV(id), vD4.id);
const nPd4 = await page.evaluate(() => window.__oficina.nPassos());
const limV = await page.evaluate(() => window.__oficina.limValor);
const absurdo = limV * 1000;   // muito além do limite (tipo digitar 1e5)
await page.evaluate((val) => { const el = document.getElementById('pvx'); el.value = String(val); el.dispatchEvent(new Event('change', { bubbles: true })); }, absurdo);
await rAF2();
const aposD4 = await page.evaluate((id) => window.__oficina.posV(id), vD4.id);
const nPd4b = await page.evaluate(() => window.__oficina.nPassos());
ok('(6 valor D4) valor absurdo (> ±limValor) é RECUSADO — vértice e lista intactos',
   nPd4b === nPd4 && Math.abs(aposD4[0] - antesD4[0]) < 1e-9,
   `X ${antesD4[0].toFixed(3)} intacto · PASSOS ${nPd4}->${nPd4b} · limValor ${limV} · tentou ${absurdo}`);

// (6 D1) REGRESSÃO: uma seta do gizmo que passa POR CIMA de outro vértice não pode
// roubar o clique — o vértice mirado DIRETO vence a seta (precedência no hit-test).
// Varre azimutes procurando uma oclusão real (a seta do selecionado cobrindo outro
// vértice) e prova que clicar ali SELECIONA o vértice coberto, não pega a seta.
let d1 = null;
for (const az of [0.3, 0.9, 1.5, 2.1, 2.7, 3.3]) {
  await page.evaluate((f) => window.__oficina.orbitar(f), { az, el: 0.45, dist: 2.6, alvo: [0, 0.28, 0] });
  await rAF2(); await rAF2();
  const achou = await page.evaluate(() => {
    const pts = window.__oficina.projMalha();
    for (const S of pts) {                                   // dono da seta (o selecionado)
      window.__oficina.selecionar(S.id);                     // gizmo() projeta fresco, não precisa de quadro
      for (const O of pts) {                                 // vértice coberto pela seta
        if (O.id === S.id) continue;
        const k = window.__oficina.hitGizmo(O.x, O.y);
        if (k) return { sel: S.id, occ: O.id, ax: k };
      }
    }
    return null;
  });
  if (achou) { d1 = { az, ...achou }; break; }
}
ok('(6 D1) achou uma seta cobrindo outro vértice pra testar (a oclusão do D1 existe)', !!d1,
   d1 ? `az ${d1.az} · seta ${d1.ax.toUpperCase()} do #${d1.sel} cobre #${d1.occ}` : 'nenhuma oclusão nos azimutes varridos');
if (d1) {
  await page.evaluate((f) => window.__oficina.orbitar(f), { az: d1.az, el: 0.45, dist: 2.6, alvo: [0, 0.28, 0] });
  await rAF2(); await rAF2();
  await page.evaluate((id) => window.__oficina.selecionar(id), d1.sel);   // dono da seta selecionado
  await rAF2();
  const oNow = await page.evaluate((oid) => { const p = window.__oficina.projMalha().find((v) => v.id === oid); return p ? { x: p.x, y: p.y } : null; }, d1.occ);
  const oclusaoAtiva = await page.evaluate(([x, y]) => window.__oficina.hitGizmo(x, y), [oNow.x, oNow.y]);
  const nPantes = await page.evaluate(() => window.__oficina.nPassos());
  await page.mouse.move(oNow.x, oNow.y); await page.mouse.down();
  await page.mouse.move(oNow.x + 1, oNow.y + 1, { steps: 2 });   // sub-limiar → clique puro, sem arrastar
  await page.mouse.up(); await rAF2();
  const selDepois = await page.evaluate(() => window.__oficina.selecionado());
  const nPdepois = await page.evaluate(() => window.__oficina.nPassos());
  ok('(6 D1) [pré] a seta REALMENTE cobre o outro vértice (hitGizmo pega no ponto dele)', oclusaoAtiva === d1.ax,
     `hitGizmo no #${d1.occ} = ${oclusaoAtiva} (seta ${d1.ax})`);
  ok('(6 D1) clicar no vértice coberto SELECIONA o vértice (não pega a seta que passa por cima)',
     selDepois === d1.occ, `selecionado ${d1.sel} -> ${selDepois} (esperado o coberto ${d1.occ})`);
  ok('(6 D1) e é clique PURO — não grava moveV fantasma', nPdepois === nPantes, `PASSOS ${nPantes} -> ${nPdepois}`);
}

// screenshot do GIZMO: um vértice selecionado, as 3 setas por cima do toco
mkdirSync(OUT6, { recursive: true });
await page.evaluate((f) => window.__oficina.orbitar(f), F6); await rAF2(); await rAF2();
const ptsShot = await page.evaluate(() => window.__oficina.projMalha());
const alvoShot = escolherVertice(ptsShot).v;
await clicarV(alvoShot);
await rAF2();
await page.screenshot({ path: join(OUT6, 'oficina-gizmo.png') });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })));   // etiquetas de id
await rAF2();
await page.screenshot({ path: join(OUT6, 'oficina-gizmo-ids.png') });
const vazMax = Math.max(vazamentos.x, vazamentos.y, vazamentos.z);

/* ==== PASSO 7: SELEÇÃO DE FACE + EXTRUDE PELO HANDLE DA NORMAL ==============
   Extrudar UMA face pela interface, tudo com eventos REAIS de mouse/teclado (a
   seleção é clique de verdade, o extrude é arrasto de verdade). Prova por NÚMERO:
   o hit-test pega a face da FRENTE na sobreposição; o extrude grava
   ['extruda',{face,dist}] com o dist batendo (medido projetando) o avanço do
   cursor na normal e o anel novo nos ids do BLOCO do passo; replay página==Node;
   clique puro só seleciona; undo/redo bit-a-bit; roda/Ctrl+Z no arrasto ignorados
   (MESMA máquina); face com a normal ~pra câmera não extruda (handle travado). */
const F7 = { az: 0.7, el: 0.45, dist: 1.95, alvo: [0, 0.28, 0] };
const LIM7 = await page.evaluate(() => window.__oficina.limiar);
const GTRAVA7 = await page.evaluate(() => window.__oficina.gizmoTrava);
const CFACE = 9;   // topo do toco: octógono (8 cantos), normal +y limpa, visível e NÃO-travada no F7
const clicarPonto = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 1, y + 1, { steps: 2 }); await page.mouse.up(); await rAF2(); };
const projFace = (id) => page.evaluate((fid) => { const c = window.__oficina.centroideFace(fid); return c ? window.__oficina.projetar(c) : null; }, id);
/* acha um ponto no CABO do handle que o pegue (hitHandle) e NÃO caia sobre um
   vértice (o alvo direto venceria o handle, D1) — o cabo sobe pela borda de trás
   da tampa, então varre da PONTA (acima da tampa, livre) pra dentro. */
async function agarreLivre(h) {
  for (let t = 0.92; t >= 0.28; t -= 0.05) {
    const off = h.seg * t, x = h.o2.x + h.dir[0] * off, y = h.o2.y + h.dir[1] * off;
    const grab = await page.evaluate(([x, y]) => window.__oficina.hitHandle(x, y), [x, y]);
    const vert = await page.evaluate(([x, y]) => window.__oficina.hit(x, y), [x, y]);
    if (grab === true && vert === null) return { x, y, off };
  }
  return null;
}

// SLATE LIMPO: desfaz tudo que os passos 4-6 gravaram, de volta ao baseline (a peça
// pura do arquivo). Assim o extrude cai num BLOCO previsível (idx=10 -> ids 10000+)
// e os canônicos de undo/replay comparam contra o toco pristino.
await page.evaluate((f) => window.__oficina.orbitar(f), F7); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
{ const baseN7 = await page.evaluate(() => window.__oficina.baseline()); let g = 0;
  while ((await page.evaluate(() => window.__oficina.nPassos())) > baseN7 && g++ < 80) {
    await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control'); await rAF2(); } }
const nBaseline7 = await page.evaluate(() => window.__oficina.nPassos());
const canonBaseline7 = await page.evaluate(() => JSON.stringify(window.__oficina.canon()));
const canonNodeBaseline7 = JSON.stringify(neutroCanonico(nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO)));
ok('(7 setup) desfez tudo até o baseline (peça pura do arquivo, página == Node)',
   canonBaseline7 === canonNodeBaseline7, `PASSOS ${nBaseline7} == baseline · canônico bit-a-bit igual ao arquivo`);

// (7 hit) HIT-TEST DE FACE + SOBREPOSIÇÃO (a da FRENTE vence)
const pc9 = await projFace(CFACE);
const fnPonto = await page.evaluate(([x, y]) => window.__oficina.facesNoPonto(x, y), [pc9.x, pc9.y]);
const hitF = await page.evaluate(([x, y]) => window.__oficina.hitFace(x, y), [pc9.x, pc9.y]);
ok('(7 hit) DUAS faces se sobrepõem nesse ponto da tela (a de trás existe)', fnPonto.length >= 2,
   `facesNoPonto = ${JSON.stringify(fnPonto.map((f) => ({ id: f.id, prof: +f.prof.toFixed(3) })))}`);
ok('(7 hit) hitFace pega a da FRENTE (menor profundidade de centroide), não a de trás',
   hitF === CFACE && fnPonto[0].id === CFACE && fnPonto[0].prof < fnPonto[1].prof,
   `hitFace ${hitF} · frente #${fnPonto[0].id}(${fnPonto[0].prof.toFixed(3)}) < trás #${fnPonto[1].id}(${fnPonto[1].prof.toFixed(3)})`);

// clicar dentro da face SELECIONA (modo face) e LIMPA o vértice; depois clicar num
// vértice volta pro modo vértice (a seleção é vértice XOR face, os dois sentidos).
await page.evaluate(() => { const p = window.__oficina.projMalha()[0]; window.__oficina.selecionar(p.id); }); await rAF2();
const tipoAntes7 = await page.evaluate(() => window.__oficina.tipoSel());
await clicarPonto(pc9.x, pc9.y);
const selVposFace = await page.evaluate(() => window.__oficina.selecionado());
const faceSelPosClique = await page.evaluate(() => window.__oficina.faceSel());
const tipoPosFace = await page.evaluate(() => window.__oficina.tipoSel());
ok('(7 hit) clicar dentro da face SELECIONA aquela face (modo face)', faceSelPosClique === CFACE && tipoPosFace === 'face',
   `faceSel ${faceSelPosClique} · tipoSel ${tipoAntes7} -> ${tipoPosFace}`);
ok('(7 hit) e LIMPA a seleção de vértice (vértice XOR face)', selVposFace === null, `selecionado=${selVposFace}`);
// vice-versa: clicar num vértice isolado volta pro modo vértice e limpa a face
const ptsPV = await page.evaluate(() => window.__oficina.projMalha());
const vIso = escolherVertice(ptsPV).v;
await clicarPonto(vIso.x, vIso.y);
const selVfim = await page.evaluate(() => window.__oficina.selecionado());
const faceFim = await page.evaluate(() => window.__oficina.faceSel());
const tipoFim = await page.evaluate(() => window.__oficina.tipoSel());
ok('(7 hit) clicar num vértice volta pro modo vértice e LIMPA a face (vice-versa)',
   selVfim === vIso.id && faceFim === null && tipoFim === 'vertice', `selecionado ${selVfim} · faceSel ${faceFim} · tipo ${tipoFim}`);

// (7 clique) CLIQUE PURO numa face SÓ seleciona — NÃO grava (extrude só pelo handle)
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
const nP_antesCliqueF = await page.evaluate(() => window.__oficina.nPassos());
const pc9b = await projFace(CFACE);
await clicarPonto(pc9b.x, pc9b.y);
const nP_posCliqueF = await page.evaluate(() => window.__oficina.nPassos());
const faceSelCliquePuro = await page.evaluate(() => window.__oficina.faceSel());
ok('(7 clique) clicar numa face (sem passar do limiar) SÓ seleciona, NÃO grava',
   faceSelCliquePuro === CFACE && nP_posCliqueF === nP_antesCliqueF,
   `faceSel ${faceSelCliquePuro} · PASSOS ${nP_antesCliqueF} -> ${nP_posCliqueF} (limiar ${LIM7}px)`);

// (7 extrude) ARRASTAR O HANDLE DA NORMAL grava ['extruda',{face,dist}]
await page.evaluate((f) => window.__oficina.orbitar(f), F7); await rAF2(); await rAF2();
const pc9c = await projFace(CFACE);
await clicarPonto(pc9c.x, pc9c.y);   // seleciona a face 9 (clique real)
const hAntes = await page.evaluate(() => window.__oficina.handleFace());
ok('(7 extrude) a face selecionada tem UM handle na normal, NÃO travado no F7',
   !!hAntes && !hAntes.travada && hAntes.compr > GTRAVA7, `handle compr ${hAntes ? hAntes.compr.toFixed(1) : '?'}px/un · travada ${hAntes && hAntes.travada}`);
const dirH = hAntes.dir, perpH = [-dirH[1], dirH[0]];
const gH = await agarreLivre(hAntes);   // ponto no cabo livre de vértices
ok('(7 extrude) achou um agarre no cabo livre de vértices', !!gH, gH ? `off ${gH.off.toFixed(0)}px de ${hAntes.seg.toFixed(0)}px` : 'nenhum');
const ALONG7 = 46, PERP7 = 22;   // 46px AO LONGO da normal + 22px PERPENDICULAR (tem que ser descartado)
const destH = { x: gH.x + dirH[0] * ALONG7 + perpH[0] * PERP7, y: gH.y + dirH[1] * ALONG7 + perpH[1] * PERP7 };
const hitHandleNoCabo = await page.evaluate(([x, y]) => window.__oficina.hitHandle(x, y), [gH.x, gH.y]);
const vertNoCabo = await page.evaluate(([x, y]) => window.__oficina.hit(x, y), [gH.x, gH.y]);
const nP_antesExtr = await page.evaluate(() => window.__oficina.nPassos());
const idsVAntes = new Set(JSON.parse(canonBaseline7).V.map((e) => e[0]));
await page.mouse.move(gH.x, gH.y); await page.mouse.down();
const emAExtr = await page.evaluate(() => window.__oficina.emArrasto());
await page.mouse.move(destH.x, destH.y, { steps: 16 }); await page.mouse.up(); await rAF2();
const ultimoExtr = await page.evaluate(() => window.__oficina.ultimoPasso());
const nP_posExtr = await page.evaluate(() => window.__oficina.nPassos());
ok('(7 extrude) o handle é grabável no cabo e NÃO é vértice (o alvo direto teria vencido)',
   hitHandleNoCabo === true && vertNoCabo === null, `hitHandle ${hitHandleNoCabo} · hit(vértice) ${vertNoCabo}`);
ok('(7 extrude) o arrasto do handle é EXTRUDE na MESMA máquina (emArrasto.extruda)',
   emAExtr && emAExtr.extruda === true && emAExtr.face === CFACE, `emArrasto ${JSON.stringify(emAExtr)}`);
const distGrav = ultimoExtr && ultimoExtr[0] === 'extruda' && ultimoExtr[1] ? ultimoExtr[1].dist : null;
ok('(7 extrude) GRAVOU um passo extruda {face,dist} no fim de PASSOS (cresceu 1)',
   nP_posExtr === nP_antesExtr + 1 && ultimoExtr && ultimoExtr[0] === 'extruda' && ultimoExtr[1].face === CFACE && Math.abs(distGrav) > 0.01,
   `PASSOS ${nP_antesExtr} -> ${nP_posExtr} · último ${JSON.stringify(ultimoExtr)}`);
// dist·compr (o dist em px) bate o avanço do cursor na normal (ALONG7)
const distPx = distGrav * hAntes.compr;
ok('(7 extrude) dist·compr bate o avanço do cursor na normal (≤ 3px)', Math.abs(distPx - ALONG7) <= 3,
   `dist ${distGrav.toFixed(4)} · dist·compr ${distPx.toFixed(1)}px vs cursor ${ALONG7}px na normal (erro ${Math.abs(distPx - ALONG7).toFixed(2)}px)`);
// NÃO-CIRCULAR: o centroide da face DEPOIS, projetado, avançou ALONG7 na dir (o núcleo levou a tampa pra onde o handle apontava), e o perpendicular foi descartado
const pc9depois = await projFace(CFACE);
const dcx = pc9depois.x - hAntes.o2.x, dcy = pc9depois.y - hAntes.o2.y;
const alongC = dcx * dirH[0] + dcy * dirH[1], perpC = dcx * perpH[0] + dcy * perpH[1];
ok('(7 extrude) o centroide projetado da face avançou o cursor NA NORMAL (perp descartado, ≤ 6/3px)',
   Math.abs(alongC - ALONG7) <= 6 && Math.abs(perpC) <= 3, `along ${alongC.toFixed(1)}px (cursor ${ALONG7}) · perp ${perpC.toFixed(2)}px`);
// o ANEL NOVO nasce nos ids do BLOCO do passo (idx = nP_antesExtr -> base idx·1000)
const idxExtr = nP_antesExtr, blocoEsp = idxExtr * 1000;
const canonPosExtr = JSON.parse(await page.evaluate(() => JSON.stringify(window.__oficina.canon())));
const idsNovos = canonPosExtr.V.map((e) => e[0]).filter((id) => !idsVAntes.has(id)).sort((a, b) => a - b);
const esperadoAnel = Array.from({ length: 8 }, (_, k) => blocoEsp + k);
ok('(7 extrude) o anel NOVO nasce nos ids do BLOCO do passo (idx·1000)',
   idsNovos.length === 8 && idsNovos.every((id, k) => id === esperadoAnel[k]),
   `passo idx ${idxExtr} -> bloco ${blocoEsp} · anel ${JSON.stringify(idsNovos)}`);

// (7 replay) a lista EDITADA re-executada dá o MESMO neutro canônico (página == Node)
const passosExtr = await page.evaluate(() => window.__oficina.passos());
const canonPageExtr = await page.evaluate(() => JSON.stringify(window.__oficina.canon()));
const canonNodeExtr = JSON.stringify(neutroCanonico(nucleo(passosExtr, toco.PARAMS, toco.TOPO)));
ok('(7 replay) a lista editada refaz o objeto igual (página == Node, fora do browser)',
   canonPageExtr === canonNodeExtr, `canônico ${canonPageExtr.length} chars, bit-a-bit igual`);

// (7 undo/redo) Ctrl+Z tira o extrude (neutro volta ao de ANTES), Ctrl+Y devolve
await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control'); await rAF2();
const nP_posUndo7 = await page.evaluate(() => window.__oficina.nPassos());
const canonPosUndo7 = await page.evaluate(() => JSON.stringify(window.__oficina.canon()));
ok('(7 undo) Ctrl+Z tira o extrude e o neutro VOLTA BIT-A-BIT ao de antes (o baseline)',
   nP_posUndo7 === nBaseline7 && canonPosUndo7 === canonBaseline7, `PASSOS ${nP_posExtr} -> ${nP_posUndo7} · neutro ${canonPosUndo7 === canonBaseline7 ? 'idêntico' : 'DIVERGE'}`);
await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control'); await rAF2();
const nP_posRedo7 = await page.evaluate(() => window.__oficina.nPassos());
const canonPosRedo7 = await page.evaluate(() => JSON.stringify(window.__oficina.canon()));
ok('(7 redo) Ctrl+Y devolve o extrude e o neutro bate com o de DEPOIS',
   nP_posRedo7 === nP_posExtr && canonPosRedo7 === canonPageExtr, `PASSOS ${nP_posUndo7} -> ${nP_posRedo7} · neutro ${canonPosRedo7 === canonPageExtr ? 'idêntico' : 'DIVERGE'}`);
// extrudar a MESMA face DE NOVO empilha outro anel no bloco do PRÓXIMO passo (a face-tampa mantém o id)
await page.evaluate((f) => window.__oficina.orbitar(f), F7); await rAF2(); await rAF2();
const hAntes2 = await page.evaluate(() => window.__oficina.handleFace());   // a face 9 SEGUE selecionada após o extrude
const g2 = await agarreLivre(hAntes2);
const nP_antes2x = await page.evaluate(() => window.__oficina.nPassos());
const idsAntes2x = new Set(JSON.parse(await page.evaluate(() => JSON.stringify(window.__oficina.canon()))).V.map((e) => e[0]));
await page.mouse.move(g2.x, g2.y); await page.mouse.down();
await page.mouse.move(g2.x + hAntes2.dir[0] * 40, g2.y + hAntes2.dir[1] * 40, { steps: 12 }); await page.mouse.up(); await rAF2();
const ultimo2x = await page.evaluate(() => window.__oficina.ultimoPasso());
const idsNovos2x = JSON.parse(await page.evaluate(() => JSON.stringify(window.__oficina.canon()))).V.map((e) => e[0]).filter((id) => !idsAntes2x.has(id)).sort((a, b) => a - b);
ok('(7 extrude 2×) extrudar a MESMA face de novo empilha um anel no bloco do próximo passo (face-tampa mantém o id)',
   ultimo2x && ultimo2x[0] === 'extruda' && ultimo2x[1].face === CFACE && idsNovos2x.length === 8 && idsNovos2x[0] === nP_antes2x * 1000,
   `2º extrude idx ${nP_antes2x} -> bloco ${nP_antes2x * 1000} · anel ${JSON.stringify(idsNovos2x)}`);
// volta ao baseline pro resto (undo dos 2 extrudes)
{ let g = 0; while ((await page.evaluate(() => window.__oficina.nPassos())) > nBaseline7 && g++ < 20) { await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control'); await rAF2(); } }

// (7 guardas) roda + Ctrl+Z DURANTE o arrasto do extrude são IGNORADOS (MESMA máquina)
await page.evaluate((f) => window.__oficina.orbitar(f), F7); await rAF2(); await rAF2();
const pc9g = await projFace(CFACE);
await clicarPonto(pc9g.x, pc9g.y);
const hG = await page.evaluate(() => window.__oficina.handleFace());
const gG7 = await agarreLivre(hG);
const distA7 = await page.evaluate(() => window.__oficina.estado().dist);
const nPA7 = await page.evaluate(() => window.__oficina.nPassos());
await page.mouse.move(gG7.x, gG7.y); await page.mouse.down();
const emAG7 = await page.evaluate(() => window.__oficina.emArrasto());
await page.mouse.wheel(0, -300); await rAF2();
const distD7 = await page.evaluate(() => window.__oficina.estado().dist);
await page.keyboard.press('Control+z'); await rAF2();
const nPD7 = await page.evaluate(() => window.__oficina.nPassos());
await page.mouse.move(gG7.x + hG.dir[0] * 44, gG7.y + hG.dir[1] * 44, { steps: 12 }); await page.mouse.up(); await rAF2();
ok('(7 guardas) a RODA é IGNORADA durante o arrasto do extrude (dist não muda)', Math.abs(distD7 - distA7) < 1e-9,
   `dist ${distA7.toFixed(3)} -> ${distD7.toFixed(3)} (emArrasto.extruda ${emAG7 && emAG7.extruda})`);
ok('(7 guardas) Ctrl+Z é IGNORADO durante o arrasto do extrude (PASSOS não muda)', nPD7 === nPA7,
   `PASSOS ${nPA7} -> ${nPD7} durante o arrasto`);
{ let g = 0; while ((await page.evaluate(() => window.__oficina.nPassos())) > nBaseline7 && g++ < 20) { await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control'); await rAF2(); } }

// (7 trava) face com a normal ~PRA CÂMERA: olhando AO LONGO da normal de uma face
//   lateral (face 4), o handle projeta pouquíssimo px/un → TRAVADO, hitHandle não
//   pega e arrastar ali NÃO extruda. Discrimina: a MESMA face de TRÁVES não trava.
const FLADO = 4;
const cfgT = await page.evaluate((fid) => { const n = window.__oficina.normalFace(fid);
  return { az: Math.atan2(n[0], n[2]), el: Math.asin(Math.max(-1, Math.min(1, n[1]))) }; }, FLADO);
await page.evaluate((c) => window.__oficina.orbitar({ az: c.az, el: c.el, dist: 6, alvo: [0, 0.28, 0] }), cfgT); await rAF2(); await rAF2();
const pcT = await projFace(FLADO);
await clicarPonto(pcT.x, pcT.y);   // seleciona a face lateral por clique real
const faceSelT = await page.evaluate(() => window.__oficina.faceSel());
const hT = await page.evaluate(() => window.__oficina.handleFace());
const hitBaseT = await page.evaluate(() => { const h = window.__oficina.handleFace(); return h ? window.__oficina.hitHandle(h.o2.x, h.o2.y) : null; });
ok('(7 trava) olhando ~pela normal, o handle da face fica TRAVADO (compr < 12px/un, apagado)',
   faceSelT === FLADO && !!hT && hT.travada && hT.compr < GTRAVA7, `face ${faceSelT} · compr ${hT ? hT.compr.toFixed(2) : '?'}px/un (limiar ${GTRAVA7})`);
ok('(7 trava) o handle travado NÃO aceita arrasto (hitHandle não pega)', hitBaseT === false, `hitHandle na base = ${hitBaseT}`);
// arrastar ali NÃO extruda (hitHandle não pegou → não vira arrasto de extrude)
const nPT_antes = await page.evaluate(() => window.__oficina.nPassos());
await page.mouse.move(hT.o2.x, hT.o2.y); await page.mouse.down();
await page.mouse.move(hT.o2.x + 40, hT.o2.y, { steps: 10 }); await page.mouse.up(); await rAF2();
const nPT_depois = await page.evaluate(() => window.__oficina.nPassos());
ok('(7 trava) arrastar sobre o handle travado NÃO extruda (PASSOS intacto)', nPT_depois === nPT_antes,
   `PASSOS ${nPT_antes} -> ${nPT_depois}`);
// DISCRIMINA: a MESMA face 4, vista de TRÁVES (do F7), NÃO trava e é grabável
await page.evaluate((f) => window.__oficina.orbitar(f), F7); await rAF2(); await rAF2();
await page.evaluate((fid) => window.__oficina.selecionarFace(fid), FLADO); await rAF2();
const hT2 = await page.evaluate(() => window.__oficina.handleFace());
ok('(7 trava) a MESMA face de TRÁVES (F7) NÃO trava (a trava é só edge-on)', !!hT2 && !hT2.travada && hT2.compr > GTRAVA7,
   `face ${FLADO} de tráves compr ${hT2 ? hT2.compr.toFixed(1) : '?'}px/un · travada ${hT2 && hT2.travada}`);
{ let g = 0; while ((await page.evaluate(() => window.__oficina.nPassos())) > nBaseline7 && g++ < 20) { await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control'); await rAF2(); } }

// screenshot do EXTRUDE: uma face selecionada + o handle, e a peça extrudada
mkdirSync(OUT7, { recursive: true });
await page.evaluate((f) => window.__oficina.orbitar(f), F7); await rAF2(); await rAF2();
const pc9shot = await projFace(CFACE);
await clicarPonto(pc9shot.x, pc9shot.y);
await rAF2();
await page.screenshot({ path: join(OUT7, 'oficina-face-handle.png') });   // face selecionada + seta da normal
const hShot = await page.evaluate(() => window.__oficina.handleFace());
const gS = await agarreLivre(hShot);
await page.mouse.move(gS.x, gS.y); await page.mouse.down();
await page.mouse.move(gS.x + hShot.dir[0] * 60, gS.y + hShot.dir[1] * 60, { steps: 14 }); await page.mouse.up(); await rAF2();
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })));   // etiquetas de id (mostra o anel novo 10000+)
await rAF2();
await page.screenshot({ path: join(OUT7, 'oficina-face-extrudada.png') });

/* ==== PASSO 8: MESCLAR VÉRTICES + ÍMÃ =======================================
   Tudo com eventos REAIS (Shift+clique de verdade, tecla M de verdade, Ctrl no
   arrasto de verdade). Prova por NÚMERO: a multi-seleção acumula/reseta/remove
   e o ativo é o último; M grava ['mescla',{de,para}] com para=ATIVO e a malha
   muda como o núcleo manda (V cai, faces trocam de→para, seleção vira o `para`);
   replay página==Node bit-a-bit (a op "mais delicada"); undo/redo voltam ao
   neutro de antes/depois; o ímã cola A na posição EXATA de B (erro medido ≤
   1e-6); Ctrl+Z/roda no meio do arrasto-com-ímã são ignorados; e mesclar cantos
   adjacentes apaga a face de área-zero sem corromper o resto. */
const F8 = { az: 0.7, el: 0.45, dist: 1.95, alvo: [0, 0.28, 0] };
const IMA_RAIO8 = await page.evaluate(() => window.__oficina.imaRaio);

const shiftClick = async (x, y) => {   // Shift+clique CURTO (sub-limiar) = toggle da multi-seleção
  await page.keyboard.down('Shift');
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 1, y + 1, { steps: 2 }); await page.mouse.up();
  await page.keyboard.up('Shift'); await rAF2();
};
const selecao = () => page.evaluate(() => window.__oficina.selecao());
const ativo = () => page.evaluate(() => window.__oficina.ativo());
const posV8 = (id) => page.evaluate((i) => window.__oficina.posV(i), id);
// desfaz tudo até o baseline (a peça pura do arquivo) — cada teste parte limpo
async function aoBaseline() { const b = await page.evaluate(() => window.__oficina.baseline()); let g = 0;
  while ((await nP()) > b && g++ < 80) await ctrlZ(); return b; }
// N vértices ISOLADOS na tela (o clique/alvo cai limpo, sem pegar vizinho)
function escolherIsolados(pts, n) {
  const dentro = pts.filter((p) => p.x > 24 && p.x < VW - painelW4 - 24 && p.y > 60 && p.y < VH - 40);
  const comSep = dentro.map((p) => { let s = 1e9; for (const q of pts) if (q.id !== p.id) s = Math.min(s, Math.hypot(p.x - q.x, p.y - q.y)); return { p, s }; });
  comSep.sort((a, b) => b.s - a.s);
  return comSep.slice(0, n).map((e) => e.p);
}
/* par (A=arrastado, B=alvo) ISOLADO (ninguém a ≤2.2·IMA_RAIO — clique/alvo do ímã
   sem ambiguidade) e o MAIS AFASTADO EM MUNDO possível, com separação de tela num
   gesto claro. Afastado em mundo → o "sem cola" tem folga (A livre cai longe de B). */
async function escolherParIma(pts) {
  const dentro = pts.filter((p) => p.x > 40 && p.x < VW - painelW4 - 40 && p.y > 80 && p.y < VH - 60);
  const iso = dentro.filter((p) => { let s = 1e9; for (const q of pts) if (q.id !== p.id) s = Math.min(s, Math.hypot(p.x - q.x, p.y - q.y)); return s > IMA_RAIO8 * 2.2; });
  const world = {};
  for (const p of iso) world[p.id] = await posV8(p.id);
  let melhor = null, best = -1;
  for (let i = 0; i < iso.length; i++) for (let j = 0; j < iso.length; j++) {
    if (i === j) continue;
    const A = iso[i], B = iso[j], scr = Math.hypot(A.x - B.x, A.y - B.y);
    if (scr < 60 || scr > 340) continue;
    const wa = world[A.id], wb = world[B.id];
    const dw = Math.hypot(wa[0] - wb[0], wa[1] - wb[1], wa[2] - wb[2]);
    if (dw > best) { best = dw; melhor = { A, B, dw, scr }; }
  }
  return melhor;
}

await page.evaluate((f) => window.__oficina.orbitar(f), F8); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
await aoBaseline();
const canonBaseline8 = await canon();
const Vbase8 = JSON.parse(canonBaseline8).V.length;
ok('(8 setup) partiu do baseline (peça pura, 19 vértices)', Vbase8 === 19, `V ${Vbase8}`);

// (8 multi) MULTI-SELEÇÃO por Shift+clique REAL
let pts8 = await page.evaluate(() => window.__oficina.projMalha());
const [A1, B1, C1] = escolherIsolados(pts8, 3);
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
await clicarPonto(A1.x, A1.y);                    // clique NORMAL → só A1
const sel1 = await selecao();
ok('(8 multi) clique normal seleciona UM vértice', sel1.length === 1 && sel1[0] === A1.id && (await ativo()) === A1.id, `selecao ${JSON.stringify(sel1)} · ativo #${await ativo()} (esp #${A1.id})`);
await shiftClick(B1.x, B1.y);                     // Shift+clique soma B1
const sel2 = await selecao();
ok('(8 multi) Shift+clique ACUMULA (2 vértices, ativo = o último)', sel2.length === 2 && sel2[0] === A1.id && sel2[1] === B1.id && (await ativo()) === B1.id, `selecao ${JSON.stringify(sel2)} · ativo #${await ativo()}`);
await shiftClick(C1.x, C1.y);                     // Shift+clique soma C1
const sel3 = await selecao();
ok('(8 multi) Shift+clique ACUMULA (3 vértices, ativo = o último)', sel3.length === 3 && sel3[2] === C1.id && (await ativo()) === C1.id, `selecao ${JSON.stringify(sel3)} · ativo #${await ativo()}`);
await shiftClick(B1.x, B1.y);                     // Shift+clique num já-selecionado REMOVE
const sel4 = await selecao();
ok('(8 multi) Shift+clique num já-selecionado REMOVE (ativo intacto)', sel4.length === 2 && !sel4.includes(B1.id) && (await ativo()) === C1.id, `selecao ${JSON.stringify(sel4)} · ativo #${await ativo()}`);
await clicarPonto(A1.x, A1.y);                    // clique NORMAL reseta pra 1
const sel5 = await selecao();
ok('(8 multi) clique normal RESETA pra 1 (limpa o resto)', sel5.length === 1 && sel5[0] === A1.id, `selecao ${JSON.stringify(sel5)}`);
// selecionar uma FACE limpa a multi-seleção (XOR)
await page.evaluate((ids) => window.__oficina.selecionarVarios(ids), [A1.id, C1.id]); await rAF2();
const nSelAntesFace = (await selecao()).length;
const pcF8 = await projFace(9);
await clicarPonto(pcF8.x, pcF8.y);
const selPosFace = await selecao();
const faceSelNow = await page.evaluate(() => window.__oficina.faceSel());
ok('(8 multi) selecionar uma FACE limpa a multi-seleção de vértice (XOR)', nSelAntesFace === 2 && selPosFace.length === 0 && faceSelNow === 9, `antes ${nSelAntesFace} vértices → depois ${selPosFace.length}, faceSel #${faceSelNow}`);

// (8 mescla) tecla M grava a mescla e a malha muda como o núcleo manda
await aoBaseline();
const canonAntesMerge = await canon();
const cAM = JSON.parse(canonAntesMerge);
const V_antesM = cAM.V.length;
const compartilham = cAM.F.filter((f) => f[1].includes(3) && f[1].includes(13)).length;
ok('(8 mescla) setup: 3 e 13 NÃO compartilham face (merge limpo, sem área-zero)', compartilham === 0, `faces com ambos ${compartilham}`);
const pos13antes = await posV8(13);
await page.evaluate(() => window.__oficina.selecionarVarios([3, 13])); await rAF2();   // ativo = 13 (o último)
ok('(8 mescla) setup: 2 vértices selecionados, ativo = 13', (await selecao()).length === 2 && (await ativo()) === 13, `selecao ${JSON.stringify(await selecao())} · ativo #${await ativo()}`);
const nP_antesM = await nP();
await page.keyboard.press('KeyM'); await rAF2();   // tecla M REAL
const ultimoM = await page.evaluate(() => window.__oficina.ultimoPasso());
const nP_posM = await nP();
const canonPosMerge = await canon();
const cPM = JSON.parse(canonPosMerge);
const V_posM = cPM.V.length;
const tem3 = cPM.V.some((e) => e[0] === 3), tem13 = cPM.V.some((e) => e[0] === 13);
const pos13depois = await posV8(13);
const facesCom3 = cPM.F.filter((f) => f[1].includes(3)).length;
const facesCom13 = cPM.F.filter((f) => f[1].includes(13)).map((f) => f[0]);
ok('(8 mescla) M grava mescla {de:[3],para:13} no fim de PASSOS (para = ativo)',
   nP_posM === nP_antesM + 1 && ultimoM && ultimoM[0] === 'mescla' && JSON.stringify(ultimoM[1].de) === '[3]' && ultimoM[1].para === 13,
   `último ${JSON.stringify(ultimoM)} · PASSOS ${nP_antesM}->${nP_posM}`);
ok('(8 mescla) a contagem de vértices CAI (o `de` some, o `para` fica)', V_posM === V_antesM - 1 && !tem3 && tem13, `V ${V_antesM}->${V_posM} · tem #3 ${tem3} · tem #13 ${tem13}`);
ok('(8 mescla) o `para` (13) MANTÉM a posição', Math.hypot(pos13depois[0] - pos13antes[0], pos13depois[1] - pos13antes[1], pos13depois[2] - pos13antes[2]) < 1e-9,
   `13 ${JSON.stringify(pos13antes.map((n) => +n.toFixed(3)))} -> ${JSON.stringify(pos13depois.map((n) => +n.toFixed(3)))}`);
ok('(8 mescla) as faces que usavam `de` (#3) passam a usar `para` (#13)', facesCom3 === 0 && facesCom13.length >= 1, `faces com #3 ${facesCom3} · faces agora com #13 ${JSON.stringify(facesCom13)}`);
ok('(8 mescla) a seleção vira só o `para` (#13)', (await selecao()).length === 1 && (await selecao())[0] === 13, `selecao ${JSON.stringify(await selecao())}`);

// (8 replay) a lista editada refaz o objeto igual (página == Node)
const passosM = await page.evaluate(() => window.__oficina.passos());
const canonNodeM = JSON.stringify(neutroCanonico(nucleo(passosM, toco.PARAMS, toco.TOPO)));
ok('(8 replay) a lista editada refaz o objeto igual (página == Node, bit-a-bit)', canonPosMerge === canonNodeM, `canônico ${canonPosMerge.length} chars, igual`);

// (8 undo/redo) Ctrl+Z tira a mescla (os 2 vértices voltam), Ctrl+Y devolve
await ctrlZ();
const canonUndoM = await canon(); const nP_undoM = await nP();
const cUM = JSON.parse(canonUndoM);
ok('(8 undo) Ctrl+Z tira a mescla e o neutro VOLTA bit-a-bit (os 2 vértices de novo lá)',
   nP_undoM === nP_antesM && canonUndoM === canonAntesMerge && cUM.V.some((e) => e[0] === 3) && cUM.V.some((e) => e[0] === 13),
   `PASSOS ${nP_posM}->${nP_undoM} · neutro ${canonUndoM === canonAntesMerge ? 'idêntico' : 'DIVERGE'} · #3 e #13 ${cUM.V.some((e) => e[0] === 3) && cUM.V.some((e) => e[0] === 13) ? 'de volta' : 'SUMIDOS'}`);
await ctrlY();
const canonRedoM = await canon();
ok('(8 redo) Ctrl+Y devolve a mescla (neutro bate com o de depois)', canonRedoM === canonPosMerge, `neutro ${canonRedoM === canonPosMerge ? 'idêntico' : 'DIVERGE'}`);

// (8 botão) o botão do painel também mescla (clique REAL do mouse sobre ele)
await aoBaseline();
await page.evaluate(() => window.__oficina.selecionarVarios([3, 13])); await rAF2();
const btInfo = await page.evaluate(() => { const b = document.getElementById('btMescla'); const r = b.getBoundingClientRect(); return { vis: !b.hidden && !b.disabled, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const nP_btAntes = await nP();
await page.mouse.click(btInfo.x, btInfo.y); await rAF2();   // clique REAL no botão do painel
const ultimoBt = await page.evaluate(() => window.__oficina.ultimoPasso());
ok('(8 botão) com 2+ selecionados o botão de mesclar aparece HABILITADO', btInfo.vis === true, `visível/habilitado ${btInfo.vis}`);
ok('(8 botão) clicar no botão do painel mescla igual à tecla M', (await nP()) === nP_btAntes + 1 && ultimoBt && ultimoBt[0] === 'mescla' && ultimoBt[1].para === 13, `último ${JSON.stringify(ultimoBt)}`);

// (8 ímã) Ctrl+arrasto de A sobre B COLA A na posição EXATA de B
await aoBaseline();
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
await page.evaluate((f) => window.__oficina.orbitar(f), F8); await rAF2(); await rAF2();
pts8 = await page.evaluate(() => window.__oficina.projMalha());
const par = await escolherParIma(pts8);
ok('(8 ímã) achou um par isolado e afastado em mundo pra testar', !!par && par.dw > 0.2, par ? `A #${par.A.id} → B #${par.B.id} · ${par.dw.toFixed(2)}un em mundo, ${par.scr.toFixed(0)}px na tela` : 'nenhum par');
const origA = await posV8(par.A.id);
const posB = await posV8(par.B.id);
await page.keyboard.down('Control');
await page.mouse.move(par.A.x, par.A.y); await page.mouse.down();
await page.mouse.move(par.B.x, par.B.y, { steps: 20 });
const imaDurante = await page.evaluate(() => window.__oficina.imaAlvo());
await page.mouse.up();
await page.keyboard.up('Control'); await rAF2();
const ultimoIma = await page.evaluate(() => window.__oficina.ultimoPasso());
const posAdepois = await posV8(par.A.id);
const erroMundo = Math.hypot(posAdepois[0] - posB[0], posAdepois[1] - posB[1], posAdepois[2] - posB[2]);
const dIma = ultimoIma && ultimoIma[1] && ultimoIma[1].d;
const dEsper = [posB[0] - origA[0], posB[1] - origA[1], posB[2] - origA[2]];
const erroD = dIma ? Math.hypot(dIma[0] - dEsper[0], dIma[1] - dEsper[1], dIma[2] - dEsper[2]) : 999;
ok('(8 ímã) durante o arrasto, imaAlvo aponta o vértice B', imaDurante === par.B.id, `imaAlvo #${imaDurante} (esp #${par.B.id})`);
ok('(8 ímã) Ctrl+arrasto COLA A na posição EXATA de B (erro ≤ 1e-6 em mundo)',
   ultimoIma && ultimoIma[0] === 'moveV' && ultimoIma[1].v === par.A.id && erroMundo <= 1e-6,
   `erro ${erroMundo.toExponential(2)} · A ${JSON.stringify(posAdepois.map((n) => +n.toFixed(4)))} vs B ${JSON.stringify(posB.map((n) => +n.toFixed(4)))}`);
ok('(8 ímã) o moveV gravado tem d = posB − posOriginal (≤ 1e-9)', erroD <= 1e-9,
   `d ${JSON.stringify(dIma && dIma.map((n) => +n.toFixed(4)))} vs esperado ${JSON.stringify(dEsper.map((n) => +n.toFixed(4)))}`);

// (8 ímã) SEM Ctrl não cola: imaAlvo null, A cai onde o cursor soltou (segue o cursor)
await ctrlZ();   // desfaz o ímã, A volta à origem
await page.mouse.move(par.A.x, par.A.y); await page.mouse.down();
await page.mouse.move(par.B.x, par.B.y, { steps: 20 });
const imaSemCtrl = await page.evaluate(() => window.__oficina.imaAlvo());
await page.mouse.up(); await rAF2();
const projAlivre = await page.evaluate((id) => window.__oficina.projetarV(id), par.A.id);
const posAlivre = await posV8(par.A.id);
const erroSegue8 = Math.hypot(projAlivre.x - par.B.x, projAlivre.y - par.B.y);
const gapMundoB = Math.hypot(posAlivre[0] - posB[0], posAlivre[1] - posB[1], posAlivre[2] - posB[2]);
ok('(8 ímã) SEM Ctrl não há ímã (imaAlvo null durante o arrasto)', imaSemCtrl === null, `imaAlvo ${imaSemCtrl}`);
ok('(8 ímã) SEM Ctrl A segue o cursor e NÃO cola em B (gap em mundo bem > 0)',
   erroSegue8 <= 3 && gapMundoB > 0.02, `segue o cursor a ${erroSegue8.toFixed(2)}px · gap em mundo a B ${gapMundoB.toFixed(3)}un (colado seria ~0)`);
await aoBaseline();

// (8 guarda) Ctrl+Z e a roda DURANTE o arrasto-com-ímã são IGNORADOS.
// PRÉ-EDIÇÃO REAL acima do baseline: sem algo pra desfazer, o Ctrl+Z do meio seria
// no-op pelo PISO (baseline), não pela guarda do arrasto — e o teste não
// discriminaria a guarda (foi o que a neutralização pegou). Com PASSOS>baseline, é
// SÓ a guarda `if (arrasto) return` que segura o Ctrl+Z em voo.
await page.evaluate((f) => window.__oficina.orbitar(f), F8); await rAF2(); await rAF2();
await arrastarVertice(28, -20);   // grava 1 moveV → PASSOS = baseline+1 (há o que desfazer)
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
// segurar Ctrl SOZINHO (sem Z) não desfaz — MESMO havendo o que desfazer
const nPpreCtrl = await nP();
await page.keyboard.down('Control'); await rAF2();
const nPholdCtrl = await nP();
await page.keyboard.up('Control');
ok('(8 guarda) segurar Ctrl (sem Z) NÃO desfaz sozinho (mesmo acima do baseline)', nPholdCtrl === nPpreCtrl && nPpreCtrl > 10, `PASSOS ${nPpreCtrl} -> ${nPholdCtrl} (baseline 10)`);
pts8 = await page.evaluate(() => window.__oficina.projMalha());
const parG = await escolherParIma(pts8);
const distA8 = await page.evaluate(() => window.__oficina.estado().dist);
const nPA8 = await nP();
await page.keyboard.down('Control');
await page.mouse.move(parG.A.x, parG.A.y); await page.mouse.down();
await page.mouse.move(parG.B.x, parG.B.y, { steps: 16 });   // arrasto-com-ímã EM CURSO (não soltou)
const emA8 = await page.evaluate(() => window.__oficina.emArrasto());
const imaG = await page.evaluate(() => window.__oficina.imaAlvo());
await page.keyboard.press('KeyZ');   // Ctrl+Z (Ctrl ainda embaixo) NO MEIO do arrasto
await rAF2();
const nP_durZ = await nP();
await page.mouse.wheel(0, -300); await rAF2();   // roda NO MEIO do arrasto
const distDur = await page.evaluate(() => window.__oficina.estado().dist);
await page.mouse.up();
await page.keyboard.up('Control'); await rAF2();
const nP_posG = await nP();
ok('(8 guarda) o arrasto-com-ímã está em curso (livre, imaAlvo = B)', emA8 && emA8.eixo === null && emA8.extruda === false && imaG === parG.B.id, `emArrasto ${JSON.stringify(emA8)} · imaAlvo #${imaG}`);
ok('(8 guarda) Ctrl+Z DURANTE o arrasto-com-ímã é IGNORADO (PASSOS não muda)', nP_durZ === nPA8, `PASSOS ${nPA8} -> ${nP_durZ} durante o arrasto`);
ok('(8 guarda) a RODA durante o arrasto-com-ímã é IGNORADA (dist não muda)', Math.abs(distDur - distA8) < 1e-9, `dist ${distA8.toFixed(3)} -> ${distDur.toFixed(3)}`);
ok('(8 guarda) ao soltar, o ímã comita 1 moveV (o Ctrl+Z do meio não bagunçou a lista)', nP_posG === nPA8 + 1, `PASSOS ${nPA8} -> ${nP_posG}`);
await aoBaseline();

// (8 área-zero) mesclar cantos ADJACENTES apaga a face de área-zero, sem corromper o resto
const canonB7az = await canon();
const cB7az = JSON.parse(canonB7az);
const F_b7az = cB7az.F.length;
const face1001Antes = cB7az.F.find((f) => f[0] === 1001);
const faceIntactaId = 3;   // side face [3,11,12,4] — não toca em 8 nem 9
const faceIntactaAntes = JSON.stringify(cB7az.F.find((f) => f[0] === faceIntactaId));
await page.evaluate(() => window.__oficina.selecionarVarios([8, 9])); await rAF2();   // ativo = 9; de = [8]
const nP_b7az = await nP();
await page.keyboard.press('KeyM'); await rAF2();
const ultimoAZ = await page.evaluate(() => window.__oficina.ultimoPasso());
const canonAZ = await canon();
const cAZ = JSON.parse(canonAZ);
const face1001Depois = cAZ.F.find((f) => f[0] === 1001);
const faceIntactaDepois = JSON.stringify(cAZ.F.find((f) => f[0] === faceIntactaId));
ok('(8 área-zero) setup: 8 e 9 são cantos do triângulo da face 1001', !!face1001Antes && face1001Antes[1].length === 3 && face1001Antes[1].includes(8) && face1001Antes[1].includes(9), `face 1001 = ${JSON.stringify(face1001Antes && face1001Antes[1])}`);
ok('(8 área-zero) mesclar cantos adjacentes APAGA a face de área-zero (F cai de 1)', !face1001Depois && cAZ.F.length === F_b7az - 1,
   `face 1001 ${face1001Depois ? 'ainda existe' : 'apagada'} · F ${F_b7az}->${cAZ.F.length} · passo ${JSON.stringify(ultimoAZ)}`);
ok('(8 área-zero) apaga QUIETO (sem órfão — é área-zero, não bowtie)', cAZ.orfaos.length === 0, `órfãos ${cAZ.orfaos.length}`);
ok('(8 área-zero) V cai de 1 (só o `de` #8 some) e o RESTO fica intacto', cAZ.V.length === cB7az.V.length - 1 && faceIntactaDepois === faceIntactaAntes,
   `V ${cB7az.V.length}->${cAZ.V.length} · face #${faceIntactaId} ${faceIntactaDepois === faceIntactaAntes ? 'byte-idêntica' : 'MUDOU'}`);
const passosAZ = await page.evaluate(() => window.__oficina.passos());
const canonNodeAZ = JSON.stringify(neutroCanonico(nucleo(passosAZ, toco.PARAMS, toco.TOPO)));
ok('(8 área-zero) o replay segue idêntico mesmo apagando face (página == Node)', canonAZ === canonNodeAZ, `canônico ${canonAZ.length} chars, igual`);
await aoBaseline();

// screenshots do passo 8: multi-seleção destacada + o ímã em ação
mkdirSync(OUT8, { recursive: true });
await page.evaluate((f) => window.__oficina.orbitar(f), F8); await rAF2(); await rAF2();
pts8 = await page.evaluate(() => window.__oficina.projMalha());
const tresShot = escolherIsolados(pts8, 3);
await page.evaluate((ids) => window.__oficina.selecionarVarios(ids), tresShot.map((p) => p.id));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })));   // etiquetas de id
await rAF2();
await page.screenshot({ path: join(OUT8, 'oficina-multiselecao.png') });   // 3 vértices roxos + ativo com anel âmbar
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' })));   // desliga
await page.evaluate(() => window.__oficina.selecionar(null)); await rAF2();
pts8 = await page.evaluate(() => window.__oficina.projMalha());
const parShot = await escolherParIma(pts8);
await page.keyboard.down('Control');
await page.mouse.move(parShot.A.x, parShot.A.y); await page.mouse.down();
await page.mouse.move(parShot.B.x, parShot.B.y, { steps: 16 });
await rAF2();
await page.screenshot({ path: join(OUT8, 'oficina-ima.png') });   // A colado em B, anel verde-HUD no alvo
await page.mouse.up();
await page.keyboard.up('Control'); await rAF2();
await aoBaseline();

/* ==== PASSO 9: PINTAR FACES ================================================
   Multi-seleção de FACE (espelho do passo 8, mas pra face) + o seletor de cor do
   painel, tudo com eventos REAIS (clique/Shift+clique de verdade nas faces, clique
   real nos presets, `change` REAL no <input type=color> — o picker nativo não roda
   headless). Prova por NÚMERO: a multi-seleção acumula/reseta/remove e a ativa é a
   última; o `change` grava ['pincel',{modo:'face',faces:[ordenadas],cor}] e a face
   vira a cor; a cor APARECE no render (paleta do swatch + probe de pixel); replay
   página==Node; undo/redo bit-a-bit; 3 faces + 1 cor = 1 passo; pintar no arrasto é
   ignorado; e as bordas (no-op de cor-igual, pintar face sem cor prévia). */
const F9 = { az: 0.7, el: 0.45, dist: 1.95, alvo: [0, 0.28, 0] };
const selFacesB = () => page.evaluate(() => window.__oficina.selecaoFaces());
const faceAtiva = () => page.evaluate(() => window.__oficina.faceAtiva());
const corFace = (id) => page.evaluate((i) => window.__oficina.corDaFace(i), id);
const paleta = () => page.evaluate(() => window.__oficina.paleta());
// FACES clicáveis: centroide na cena (à esquerda do painel), front-most (hitFace===id)
// e SEM vértice sob o centroide (hit===null) — então clique normal arma a face e
// Shift+clique arma a face (não um vértice). Espelha escolherIsolados, mas pra face.
async function facesClicaveis() {
  const fids = JSON.parse(await canon()).F.map((f) => f[0]);
  const out = [];
  for (const id of fids) {
    const c = await projFace(id);
    if (!c || !(c.x > 46 && c.x < VW - painelW4 - 46 && c.y > 76 && c.y < VH - 56)) continue;
    const hitF = await page.evaluate(([x, y]) => window.__oficina.hitFace(x, y), [c.x, c.y]);
    const hitV = await page.evaluate(([x, y]) => window.__oficina.hit(x, y), [c.x, c.y]);
    if (hitF === id && hitV === null) out.push({ id, x: c.x, y: c.y });
  }
  return out;
}
// 3 faces mutuamente separadas na tela (clique limpo), a de MENOR id primeiro só pra
// ter A distante das outras; a ativa transita como o teste afirma.
function tresFacesSeparadas(fs, minSep = 70) {
  const esc = [];
  for (const f of fs) { if (esc.every((g) => Math.hypot(f.x - g.x, f.y - g.y) >= minSep)) esc.push(f); if (esc.length === 3) break; }
  return esc;
}
const pintarChange = async (cor) => { await page.$eval('#pcCor', (el, c) => { el.value = c; el.dispatchEvent(new Event('change', { bubbles: true })); }, cor); await rAF2(); };
const clicarPreset = async (cor) => { const b = await page.$eval(`#pcPresets .sw[data-cor="${cor}"]`, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await page.mouse.click(b.x, b.y); await rAF2(); };
// média RGB de um probe pequeno do RENDER centrado em (px,py) — prova de pixel
async function probeRGB(px, py, s = 14) {
  const x = Math.max(0, Math.round(px - s / 2)), y = Math.max(0, Math.round(py - s / 2));
  const img = decodePNG(await page.screenshot({ clip: { x, y, width: s, height: s } }));
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i + 3 <= img.data.length; i += img.ch) { r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
  return { r: r / n, g: g / n, b: b / n };
}

await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2(); await rAF2();
await page.evaluate(() => { window.__oficina.selecionar(null); window.__oficina.selecionarFaces([]); }); await rAF2();
await aoBaseline();
const canonBaseline9 = await canon();
ok('(9 setup) partiu do baseline (peça pura do arquivo)', JSON.parse(canonBaseline9).V.length === 19, `V ${JSON.parse(canonBaseline9).V.length}`);

// (9 multi) MULTI-SELEÇÃO de FACE por clique/Shift+clique REAL
const fclick = await facesClicaveis();
const [FA, FB, FC] = tresFacesSeparadas(fclick);
ok('(9 multi) achou 3 faces clicáveis e separadas na tela', !!(FA && FB && FC) && FA.id !== FB.id && FB.id !== FC.id,
   FA && FB && FC ? `faces #${FA.id} #${FB.id} #${FC.id}` : `só ${fclick.length} clicáveis`);
await clicarPonto(FA.x, FA.y);                     // clique NORMAL → só FA
const f1 = await selFacesB();
ok('(9 multi) clique normal seleciona UMA face', f1.length === 1 && f1[0] === FA.id && (await faceAtiva()) === FA.id, `selFaces ${JSON.stringify(f1)} · ativa #${await faceAtiva()} (esp #${FA.id})`);
await shiftClick(FB.x, FB.y);                       // Shift+clique soma FB
const f2 = await selFacesB();
ok('(9 multi) Shift+clique ACUMULA (2 faces, ativa = a última)', f2.length === 2 && f2[0] === FA.id && f2[1] === FB.id && (await faceAtiva()) === FB.id, `selFaces ${JSON.stringify(f2)} · ativa #${await faceAtiva()}`);
await shiftClick(FC.x, FC.y);                       // Shift+clique soma FC
const f3 = await selFacesB();
ok('(9 multi) Shift+clique ACUMULA (3 faces, ativa = a última)', f3.length === 3 && f3[2] === FC.id && (await faceAtiva()) === FC.id, `selFaces ${JSON.stringify(f3)} · ativa #${await faceAtiva()}`);
await shiftClick(FB.x, FB.y);                       // Shift+clique numa já-selecionada REMOVE
const f4 = await selFacesB();
ok('(9 multi) Shift+clique numa já-selecionada REMOVE (ativa intacta)', f4.length === 2 && !f4.includes(FB.id) && (await faceAtiva()) === FC.id, `selFaces ${JSON.stringify(f4)} · ativa #${await faceAtiva()}`);
await clicarPonto(FA.x, FA.y);                      // clique NORMAL reseta pra 1
const f5 = await selFacesB();
ok('(9 multi) clique normal RESETA pra 1 (limpa o resto)', f5.length === 1 && f5[0] === FA.id, `selFaces ${JSON.stringify(f5)}`);
// XOR: selecionar um VÉRTICE limpa as faces
await page.evaluate((ids) => window.__oficina.selecionarFaces(ids), [FA.id, FC.id]); await rAF2();
const nFacesAntesV = (await selFacesB()).length;
const ptsV9 = await page.evaluate(() => window.__oficina.projMalha());
const vIso9 = escolherVertice(ptsV9).v;
await clicarPonto(vIso9.x, vIso9.y);
const facesPosV = await selFacesB(); const vSelPosV = await page.evaluate(() => window.__oficina.selecionado());
ok('(9 multi) selecionar um VÉRTICE limpa as faces (XOR)', nFacesAntesV === 2 && facesPosV.length === 0 && vSelPosV === vIso9.id, `faces antes ${nFacesAntesV} → depois ${facesPosV.length}, vértice #${vSelPosV}`);
// XOR reverso: selecionar face limpa vértices
await page.evaluate(() => window.__oficina.selecionarVarios([3, 5])); await rAF2();
const nVAntesF = (await selecao()).length;
await clicarPonto(FA.x, FA.y);
const selPosFace9 = await selecao(); const facePosClick = await faceAtiva();
ok('(9 multi) selecionar uma FACE limpa os vértices (XOR reverso)', nVAntesF === 2 && selPosFace9.length === 0 && facePosClick === FA.id, `vértices antes ${nVAntesF} → depois ${selPosFace9.length}, face #${facePosClick}`);

// (9 pinta) o `change` grava o pincel e a face vira a cor; outra face intacta
await aoBaseline();
const CFACE9 = 9;   // topo — pintável e visível de cima pro probe de pixel
const OUTRA = 8;    // fundo — NÃO selecionada, tem que ficar intacta
await page.evaluate((id) => window.__oficina.selecionarFaces([id]), CFACE9); await rAF2();
const corAntes9 = await corFace(CFACE9);
const corOutraAntes = await corFace(OUTRA);
const painelCorAntes = await page.evaluate(() => window.__oficina.painelCor());
ok('(9 pinta) o bloco de cor aparece com a face selecionada e mostra a cor EFETIVA da ativa (read-back)',
   painelCorAntes.vis === true && painelCorAntes.cor.toLowerCase() === (corAntes9 || '#9a8f80').toLowerCase(),
   `bloco visível ${painelCorAntes.vis} · input ${painelCorAntes.cor} vs face #${CFACE9} ${corAntes9}`);
const nP_antesPaint = await nP();
const paletaAntes = await paleta();
const AZUL = '#1030ff';
await pintarChange(AZUL);
const ultimoPaint = await page.evaluate(() => window.__oficina.ultimoPasso());
const nP_posPaint = await nP();
const corDepois9 = await corFace(CFACE9);
const corOutraDepois = await corFace(OUTRA);
ok('(9 pinta) o `change` grava [pincel,{modo:face,faces:[9],cor}] no fim de PASSOS (cresceu 1)',
   nP_posPaint === nP_antesPaint + 1 && JSON.stringify(ultimoPaint) === JSON.stringify(['pincel', { modo: 'face', faces: [CFACE9], cor: AZUL }]),
   `PASSOS ${nP_antesPaint}->${nP_posPaint} · último ${JSON.stringify(ultimoPaint)}`);
ok('(9 pinta) neutro.F.get(9).cor VIROU a cor e a face NÃO selecionada (#8) ficou intacta',
   corDepois9 === AZUL && corOutraDepois === corOutraAntes, `#9 ${corAntes9}->${corDepois9} · #8 ${corOutraAntes}->${corOutraDepois}`);

// (9 render) a cor APARECE no render — paleta do swatch + probe de pixel
const paletaDepois = await paleta();
ok('(9 render) a paleta REAL do swatch (pixels que sobem pra GPU) passou a conter o hex',
   Array.isArray(paletaAntes) && !paletaAntes.includes(AZUL) && Array.isArray(paletaDepois) && paletaDepois.includes(AZUL),
   `antes ${JSON.stringify(paletaAntes)} · depois inclui ${AZUL}: ${paletaDepois && paletaDepois.includes(AZUL)}`);
// probe de PIXEL: olhando o topo de cima, o centro da face 9 vira AZUL (b>r) — antes madeira (r>b).
// Faço o antes/depois na MESMA orientação: desfaço o pincel, meço, refaço.
await ctrlZ();   // tira o pincel → face 9 volta à cor de madeira
await page.evaluate(() => window.__oficina.orbitar({ az: 0, el: 1.45, dist: 1.7, alvo: [0, 0.28, 0] })); await rAF2(); await rAF2();
const pcTopo = await projFace(CFACE9);
const rgbAntes = await probeRGB(pcTopo.x, pcTopo.y);
await ctrlY();   // devolve o pincel → face 9 azul de novo
await rAF2(); await rAF2();
const rgbDepois = await probeRGB(pcTopo.x, pcTopo.y);
ok('(9 render) probe de pixel do topo: madeira (r>b) ANTES vira AZUL (b>r) DEPOIS do pincel',
   rgbAntes.r > rgbAntes.b + 12 && rgbDepois.b > rgbDepois.r + 12 && rgbDepois.b > rgbDepois.g + 12,
   `antes rgb(${rgbAntes.r.toFixed(0)},${rgbAntes.g.toFixed(0)},${rgbAntes.b.toFixed(0)}) · depois rgb(${rgbDepois.r.toFixed(0)},${rgbDepois.g.toFixed(0)},${rgbDepois.b.toFixed(0)})`);

// (9 replay) a lista editada refaz o objeto igual (página == Node)
const passosPaint = await page.evaluate(() => window.__oficina.passos());
const canonPagePaint = await canon();
const canonNodePaint = JSON.stringify(neutroCanonico(nucleo(passosPaint, toco.PARAMS, toco.TOPO)));
ok('(9 replay) a lista editada refaz o objeto igual (página == Node, bit-a-bit)', canonPagePaint === canonNodePaint, `canônico ${canonPagePaint.length} chars, igual`);

// (9 undo/redo) Ctrl+Z tira o pincel (a face volta à cor de antes), Ctrl+Y devolve
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2();
const canonComPincel = await canon();
await ctrlZ();
const nP_undo9 = await nP(); const canonUndo9 = await canon(); const corUndo9 = await corFace(CFACE9);
ok('(9 undo) Ctrl+Z tira o pincel e a face volta bit-a-bit à cor de antes',
   nP_undo9 === nP_antesPaint && canonUndo9 === canonBaseline9 && corUndo9 === corAntes9,
   `PASSOS ${nP_posPaint}->${nP_undo9} · neutro ${canonUndo9 === canonBaseline9 ? 'idêntico' : 'DIVERGE'} · #9 ${corUndo9}`);
await ctrlY();
const canonRedo9 = await canon(); const corRedo9 = await corFace(CFACE9);
ok('(9 redo) Ctrl+Y devolve o pincel (neutro bate com o de depois, a face azul de novo)',
   canonRedo9 === canonComPincel && corRedo9 === AZUL, `neutro ${canonRedo9 === canonComPincel ? 'idêntico' : 'DIVERGE'} · #9 ${corRedo9}`);

// (9 várias) 3 faces + 1 preset = 1 passo pincel com as 3 faces ORDENADAS, todas com a cor
await aoBaseline();
await page.evaluate(() => window.__oficina.selecionarFaces([9, 5, 3])); await rAF2();   // ordem de seleção [9,5,3] (ativa 3) → grava ORDENADO [3,5,9]
const FOLHA = '#7a9c3f';
const nP_antesV = await nP();
await clicarPreset(FOLHA);   // clique REAL num preset
const ultimoV = await page.evaluate(() => window.__oficina.ultimoPasso());
const nP_posV = await nP();
const coresV = [await corFace(3), await corFace(5), await corFace(9)];
ok('(9 várias) 3 faces + 1 cor → 1 passo pincel com as faces ORDENADAS [3,5,9]',
   nP_posV === nP_antesV + 1 && ultimoV && ultimoV[0] === 'pincel' && ultimoV[1].modo === 'face' && JSON.stringify(ultimoV[1].faces) === '[3,5,9]' && ultimoV[1].cor === FOLHA,
   `PASSOS ${nP_antesV}->${nP_posV} · último ${JSON.stringify(ultimoV)}`);
ok('(9 várias) as 3 faces selecionadas viraram a cor', coresV.every((c) => c === FOLHA), `cores #3/#5/#9 ${JSON.stringify(coresV)}`);
await aoBaseline();

// (9 guarda) pintar NO MEIO de um arrasto (extrude em curso) é IGNORADO
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2(); await rAF2();
const pcG9 = await projFace(CFACE9);
await clicarPonto(pcG9.x, pcG9.y);   // seleciona a face 9 (clique real)
const hG9 = await page.evaluate(() => window.__oficina.handleFace());
const gG9 = await agarreLivre(hG9);
const nP_antesGuard = await nP();
await page.mouse.move(gG9.x, gG9.y); await page.mouse.down();
await page.mouse.move(gG9.x + hG9.dir[0] * 24, gG9.y + hG9.dir[1] * 24, { steps: 8 });   // extrude EM CURSO (não soltou)
const emA9 = await page.evaluate(() => window.__oficina.emArrasto());
await pintarChange('#00ff88');   // tenta pintar NO MEIO do arrasto
const nP_durGuard = await nP();
await page.mouse.up(); await rAF2();
const nP_posGuard = await nP();
ok('(9 guarda) o extrude está EM CURSO (arrasto ativo na face 9)', emA9 && emA9.extruda === true && emA9.face === CFACE9, `emArrasto ${JSON.stringify(emA9)}`);
ok('(9 guarda) pintar no meio do arrasto é IGNORADO (PASSOS não muda durante o arrasto)', nP_durGuard === nP_antesGuard,
   `PASSOS ${nP_antesGuard} -> ${nP_durGuard} durante o arrasto (ao soltar o extrude comita: ${nP_posGuard})`);
await aoBaseline();

// (9 bordas) NO-OP de cor-igual (sem passo fantasma) e pintar face SEM cor prévia (null → hex)
await page.evaluate((id) => window.__oficina.selecionarFaces([id]), CFACE9); await rAF2();
const corMostra9 = await corFace(CFACE9);   // '#c39a5e' no baseline
const nP_antesNoop = await nP();
const noop = await page.evaluate((c) => window.__oficina.pintar(c), corMostra9);   // pinta a MESMA cor
const nP_posNoop = await nP();
ok('(9 bordas) pintar a cor que a face JÁ mostra é NO-OP (devolve null, PASSOS não muda)',
   noop === null && nP_posNoop === nP_antesNoop, `pintar('${corMostra9}') → ${noop === null ? 'null' : JSON.stringify(noop)} · PASSOS ${nP_antesNoop}->${nP_posNoop}`);
// pintar face SEM cor prévia: extruda a 9 (paredes novas no bloco idx·1000, cor null), pinta uma
await page.evaluate(() => window.__oficina.selecionarFace(9)); await rAF2();
const nP_antesE = await nP();                                     // o bloco da extrusão é idx·1000 (idx = nº de passos ANTES dela)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))); await rAF2();   // tecla E extruda a face 9 → paredes no bloco (cor null)
const PAREDE = nP_antesE * 1000;
const corParedeAntes = await corFace(PAREDE);
await page.evaluate((id) => window.__oficina.selecionarFaces([id]), PAREDE); await rAF2();
const noopPadrao = await page.evaluate((c) => window.__oficina.pintar(c), '#9a8f80');   // COR_PADRAO numa face null = no-op
const nP_apExtr = await nP();
const passoParede = await page.evaluate((c) => window.__oficina.pintar(c), AZUL);   // cor nova numa face SEM cor prévia → grava
const corParedeDepois = await corFace(PAREDE);
ok('(9 bordas) parede recém-extrudada NÃO tem cor prévia (neutro cor = null)', corParedeAntes === null, `corDaFace(${PAREDE}) = ${corParedeAntes}`);
ok('(9 bordas) pintar COR_PADRAO numa face SEM cor é NO-OP (null conta como a madeira neutra)', noopPadrao === null, `pintar('#9a8f80') → ${noopPadrao === null ? 'null' : JSON.stringify(noopPadrao)}`);
ok('(9 bordas) pintar uma cor NOVA numa face SEM cor prévia grava (null → hex)',
   passoParede && passoParede[0] === 'pincel' && corParedeDepois === AZUL, `passo ${JSON.stringify(passoParede)} · corDaFace(${PAREDE}) ${corParedeAntes}->${corParedeDepois}`);
await aoBaseline();

// screenshots do passo 9: faces pintadas + a multi-seleção destacada
mkdirSync(OUT9, { recursive: true });
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2(); await rAF2();
await page.evaluate(() => { window.__oficina.selecionarFaces([9, 1, 2]); }); await rAF2();
await page.screenshot({ path: join(OUT9, 'oficina-faces-selecionadas.png') });   // 3 faces roxas, a ativa mais forte
await page.evaluate(() => { window.__oficina.selecionarFaces([9]); window.__oficina.pintar('#3b6fd6'); }); await rAF2();
await page.evaluate(() => { window.__oficina.selecionarFaces([1, 2, 3, 4, 5, 6, 7]); window.__oficina.pintar('#7a9c3f'); }); await rAF2();
await page.evaluate(() => { window.__oficina.selecionarFaces([]); window.__oficina.selecionar(null); }); await rAF2();
await page.screenshot({ path: join(OUT9, 'oficina-faces-pintadas.png') });   // topo azul + casca verde
await aoBaseline();

/* ==== PASSO 10: EXPORTAR o objeto como CÓDIGO + COLISÃO automática ==========
   Prova por NÚMERO: (colisão) o painel reflete colisaoDe do estado atual e o toco
   (que TEM solido) não mostra o aviso; (marca) o botão REAL grava ['solido',{faces:
   [ordenadas]}], neutro.F.solido vira true, é desfazível, no-op se já-sólido, e é
   ignorado no meio de um arrasto; (serialização IDA-E-VOLTA — o CORAÇÃO) depois de
   editar (arrasto+extruda+pincel+solido), a string exportada, salva num TEMP e
   RE-IMPORTADA em Node, tem PARAMS/TOPO/PASSOS/meta iguais ao editor e o
   neutroCanonico BIT-A-BIT igual; (servidor) o servir.mjs REAL grava pecas/<nome>.js
   (num pecas TEMP, nunca o rastreado) e o arquivo === o conteúdo, re-importar
   replica; a segurança rejeita ../.., /etc, a/b, .., espaço e símbolo sem escrever
   fora; um GET serve com no-store; (sem-sólido) uma peça sem solido servida pelo
   servir.mjs mostra o AVISO e a colisão vira o objeto INTEIRO, e marcar uma face a
   MUDA; (fallback) sem a rota, o Salvar cai no download sem quebrar. */
mkdirSync(OUT10, { recursive: true });
const T_MOTOR = join(OUT10, 'motor');   // shim: '../motor/oficina.js' das peças TEMP re-exporta o motor REAL (pro Node re-importar)
const T_RT = join(OUT10, 'rt');         // round-trip: a string do editor gravada aqui, re-importada em Node
const T_SRV = join(OUT10, 'srv');       // pecas/ TEMP onde o servir.mjs grava (NUNCA o rastreado)
const T_NS = join(OUT10, 'ns');         // pecas/ TEMP com uma peça SEM solido, servida pro browser
for (const d of [T_MOTOR, T_RT, T_SRV, T_NS]) { rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true }); }
const relShim = relative(T_MOTOR, resolve(REPO, 'prototipos/fps/v3/motor/oficina.js')).split(pathSep).join('/');
writeFileSync(join(T_MOTOR, 'oficina.js'), `export * from ${JSON.stringify(relShim)};\n`);
const reimportar = async (dir, conteudo, nomeArq) => {   // grava no TEMP e importa em Node (com o shim do motor ao lado)
  const arq = join(dir, nomeArq + '.js');
  writeFileSync(arq, conteudo);
  return import(pathToFileURL(arq).href + '?v=' + Date.now());
};
const V3 = resolve(REPO, 'prototipos/fps/v3');

// -------- (10 colisão) o painel reflete colisaoDe; o toco TEM solido → sem aviso --
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2();
await aoBaseline();
const baseN10 = await nP();
const colToco = await page.evaluate(() => window.__oficina.colisao());
const pcToco = await page.evaluate(() => window.__oficina.painelColisao());
ok('(10 colisão) o painel mostra a colisaoDe do estado atual (raio/altura/base batem)',
   pcToco.forma === 'cilindro' && pcToco.raio === colToco.raio.toFixed(3) && pcToco.altura === colToco.altura.toFixed(3) && pcToco.base === colToco.base.toFixed(3),
   `painel r${pcToco.raio}/h${pcToco.altura}/b${pcToco.base} · colisaoDe r${colToco.raio.toFixed(3)}/h${colToco.altura.toFixed(3)}/b${colToco.base.toFixed(3)}`);
ok('(10 colisão) o toco TEM faces sólidas no baseline → o aviso NÃO aparece',
   pcToco.aviso === false && (await page.evaluate(() => window.__oficina.temSolido())) === true, `aviso ${pcToco.aviso}`);

// -------- (10 marca) o botão REAL marca faces não-sólidas como sólidas ----------
const Ftoco = JSON.parse(await canon()).F;                       // [id, vs, cor, mat, liso, solido]
const naoSolidas = Ftoco.filter((f) => !f[5]).map((f) => f[0]).sort((a, b) => a - b).slice(0, 2);
ok('(10 marca) o toco tem faces NÃO-sólidas pra marcar (as paredes do galho)', naoSolidas.length === 2, `não-sólidas ${JSON.stringify(naoSolidas)}`);
await page.evaluate((ids) => window.__oficina.selecionarFaces(ids), naoSolidas); await rAF2();
const pcAntesMarca = await page.evaluate(() => window.__oficina.painelColisao());
const nP_antesMarca = await nP();
const btVis = await page.$eval('#btSolido', (el) => !el.hidden);
await page.click('#btSolido'); await rAF2();          // CLIQUE REAL no botão (Playwright rola pra vista + evento real)
const ultimoMarca = await page.evaluate(() => window.__oficina.ultimoPasso());
const nP_posMarca = await nP();
const solid0 = await page.evaluate((id) => window.__oficina.solidoDe(id), naoSolidas[0]);
const solid1 = await page.evaluate((id) => window.__oficina.solidoDe(id), naoSolidas[1]);
ok('(10 marca) o botão "marcar sólido" aparece com face(s) selecionada(s)', btVis === true && pcAntesMarca.btSolido === true);
ok('(10 marca) clicar grava [solido,{faces:[ordenadas]}] no fim de PASSOS (cresceu 1)',
   nP_posMarca === nP_antesMarca + 1 && JSON.stringify(ultimoMarca) === JSON.stringify(['solido', { faces: naoSolidas }]),
   `PASSOS ${nP_antesMarca}->${nP_posMarca} · último ${JSON.stringify(ultimoMarca)}`);
ok('(10 marca) neutro.F.solido das faces marcadas VIROU true', solid0 === true && solid1 === true, `solidoDe ${naoSolidas[0]}=${solid0} ${naoSolidas[1]}=${solid1}`);
await ctrlZ();
ok('(10 marca) Ctrl+Z desfaz a marcação (solidoDe volta a false, PASSOS ao baseline)',
   (await page.evaluate((id) => window.__oficina.solidoDe(id), naoSolidas[0])) === false && (await nP()) === nP_antesMarca);

// -------- (10 marca no-op) marcar uma face JÁ sólida não grava passo fantasma ----
await aoBaseline();
const jaSolida = Ftoco.filter((f) => f[5]).map((f) => f[0])[0];   // uma face já sólida no baseline (0..9)
await page.evaluate((id) => window.__oficina.selecionarFaces([id]), jaSolida); await rAF2();
const noopMarca = await page.evaluate(() => window.__oficina.marcarSolido());
ok('(10 marca no-op) marcar uma face JÁ sólida é NO-OP (devolve null, PASSOS não muda)',
   noopMarca === null && (await nP()) === baseN10, `pintar-solido(#${jaSolida}) → ${noopMarca === null ? 'null' : JSON.stringify(noopMarca)}`);

// -------- (10 marca guarda) marcar no meio de um arrasto (extrude) é IGNORADO -----
await aoBaseline();
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.selecionarFace(9)); await rAF2();
const hMarca = await page.evaluate(() => window.__oficina.handleFace());
const gMarca = hMarca && !hMarca.travada ? await agarreLivre(hMarca) : null;
if (gMarca) {
  await page.mouse.move(gMarca.x, gMarca.y); await page.mouse.down();
  await page.mouse.move(gMarca.x + hMarca.dir[0] * 24, gMarca.y + hMarca.dir[1] * 24, { steps: 8 });   // extrude EM CURSO
  const emArr = await page.evaluate(() => window.__oficina.emArrasto());
  const nP_antesGm = await nP();
  const marcaDur = await page.evaluate(() => window.__oficina.marcarSolido());
  const nP_durGm = await nP();
  await page.mouse.up(); await rAF2();
  ok('(10 marca guarda) marcar no meio de um arrasto é IGNORADO (devolve null, PASSOS não muda)',
     emArr && emArr.extruda === true && marcaDur === null && nP_durGm === nP_antesGm, `emArrasto ${JSON.stringify(emArr)} · marcar→${marcaDur === null ? 'null' : 'GRAVOU'}`);
} else { ok('(10 marca guarda) handle da face 9 disponível pra o teste de guarda', false, 'handle travado/ausente'); }
await aoBaseline();

// -------- (10 serialização IDA-E-VOLTA) — o CORAÇÃO ----------------------------
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2(); await rAF2();
await arrastarVertice(26, -20);                                                   // moveV REAL (arrasto)
await page.evaluate(() => window.__oficina.selecionarFace(9)); await rAF2();
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))); await rAF2();   // extruda (tecla E)
await page.evaluate(() => { window.__oficina.selecionarFaces([9]); window.__oficina.pintar('#2277cc'); }); await rAF2();   // pinta
const paraSolido = JSON.parse(await canon()).F.filter((f) => !f[5]).map((f) => f[0])[0];   // uma face não-sólida qualquer
await page.evaluate((id) => { window.__oficina.selecionarFaces([id]); window.__oficina.marcarSolido(); }, paraSolido); await rAF2();   // marca sólido
const canonEdit = await canon();
const strEdit = await page.evaluate(() => window.__oficina.serializar());
const passosEdit = await page.evaluate(() => window.__oficina.passos());
const Mrt = await reimportar(T_RT, strEdit, 'rt_editado');
const canonNodeEdit = JSON.stringify(neutroCanonico(nucleo(Mrt.PASSOS, Mrt.PARAMS, Mrt.TOPO)));
ok('(10 serial) o export tem o cabeçalho, o import e a CHAMADA colisaoDe(PASSOS, PARAMS, TOPO) (não o valor)',
   strEdit.startsWith('/*') && strEdit.includes("import { executar, colisaoDe } from '../motor/oficina.js';") &&
   /colisao:\s*colisaoDe\(PASSOS, PARAMS, TOPO\)/.test(strEdit) && !/colisao:\s*\{/.test(strEdit));
ok('(10 serial) PARAMS e TOPO reabrem iguais ao editor', JSON.stringify(Mrt.PARAMS) === JSON.stringify(toco.PARAMS) && JSON.stringify(Mrt.TOPO) === JSON.stringify(toco.TOPO),
   `PARAMS ${JSON.stringify(Mrt.PARAMS)} · TOPO ${JSON.stringify(Mrt.TOPO)}`);
ok('(10 serial) PASSOS reabrem iguais à lista EDITADA (arrasto+extruda+pincel+solido)',
   JSON.stringify(Mrt.PASSOS) === JSON.stringify(passosEdit) && Mrt.PASSOS.length === baseN10 + 4, `${Mrt.PASSOS.length} passos (baseline ${baseN10} + 4 edições)`);
ok('(10 serial) meta.nome/tipo/desc iguais + colisao é objeto recalculado (cilindro)',
   Mrt.meta.nome === toco.meta.nome && Mrt.meta.tipo === toco.meta.tipo && Mrt.meta.desc === toco.meta.desc && Mrt.meta.colisao && Mrt.meta.colisao.forma === 'cilindro');
ok('(10 serial ★) neutroCanonico BIT-A-BIT: a peça exportada REABRE IDÊNTICA à editada (página == Node)',
   canonNodeEdit === canonEdit, `${canonNodeEdit.length} chars, ${canonNodeEdit === canonEdit ? 'idêntico' : 'DIVERGE'}`);

// -------- (10 servidor) o servir.mjs REAL grava em pecas/ TEMP + segurança + no-store
const srv = criarServidor({ raiz: V3, pecas: T_SRV });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const sbase = `http://127.0.0.1:${srv.address().port}`;
const rGrava = await fetch(`${sbase}/oficina/salvar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'teste_export', conteudo: strEdit }) });
const jGrava = await rGrava.json();
const gravado = existsSync(join(T_SRV, 'teste_export.js')) ? readFileSync(join(T_SRV, 'teste_export.js'), 'utf8') : null;
ok('(10 servidor grava) POST {nome:teste_export} grava pecas/teste_export.js e o arquivo === o conteúdo enviado',
   rGrava.status === 200 && jGrava.ok === true && gravado === strEdit, `status ${rGrava.status} · igual ${gravado === strEdit}`);
const Mg = await import(pathToFileURL(join(T_SRV, 'teste_export.js')).href + '?v=' + Date.now());
ok('(10 servidor grava) re-importar o arquivo GRAVADO replica o objeto (canônico == editor)',
   JSON.stringify(neutroCanonico(nucleo(Mg.PASSOS, Mg.PARAMS, Mg.TOPO))) === canonEdit);
const antesSeg = readdirSync(T_SRV).sort().join(',');
const maus = ['../../evil', '/etc/passwd', 'a/b', '..', 'com espaco', 'x;rm -rf'];
let rejeitados = 0;
for (const mau of maus) { const rr = await fetch(`${sbase}/oficina/salvar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: mau, conteudo: 'HACK' }) }); if (rr.status >= 400) rejeitados++; }
const depoisSeg = readdirSync(T_SRV).sort().join(',');
const escapou = existsSync(join(OUT10, 'evil.js')) || existsSync(resolve(V3, 'evil.js')) || existsSync(resolve(REPO, 'evil.js')) || existsSync('/tmp/HACK') || existsSync(join(T_SRV, '..', 'evil.js'));
ok('(10 segurança) TODOS os nomes maliciosos rejeitados (../.., /etc, a/b, .., espaço, símbolo)', rejeitados === maus.length, `${rejeitados}/${maus.length} rejeitados (status>=400)`);
ok('(10 segurança) NADA escrito fora nem a mais em pecas/ (o traversal não escapou)', antesSeg === depoisSeg && !escapou, `pecas antes [${antesSeg}] depois [${depoisSeg}] · escapou ${escapou}`);
const rNoStore = await fetch(`${sbase}/motor/oficina.js`);
ok('(10 no-store) GET a um módulo serve com Cache-Control: no-store', rNoStore.status === 200 && rNoStore.headers.get('cache-control') === 'no-store', `cache-control ${rNoStore.headers.get('cache-control')}`);
srv.close();

// -------- (10 sem-sólido) peça SEM solido servida pelo servir.mjs → aviso + objeto todo
const SEM_SOLIDO = `/* semsolido — fixture da bancada (passo 10): peça SEM solido, pra provar o aviso e a colisão do objeto inteiro. */
import { executar, colisaoDe } from '../motor/oficina.js';
export const PARAMS = { r: 0.5, h: 1 };
export const TOPO = { lados: 8 };
export const PASSOS = [
  ['cilindro', { id: 0, raio: 'r', altura: 'h', lados: 'lados' }],
];
export const meta = { nome: 'semsolido', tipo: 'objeto', desc: 'sem solido', colisao: colisaoDe(PASSOS, PARAMS, TOPO) };
export function construir(ctx) { return executar(PASSOS, PARAMS, TOPO, ctx); }
`;
writeFileSync(join(T_NS, 'semsolido.js'), SEM_SOLIDO);
const srvNS = criarServidor({ raiz: V3, pecas: T_NS });
await new Promise((r) => srvNS.listen(0, '127.0.0.1', r));
const nsBase = `http://127.0.0.1:${srvNS.address().port}`;
const page2 = await browser.newPage({ viewport: { width: VW, height: VH } });
page2.on('pageerror', (e) => console.error('PAGEERR(ns):', e.message));
await page2.goto(`${nsBase}/oficina.html?peca=semsolido`, { waitUntil: 'load' });
await page2.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const ready2 = await page2.evaluate(() => window.__ready === true);
ok('(10 sem-sólido) o servir.mjs serve a Oficina + a peça SEM solido, e ela abre (window.__ready)', ready2);
const pc2 = await page2.evaluate(() => window.__oficina.painelColisao());
const col2 = await page2.evaluate(() => window.__oficina.colisao());
const temSol2 = await page2.evaluate(() => window.__oficina.temSolido());
ok('(10 sem-sólido) NENHUMA face sólida → o AVISO aparece EM DESTAQUE', pc2.aviso === true && temSol2 === false, `aviso ${pc2.aviso} · temSolido ${temSol2}`);
ok('(10 sem-sólido) a colisão usa o OBJETO INTEIRO (raio≈0.5, altura≈1, base≈0)',
   Math.abs(col2.raio - 0.5) < 1e-9 && Math.abs(col2.altura - 1) < 1e-9 && Math.abs(col2.base) < 1e-9, `raio ${col2.raio} altura ${col2.altura} base ${col2.base}`);
await page2.screenshot({ path: join(OUT10, 'oficina-sem-solido-aviso.png') });
// marcar o TOPO (face 9) sólido → a colisão MUDA (só o anel de cima: altura → 0) e o aviso some
await page2.evaluate(() => window.__oficina.selecionarFaces([9])); await rAF2();
const marcou2 = await page2.evaluate(() => window.__oficina.marcarSolido());
const col2b = await page2.evaluate(() => window.__oficina.colisao());
const pc2b = await page2.evaluate(() => window.__oficina.painelColisao());
ok('(10 sem-sólido→marca) marcar a face 9 grava [solido,{faces:[9]}] e solidoDe(9)=true',
   JSON.stringify(marcou2) === JSON.stringify(['solido', { faces: [9] }]) && (await page2.evaluate(() => window.__oficina.solidoDe(9))) === true);
ok('(10 sem-sólido→marca) a colisão MUDOU (só o topo: altura 1→0, base 0→1) e o aviso SUMIU',
   Math.abs(col2b.altura) < 1e-9 && Math.abs(col2b.base - 1) < 1e-9 && pc2b.aviso === false && pc2b.altura === col2b.altura.toFixed(3),
   `altura ${col2.altura}→${col2b.altura} · base ${col2.base}→${col2b.base} · aviso ${pc2b.aviso}`);
await page2.close();
srvNS.close();

// -------- (10 fallback) sem a rota (server estático da bancada), o Salvar baixa ---
await aoBaseline();
const dlAntes = await page.evaluate(() => window.__oficina.ultimoDownload());
const resSalvar = await page.evaluate(() => window.__oficina.salvar());   // POST → 404 (rota ausente aqui) → FALLBACK download
const dlDepois = await page.evaluate(() => window.__oficina.ultimoDownload());
ok('(10 fallback) sem a rota de salvar, o Salvar cai no DOWNLOAD sem quebrar (blob + <a download>)',
   resSalvar && resSalvar.via === 'download' && dlAntes === null && dlDepois && dlDepois.nome.endsWith('.js') && dlDepois.tamanho > 200,
   `via ${resSalvar && resSalvar.via} · download ${JSON.stringify(dlDepois)}`);

// screenshot do passo 10: painel de colisão + face marcada sólida na peça principal
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2();
await aoBaseline();
await page.evaluate(() => window.__oficina.selecionarFaces([1000, 1001])); await rAF2();
await page.screenshot({ path: join(OUT10, 'oficina-colisao-painel.png') });
await aoBaseline();
// limpa os dirs TEMP de peças (scratchpad é gitignored; some com o repo limpo)
for (const d of [T_MOTOR, T_RT, T_SRV, T_NS]) rmSync(d, { recursive: true, force: true });

/* ==== PASSO 11a: ATLAS POR FACE — a FUNDAÇÃO da textura pintável ============
   O adaptarV3 troca o SWATCH (fita de cores; faces da mesma cor num só texel)
   por um ATLAS: cada face uma ILHA própria, UV por PROJEÇÃO EM CAIXA daquela
   face. Prova por MEDIÇÃO:
   (11a estrutura) headless (adaptarV3 com um ctx de mentira que só devolve
     {W,H,fn}): as N ilhas são DISJUNTAS e o FURO da caixa GLOBAL — topo(+y #9) e
     fundo(−y #8) quase no MESMO XZ (IoU alto) — some, cada um na sua ilha;
   (11a equivale) na TELA, o toco renderiza cada face na SUA cor, IGUAL ao swatch
     (probe de pixel — o critério: se muda de aparência, é regressão; o cmp
     byte-a-byte swatch↔atlas fecha isso no relatório).
   O mapa por face (ilha + projeta) fica em R11.atlas pro pincel macio do 11b. */
const ctxAtlas11 = { tex: { texCanvas: (w, h, fn) => ({ width: w, height: h, fn }) } };   // ctx headless: captura {W,H,fn}, não desenha
const neutro11 = nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO);
const R11 = adaptarV3(neutro11, ctxAtlas11);
const faceIds11 = [...neutro11.F.values()].map((f) => f.id).sort((a, b) => a - b);
const inter11 = (A, B) => !(A.x + A.w <= B.x || B.x + B.w <= A.x || A.y + A.h <= B.y || B.y + B.h <= A.y);
const rects11 = faceIds11.map((id) => R11.atlas.daFace(id).ilha);
let col11 = 0; for (let a = 0; a < rects11.length; a++) for (let b = a + 1; b < rects11.length; b++) if (inter11(rects11[a], rects11[b])) col11++;
ok(`(11a estrutura) as ${N_FACE} ilhas do atlas são DISJUNTAS (nenhuma sobreposição)`, col11 === 0,
   `${col11} pares se intersectam · grade ${R11.atlas.cols}×${R11.atlas.rows}, ilha ${R11.atlas.tile}px, gutter ${R11.atlas.gutter}px, textura ${R11.atlas.W}×${R11.atlas.H}`);
// o FURO por NÚMERO: na caixa GLOBAL o fundo #8 e o topo #9 projetam no mesmo XZ (bbox 2D quase idêntica → IoU≈1); o atlas os separa (ilhas distintas)
const bboxXZ = (id) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const v of neutro11.F.get(id).vs) { const p = neutro11.V.get(v); if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2]; } return { x0, x1, z0, z1 }; };
const b8 = bboxXZ(8), b9 = bboxXZ(9);
const ovl = Math.max(0, Math.min(b8.x1, b9.x1) - Math.max(b8.x0, b9.x0)) * Math.max(0, Math.min(b8.z1, b9.z1) - Math.max(b8.z0, b9.z0));
const uni = (b8.x1 - b8.x0) * (b8.z1 - b8.z0) + (b9.x1 - b9.x0) * (b9.z1 - b9.z0) - ovl;
const iouGlobal = ovl / uni;
const il8 = R11.atlas.daFace(8).ilha, il9 = R11.atlas.daFace(9).ilha;
ok('(11a estrutura) o FURO da caixa GLOBAL (fundo #8 e topo #9 quase no mesmo XZ, IoU alto) some — no atlas as ilhas são distintas',
   iouGlobal > 0.9 && !inter11(il8, il9),
   `IoU global ${iouGlobal.toFixed(3)} (sobreposição quase total → pintar um pintaria o outro) · ilha #8 ${JSON.stringify(il8)} vs #9 ${JSON.stringify(il9)} (não se intersectam)`);

// (11a equivale) probe de PIXEL do topo #9 de cima: a madeira clara que o swatch dava
await aoBaseline();
await page.evaluate((f) => window.__oficina.orbitar(f), { az: 0, el: 1.45, dist: 1.7, alvo: [0, 0.28, 0] }); await rAF2(); await rAF2();
const pTopo11 = await projFace(9);
const rgbTopo11 = await probeRGB(pTopo11.x, pTopo11.y);
ok('(11a equivale) o topo #9 renderiza a MADEIRA clara (r>b e g>b) na tela — a mesma cor do swatch',
   rgbTopo11.r > rgbTopo11.b + 12 && rgbTopo11.g > rgbTopo11.b + 8,
   `rgb(${rgbTopo11.r.toFixed(0)},${rgbTopo11.g.toFixed(0)},${rgbTopo11.b.toFixed(0)})`);

// screenshot do toco pelo ATLAS (deve parecer IDÊNTICO ao swatch — cmp byte-a-byte no relatório)
mkdirSync(OUT11, { recursive: true });
await page.evaluate((f) => window.__oficina.orbitar(f), F9); await rAF2(); await rAF2();
await page.screenshot({ path: join(OUT11, 'oficina-atlas-toco.png') });
await aoBaseline();

/* ==== PASSO 11b (MOTOR): PINCEL MACIO no núcleo — a op 'livre' + a rasterização do
   DAB. Headless por MEDIÇÃO (sem interface; a interface, pintar arrastando, é o 11c).
   A op grava a tinta ANCORADA à face ({a,b} FACE-LOCAL, o mesmo s,t da projeção — não
   um texel cru) e o adaptarV3 pinta um dab radial macio na ilha; determinístico (a
   tinta entra na canon), a tinta ACOMPANHA a face num moveV, órfão grita, e o modo
   'face' segue BYTE-idêntico (o toco canoniza igual). ctxAtlas11 devolve {W,H,fn}, então
   R.tex.fn(x,y) amostra o texel — como o motor faz (NEAREST). */
const amostra11b = (R, x, y) => R.tex.fn(x, y);
const BASE11 = [0x9a, 0x8f, 0x80];   // COR_PADRAO (madeira neutra sob o dab de uma face sem cor chapada)
const ehCor11 = (c) => c[0] === 255 && c[1] === 0 && c[2] === 0;
const ehBase11 = (c) => c[0] === BASE11[0] && c[1] === BASE11[1] && c[2] === BASE11[2];
const cubo11 = ['cubo', { id: 0, lado: 1 }];
// (1) modo livre rasteriza um dab: centro = cor, borda = base, meio esmaece (degradê por número)
const nLivre11 = nucleo([cubo11, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.3, dureza: 0.5, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }]], {}, {});
const Rl11 = adaptarV3(nLivre11, ctxAtlas11);
const ilL11 = Rl11.atlas.daFace(0).ilha, cxL11 = Math.round(ilL11.x + 0.5 * ilL11.w), cyL11 = Math.round(ilL11.y + 0.5 * ilL11.h);
const centroL11 = amostra11b(Rl11, cxL11, cyL11), meioL11 = amostra11b(Rl11, cxL11 + 6, cyL11), bordaL11 = amostra11b(Rl11, cxL11 + 8, cyL11);
ok('(11b motor) modo livre pinta um DAB radial: centro = cor, borda = base, e o meio esmaece (degradê)',
   ehCor11(centroL11) && ehBase11(bordaL11) && meioL11[0] > BASE11[0] && meioL11[0] < 255 && meioL11[1] > 0 && meioL11[1] < BASE11[1],
   `centro rgb(${centroL11}) · +6px rgb(${meioL11}) · +8px rgb(${bordaL11}) · tinta gravada ${JSON.stringify(nLivre11.F.get(0).tinta[0])}`);
// (2) determinismo + compat: canon com dab estável 2x + round-trip JSON, e o toco (só 'face') canoniza SEM tinta (linha F de 6 = byte-igual ao 11a)
const passL11 = [cubo11, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.25, dureza: 0.7, pontos: [{ f: 0, a: 0.3, b: 0.4 }, { f: 3, a: 0.5, b: 0.5 }] }]];
const cL1_11 = JSON.stringify(neutroCanonico(nucleo(passL11, {}, {})));
const cL2_11 = JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(passL11)), {}, {})));
const canonToco11 = neutroCanonico(nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO));
const cSemDab11 = JSON.stringify(neutroCanonico(nucleo([cubo11], {}, {})));
ok('(11b motor) determinismo (canon 2x + round-trip JSON, a tinta ESTÁ na canon) e compat: o toco só-face canoniza sem tinta',
   cL1_11 === cL2_11 && cL1_11 !== cSemDab11 && canonToco11.F.every((r) => r.length === 6),
   `canon com dab estável e != sem dab (replay carrega a tinta); toco: todas as ${canonToco11.F.length} faces com linha F de 6 (sem 7º campo = byte-igual ao 11a)`);
// (3) paint-follows-face: um moveV DEPOIS num vértice da face mantém o dab no {a,b} da ilha (centro segue a cor); a projeção do canto v1 de fato deslizou
const nMov11 = nucleo([cubo11, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.3, dureza: 0.6, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }], ['moveV', { v: 2, d: [0.4, 0, 0.3] }]], {}, {});
const Rm11 = adaptarV3(nMov11, ctxAtlas11), ilM11 = Rm11.atlas.daFace(0).ilha;
const uvAntes11 = Rl11.atlas.daFace(0).projeta(nLivre11.V.get(1)), uvDepois11 = Rm11.atlas.daFace(0).projeta(nMov11.V.get(1));
ok('(11b motor) paint-follows-face: um moveV depois mantém o dab no {a,b} da face (o centro segue vermelho, o UV do canto deslizou)',
   ehCor11(amostra11b(Rm11, Math.round(ilM11.x + 0.5 * ilM11.w), Math.round(ilM11.y + 0.5 * ilM11.h))) && JSON.stringify(uvAntes11) !== JSON.stringify(uvDepois11),
   `UV do canto v1 ${JSON.stringify(uvAntes11)} -> ${JSON.stringify(uvDepois11)} (a projeção mexeu), mas o centro do dab segue cor`);
// (4) órfão grita; raio maior tinge mais texels; e o dab fica PRESO na célula (não vaza pra ilha vizinha)
const nOrf11 = nucleo([cubo11, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 0.3, dureza: 0.5, pontos: [{ f: 999, a: 0.5, b: 0.5 }] }]], {}, {});
const tintados11 = (raio, dureza) => { const R = adaptarV3(nucleo([cubo11, ['pincel', { modo: 'livre', cor: '#ff0000', raio, dureza, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }]], {}, {}), ctxAtlas11); const il = R.atlas.daFace(0).ilha; let n = 0; for (let y = il.y; y < il.y + il.h; y++) for (let x = il.x; x < il.x + il.w; x++) if (!ehBase11(amostra11b(R, x, y))) n++; return n; };
const tPeq11 = tintados11(0.2, 0.5), tGde11 = tintados11(0.4, 0.5);
const nBig11 = adaptarV3(nucleo([cubo11, ['pincel', { modo: 'livre', cor: '#ff0000', raio: 3, dureza: 1, pontos: [{ f: 0, a: 0.5, b: 0.5 }] }]], {}, {}), ctxAtlas11);
const ilViz11 = nBig11.atlas.daFace(1).ilha;
const vizIntacta11 = ehBase11(amostra11b(nBig11, Math.round(ilViz11.x + 0.5 * ilViz11.w), Math.round(ilViz11.y + 0.5 * ilViz11.h)));
ok('(11b motor) órfão grita; raio maior tinge mais texels; e o dab fica PRESO na célula (não vaza pra vizinha)',
   nOrf11.orfaos.length === 1 && nOrf11.orfaos[0].op === 'pincel' && nOrf11.orfaos[0].ref === 999 && tGde11 > tPeq11 && vizIntacta11,
   `órfão #999 (op pincel, malha do cubo intacta V=${nOrf11.V.size}/F=${nOrf11.F.size}) · texels tingidos raio0.2=${tPeq11} < raio0.4=${tGde11} · face vizinha #1 intacta sob raio gigante`);

/* ==== PASSO 11c: PINCEL MACIO — pintar arrastando na SUPERFÍCIE (a INTERFACE grava
   a op certa a partir do gesto). Gestos REAIS (page.mouse). O motor da op 'livre' + o
   ATLAS (adaptarV3) já estão provados (11a/11b); aqui o foco é a interface GRAVAR o
   ['pincel',{modo:'livre',...}] certo e não regredir o resto. A câmera olha o topo #9
   (com az=0 a direita da tela = +X do mundo, então um arrasto horizontal → `a` monotônico). */
mkdirSync(OUT11C, { recursive: true });
const CAM11C = { az: 0, el: 1.15, dist: 1.7, alvo: [0, 0.28, 0] };
const F9base = [0xc3, 0x9a, 0x5e];   // cor CHAPADA da face 9 (#c39a5e) — o fundo da ilha sob o dab
await page.evaluate(() => { window.__oficina.selecionar(null); window.__oficina.selecionarFaces([]); window.__oficina.ligarPincel(false); }); await rAF2();
await aoBaseline();
await page.evaluate((f) => window.__oficina.orbitar(f), CAM11C); await rAF2(); await rAF2();

// (11c raycast) o inverso EXATO de projetar (com LENTE): o ponto de superfície do
// cursor, projetado de volta pelo PRÓPRIO motor, cai EM CIMA do cursor (prova
// NÃO-circular). Quebra na hora se o raio ignorar a lente/aspect.
const s9 = await projFace(9);
const fCentro9 = await page.evaluate(([x, y]) => window.__oficina.hitFace(x, y), [s9.x, s9.y]);
const probeCur = { x: s9.x + 12, y: s9.y - 7 };
const hitP = await page.evaluate((p) => window.__oficina.pincelNoPonto(p.x, p.y), probeCur);
const backP = await page.evaluate((p) => window.__oficina.projetar(p), hitP.pMundo);
const erroRT = Math.hypot(backP.x - probeCur.x, backP.y - probeCur.y);
ok('(11c raycast) o ponto de superfície do cursor projeta de VOLTA no cursor (inverso exato de projetar, com lente)',
   fCentro9 === 9 && hitP.f === 9 && erroRT < 1.0, `hitFace centro #${fCentro9} · face do raio #${hitP.f} · round-trip ${erroRT.toFixed(3)}px`);
const abChk = await page.evaluate((h) => window.__oficina.abInMundo(h.f, h.pMundo), hitP);
ok('(11c raycast) abInMundo(face, pontoMundo) == {a,b} do raycast (conversão superfície→face-local consistente)',
   Math.abs(abChk.a - hitP.ab.a) < 1e-9 && Math.abs(abChk.b - hitP.ab.b) < 1e-9,
   `raycast {a:${hitP.ab.a.toFixed(4)},b:${hitP.ab.b.toFixed(4)}} vs abInMundo {a:${abChk.a.toFixed(4)},b:${abChk.b.toFixed(4)}}`);

// === PROVA 1: o MODO muda o comportamento do arrasto; DESLIGADO, sem regressão ===
await page.evaluate(() => { window.__oficina.selecionar(null); window.__oficina.selecionarFaces([]); window.__oficina.ligarPincel(false); }); await rAF2();
const modoOff = await page.evaluate(() => window.__oficina.modoPincel());
const estOffA = await page.evaluate(() => window.__oficina.estado());
const nP_off0 = await nP();
await page.mouse.move(s9.x - 30, s9.y); await page.mouse.down();
await page.mouse.move(s9.x + 30, s9.y, { steps: 12 }); await page.mouse.up(); await rAF2();
const nP_off1 = await nP();
const estOffB = await page.evaluate(() => window.__oficina.estado());
const orbitouOff = Math.abs(estOffB.az - estOffA.az) > 1e-4 || Math.abs(estOffB.el - estOffA.el) > 1e-4;
ok('(11c modo) DESLIGADO: arrasto no corpo da face ORBITA e NÃO pinta (passo 7 intacto)',
   modoOff === false && nP_off1 === nP_off0 && orbitouOff, `modo ${modoOff} · PASSOS ${nP_off0}->${nP_off1} · orbitou ${orbitouOff}`);
// LIGADO: o MESMO arrasto na face PINTA (grava) e a câmera NÃO gira
await page.evaluate((f) => window.__oficina.orbitar(f), CAM11C); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.ligarPincel(true)); await rAF2();
const modoOn = await page.evaluate(() => window.__oficina.modoPincel());
const s9on = await projFace(9);
const selAntesOn = await page.evaluate(() => window.__oficina.selecionado());
const estOnA = await page.evaluate(() => window.__oficina.estado());
const nP_on0 = await nP();
await page.mouse.move(s9on.x - 30, s9on.y); await page.mouse.down();
await page.mouse.move(s9on.x + 30, s9on.y, { steps: 12 }); await page.mouse.up(); await rAF2();
const nP_on1 = await nP();
const ultimoOn = await page.evaluate(() => window.__oficina.ultimoPasso());
const estOnB = await page.evaluate(() => window.__oficina.estado());
const selDepoisOn = await page.evaluate(() => window.__oficina.selecionado());
const naoOrbitouOn = Math.abs(estOnB.az - estOnA.az) < 1e-6 && Math.abs(estOnB.el - estOnA.el) < 1e-6;
ok('(11c modo) LIGADO: o MESMO arrasto PINTA (grava pincel livre), a câmera NÃO gira e NENHUM vértice é selecionado/movido',
   modoOn === true && nP_on1 === nP_on0 + 1 && ultimoOn[0] === 'pincel' && ultimoOn[1].modo === 'livre' && naoOrbitouOn && selAntesOn === null && selDepoisOn === null,
   `modo ${modoOn} · PASSOS ${nP_on0}->${nP_on1} · op ${ultimoOn[0]}/${ultimoOn[1].modo} · câmera parada ${naoOrbitouOn} · sel ${selAntesOn}->${selDepoisOn}`);
// sem regressão: DESLIGADO um arrasto de vértice ainda grava moveV (passo 4 intacto)
await aoBaseline();
await page.evaluate(() => window.__oficina.ligarPincel(false)); await rAF2();
await page.evaluate((f) => window.__oficina.orbitar(f), F4); await rAF2();
const nP_reg0 = await nP();
await arrastarVertice(0, -26);
const nP_reg1 = await nP();
const ultReg = await page.evaluate(() => window.__oficina.ultimoPasso());
ok('(11c modo) sem regressão: DESLIGADO um arrasto de vértice ainda grava moveV (passo 4 intacto)',
   nP_reg1 === nP_reg0 + 1 && ultReg[0] === 'moveV', `PASSOS ${nP_reg0}->${nP_reg1} · op ${ultReg[0]}`);

// === PROVA 2: PINTA GRAVA CERTO — face certa + {a,b} batendo a posição arrastada ===
await aoBaseline();
await page.evaluate((f) => window.__oficina.orbitar(f), CAM11C); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.setPincel({ cor: '#1030ff', raio: 0.22, dureza: 0.6 })); await rAF2();
await page.evaluate(() => window.__oficina.ligarPincel(true)); await rAF2();
const canonBase11c = await canon();   // baseline pré-pincelada (pro undo/redo)
const s9p = await projFace(9);
const nP_p0 = await nP();
await page.mouse.move(s9p.x - 58, s9p.y); await page.mouse.down();
await page.mouse.move(s9p.x + 58, s9p.y, { steps: 24 }); await page.mouse.up(); await rAF2();
const opPaint = await page.evaluate(() => window.__oficina.ultimoPasso());
const nP_p1 = await nP();
const canonComPincel11c = await canon();   // com a pincelada (pro redo)
const pts11c = opPaint[1].pontos;
const todasFace9 = pts11c.every((pt) => pt.f === 9);
const abRange = pts11c.every((pt) => pt.a >= -0.02 && pt.a <= 1.02 && pt.b >= -0.02 && pt.b <= 1.02);
const asArr = pts11c.map((pt) => pt.a), bsArr = pts11c.map((pt) => pt.b);
const aSobe = asArr.every((v, i) => i === 0 || v >= asArr[i - 1] - 1e-6);
const aDesce = asArr.every((v, i) => i === 0 || v <= asArr[i - 1] + 1e-6);
const aSpread = Math.max(...asArr) - Math.min(...asArr), bSpread = Math.max(...bsArr) - Math.min(...bsArr);
ok('(11c grava) arrasto na superfície grava [pincel,{modo:livre,cor,raio,dureza,pontos:[{f,a,b}]}] no fim de PASSOS',
   nP_p1 === nP_p0 + 1 && opPaint[0] === 'pincel' && opPaint[1].modo === 'livre' && opPaint[1].cor === '#1030ff' && opPaint[1].raio === 0.22 && opPaint[1].dureza === 0.6 && Array.isArray(pts11c) && pts11c.length >= 4,
   `PASSOS ${nP_p0}->${nP_p1} · ${pts11c.length} pontos · cor ${opPaint[1].cor} raio ${opPaint[1].raio} dureza ${opPaint[1].dureza}`);
ok('(11c grava) os pontos caem na FACE certa (#9, sob o cursor) e {a,b}∈[0,1] ACOMPANHAM o arrasto (a monotônico e espalhado, b ~constante)',
   todasFace9 && abRange && (aSobe || aDesce) && aSpread > 0.3 && bSpread < 0.15,
   `todas #9 ${todasFace9} · a∈[0,1] ${abRange} · a ${aSobe ? 'sobe' : aDesce ? 'desce' : 'NÃO-monot'} spread ${aSpread.toFixed(3)} · b spread ${bSpread.toFixed(3)}`);

// === PROVA 4: REPLAY — a lista editada re-executada bit-a-bit igual PÁGINA == NODE ===
const passos11c = await page.evaluate(() => window.__oficina.passos());
const canonPage11c = await canon();
const canonNode11c = JSON.stringify(neutroCanonico(nucleo(passos11c, toco.PARAMS, toco.TOPO)));
ok('(11c replay) a lista editada refaz o objeto igual (página == Node, bit-a-bit — a tinta livre entra na canon)',
   canonPage11c === canonNode11c, `canônico ${canonPage11c.length} chars, ${canonPage11c === canonNode11c ? 'idêntico' : 'DIVERGE'}`);

// === PROVA 3: APARECE NO RENDER — probe de pixel da pincelada (madeira→azul), região não pintada intacta ===
await ctrlZ(); await rAF2(); await rAF2();   // tira a pincelada → topo volta madeira
const rgbAntes11c = await probeRGB(s9p.x, s9p.y);
await ctrlY(); await rAF2(); await rAF2();   // devolve a pincelada → topo azul
const rgbDepois11c = await probeRGB(s9p.x, s9p.y);
ok('(11c render) a pincelada APARECE: o centro vira AZUL (b>r) DEPOIS; madeira (r>b) ANTES (via undo/redo, mesma orientação)',
   rgbAntes11c.r > rgbAntes11c.b + 8 && rgbDepois11c.b > rgbDepois11c.r + 12 && rgbDepois11c.b > rgbDepois11c.g + 10,
   `antes rgb(${rgbAntes11c.r | 0},${rgbAntes11c.g | 0},${rgbAntes11c.b | 0}) → depois rgb(${rgbDepois11c.r | 0},${rgbDepois11c.g | 0},${rgbDepois11c.b | 0})`);
const rimY = s9p.y - 62;   // acima da pincelada horizontal, ainda na face 9 mas fora do dab (raio ~48px na tela)
const hitRim = await page.evaluate(([x, y]) => window.__oficina.pincelNoPonto(x, y), [s9p.x, rimY]);
const rgbRim = await probeRGB(s9p.x, rimY);
ok('(11c render) uma região NÃO pintada da MESMA face não muda (segue madeira, r>b)',
   rgbRim.r > rgbRim.b + 8 && hitRim && hitRim.f === 9, `borda rgb(${rgbRim.r | 0},${rgbRim.g | 0},${rgbRim.b | 0}) · face #${hitRim ? hitRim.f : 'fora'}`);

// === PROVA 5: UNDO/REDO — Ctrl+Z tira a pincelada (superfície volta), Ctrl+Y devolve ===
await page.evaluate((f) => window.__oficina.orbitar(f), CAM11C); await rAF2();
const nP_prevUndo = await nP();
await ctrlZ();
const nP_undo11c = await nP();
const canonUndo11c = await canon();
ok('(11c undo) Ctrl+Z tira a pincelada e a superfície volta bit-a-bit ao baseline',
   nP_undo11c === nP_prevUndo - 1 && canonUndo11c === canonBase11c, `PASSOS ${nP_prevUndo}->${nP_undo11c} · neutro ${canonUndo11c === canonBase11c ? 'idêntico ao baseline' : 'DIVERGE'}`);
await ctrlY();
const canonRedo11c = await canon();
ok('(11c redo) Ctrl+Y devolve a pincelada (neutro bate bit-a-bit com o de depois)',
   canonRedo11c === canonComPincel11c, `neutro ${canonRedo11c === canonComPincel11c ? 'idêntico' : 'DIVERGE'}`);

// === PROVA 6: RAIO/DUREZA da UI — os sliders mudam raio/dureza da op e o tamanho da mancha ===
await aoBaseline();
await page.evaluate((f) => window.__oficina.orbitar(f), CAM11C); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.ligarPincel(true)); await rAF2();
const s9r = await projFace(9);
const carimbar = async () => { await page.mouse.move(s9r.x, s9r.y); await page.mouse.down(); await page.mouse.move(s9r.x + 2, s9r.y, { steps: 2 }); await page.mouse.up(); await rAF2(); };
await page.evaluate(() => window.__oficina.setPincel({ cor: '#1030ff', raio: 0.08, dureza: 0.3 })); await rAF2();
const cfgPeq = await page.evaluate(() => window.__oficina.pincelCfg());
await carimbar();
const opPeq = await page.evaluate(() => window.__oficina.ultimoPasso());
await aoBaseline();
await page.evaluate(() => window.__oficina.setPincel({ raio: 0.5, dureza: 0.9 })); await rAF2();
const cfgGde = await page.evaluate(() => window.__oficina.pincelCfg());
const painelGde = await page.evaluate(() => window.__oficina.painelPincel());
await carimbar();
const opGde = await page.evaluate(() => window.__oficina.ultimoPasso());
ok('(11c raio/dureza) o raio/dureza da op REFLETEM os sliders da UI (pequeno 0.08/0.3, grande 0.5/0.9) e o painel mostra os valores',
   opPeq[1].raio === 0.08 && opPeq[1].dureza === 0.3 && opPeq[1].raio === cfgPeq.raio && opGde[1].raio === 0.5 && opGde[1].dureza === 0.9 && painelGde.raioV === '0.50' && painelGde.durezaV === '0.90',
   `op peq ${opPeq[1].raio}/${opPeq[1].dureza} · op gde ${opGde[1].raio}/${opGde[1].dureza} · painel ${painelGde.raioV}/${painelGde.durezaV}`);
// e a MANCHA gravada é maior: conta texels tingidos na ilha da face 9 (headless, das ops REAIS)
const tintadosFace9 = (op) => {
  const R = adaptarV3(nucleo([...toco.PASSOS, op], toco.PARAMS, toco.TOPO), ctxAtlas11);
  const il = R.atlas.daFace(9).ilha; let n = 0;
  for (let y = il.y; y < il.y + il.h; y++) for (let x = il.x; x < il.x + il.w; x++) { const c = R.tex.fn(x, y); if (!(c[0] === F9base[0] && c[1] === F9base[1] && c[2] === F9base[2])) n++; }
  return n;
};
const nTexPeq = tintadosFace9(opPeq), nTexGde = tintadosFace9(opGde);
ok('(11c raio/dureza) a MANCHA gravada é maior com raio maior (texels tingidos na ilha da face 9)',
   nTexGde > nTexPeq, `raio 0.08 → ${nTexPeq} texels < raio 0.5 → ${nTexGde} texels`);

// === PROVA 7: GUARDAS — roda/Ctrl+Z DURANTE a pincelada ignorados; arrasto no vazio não grava ===
await aoBaseline();
await page.evaluate((f) => window.__oficina.orbitar(f), CAM11C); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.setPincel({ cor: '#1030ff', raio: 0.2, dureza: 0.6 })); await rAF2();
await page.evaluate(() => window.__oficina.ligarPincel(true)); await rAF2();
const s9g = await projFace(9);
// pincelada 1 COMMITADA — pra um Ctrl+Z (se a guarda falhasse) ter o que desfazer
await page.mouse.move(s9g.x - 30, s9g.y + 18); await page.mouse.down();
await page.mouse.move(s9g.x + 30, s9g.y + 18, { steps: 14 }); await page.mouse.up(); await rAF2();
const nP_comm = await nP();   // baseline + 1 (pincelada 1)
const distAntesG = await page.evaluate(() => window.__oficina.estado().dist);
// pincelada 2 — no MEIO dela, dispara roda + Ctrl+Z (as guardas do passo 4/5 seguram)
await page.mouse.move(s9g.x - 32, s9g.y); await page.mouse.down();
await page.mouse.move(s9g.x - 8, s9g.y, { steps: 6 });
const emArrDur = await page.evaluate(() => window.__oficina.emArrasto());
await page.mouse.wheel(0, 140);
const distDurG = await page.evaluate(() => window.__oficina.estado().dist);
await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
const nP_gDur = await nP();   // guarda: segue nP_comm (a pincelada 1 NÃO foi desfeita no meio da 2ª)
const emArrDur2 = await page.evaluate(() => window.__oficina.emArrasto());
await page.mouse.move(s9g.x + 32, s9g.y, { steps: 6 }); await page.mouse.up(); await rAF2();
const nP_g1 = await nP();
ok('(11c guarda) roda e Ctrl+Z DURANTE a pincelada são IGNORADOS (reusa a máquina do passo 4/5) — dist e a pincelada anterior intactos no meio',
   emArrDur && emArrDur.pincel === true && Math.abs(distDurG - distAntesG) < 1e-9 && nP_gDur === nP_comm && emArrDur2 && emArrDur2.pincel === true,
   `emArrasto.pincel ${emArrDur && emArrDur.pincel} · dist ${distAntesG.toFixed(3)}==${distDurG.toFixed(3)} · Ctrl+Z no meio NÃO desfez (PASSOS ${nP_gDur}==${nP_comm})`);
ok('(11c guarda) a 2ª pincelada completa grava (o Ctrl+Z no meio não a atrapalhou)',
   nP_g1 === nP_comm + 1, `PASSOS ${nP_comm}->${nP_g1}`);
// arrasto no VAZIO no modo pincel: NÃO grava op (orbita)
await aoBaseline();
await page.evaluate((f) => window.__oficina.orbitar(f), CAM11C); await rAF2(); await rAF2();
const vazioPt = { x: 40, y: Math.round(s9g.y) };   // longe à esquerda do objeto (painel é à direita)
const hitVazio = await page.evaluate((p) => window.__oficina.pincelNoPonto(p.x, p.y), vazioPt);
const nP_v0 = await nP();
const estV0 = await page.evaluate(() => window.__oficina.estado());
await page.mouse.move(vazioPt.x, vazioPt.y); await page.mouse.down();
await page.mouse.move(vazioPt.x + 45, vazioPt.y + 22, { steps: 10 }); await page.mouse.up(); await rAF2();
const nP_v1 = await nP();
const estV1 = await page.evaluate(() => window.__oficina.estado());
const orbitouVazio = Math.abs(estV1.az - estV0.az) > 1e-4 || Math.abs(estV1.el - estV0.el) > 1e-4;
ok('(11c guarda) no modo pincel, um arrasto no VAZIO (sem face) NÃO grava op vazia (orbita)',
   hitVazio === null && nP_v1 === nP_v0 && orbitouVazio, `vazio hit ${hitVazio} · PASSOS ${nP_v0}->${nP_v1} · orbitou ${orbitouVazio}`);

// === CROSSING: o raycast pega a face SOB o cursor → um arrasto atravessando grava pontos em faces DIFERENTES (a op já separa por face) ===
await aoBaseline();
await page.evaluate(() => window.__oficina.orbitar({ az: 0.5, el: 0.5, dist: 2.0, alvo: [0, 0.28, 0] })); await rAF2(); await rAF2();
const topPt = await projFace(9);
const fTop = await page.evaluate(([x, y]) => window.__oficina.hitFace(x, y), [topPt.x, topPt.y]);
let fSideId = null, sidePt = null;
for (const k of [1, 2, 3, 4, 5, 6, 7]) {
  const p = await projFace(k); if (!p) continue;
  const fh = await page.evaluate(([x, y]) => window.__oficina.hitFace(x, y), [p.x, p.y]);
  if (fh === k) { fSideId = k; sidePt = p; break; }
}
ok('(11c faces) o raycast pega a face SOB o cursor (topo #9 vs um lado) — a base do arrasto atravessar faces',
   fTop === 9 && fSideId != null && fSideId !== 9, `topo→#${fTop} · lado→#${fSideId}`);
await page.evaluate(() => window.__oficina.setPincel({ raio: 0.14, dureza: 0.6 })); await rAF2();
await page.evaluate(() => window.__oficina.ligarPincel(true)); await rAF2();
await page.mouse.move(topPt.x, topPt.y); await page.mouse.down();
await page.mouse.move(sidePt.x, sidePt.y, { steps: 26 }); await page.mouse.up(); await rAF2();
const opCross = await page.evaluate(() => window.__oficina.ultimoPasso());
const facesCross = (opCross && opCross[0] === 'pincel') ? [...new Set(opCross[1].pontos.map((p) => p.f))].sort((a, b) => a - b) : [];
ok('(11c faces) um arrasto REAL do topo pra um lado grava pontos em ≥2 faces num ÚNICO passo pincel (a op aguenta, separa por face)',
   facesCross.length >= 2 && facesCross.includes(9), `faces na pincelada: ${JSON.stringify(facesCross)}`);

// screenshot: o toco com uma pincelada macia por cima (pra o olho) + a UI (chip aceso + sliders)
await aoBaseline();
await page.evaluate(() => { window.__oficina.selecionar(null); window.__oficina.selecionarFaces([]); }); await rAF2();   // limpa vértice/gizmo pro shot ficar limpo
await page.evaluate(() => window.__oficina.orbitar({ az: 0.35, el: 0.85, dist: 1.85, alvo: [0, 0.28, 0] })); await rAF2(); await rAF2();
await page.evaluate(() => window.__oficina.setPincel({ cor: '#1030ff', raio: 0.3, dureza: 0.55 })); await rAF2();
await page.evaluate(() => window.__oficina.ligarPincel(true)); await rAF2();
const sShot = await projFace(9);
await page.mouse.move(sShot.x - 42, sShot.y + 12); await page.mouse.down();
await page.mouse.move(sShot.x - 10, sShot.y - 22, { steps: 10 });
await page.mouse.move(sShot.x + 26, sShot.y - 4, { steps: 10 });
await page.mouse.move(sShot.x + 48, sShot.y + 20, { steps: 10 });
await page.mouse.up(); await rAF2(); await rAF2();
await page.screenshot({ path: join(OUT11C, 'oficina-pincel-macio.png') });
await page.evaluate(() => window.__oficina.ligarPincel(false)); await rAF2();
await aoBaseline();

// ============================================================================
// PASSO 12a — MATERIAIS OPACOS. A UI aplica um material às faces selecionadas
// (['material',{faces,usa}]) com preview ao vivo; o adaptarV3 agrupa por material
// em LOTES e o render aplica cor/emissivo/aspereza/semLuz POR LOTE. Aqui a bancada
// prova: a op grava + f.material seta, o replay página==Node com MATERIAIS (o
// material ENTRA na canon), o agrupamento em lotes (headless), a guarda de no-op e
// o undo. (A jóia byte-idêntica do JOGO e o efeito por-pixel são provados à parte.)
mkdirSync(OUT12, { recursive: true });
await aoBaseline();
await page.evaluate(() => { window.__oficina.selecionar(null); window.__oficina.selecionarFaces([]); }); await rAF2();
const nP12_0 = await nP();
await page.evaluate(() => window.__oficina.selecionarFaces([9])); await rAF2();   // topo do toco
const op12 = await page.evaluate(() => window.__oficina.aplicarMaterial({ cor: '#ff7326', emissivo: 1.4, aspereza: 0, semLuz: true }));
const mat12 = await page.evaluate(() => window.__oficina.materiais());
const usa12 = op12 && op12[1] ? op12[1].usa : null;
const mFace9 = await page.evaluate(() => window.__oficina.materialDaFace(9));
const mFace1 = await page.evaluate(() => window.__oficina.materialDaFace(1));
const painel12 = await page.evaluate(() => window.__oficina.painelMaterial());
ok('(12a UI) aplicar grava [\'material\',{faces:[9],usa}], seta f.material só na face 9, registra o material (aspereza:0 omitido), e o painel mostra',
   op12 && op12[0] === 'material' && JSON.stringify(op12[1].faces) === '[9]' && mFace9 === usa12 && mFace1 === null &&
   mat12[usa12] && mat12[usa12].emissivo === 1.4 && mat12[usa12].semLuz === true && mat12[usa12].aspereza === undefined && painel12.vis === true,
   `op ${JSON.stringify(op12)} · face9=${mFace9} face1=${mFace1} · MATERIAIS[${usa12}]=${JSON.stringify(mat12[usa12])} · painel ${JSON.stringify(painel12)}`);
// replay: página == Node com MATERIAIS (o material está na canon — sem isso o replay o perderia)
const canonPage12 = await canon();
const canonNode12 = JSON.stringify(neutroCanonico(nucleo([...toco.PASSOS, op12], toco.PARAMS, toco.TOPO, mat12)));
ok('(12a replay) o material ENTRA na canon e a página == Node bit-a-bit (a lista+MATERIAIS refaz o objeto igual)',
   canonPage12 === canonNode12, `canônico ${canonPage12.length} chars, ${canonPage12 === canonNode12 ? 'idêntico' : 'DIVERGE'}`);
// a canon com material DIFERE da sem (falha sob neutralização — o material é gravado)
const canonSemMat = JSON.stringify(neutroCanonico(nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO)));
ok('(12a replay) a canon COM material difere da SEM (o f.material é de fato gravado)', canonPage12 !== canonSemMat);
// guarda: aplicar o MESMO material de novo na face 9 → no-op (sem passo fantasma)
await page.evaluate(() => window.__oficina.selecionarFaces([9])); await rAF2();
const nP12_dup0 = await nP();
const opDup = await page.evaluate(() => window.__oficina.aplicarMaterial({ cor: '#ff7326', emissivo: 1.4, aspereza: 0, semLuz: true }));
const nP12_dup1 = await nP();
ok('(12a guarda) aplicar o MESMO material de novo é no-op (sem passo fantasma)', opDup === null && nP12_dup1 === nP12_dup0, `opDup ${opDup} · PASSOS ${nP12_dup0}->${nP12_dup1}`);
// AGRUPAMENTO por material (headless): 2 materiais → 3 lotes (2 + padrão), params certos, triângulos CONSERVADOS
const MAT12 = { casca: { cor: '#6b4a2f', aspereza: 0.9 }, brasa: { cor: '#ff7326', emissivo: 1.4, semLuz: true } };
const passos12g = [...toco.PASSOS, ['material', { faces: [9], usa: 'brasa' }], ['material', { faces: [1, 2, 3], usa: 'casca' }]];
const neutro12g = nucleo(passos12g, toco.PARAMS, toco.TOPO, MAT12);
const r12g = adaptarV3(neutro12g, ctxAtlas11, MAT12);
const r12base = adaptarV3(nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO), ctxAtlas11);   // sem material: 1 lote
const brasaL = r12g.lotes.find((L) => L.emissivo), cascaL = r12g.lotes.find((L) => L.aspereza);
const defL = r12g.lotes.find((L) => !L.emissivo && !L.aspereza && !L.corMul && !L.semLuz);
const somaMat = r12g.lotes.reduce((s, L) => s + L.mesh.v.length, 0), somaBase = r12base.lotes[0].mesh.v.length;
ok('(12a agrupamento) 2 materiais → 3 LOTES (brasa+casca+padrão), params certos, e os triângulos CONSERVAM (soma == 1 lote sem material)',
   r12g.lotes.length === 3 && r12base.lotes.length === 1 && brasaL && cascaL && defL &&
   brasaL.emissivo === 1.4 && brasaL.semLuz === 1 && cascaL.aspereza === 0.9 &&
   neutro12g.F.get(9).material === 'brasa' && neutro12g.F.get(1).material === 'casca' && somaMat === somaBase,
   `lotes ${r12g.lotes.length} (base ${r12base.lotes.length}) · brasa e=${brasaL && brasaL.emissivo}/sL=${brasaL && brasaL.semLuz} casca asp=${cascaL && cascaL.aspereza} · triângulos ${somaMat}==${somaBase}`);
// undo: Ctrl+Z tira o passo de material (a face 9 volta a SEM material)
await aoBaseline();
await page.evaluate(() => window.__oficina.selecionarFaces([9])); await rAF2();
const nP12_u0 = await nP();
await page.evaluate(() => window.__oficina.aplicarMaterial({ emissivo: 1.4, semLuz: true })); await rAF2();
const nP12_u1 = await nP(); const mFace9_ap = await page.evaluate(() => window.__oficina.materialDaFace(9));
await page.evaluate(() => window.__oficina.desfazer()); await rAF2();
const nP12_u2 = await nP(); const mFace9_undo = await page.evaluate(() => window.__oficina.materialDaFace(9));
ok('(12a undo) Ctrl+Z tira o passo de material — a face 9 volta a SEM material',
   nP12_u1 === nP12_u0 + 1 && mFace9_ap != null && nP12_u2 === nP12_u0 && mFace9_undo === null,
   `PASSOS ${nP12_u0}->${nP12_u1}->${nP12_u2} · face9 ${mFace9_ap}->${mFace9_undo}`);
// screenshot: o toco com a BRASA no topo (emissivo+semLuz) — evidência pro olho
await aoBaseline();
await page.evaluate(() => { window.__oficina.selecionar(null); window.__oficina.selecionarFaces([9]); }); await rAF2();
await page.evaluate(() => window.__oficina.aplicarMaterial({ cor: '#ff7326', emissivo: 1.4, semLuz: true })); await rAF2();
await page.evaluate(() => window.__oficina.orbitar({ az: 0.4, el: 0.7, dist: 1.9, alvo: [0, 0.28, 0] })); await rAF2(); await rAF2();
await page.screenshot({ path: join(OUT12, 'oficina-material-brasa.png') });
await aoBaseline();

// ===== PASSO 12b: MISTURA TRANSPARENTE — a UI marca transparente + opacidade, grava e replaya =====
await page.evaluate(() => { window.__oficina.selecionar(null); window.__oficina.selecionarFaces([9]); }); await rAF2();
const nP12b_0 = await nP();
const op12b = await page.evaluate(() => window.__oficina.aplicarMaterial({ cor: '#7fdfff', transparente: true, opacidade: 0.5 }));
const mat12b = await page.evaluate(() => window.__oficina.materiais());
const usa12b = op12b && op12b[1] ? op12b[1].usa : null;
const nP12b_1 = await nP();
ok('(12b UI) marcar transparente + opacidade grava [\'material\',{faces:[9],usa}] e registra mistura:transparente + opacidade:0.5',
   op12b && op12b[0] === 'material' && JSON.stringify(op12b[1].faces) === '[9]' && nP12b_1 === nP12b_0 + 1 &&
   mat12b[usa12b] && mat12b[usa12b].mistura === 'transparente' && mat12b[usa12b].opacidade === 0.5,
   `op ${JSON.stringify(op12b)} · MATERIAIS[${usa12b}]=${JSON.stringify(mat12b[usa12b])} · PASSOS ${nP12b_0}->${nP12b_1}`);
// replay: página == Node com o material transparente (mistura/opacidade em MATERIAIS, f.material na canon)
const canonPage12b = await canon();
const canonNode12b = JSON.stringify(neutroCanonico(nucleo([...toco.PASSOS, op12b], toco.PARAMS, toco.TOPO, mat12b)));
ok('(12b replay) o material transparente entra e a página == Node bit-a-bit (a lista+MATERIAIS refaz igual)',
   canonPage12b === canonNode12b, `canônico ${canonPage12b.length} chars, ${canonPage12b === canonNode12b ? 'idêntico' : 'DIVERGE'}`);
// headless: o adaptarV3 marca UM lote transparente (transparente:true + opacidade) — o render lê daí
const r12b = adaptarV3(nucleo([...toco.PASSOS, op12b], toco.PARAMS, toco.TOPO, mat12b), ctxAtlas11, mat12b);
const transpL = r12b.lotes.find((L) => L.transparente);
ok('(12b lote) o adaptarV3 marca o lote do material transparente (transparente:true, opacidade 0.5), 1 só',
   transpL && transpL.opacidade === 0.5 && r12b.lotes.filter((L) => L.transparente).length === 1,
   `lotes transp ${r12b.lotes.filter((L) => L.transparente).length} · opacidade ${transpL && transpL.opacidade}`);
// screenshot: o toco com o TOPO de vidro (transparente) — evidência pro olho
await page.evaluate(() => window.__oficina.orbitar({ az: 0.4, el: 0.7, dist: 1.9, alvo: [0, 0.28, 0] })); await rAF2(); await rAF2();
await page.screenshot({ path: join(OUT12, 'oficina-material-transp.png') });
await aoBaseline();

/* ==== PASSO 13a: ANIMAÇÃO RÍGIDA POR PARTE (em laço) =========================
   O MOTOR da animação: a op `parte` nomeia faces, o adaptarV3 agrupa por (parte,
   material) e resolve o pivô (explícito ou CENTROIDE), e montarAnimar devolve
   `animar(T,lotes)` que escreve a matriz de cada parte POR ÍNDICE (infoPorLote,
   paralelo aos lotes do render) — o render.js NÃO muda (diff vazio, jóia intacta).
   Prova por MEDIÇÃO, headless (motor) + na página (relógio congelado). */
mkdirSync(OUT13, { recursive: true });
const ctx13 = { tex: { texCanvas: (w, h, fn) => ({ width: w, height: h, fn }) } };   // ctx headless (sem m4: executar não precisa de matriz pra medir a estrutura)
const IDENT16 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const aplica13 = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];

// (13a op parte) seta f.parte; registra pivô; face inexistente GRITA sem corromper; reatribuir = última vence
const nParte = nucleo([['cubo', { id: 0, lado: 1 }], ['parte', { nome: 'x', faces: [0, 1], pivo: [0.1, 0.2, 0.3] }]], {}, {});
const nParteOrf = nucleo([['cubo', { id: 0, lado: 1 }], ['parte', { nome: 'x', faces: [0, 999] }]], {}, {});
const nParteRe = nucleo([['cubo', { id: 0, lado: 1 }], ['parte', { nome: 'a', faces: [0] }], ['parte', { nome: 'b', faces: [0] }]], {}, {});
ok('(13a op parte) nomeia faces (f.parte), registra pivô, face inexistente GRITA (malha intacta), reatribuir = última vence',
   nParte.F.get(0).parte === 'x' && nParte.F.get(2).parte === null && JSON.stringify(nParte.partes.x.pivo) === '[0.1,0.2,0.3]' &&
   nParteOrf.orfaos.length === 1 && nParteOrf.orfaos[0].op === 'parte' && nParteOrf.orfaos[0].ref === 999 && nParteOrf.V.size === 8 && nParteOrf.F.size === 6 &&
   nParteRe.F.get(0).parte === 'b',
   `pivô ${JSON.stringify(nParte.partes.x.pivo)} · órfão #${nParteOrf.orfaos[0].ref} (V=${nParteOrf.V.size}/F=${nParteOrf.F.size}) · reatribuído -> '${nParteRe.F.get(0).parte}'`);

// (13a canon) f.parte ENTRA na canon (replay determinístico); face SEM parte fica BYTE-idêntica (o toco: todas as linhas F de 6)
const canonComParte = neutroCanonico(nParte);
const rowComParte = canonComParte.F.find((r) => r[0] === 0), rowSemParte = canonComParte.F.find((r) => r[0] === 2);
const canonTocoRows13 = neutroCanonico(nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO)).F;
const cAnimA = JSON.stringify(neutroCanonico(nucleo(anim.PASSOS, anim.PARAMS, anim.TOPO, anim.MATERIAIS)));
const cAnimB = JSON.stringify(neutroCanonico(nucleo(JSON.parse(JSON.stringify(anim.PASSOS)), anim.PARAMS, anim.TOPO, anim.MATERIAIS)));
ok('(13a canon) f.parte entra na canon (linha de 7); face SEM parte fica de 6 (byte-compat: toco intacto); determinismo + round-trip',
   rowComParte[rowComParte.length - 1] === 'x' && rowComParte.length === 7 && rowSemParte.length === 6 &&
   canonTocoRows13.every((r) => r.length === 6) && cAnimA === cAnimB,
   `parte na linha ${rowComParte.length} vs sem-parte ${rowSemParte.length} · toco ${canonTocoRows13.length} linhas de 6 · anim canon ${cAnimA.length} chars estável`);

// (13a agrupamento) (parte,material): a 'roda' abarca 2 materiais -> 2 lotes (mesma parte), + o braço; triângulos conservados; compat toco 1 lote
const rAnim13 = adaptarV3(nucleo(anim.PASSOS, anim.PARAMS, anim.TOPO, anim.MATERIAIS), ctx13, anim.MATERIAIS);
const infoLote13 = rAnim13.lotes.map((L) => L.parte || null);
const rTocoUmLote = adaptarV3(nucleo(toco.PASSOS, toco.PARAMS, toco.TOPO), ctx13);
const somaAnim13 = rAnim13.lotes.reduce((s, L) => s + L.mesh.v.length, 0);
const somaSemGrupo = adaptarV3(nucleo([...anim.PASSOS.filter((p) => p[0] !== 'parte' && p[0] !== 'material')], anim.PARAMS, anim.TOPO), ctx13).lotes.reduce((s, L) => s + L.mesh.v.length, 0);
ok('(13a agrupamento) (parte,material): a roda (2 materiais) vira 2 lotes + o braço = 3, todos com L.parte; triângulos CONSERVAM; toco sem-parte-sem-material = 1 lote',
   rAnim13.lotes.length === 3 && JSON.stringify(infoLote13) === '["roda","roda","braco"]' && somaAnim13 === somaSemGrupo && rTocoUmLote.lotes.length === 1 && rTocoUmLote.lotes[0].parte === null,
   `lotes ${rAnim13.lotes.length} ${JSON.stringify(infoLote13)} · floats agrupados ${somaAnim13} == sem-grupo ${somaSemGrupo} · toco ${rTocoUmLote.lotes.length} lote(s)`);

// (13a pivô) 'roda' SEM pivo -> CENTROIDE (puxado pro dente em +x); 'braco' COM pivo explícito na base
ok('(13a pivô) default = CENTROIDE da parte (roda, sem pivo -> puxado pro dente +x); override = pivô EXPLÍCITO (braço na base bracoX)',
   anim.PASSOS.find((p) => p[0] === 'parte' && p[1].nome === 'roda')[1].pivo === undefined && rAnim13.partes.roda.pivo[0] > 0 &&
   JSON.stringify(rAnim13.partes.braco.pivo) === JSON.stringify([anim.PARAMS.bracoX, 0, 0]),
   `roda pivô=centroide ${rAnim13.partes.roda.pivo.map((n) => n.toFixed(3))} (x>0) · braço pivô=explícito ${JSON.stringify(rAnim13.partes.braco.pivo)}`);

// (13a interpolador) avaliarChaves em t conhecido: pontas, chave, meio (smoothstep(.5)=.5) e quarto (.15625 — DISCRIMINA de linear .25)
const K13 = [[0, 10], [2, 20]];
const q13 = avaliarChaves(K13, 0.5), meio13 = avaliarChaves(K13, 1);
ok('(13a interpolador) avaliarChaves: antes->1º, depois->último, na chave, meio=15 (smoothstep .5=.5), quarto=11.5625 (≠ linear 12.5)',
   avaliarChaves(K13, -1) === 10 && avaliarChaves(K13, 9) === 20 && avaliarChaves(K13, 0) === 10 && meio13 === 15 && Math.abs(q13 - 11.5625) < 1e-9,
   `[-1]->${avaliarChaves(K13, -1)} [9]->${avaliarChaves(K13, 9)} meio->${meio13} quarto->${q13} (linear daria 12.5)`);

// (13a montarAnimar) casa por ÍNDICE, matriz determinística (mesmo T), move (T=0≠T=1), 2 lotes da roda com a MESMA matriz, PIVÔ fixo, vazio->undefined, canal ruim GRITA
const animarFn = montarAnimar(anim.ANIMACOES, infoLote13, rAnim13.partes);
const rodar13 = (T) => { const L = rAnim13.lotes.map(() => ({ matriz: IDENT16() })); animarFn(T, L); return L.map((l) => l.matriz); };
const m0 = rodar13(0), m0b = rodar13(0), m1 = rodar13(1);
const pivoRoda = rAnim13.partes.roda.pivo, fixo13 = aplica13(m0[0], pivoRoda);   // T=0: rotY=0, mas a matriz T(piv)·I·T(-piv)=I -> o pivô fica no lugar em qualquer T
const fixo13b = aplica13(m1[0], pivoRoda);
let canalGritou13 = false; try { montarAnimar({ x: { trilhas: [{ parte: 'roda', canal: 'giroZ', chaves: [[0, 0]] }] } }, infoLote13, rAnim13.partes); } catch (e) { canalGritou13 = /canal/.test(e.message); }
ok('(13a montarAnimar) matriz por ÍNDICE: determinística (T=0 2x igual), MOVE (T=0≠T=1), 2 lotes da roda = MESMA matriz, PIVÔ fixo, {}->undefined, canal ruim GRITA',
   JSON.stringify(m0) === JSON.stringify(m0b) && JSON.stringify(m0) !== JSON.stringify(m1) && JSON.stringify(m1[0]) === JSON.stringify(m1[1]) &&
   Math.hypot(fixo13[0] - pivoRoda[0], fixo13[1] - pivoRoda[1], fixo13[2] - pivoRoda[2]) < 1e-9 && Math.hypot(fixo13b[0] - pivoRoda[0], fixo13b[1] - pivoRoda[1], fixo13b[2] - pivoRoda[2]) < 1e-9 &&
   montarAnimar({}, infoLote13, rAnim13.partes) === undefined && canalGritou13,
   `T0==T0 & T0!=T1 & lote0==lote1(roda) · pivô fica a ${Math.hypot(fixo13b[0] - pivoRoda[0], fixo13b[1] - pivoRoda[1], fixo13b[2] - pivoRoda[2]).toExponential(1)} dele · {}->undefined · canal GRITA`);

// (13a executar) fia ANIMACOES -> animar; SEM ANIMACOES -> undefined (o render vê peca.animar||null=null -> byte-idêntico)
const objComAnim = executar(anim.PASSOS, anim.PARAMS, anim.TOPO, ctx13, anim.MATERIAIS, anim.ANIMACOES);
const objSemAnim = executar(anim.PASSOS, anim.PARAMS, anim.TOPO, ctx13, anim.MATERIAIS);
ok('(13a executar) fia ANIMACOES -> animar presente; SEM ANIMACOES -> animar undefined (compat: peca.animar||null = null)',
   typeof objComAnim.animar === 'function' && objSemAnim.animar === undefined,
   `com ANIMACOES: ${typeof objComAnim.animar} · sem: ${objSemAnim.animar}`);

// (13a JÓIA) render.js diff vazio vs origin/main — o passo dirige pelo hook `animar` que já existe
const { execFileSync } = await import('node:child_process');
let renderDiff13 = 'ERRO';
try { renderDiff13 = execFileSync('git', ['diff', '--stat', 'origin/main', '--', 'prototipos/fps/v3/motor/render.js'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch (e) { renderDiff13 = 'git falhou: ' + e.message; }
ok('(13a JÓIA) render.js (motor COMPARTILHADO com o JOGO) tem diff VAZIO vs origin/main — a animação dirige pelo hook existente',
   renderDiff13 === '', `git diff --stat render.js: ${renderDiff13 === '' ? 'VAZIO' : JSON.stringify(renderDiff13)}`);

// ---- na PÁGINA: relógio congelado no visor.html + página==Node bit-a-bit ----
const visorBase = base.replace('oficina.html', 'visor.html');
const page13 = await browser.newPage({ viewport: { width: 900, height: 560 } });
page13.on('pageerror', (e) => console.error('PAGEERR(13a):', e.message));
await page13.addInitScript(() => { const _raf = window.requestAnimationFrame.bind(window); window.__FIXO = 0; window.requestAnimationFrame = (cb) => _raf(() => cb(window.__FIXO)); });   // CONGELA o relógio: cada quadro usa __FIXO (ms)
await page13.goto(`${visorBase}?peca=_oficina-anim&a=35`, { waitUntil: 'load' });   // ?a fixa a câmera: a órbita não varia entre fases -> a ÚNICA coisa T-dependente é a animação (pólen desligado na peça)
await page13.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {});
const ready13 = await page13.evaluate(() => window.__ready === true);
ok('(13a visor) _oficina-anim abre no visor.html (window.__ready)', ready13);

// página==Node: a canon com f.parte refaz IGUAL (replay determinístico da peça com parte)
const canonPage13 = await page13.evaluate(async () => {
  const m = await import('/prototipos/fps/v3/motor/oficina.js');
  const p = await import('/prototipos/fps/v3/pecas/_oficina-anim.js');
  return JSON.stringify(m.neutroCanonico(m.nucleo(p.PASSOS, p.PARAMS, p.TOPO, p.MATERIAIS)));
});
ok('(13a replay) uma peça COM parte faz replay página==Node bit-a-bit (a canon com f.parte é idêntica)',
   canonPage13 === cAnimA, `canônico ${cAnimA.length} chars, ${canonPage13 === cAnimA ? 'idêntico' : 'DIVERGE'}`);

// página==Node: as MATRIZES da animação em vários T batem bit-a-bit (DETERMINISMO ABSOLUTO — mesmo T, mesma matriz, página e Node)
const TS13 = [0, 0.5, 1, 1.7, 4];
const matrizesNode13 = TS13.map((T) => { const L = rAnim13.lotes.map(() => ({ matriz: IDENT16() })); animarFn(T, L); return L.map((l) => l.matriz); });
const matrizesPage13 = await page13.evaluate(async (TS) => {
  const m = await import('/prototipos/fps/v3/motor/oficina.js');
  const p = await import('/prototipos/fps/v3/pecas/_oficina-anim.js');
  const ctx = { tex: { texCanvas: (w, h, fn) => ({ width: w, height: h, fn }) } };
  const r = m.adaptarV3(m.nucleo(p.PASSOS, p.PARAMS, p.TOPO, p.MATERIAIS), ctx, p.MATERIAIS);
  const info = r.lotes.map((L) => L.parte || null);
  const animar = m.montarAnimar(p.ANIMACOES, info, r.partes);
  return TS.map((T) => { const L = r.lotes.map(() => ({ matriz: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })); animar(T, L); return L.map((l) => [...l.matriz]); });
}, TS13);
ok('(13a determinismo) as MATRIZES da animação em 5 tempos batem página==Node BIT-A-BIT (mesmo T -> mesma matriz, sem Date/random)',
   JSON.stringify(matrizesNode13) === JSON.stringify(matrizesPage13),
   `${TS13.length} tempos × 3 lotes: ${JSON.stringify(matrizesNode13) === JSON.stringify(matrizesPage13) ? 'idênticas' : 'DIVERGEM'}`);

// relógio CONGELADO: mesma fase 2x = idêntico; T=0 vs T=1 = a parte MOVEU (>> 0). CLIP abaixo do HUD (o fps do topo muda por timing, não é a cena)
const CLIP13 = { x: 120, y: 90, width: 660, height: 430 };
const settle13 = async (n = 10) => { for (let i = 0; i < n; i++) await page13.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(0)))); };
const fase13 = async (fixoMs) => { await page13.evaluate((f) => { window.__FIXO = f; }, fixoMs); await settle13(); return decodePNG(await page13.screenshot({ clip: CLIP13 })); };
await settle13(20);   // warmup: canvas/FBO estabilizam antes da 1ª captura
const f0a = await fase13(0), f0b = await fase13(0), f1a = await fase13(1000), f1b = await fase13(1000), f0c = await fase13(0);
const dSame0 = diffPix(f0a, f0b), dSame1 = diffPix(f1a, f1b), dMove = diffPix(f0a, f1a), dVolta = diffPix(f0a, f0c);
ok('(13a anima de verdade) relógio congelado: mesma fase 2x = IDÊNTICO (T0 e T1), e T=0 vs T=1 os pixels DIFEREM (a parte moveu); volta a T=0 = idêntico',
   dSame0 === 0 && dSame1 === 0 && dMove > 3000 && dVolta === 0,
   `T0=T0 ${dSame0}px · T1=T1 ${dSame1}px · T0≠T1 ${dMove}px (movimento) · volta ${dVolta}px`);
await page13.evaluate(() => { window.__FIXO = 700; });   // uma pose bonita (engrenagem girada + braço no meio do swing) pro screenshot
await settle13();
await page13.screenshot({ path: join(OUT13, 'oficina-anim.png') });
await page13.close();

await browser.close();
server.close();

console.log(`\n  screenshots: ${join(OUT, 'oficina-antes.png')}\n               ${join(OUT, 'oficina-depois.png')}\n               ${join(OUT3, 'oficina-malha.png')}\n               ${join(OUT3, 'oficina-malha-ids.png')}\n               ${join(OUT4, 'oficina-vertice-arrastado.png')}\n               ${join(OUT5, 'oficina-desfazer-refazer.png')}\n               ${join(OUT6, 'oficina-gizmo.png')}\n               ${join(OUT6, 'oficina-gizmo-ids.png')}\n               ${join(OUT7, 'oficina-face-handle.png')}\n               ${join(OUT7, 'oficina-face-extrudada.png')}\n               ${join(OUT8, 'oficina-multiselecao.png')}\n               ${join(OUT8, 'oficina-ima.png')}\n               ${join(OUT9, 'oficina-faces-selecionadas.png')}\n               ${join(OUT9, 'oficina-faces-pintadas.png')}\n               ${join(OUT10, 'oficina-sem-solido-aviso.png')}\n               ${join(OUT10, 'oficina-colisao-painel.png')}\n               ${join(OUT11, 'oficina-atlas-toco.png')}\n               ${join(OUT11C, 'oficina-pincel-macio.png')}\n               ${join(OUT12, 'oficina-material-brasa.png')}\n               ${join(OUT13, 'oficina-anim.png')}`);
if (falhas.length) { console.error(`\nBANCADA FALHOU — ${falhas.length}: ${falhas.join('; ')}`); process.exit(1); }
console.log(`\nBANCADA OK — passo 2: órbita/pan/zoom + cursor livre + objeto centrado (piso ${pisoDiff}px, gesto ${gestoDiff}px); passo 3: overlay da malha (${N_VERT} vértices, arestas das ${N_FACE} faces) alinhado sobre o objeto; passo 4: seleciona + arrasta (segue o cursor a ${erroSegue.toFixed(2)}px) + grava moveV + replay da lista editada idêntico (página == Node) + câmera intacta no vazio; passo 5: desfazer/refazer (Ctrl+Z/Y/Shift+Z, baseline ${baseN}) — neutro canônico bate bit-a-bit com antes/depois, piso do baseline no-op, edição nova limpa o redo, 3 arrastos↔3 desfaz↔3 refaz idêntico; passo 6: gizmo de eixos (3 setas X/Y/Z) — arrasto TRAVADO grava d no eixo (vazamento máx ${vazMax.toExponential(2)} nos outros), o vértice segue a seta, a roda e o Ctrl+Z durante o arrasto são ignorados (guardas cobrem), o painel reflete vértice+caixa e fica de leitura no arrasto, e um clique num vértice coberto por uma seta seleciona o VÉRTICE (D1: precedência do alvo direto sobre o gizmo); o campo de valor exato recusa números absurdos (D4: limite de sanidade ±${limV}); passo 7: extruda UMA face pelo handle da normal — hit-test pega a face da FRENTE na sobreposição, o arrasto grava ['extruda',{face,dist}] com dist·compr ${distPx.toFixed(1)}px batendo o cursor ${ALONG7}px na normal (centroide projetado avançou ${alongC.toFixed(1)}px), o anel novo nasce no bloco ${blocoEsp} (idx·1000), replay página==Node bit-a-bit, undo/redo voltam ao neutro de antes/depois, a roda e o Ctrl+Z no arrasto são ignorados (MESMA máquina) e a face com a normal ~pra câmera não extruda (handle travado); passo 8: MESCLAR + ÍMÃ — Shift+clique multi-seleciona (o ativo é o último), a tecla M e o botão gravam ['mescla',{de,para}] (V ${V_antesM}->${V_posM}, o 'para' mantém a posição, as faces trocam de→para, a seleção vira o 'para'), replay página==Node bit-a-bit, undo/redo voltam ao neutro de antes/depois, o ímã cola A na posição EXATA de B (erro ${erroMundo.toExponential(1)} em mundo; sem Ctrl o gap é ${gapMundoB.toFixed(2)}un), Ctrl+Z e a roda no meio do arrasto-com-ímã são ignorados (MESMA máquina), e mesclar cantos adjacentes apaga a face de área-zero quieto sem corromper o resto; passo 9: PINTAR FACES — Shift+clique multi-seleciona faces (a ativa é a última), o \`change\` do <input type=color> grava ['pincel',{modo:'face',faces:[ordenadas],cor}] (neutro.F.cor vira a cor, face não-selecionada intacta), a cor APARECE no render (paleta do swatch tem o hex + probe de pixel do topo: madeira→azul), replay página==Node bit-a-bit, undo/redo voltam ao neutro de antes/depois, 3 faces + 1 cor = 1 passo com as 3 ORDENADAS, pintar no meio de um arrasto é ignorado, pintar a cor que a face já mostra é no-op (sem passo fantasma) e pintar face sem cor prévia grava (null → hex); passo 10: EXPORTAR + COLISÃO — o painel reflete colisaoDe (raio/altura/base) e o botão REAL grava ['solido',{faces:[ordenadas]}] (neutro.F.solido vira true, desfazível, no-op se já-sólido, ignorado no arrasto); a serialização IDA-E-VOLTA depois de editar (arrasto+extruda+pincel+solido) reabre BIT-A-BIT idêntica (página == Node, com a CHAMADA colisaoDe(PASSOS, PARAMS, TOPO) gravada, não o valor); o servir.mjs REAL grava pecas/<nome>.js num dir TEMP (arquivo === conteúdo, re-import replica), rejeita ../.., /etc, a/b, .., espaço e símbolo sem escrever fora, e serve com Cache-Control: no-store; uma peça sem solido mostra o AVISO e a colisão vira o objeto INTEIRO (marcar o topo a muda: altura 1→0); e sem a rota o Salvar cai no download sem quebrar; passo 11a: ATLAS POR FACE (fundação da textura pintável) — o adaptarV3 troca o SWATCH por um atlas de ${N_FACE} ILHAS DISJUNTAS (grade ${R11.atlas.cols}×${R11.atlas.rows}, ilha ${R11.atlas.tile}px, gutter ${R11.atlas.gutter}px, textura ${R11.atlas.W}×${R11.atlas.H}), o FURO da caixa GLOBAL (fundo #8 e topo #9 quase no mesmo XZ, IoU ${iouGlobal.toFixed(2)}) some com ilhas separadas, e o toco renderiza cada face na SUA cor IGUAL ao swatch (topo #9 madeira clara rgb ${rgbTopo11.r.toFixed(0)},${rgbTopo11.g.toFixed(0)},${rgbTopo11.b.toFixed(0)}; cmp byte-a-byte swatch↔atlas = 0 pixels no relatório). O mapa por face (ilha + projeta) fica anexado em atlas pro pincel macio do 11b; passo 11b (MOTOR): PINCEL MACIO no núcleo — a op 'livre' grava a tinta ANCORADA à face ({a,b} face-local, o mesmo s,t da projeção — não um texel cru) e o adaptarV3 rasteriza um DAB radial macio na ilha (centro=cor rgb ${centroL11}, +8px=base rgb ${bordaL11}, meio esmaece rgb ${meioL11}); determinístico (canon 2x + round-trip JSON estáveis, a tinta ENTRA na canon), a tinta ACOMPANHA a face num moveV (o centro segue cor mesmo com o UV do canto deslizando), órfão grita (#999, malha intacta), raio maior tinge mais texels (0.2→${tPeq11} < 0.4→${tGde11}) e dureza controla a borda, e o dab fica PRESO na célula (não vaza pra vizinha) — o modo 'face' segue BYTE-idêntico (o toco canoniza igual, linha F de 6); passo 11c: PINCEL MACIO na INTERFACE (pintar arrastando) — o modo pincel (chip "Pincel" + tecla B) LIGADO faz o arrasto na superfície PINTAR em vez de orbitar/selecionar (grava ['pincel',{modo:'livre',cor,raio,dureza,pontos:[{f,a,b}]}], câmera parada, nenhum vértice mexido), DESLIGADO tudo segue como antes (arrasto de vértice ainda grava moveV); o RAYCAST do cursor é o inverso EXATO de projetar (com lente) — o ponto de superfície projeta de volta a ${erroRT.toFixed(2)}px do cursor —, acha a face da FRENTE (hitFace) e intersecta o plano dela → {f,a,b} FACE-LOCAL (abInMundo bate o raycast); os pontos caem na face certa (#9) e ACOMPANHAM o arrasto (a monotônico, spread ${aSpread.toFixed(2)}); a pincelada APARECE no render (o centro vira azul rgb ${rgbDepois11c.r | 0},${rgbDepois11c.g | 0},${rgbDepois11c.b | 0}; a borda não pintada segue madeira), replay página==Node bit-a-bit (a tinta livre entra na canon), undo/redo voltam a superfície ao baseline/depois, os sliders de raio/dureza refletem na op e no tamanho da mancha (raio 0.08→${nTexPeq} texels < 0.5→${nTexGde}), a roda e o Ctrl+Z DURANTE a pincelada são ignorados (reusa a máquina arrasto/soltar), um arrasto no VAZIO no modo pincel não grava op vazia (orbita), e um arrasto atravessando o topo e um lado grava pontos em faces diferentes num só passo (${JSON.stringify(facesCross)}); passo 12a: MATERIAIS OPACOS — a UI aplica um material às faces selecionadas (grava ['material',{faces:[9],usa:'${usa12}'}], seta f.material só na face 9, registra ${JSON.stringify(mat12[usa12])} — aspereza:0 omitido —, painel mostra), o material ENTRA na canon e o replay página==Node é bit-a-bit (${canonPage12.length} chars, difere da canon SEM material), aplicar o mesmo material de novo é no-op (sem passo fantasma), o adaptarV3 AGRUPA por material em 3 LOTES (brasa emissivo 1.4+semLuz, casca aspereza 0.9, + o padrão) conservando os triângulos (${somaMat}==${somaBase}), e o Ctrl+Z tira o passo (a face volta a sem material). A JÓIA (render.js compartilhado com o JOGO) fica BYTE-idêntica com material desligado — provado por cmp à parte; passo 13a: ANIMAÇÃO RÍGIDA POR PARTE — a op \`parte\` nomeia faces (f.parte na canon, órfão grita, última vence) e face SEM parte fica byte-idêntica (toco: ${canonTocoRows13.length} linhas de 6); o adaptarV3 agrupa por (parte,material) — a roda (2 materiais) vira 2 lotes + o braço, triângulos conservados (${somaAnim13}), toco sem-parte-sem-material = 1 lote; o pivô default é o CENTROIDE (roda puxada pro dente) e o override é EXPLÍCITO (braço na base); o interpolador (avaliarChaves) é smoothstep (meio 15, quarto 11.5625 ≠ linear 12.5); montarAnimar escreve a matriz por ÍNDICE (infoPorLote ${JSON.stringify(infoLote13)}), determinística (mesmo T -> mesma matriz), com o pivô fixo, {}->undefined e canal ruim gritando; executar fia ANIMACOES (sem -> animar undefined = byte-idêntico); a peça COM parte faz replay página==Node bit-a-bit e as MATRIZES batem página==Node em 5 tempos; e no relógio congelado a mesma fase 2x é idêntica (${dSame0}px) e T=0 vs T=1 os pixels DIFEREM (${dMove}px — a parte moveu). A JÓIA render.js tem diff VAZIO (${renderDiff13 === '' ? 'confirmado' : renderDiff13}) — a animação dirige pelo hook animar(T,lotes) que já existia.`);
