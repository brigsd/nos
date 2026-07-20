#!/usr/bin/env node
/**
 * olhar-peca.mjs — o olho da OFICINA (D-55).
 *
 * Screenshots de uma PEÇA do v3 no visor padrão, em 3 ângulos, sem rede:
 * server estático local (o visor usa ES modules) + Chromium do site.
 *
 *   npm run peca -- casa-toras            # 3 ângulos padrão
 *   npm run peca -- _modelo --res=960     # template, outra resolução
 *
 * Saída: tools/bancadas/out/peca-<nome>-<ângulo>.png — e o passo seguinte é
 * sempre LER os PNGs (screenshot que ninguém olha é ruído).
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
const nome = (args.find((a) => !a.startsWith('--')) || 'casa-toras').replace(/[^a-z0-9_-]/gi, '');
const res = /^--res=(\d+)$/.exec(args.find((a) => a.startsWith('--res=')) || '')?.[1] || '640';
/* --e= / --r= sobrescrevem a altura/raio da câmera em TODOS os ângulos
   (peças de paisagem — chão, ilha — pedem câmera mais alta e afastada) */
const eOv = /^--e=([\d.]+)$/.exec(args.find((a) => a.startsWith('--e=')) || '')?.[1];
const rOv = /^--r=([\d.]+)$/.exec(args.find((a) => a.startsWith('--r=')) || '')?.[1];
/* --geo=normais|flat = VISÃO DE GEOMETRIA (D-65): sem textura, pra emenda/faceta/junção
   saltarem (a casca esconde defeito de forma). --giro=N = N ângulos ao redor (não 3). */
const geo = /^--geo=(normais|flat)$/.exec(args.find((a) => a.startsWith('--geo=')) || '')?.[1];
const giro = parseInt(/^--giro=(\d+)$/.exec(args.find((a) => a.startsWith('--giro=')) || '')?.[1] || '0', 10);
const RES = parseInt(res, 10), VW = Math.max(900, RES), VH = Math.round(VW * 9 / 16);   // viewport ACOMPANHA res -> foto nítida em alta

const peçaPath = join(REPO, 'prototipos/fps/v3/pecas', `${nome}.js`);
if (!existsSync(peçaPath)) { console.error(`peça desconhecida: ${nome} (veja prototipos/fps/v3/pecas/)`); process.exit(1); }

/* server estático mínimo (só o que o visor precisa) */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res2) => {
  const p = join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !existsSync(p)) { res2.writeHead(404); res2.end(); return; }
  res2.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res2.end(readFileSync(p));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/prototipos/fps/v3/visor.html`;

const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('Playwright não encontrado. Rode: cd site && npm ci'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
page.on('pageerror', (e) => console.error('PAGEERR:', e.message));
mkdirSync(OUT, { recursive: true });

/* e/r só entram na URL se pedidos (--e/--r): sem eles, quem manda é a
   CÂMERA SUGERIDA PELA PEÇA (peca.camera) e por fim o padrão do visor —
   uma paisagem abre alta, um objeto abre perto, sem a bancada atrapalhar */
const ANGULOS = giro > 0 ? Array.from({ length: giro }, (_, i) => String(Math.round(i * 360 / giro))) : ['38', '0', '90'];   // 3/4, frente, perfil OU giro completo
const sfx = geo ? `${geo}-` : '';        // arquivos de geometria não sobrescrevem os texturizados
for (const rot of ANGULOS) {
  const extra = (eOv ? `&e=${eOv}` : '') + (rOv ? `&r=${rOv}` : '') + (geo ? `&debug=${geo}` : '');
  await page.goto(`${base}?peca=${nome}&res=${res}&ts=4&a=${rot}${extra}`, { waitUntil: 'load' });
  await page.waitForTimeout(1300);
  const ok = await page.evaluate(() => !!window.__ready);
  const fps = await page.evaluate(() => document.getElementById('fps')?.textContent);
  const file = join(OUT, `peca-${nome}-${sfx}${rot}.png`);
  await page.screenshot({ path: file });
  console.log(`olhou ${nome} @${rot}° ${geo ? `[${geo}] ` : ''}${VW}px — ready=${ok} — ${fps}\n  ${file}`);
}
await browser.close();
server.close();
