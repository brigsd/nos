#!/usr/bin/env node
/**
 * olhar.mjs — o olho do coder (D-35).
 *
 * Tira screenshots do cliente oficial (FPS) de pontos de vista exatos, SEM
 * rede externa: o build inline o mundo no HTML, o server é local, o Chromium
 * é o do sandbox. Nasceu do atrito real de 16/07: auditar A Clareira exigiu
 * montar isso ad hoc no scratchpad — agora é permanente e custa um comando.
 *
 *   npm run olhar                        # todos os pontos canônicos (pontos.json)
 *   npm run olhar -- forja portais       # só estes
 *   npm run olhar -- 46.2,15.6,0.9       # um ?cam= avulso
 *   npm run olhar -- forja --tod=0.8     # força a hora (0.3 dia · 0.55 entardecer · 0.8 noite)
 *   npm run olhar -- --no-build          # usa o build que já existe
 *
 * Saída: prototipos/fps/qa/out/<nome>.png (gitignorado, D-30 — evidência é
 * regenerável, nunca versionada). O passo seguinte é sempre LER os PNGs —
 * screenshot que ninguém olha é ruído.
 */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BUILT = join(REPO, 'site/public/fps/index.html');
const OUT = join(HERE, 'out');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const todFlag = [...flags].map((f) => /^--tod=([\d.]+)$/.exec(f)).find(Boolean)?.[1];
const wanted = args.filter((a) => !a.startsWith('--'));

/* 1 · build fresco por padrão — auditar código velho é a receita da conclusão errada */
if (!flags.has('--no-build') || !existsSync(BUILT)) {
  execFileSync('node', [join(REPO, 'site/scripts/build-fps.mjs')], { stdio: 'inherit', cwd: REPO });
}

/* 2 · quais pontos? nomes do pontos.json, ou "x,y,a" avulso */
const PONTOS = JSON.parse(readFileSync(join(HERE, 'pontos.json'), 'utf8'));
delete PONTOS._;
const shots = [];
if (wanted.length === 0) {
  for (const [name, p] of Object.entries(PONTOS)) shots.push({ name, ...p });
} else {
  for (const w of wanted) {
    if (PONTOS[w]) shots.push({ name: w, ...PONTOS[w] });
    else if (/^-?[\d.]+,-?[\d.]+(,-?[\d.]+)?$/.test(w)) shots.push({ name: `cam-${w.replaceAll(',', 'x')}`, cam: w });
    else { console.error(`ponto desconhecido: ${w} (veja pontos.json)`); process.exit(1); }
  }
}

/* 3 · server local no porto 0 (efêmero — nunca colide) servindo só o build */
const html = readFileSync(BUILT);
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

/* 4 · Chromium via o Playwright do site (CommonJS — daí o default import).
   Dependência oculta: o Playwright vive em site/node_modules, não na raiz —
   rode `cd site && npm ci` uma vez antes de usar a bancada. */
const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('olhar: Playwright não encontrado. Rode uma vez: cd site && npm ci   (a bancada usa o Playwright/Chromium do site).'); process.exit(1); }
const pw = (await import(PW)).default;
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
mkdirSync(OUT, { recursive: true });
for (const s of shots) {
  const tod = todFlag ?? s.tod;
  const url = `${base}?cam=${s.cam}${tod !== undefined ? `&tod=${tod}` : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1600); // assar texturas + ~90 frames de assentamento
  const file = join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file });
  console.log(`olhou ${s.name} (${s.cam}${tod !== undefined ? ` · tod=${tod}` : ''})${s.desc ? ` — ${s.desc}` : ''}\n  ${file}`);
}
await browser.close();
server.close();
