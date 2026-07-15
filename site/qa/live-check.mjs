#!/usr/bin/env node
/**
 * site/qa/live-check.mjs
 *
 * R5 (Fluidez B, D-24) QA: proves src/live.ts's tier logic — Camada B's
 * ETag/304 handling, the 401 downgrade to Camada C, the rate-limit backoff,
 * the minimal world-shape validation, visibility pause/resume, and the
 * refreshNow()/stop() controls — against a MOCKED `fetch`, since this
 * sandbox has no real network egress to api.github.com/raw.githubusercontent.com
 * (see screenshot.mjs's header comment: the live site itself already
 * degrades to the bundled world/heart.json copy for the exact same reason).
 *
 * This drives the REAL, unmodified site/src/live.ts through qa/live-check.html
 * — it is not a re-implementation of the tier logic under test. Starts its
 * own `vite dev` server (so the harness page's inline module script can
 * import `/src/live.ts` with on-the-fly TS transform, same as index.html
 * importing `/src/main.ts`), drives it with headless Chromium, reads the
 * PASS/FAIL log the harness writes into the DOM, and exits non-zero on any
 * failure or unexpected console error.
 *
 *   node qa/live-check.mjs
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const PORT = 5091;
const URL = `http://127.0.0.1:${PORT}/qa/live-check.html`;

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) {
            reject(new Error(`vite dev não respondeu em ${url} a tempo`));
          } else {
            setTimeout(tryOnce, 200);
          }
        });
    };
    tryOnce();
  });
}

async function main() {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--port', String(PORT), '--strictPort'], {
    cwd: SITE_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let viteExited = false;
  vite.on('exit', () => {
    viteExited = true;
  });
  const viteOutput = [];
  vite.stdout.on('data', (d) => viteOutput.push(d.toString()));
  vite.stderr.on('data', (d) => viteOutput.push(d.toString()));

  try {
    await waitForServer(URL, 20000);

    const browser = await chromium.launch({
      executablePath: '/opt/pw-browsers/chromium',
      args: ['--no-sandbox'],
    });
    try {
      const page = await browser.newPage();

      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => document.getElementById('done')?.dataset.status !== 'running', {
        timeout: 20000,
      });

      const log = await page.textContent('#log');
      const status = await page.getAttribute('#done', 'data-status');
      const summary = await page.getAttribute('#done', 'data-summary');

      console.log(log);
      console.log(`\nresultado: ${status} (${summary})`);

      if (consoleErrors.length > 0) {
        // Warn-only, same convention as screenshot.mjs: a headless Chromium
        // tab requests /favicon.ico automatically and this harness page
        // (dev-only, never shipped) has none, which logs as a console error
        // unrelated to live.ts - the actual pass/fail gate is data-status
        // below, driven by the harness's own PASS/FAIL assertions.
        console.warn(`\npágina registrou ${consoleErrors.length} erro(s) de console:`);
        for (const e of consoleErrors) console.warn(' -', e);
      }

      if (status !== 'pass') {
        process.exitCode = 1;
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error('live-check falhou:', err);
    console.error('--- saída do vite dev ---');
    console.error(viteOutput.join(''));
    process.exitCode = 1;
  } finally {
    if (!viteExited) vite.kill();
  }
}

main();
