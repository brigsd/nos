#!/usr/bin/env node
/**
 * site/qa/live-indicator-screenshot.mjs
 *
 * Visual QA for the "pulso ao vivo" HUD indicator (R5, D-24, Fluidez B).
 * Two screenshots, two different honesty levels:
 *
 *   1. real-site.png — the ACTUAL built site (dist/, via `vite preview`,
 *      same recipe as screenshot.mjs), cropped to the top-left HUD panel.
 *      This is what a real anonymous visitor's browser paints end to end
 *      through main.ts/live.ts/live-indicator.ts, unmodified. Camada C is
 *      what a fresh visitor gets by default (no token in localStorage), and
 *      this sandbox's headless Chromium has no route to
 *      raw.githubusercontent.com either (see screenshot.mjs's header
 *      comment) - so even this "real" capture shows Camada C's poll ALSO
 *      failing quietly in the background, same as the live site would on a
 *      flaky connection. That's the honest, unremarkable default state; the
 *      indicator keeps painting a truthful "atualizado há Xs" throughout.
 *
 *   2. states-preview.png — qa/live-indicator-states.html, a small fixture
 *      that calls the REAL src/live-indicator.ts with hand-built LiveStatus
 *      objects to show Camada B ("ao vivo · batida N") and the paused state,
 *      neither of which this sandbox can produce for real (Camada B needs a
 *      genuine token + reachable api.github.com; paused needs a background
 *      tab, which Playwright's headless page never truly backgrounds). This
 *      is explicitly a paint-only fixture, not a network capture - see that
 *      file's own header comment. The tier LOGIC (not just the paint) is
 *      separately proven against a mocked fetch by qa/live-check.html/.mjs.
 *
 *   cd site && npm run build
 *   node qa/live-indicator-screenshot.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const PREVIEW_PORT = 5095;
const DEV_PORT = 5096;
const realSiteOut = path.resolve(__dirname, process.argv[2] || 'live-indicator-real-site.png');
const statesOut = path.resolve(__dirname, process.argv[3] || 'live-indicator-states.png');

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) reject(new Error(`servidor não respondeu em ${url} a tempo`));
          else setTimeout(tryOnce, 200);
        });
    };
    tryOnce();
  });
}

function spawnVite(args, port) {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...args, '--port', String(port), '--strictPort'], {
    cwd: SITE_ROOT,
    stdio: 'ignore',
  });
  return child;
}

async function shootRealSite(browser) {
  const preview = spawnVite(['preview'], PREVIEW_PORT);
  try {
    const url = `http://127.0.0.1:${PREVIEW_PORT}`;
    await waitForServer(url, 20000);

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    // Same wait as screenshot.mjs: main.ts flips #stat-tick once world+sprites
    // both settle (falls back to the bundled world copy - live fetch can't
    // reach raw.githubusercontent.com in this sandbox).
    await page.waitForFunction(() => document.getElementById('stat-tick')?.textContent?.trim() !== '—', {
      timeout: 20000,
    });
    // Let live.ts's INITIAL_DELAY_MS (2s) elapse plus a beat, so the
    // indicator's "atualizado há Xs" has visibly started counting instead of
    // showing the placeholder "—" from index.html's static markup.
    await page.waitForFunction(
      () => document.getElementById('hud-live-label')?.textContent?.trim() !== '—',
      { timeout: 8000 },
    );
    await page.waitForTimeout(300);

    const panel = page.locator('.hud-top .hud-panel');
    await panel.screenshot({ path: realSiteOut });
    console.log(`real-site screenshot saved to ${realSiteOut}`);
    const labelText = await page.locator('#hud-live-label').textContent();
    console.log(`  #hud-live-label at capture time: "${labelText}"`);

    if (consoleErrors.length > 0) {
      console.warn(`  página registrou ${consoleErrors.length} erro(s) de console (esperado: live/raw fetch falhando no sandbox):`);
      for (const e of consoleErrors) console.warn('   -', e);
    }
    await page.close();
  } finally {
    preview.kill();
  }
}

async function shootStatesPreview(browser) {
  const dev = spawnVite(['dev'], DEV_PORT);
  try {
    const url = `http://127.0.0.1:${DEV_PORT}/qa/live-indicator-states.html`;
    await waitForServer(`http://127.0.0.1:${DEV_PORT}`, 20000);

    const page = await browser.newPage({ viewport: { width: 640, height: 220 } });
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 10000 });
    await page.waitForTimeout(150);

    await page.screenshot({ path: statesOut });
    console.log(`states-preview screenshot saved to ${statesOut}`);

    if (consoleErrors.length > 0) {
      console.warn(`  página registrou ${consoleErrors.length} erro(s) de console:`);
      for (const e of consoleErrors) console.warn('   -', e);
    }
    await page.close();
  } finally {
    dev.kill();
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  try {
    await shootRealSite(browser);
    await shootStatesPreview(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('live-indicator-screenshot falhou:', err);
  process.exit(1);
});
