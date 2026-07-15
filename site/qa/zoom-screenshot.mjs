#!/usr/bin/env node
/**
 * site/qa/zoom-screenshot.mjs
 *
 * Same idea as screenshot.mjs, but zooms in (mouse wheel over the canvas)
 * before capturing, so the art-reviewer pass can inspect the water-rim
 * pixels closely instead of judging them at whole-map scale. Not part of
 * the npm "qa" script - an ad hoc close-up tool for this review pass.
 *
 *   node qa/zoom-screenshot.mjs <outFile> <url> <cssX> <cssY> <wheelSteps>
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outFile = path.resolve(__dirname, process.argv[2] || 'zoom.png');
const url = process.argv[3] || 'http://127.0.0.1:5090';
const cssX = Number(process.argv[4] || 640);
const cssY = Number(process.argv[5] || 300);
const wheelSteps = Number(process.argv[6] || 400);

async function main() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(
      () => document.getElementById('stat-tick')?.textContent?.trim() !== '—',
      { timeout: 20000 },
    );
    await page.waitForTimeout(300);

    await page.mouse.move(cssX, cssY);
    // Negative deltaY zooms in (see input.ts: factor = 1.0015 ** -deltaY).
    await page.mouse.wheel(0, -wheelSteps);
    await page.waitForTimeout(200);

    await page.screenshot({ path: outFile });
    console.log(`zoom screenshot saved to ${outFile}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('zoom screenshot failed:', err);
  process.exit(1);
});
