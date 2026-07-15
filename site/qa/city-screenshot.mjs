#!/usr/bin/env node
/**
 * site/qa/city-screenshot.mjs
 *
 * QA captures for A Cidade (R8, docs/CITY_PLAN.md): drives the REAL built
 * site (vite preview) in headless Chromium and captures the city at the
 * zoom levels a player actually sees - whole-map (the "does the city read
 * as a place?" shot), mid zoom on a Praça das Oficinas, close zoom, o
 * Salão de Portais, o Largo do Mural, and the ideador's own viewport: a
 * 390x844 phone, default view + praça. Outputs into site/qa/city/.
 *
 * The served world must already carry the city (run the migration against
 * a COPY and drop it at dist/world/heart.json - see the PR's QA notes;
 * world/heart.json itself is never touched).
 *
 *   node qa/city-screenshot.mjs [url] [outDir]
 *
 * Screen math for the wheel targets (camera.ts: default zoom = fit * 0.94,
 * map centered): desktop 1280x800 puts o Núcleo (tile 32.5, 32.5) around
 * CSS (646, 406) and the portal (57.5, 34.5) around (939, 429); the phone
 * 390x844 puts o Núcleo around (198, 425). Negative deltaY zooms in
 * (input.ts: factor = 1.0015 ** -deltaY), anchored at the cursor.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://127.0.0.1:5099';
const outDir = path.resolve(__dirname, process.argv[3] || 'city');

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 }; // o ideador joga no celular

const SHOTS = [
  { name: 'city-full', viewport: DESKTOP, at: null, wheel: 0 },
  { name: 'city-praca-mid', viewport: DESKTOP, at: [646, 406], wheel: 700 },
  { name: 'city-praca-close', viewport: DESKTOP, at: [646, 406], wheel: 1400 },
  { name: 'city-salao', viewport: DESKTOP, at: [939, 429], wheel: 1000 },
  { name: 'city-largo', viewport: DESKTOP, at: [560, 390], wheel: 1300 },
  { name: 'city-phone-full', viewport: PHONE, at: null, wheel: 0 },
  // Round 3 QA finding (R3-16): the first wheel target (198, 425) landed on
  // the HUD's stacked panels, which swallow the event - the shot came out
  // identical to the default view. The map's uncovered strip on a 390px
  // phone is the RIGHT edge - which at default framing is the map's east,
  // i.e. o Salão: zoom there directly...
  { name: 'city-phone-salao', viewport: PHONE, at: [370, 420], wheel: 900 },
  // ...and reach a Praça by zooming on the east strip then DRAGGING the map
  // east (pointer capture keeps the drag on the canvas even when the cursor
  // crosses the HUD, same as a thumb would). Drag length tuned in round 4:
  // the first take (335px) overshot and hid the praça behind the HUD column.
  { name: 'city-phone-praca', viewport: PHONE, at: [370, 420], wheel: 900, drag: [[375, 500], [170, 480]] },
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage({ viewport: shot.viewport });
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(String(err)));

      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => document.getElementById('stat-tick')?.textContent?.trim() !== '—', {
        timeout: 20000,
      });
      await page.waitForTimeout(400);

      if (shot.at && shot.wheel > 0) {
        await page.mouse.move(shot.at[0], shot.at[1]);
        await page.mouse.wheel(0, -shot.wheel);
        await page.waitForTimeout(250);
      }
      if (shot.drag) {
        const [[fx, fy], [tx, ty]] = shot.drag;
        await page.mouse.move(fx, fy);
        await page.mouse.down();
        // A few intermediate moves so input.ts sees a drag, not a jump.
        for (let i = 1; i <= 6; i++) {
          await page.mouse.move(fx + ((tx - fx) * i) / 6, fy + ((ty - fy) * i) / 6);
          await page.waitForTimeout(30);
        }
        await page.mouse.up();
        await page.waitForTimeout(250);
      }

      const outFile = path.join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: outFile });
      console.log(`${shot.name} -> ${outFile}${errors.length ? `  (console errors: ${errors.length})` : ''}`);
      if (errors.length) for (const e of errors) console.error(`  [console] ${e}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('city screenshot failed:', err);
  process.exit(1);
});
