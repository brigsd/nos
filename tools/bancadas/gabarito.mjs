#!/usr/bin/env node
/**
 * gabarito.mjs — P5 do playground (D-118): FORMA COMO NÚMERO. Mede a
 * silhueta RENDERIZADA de uma peça contra um CONTORNO de referência (o
 * gabarito, desenhado à mão — hoje sem canvas, ver prototipos/fps/v3/
 * gabaritos/) e devolve IoU + VEREDITO calibrado (exit≠0 = REPROVADO), nos
 * ângulos que o gabarito cobrir. Sai a EVIDÊNCIA (silhueta, contorno
 * rasterizado, sobreposição) em PNG — número sem imagem não é veredito.
 *
 *   node tools/bancadas/gabarito.mjs _viga            # todos os ângulos do gabarito
 *   node tools/bancadas/gabarito.mjs _viga --res=1200
 *
 * Sem gabarito pra peça -> falha alto (nada foi medido, não é um "passou").
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './bench/pngstats.mjs';
import { mascaraParaPng, sobreposicaoParaPng } from './bench/pngwrite.mjs';
import { extrairSilhueta, rasterizarContorno, validarContorno, iou, areaMascara, LIMIAR_IOU } from './bench/gabarito-nucleo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT = join(HERE, 'out');
const PECAS = join(REPO, 'prototipos/fps/v3/pecas');
const GABARITOS = join(REPO, 'prototipos/fps/v3/gabaritos');

const args = process.argv.slice(2);
const nome = (args.find((a) => !a.startsWith('--')) || '').replace(/[^a-z0-9_-]/gi, '');
const res = /^--res=(\d+)$/.exec(args.find((a) => a.startsWith('--res=')) || '')?.[1] || '900';

if (!nome) { console.error('uso: node tools/bancadas/gabarito.mjs <peça> [--res=N]'); process.exit(2); }
const peçaPath = join(PECAS, `${nome}.js`);
if (!existsSync(peçaPath)) { console.error(`peça desconhecida: ${nome} (veja prototipos/fps/v3/pecas/)`); process.exit(2); }
const gabaritoPath = join(GABARITOS, `${nome}.js`);
if (!existsSync(gabaritoPath)) {
  console.error(`✗ ${nome}: SEM gabarito (prototipos/fps/v3/gabaritos/${nome}.js não existe) — nada foi medido, isto NÃO é um "passou"`);
  console.error(`  crie o arquivo com: export const CONTORNOS = { '38': [[x,y],...], ... }  (0..1, ver prototipos/fps/v3/gabaritos/_viga.js)`);
  process.exit(1);
}

let CONTORNOS;
try {
  ({ CONTORNOS } = await import(pathToFileURL(gabaritoPath).href));
  if (!CONTORNOS || typeof CONTORNOS !== 'object' || Array.isArray(CONTORNOS)) throw new Error(`gabaritos/${nome}.js precisa exportar CONTORNOS: {ângulo: [[x,y],...]}`);
  const angulos = Object.keys(CONTORNOS);
  if (!angulos.length) throw new Error(`gabaritos/${nome}.js: CONTORNOS está vazio — nenhum ângulo pra medir`);
  for (const a of angulos) CONTORNOS[a] = validarContorno(CONTORNOS[a], `CONTORNOS['${a}']`);
} catch (e) { console.error(`✗ ${nome}: gabarito malformado — ${e.message}`); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res2) => {
  const p = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res2.writeHead(404); res2.end(); return; }
  res2.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res2.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/prototipos/fps/v3/visor.html`;

const PW = join(REPO, 'node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('Playwright não encontrado. Rode: npm ci (na raiz)'); process.exit(2); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

const RES = parseInt(res, 10), VW = Math.max(900, RES), VH = Math.round(VW * 9 / 16);
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
mkdirSync(OUT, { recursive: true });

async function screenshot(peca, angulo) {
  await page.goto(`${base}?peca=${peca}&res=${res}&ts=4&a=${angulo}`, { waitUntil: 'load' });
  await page.waitForTimeout(1300);
  const ok = await page.evaluate(() => window.__ready === true);
  const buf = await page.screenshot();
  return { ok, buf };
}

let piorIou = Infinity, algumaFalha = false;
const linhas = [];
for (const angulo of Object.keys(CONTORNOS)) {
  try {
    const fundoR = await screenshot('_vazio', angulo);
    const objR = await screenshot(nome, angulo);
    if (!fundoR.ok || !objR.ok) { algumaFalha = true; linhas.push(`  ✗ @${angulo}°: peça não abriu (ready≠true)`); piorIou = 0; continue; }

    const fundo = decodePng(fundoR.buf), obj = decodePng(objR.buf);
    const sil = extrairSilhueta(fundo, obj);
    const areaObj = areaMascara(sil);
    if (areaObj === 0) { algumaFalha = true; linhas.push(`  ✗ @${angulo}°: silhueta vazia (0 pixels) — peça não apareceu no quadro (câmera? peça vazia?)`); piorIou = 0; continue; }

    const ref = rasterizarContorno(CONTORNOS[angulo], sil.W, sil.H);
    const pontuacao = iou(sil, ref);
    piorIou = Math.min(piorIou, pontuacao);
    const passou = pontuacao >= LIMIAR_IOU;
    if (!passou) algumaFalha = true;

    const evidPath = `${OUT}/gabarito-${nome}-${angulo}`;
    writeFileSync(`${evidPath}-silhueta.png`, mascaraParaPng(sil));
    writeFileSync(`${evidPath}-referencia.png`, mascaraParaPng(ref));
    writeFileSync(`${evidPath}-sobreposicao.png`, sobreposicaoParaPng(sil, ref));
    writeFileSync(`${evidPath}-render.png`, objR.buf);
    linhas.push(`  ${passou ? '✓' : '✗'} @${angulo}°: IoU=${pontuacao.toFixed(3)} (limiar ${LIMIAR_IOU}) — área render=${areaObj}px, área referência=${areaMascara(ref)}px`);
    linhas.push(`      evidência: ${evidPath}-sobreposicao.png (branco=interseção, verde=só render, magenta=só referência)`);
  } catch (e) { algumaFalha = true; piorIou = 0; linhas.push(`  ✗ @${angulo}°: falhou — ${e.message}`); }
}
if (erros.length) { algumaFalha = true; linhas.push(`  ${erros.length} erro(s) de página: ${erros.slice(0, 2).join(' ; ')}`); }

await browser.close(); server.close();
console.log(`${algumaFalha ? '✗' : '✓'} ${nome} — pior IoU entre os ângulos medidos: ${Number.isFinite(piorIou) ? piorIou.toFixed(3) : 'n/a'}`);
console.log(linhas.join('\n'));
process.exit(algumaFalha ? 1 : 0);
