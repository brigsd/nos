#!/usr/bin/env node
/**
 * site/qa/oficinas-screenshot.mjs
 *
 * Same idea as screenshot.mjs, but for the "Oficinas" panel (R4, D-23/
 * D-25a): logs in as the demo player via the "Meu Nó" form (exercises
 * meu-no.ts's new onLoginChange hook), expands the Oficinas <details> panel,
 * and captures it, then zooms in on the map around O Núcleo to capture the
 * 4 machine sprites + name labels. Not part of the npm "qa" script - an ad
 * hoc tool for this slice, same status as zoom-screenshot.mjs.
 *
 *   node qa/oficinas-screenshot.mjs <panelOutFile> <mapOutFile> <url> <login>
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const panelOutFile = path.resolve(__dirname, process.argv[2] || 'oficinas-panel.png');
const mapOutFile = path.resolve(__dirname, process.argv[3] || 'oficinas-map.png');
const url = process.argv[4] || 'http://127.0.0.1:5090';
const login = process.argv[5] || 'brigsd';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  try {
    // Tall viewport: the HUD stacks Auth+Meu Nó+Mural+Comércio+Nativos+
    // Oficinas top to bottom with no internal scroll container (#app clips
    // overflow), so a standard 800px-tall viewport crops the Oficinas body
    // once everything above it is also on screen. Only this QA capture
    // needs the extra height - the map shot below switches back to the
    // standard 1280x800 used by the rest of site/qa/.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('stat-tick')?.textContent?.trim() !== '—', {
      timeout: 20000,
    });
    await page.waitForTimeout(300);

    // Zoom in around O Núcleo (the 4 machines ring its clearing) and
    // capture the map FIRST, at the standard 1280x800 viewport (matches the
    // rest of site/qa/) and before any resize below shifts the camera's
    // framing.
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(200);
    await page.screenshot({ path: mapOutFile });
    console.log(`oficinas map screenshot saved to ${mapOutFile}`);

    // "Meu Nó": tell the HUD who we are, so Oficinas' materials preview has
    // a real player to compare against (also exercises the new
    // onLoginChange hook threaded from meu-no.ts to oficinas.ts).
    await page.fill('#hud-meuno .meuno-input', login);
    await page.click('#hud-meuno .meuno-button');
    await page.waitForTimeout(200);

    // Expand the Oficinas panel and grow the viewport tall enough to fit
    // the whole HUD stack above it before capturing.
    await page.click('#hud-oficinas summary');
    await page.waitForTimeout(200);
    const hudHeight = await page.evaluate(() => document.getElementById('hud')?.scrollHeight ?? 800);
    await page.setViewportSize({ width: 1280, height: Math.max(800, hudHeight + 40) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: panelOutFile });
    console.log(`oficinas panel screenshot saved to ${panelOutFile}`);

    if (consoleErrors.length > 0) {
      console.warn(`page logged ${consoleErrors.length} console error(s):`);
      for (const e of consoleErrors) console.warn(' -', e);
    } else {
      console.log('no console errors');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('oficinas screenshot failed:', err);
  process.exit(1);
});
