#!/usr/bin/env node
/**
 * site/qa/screenshot.mjs
 *
 * Art-reviewer QA tool for issue #12: opens the already-built, already-served
 * site in headless Chromium and saves a 1280x800 screenshot under site/qa/,
 * so visual changes (campina tones, water rim, ...) can be judged by reading
 * the actual rendered map instead of the source sprites in isolation.
 *
 * Does NOT start the preview server itself - point it at whatever is
 * already serving the built `dist/` (see README below for the exact
 * sequence this project uses).
 *
 *   cd site && npm run build
 *   node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5090 &
 *   node qa/screenshot.mjs [outFile] [url]
 *
 * Headless Chromium has no real network egress in this environment, so the
 * site's live world fetch (raw.githubusercontent.com) always times out and
 * falls back to the bundled world/heart.json copy - that's expected, not a
 * bug, and still exercises the exact same renderer.ts drawing code.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outFile = path.resolve(__dirname, process.argv[2] || 'screenshot.png');
const url = process.argv[3] || 'http://127.0.0.1:5090';

async function main() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    await page.goto(url, { waitUntil: 'load', timeout: 30000 });

    // main.ts flips #stat-tick from the "-" placeholder once world+sprites
    // both load (live fetch fails in headless -> falls back to the bundled
    // copy - see world.ts). Give it generous room for the live-fetch abort
    // (LIVE_TIMEOUT_MS=4000) plus the fallback fetch + sprite decode.
    await page.waitForFunction(
      () => document.getElementById('stat-tick')?.textContent?.trim() !== '—',
      { timeout: 20000 },
    );
    // One extra frame for the canvas to actually paint post-load.
    await page.waitForTimeout(300);

    await page.screenshot({ path: outFile });

    if (consoleErrors.length > 0) {
      console.warn(`screenshot saved to ${outFile}, but the page logged ${consoleErrors.length} console error(s):`);
      for (const e of consoleErrors) console.warn(' -', e);
    } else {
      console.log(`screenshot saved to ${outFile} (no console errors)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('screenshot failed:', err);
  process.exit(1);
});
