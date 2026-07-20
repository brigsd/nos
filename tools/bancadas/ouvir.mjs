#!/usr/bin/env node
/**
 * ouvir.mjs — os ouvidos do coder (D-40).
 *
 * O par do olhar.mjs (D-35): eu SEI desenhar som, mas não ESCUTO. Então em vez
 * de "confiar que soa", esta bancada MEDE — carrega o cliente oficial num
 * Chromium headless, destrava o áudio com um gesto sintético, e lê o estado do
 * grafo (window.__nosAudio) + o RMS real do sinal num AnalyserNode ligado ao
 * master. Prova, determinística e sem ouvidos, que: (1) o contexto acorda,
 * (2) a água do chafariz SOBE por proximidade, (3) não há silêncio nem clip.
 * O "soa bonito?" continua sendo do ideador — isto só barra a regressão muda.
 *
 *   npm run ouvir                    # padrão: chafariz (perto) vs spawn (longe)
 *   npm run ouvir -- chafariz forja  # pontos nomeados do pontos.json
 *   npm run ouvir -- 46.2,15.6       # um ?cam= avulso
 *   npm run ouvir -- --no-build      # usa o build que já existe
 *
 * Sem rede externa (mundo inline, server local, Chromium do sandbox), igual olhar.
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BUILT = join(REPO, 'site/public/fps/index.html');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const wanted = args.filter((a) => !a.startsWith('--'));

/* 1 · build fresco por padrão — medir código velho é a receita da conclusão errada */
if (!flags.has('--no-build') || !existsSync(BUILT)) {
  execFileSync('node', [join(REPO, 'site/scripts/build-fps.mjs')], { stdio: 'inherit', cwd: REPO });
}

/* 2 · quais pontos? nomes do pontos.json, "x,y[,a]" avulso, ou o par padrão */
const PONTOS = JSON.parse(readFileSync(join(HERE, 'pontos.json'), 'utf8'));
delete PONTOS._;
const pts = [];
const push = (name, cam) => pts.push({ name, cam });
if (wanted.length === 0) {
  push('chafariz', PONTOS.chafariz.cam); // perto da água
  push('spawn', PONTOS.spawn.cam);       // longe, no início do carreiro
} else {
  for (const w of wanted) {
    if (PONTOS[w]) push(w, PONTOS[w].cam);
    else if (/^-?[\d.]+,-?[\d.]+(,-?[\d.]+)?$/.test(w)) push(`cam-${w.replaceAll(',', 'x')}`, w);
    else { console.error(`ponto desconhecido: ${w} (veja pontos.json)`); process.exit(1); }
  }
}

/* 3 · server local efêmero servindo só o build */
const html = readFileSync(BUILT);
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

/* 4 · Chromium com autoplay liberado (o gesto sintético ainda destrava, mas a
   flag evita depender só dele em headless) */
/* dependência oculta: o Playwright vive em site/node_modules (rode `cd site && npm ci` uma vez) */
const PW = join(REPO, 'site/node_modules/playwright/index.js');
if (!existsSync(PW)) { console.error('ouvir: Playwright não encontrado. Rode uma vez: cd site && npm ci   (a bancada usa o Playwright/Chromium do site).'); process.exit(1); }
const pw = (await import(pathToFileURL(PW).href)).default;
const browser = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

/* mede um ponto: destrava o som, espera o glide da proximidade assentar, lê o
   grafo e o RMS do sinal que sai do master */
async function medir(cam) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${base}?cam=${cam}`, { waitUntil: 'load' });
  await page.keyboard.press('Shift'); // gesto de teclado: destrava o AudioContext (não move nem muda mudo)
  await page.waitForTimeout(900);      // texturas + glide da água (setTargetAtTime ~0.14s)
  const out = await page.evaluate(async () => {
    const info = typeof window.__nosAudio === 'function' ? window.__nosAudio() : null;
    let rms = null;
    try {
      if (typeof AC !== 'undefined' && AC && typeof masterG !== 'undefined' && masterG) {
        const an = AC.createAnalyser(); an.fftSize = 2048;
        masterG.connect(an);
        const buf = new Float32Array(an.fftSize);
        let acc = 0, n = 0; const t0 = performance.now();
        while (performance.now() - t0 < 260) {
          an.getFloatTimeDomainData(buf);
          let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          acc += Math.sqrt(s / buf.length); n++;
          await new Promise((r) => setTimeout(r, 24));
        }
        masterG.disconnect(an);
        rms = +(acc / Math.max(n, 1)).toFixed(5);
      }
    } catch (e) { rms = `err:${e.message}`; }
    return { info, rms };
  });
  await page.close();
  return { ...out, errs };
}

const rows = [];
for (const p of pts) {
  const m = await medir(p.cam);
  rows.push({ name: p.name, cam: p.cam, ...m });
  const i = m.info || {};
  console.log(
    `ouviu ${p.name.padEnd(9)} (${p.cam})  estado=${i.state}  água=${i.water}  vento=${i.wind}  master=${i.master}  RMS=${m.rms}` +
      (m.errs.length ? `  ⚠ erros: ${m.errs.join(' | ')}` : ''),
  );
}

await browser.close();
server.close();

/* 5 · porteiro anti-regressão (só quando dá pra comparar perto vs longe) */
const chaf = rows.find((r) => r.name === 'chafariz');
const spw = rows.find((r) => r.name === 'spawn');
let bad = rows.some((r) => r.errs.length);
if (chaf && spw) {
  const near = chaf.info?.water ?? 0, far = spw.info?.water ?? 0;
  if (!(near > far + 0.02)) { console.error(`✗ proximidade não subiu a água: perto=${near} longe=${far}`); bad = true; }
  if (typeof chaf.rms === 'number' && chaf.rms < 0.0005) { console.error(`✗ silêncio perto do chafariz (RMS=${chaf.rms})`); bad = true; }
  if (typeof chaf.rms === 'number' && chaf.rms > 0.5) { console.error(`✗ clip/áudio alto demais (RMS=${chaf.rms})`); bad = true; }
  if (!bad) console.log('✓ som ok: contexto acorda, água sobe por proximidade, sinal presente e sem clip');
}
process.exit(bad ? 1 : 0);
