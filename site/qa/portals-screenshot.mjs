#!/usr/bin/env node
/**
 * site/qa/portals-screenshot.mjs
 *
 * QA tool for R6 fase 1 (Portais, D-17): opens the already-built, already-
 * served site in headless Chromium and drives a full travessia end to end -
 * expand the Portais panel, cross into O Átrio, come back - saving a
 * screenshot at each stage. Not part of the npm "qa" script - an ad hoc tool
 * for this slice, same status as oficinas-screenshot.mjs/
 * live-indicator-screenshot.mjs.
 *
 * Does NOT start the preview server itself - point it at whatever is
 * already serving the built `dist/` (see README below for the exact
 * sequence this project uses).
 *
 *   cd site && npm run build
 *   node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5090 &
 *   node qa/portals-screenshot.mjs [url]
 *
 * O Átrio's worldUrl (worlds/atrio.json) is a same-origin relative fetch, so
 * it works fully in this sandbox (no real network egress needed) - the task
 * this script verifies is explicit about that. "Voltar ao Coração" DOES
 * touch world.ts's loadWorld(), which first tries the live raw.githubusercontent.com
 * URL and only falls back to the bundled world/heart.json copy after its own
 * ~4s timeout (LIVE_TIMEOUT_MS) - same "expected, not a bug" situation
 * screenshot.mjs already documents for the initial page load. This script
 * waits on DOM state (page.waitForFunction), not fixed sleeps, so it isn't
 * sensitive to exactly how long that takes.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://127.0.0.1:5090';

const panelOut = path.join(__dirname, 'portals-panel.png');
const visitingOut = path.join(__dirname, 'portals-visiting-atrio.png');
const homeOut = path.join(__dirname, 'portals-back-home.png');

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
    await page.waitForFunction(() => document.getElementById('stat-tick')?.textContent?.trim() !== '—', {
      timeout: 20000,
    });
    await page.waitForTimeout(300);

    // --- (a) The Portais panel, expanded ---------------------------------
    await page.click('#hud-portais summary');
    await page.waitForTimeout(200);
    const hudHeight = await page.evaluate(() => document.getElementById('hud')?.scrollHeight ?? 800);
    await page.setViewportSize({ width: 1280, height: Math.max(800, hudHeight + 40) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: panelOut });
    console.log(`(a) painel Portais -> ${panelOut}`);

    // Back to the standard viewport for the map shots below.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);

    // --- Cross into O Átrio ------------------------------------------------
    const clicked = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#hud-portais-body .portal-card'));
      const atrioCard = cards.find((c) => c.querySelector('.portal-header')?.textContent?.includes('Átrio'));
      const btn = atrioCard?.querySelector('button.portal-act');
      if (btn instanceof HTMLButtonElement && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    });
    if (!clicked) throw new Error('Não encontrei um botão "atravessar" habilitado para O Átrio.');

    await page.waitForFunction(() => document.getElementById('hud-world-name')?.textContent?.includes('Átrio'), {
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    // --- (b) Mid-visit in O Átrio, with the banner -------------------------
    await page.screenshot({ path: visitingOut });
    console.log(`(b) de visita em O Átrio -> ${visitingOut}`);

    const visitingBannerVisible = await page.evaluate(() => {
      const el = document.getElementById('hud-visiting');
      return !!el && !el.hidden && el.textContent.includes('Átrio');
    });
    if (!visitingBannerVisible) throw new Error('O banner "você está de visita" não apareceu como esperado.');

    // --- Voltar ao Coração ---------------------------------------------------
    await page.click('#hud-visiting .visiting-voltar');
    await page.waitForFunction(() => document.getElementById('hud-world-name')?.textContent === 'O Coração', {
      timeout: 15000,
    });
    await page.waitForTimeout(500);

    // --- (c) Back home -------------------------------------------------------
    await page.screenshot({ path: homeOut });
    console.log(`(c) de volta n'O Coração -> ${homeOut}`);

    const bannerHiddenAgain = await page.evaluate(() => document.getElementById('hud-visiting')?.hidden === true);
    if (!bannerHiddenAgain) throw new Error('O banner de visita deveria ter sumido ao voltar.');

    // Same acknowledged limitation screenshot.mjs already documents: this
    // sandbox has no real network egress to raw.githubusercontent.com, so
    // world.ts's loadWorld() (called again here by "voltar", per the task)
    // always times out on the live URL and falls back to the bundled
    // world/heart.json copy - a benign console error, not a bug in this
    // slice's code. Warn (for visibility) but don't fail the script over it;
    // only warn a real correctness failure (a thrown Error above already
    // exits non-zero on its own).
    if (consoleErrors.length > 0) {
      console.warn(`A página registrou ${consoleErrors.length} erro(s) de console (esperado neste sandbox sem rede real):`);
      for (const e of consoleErrors) console.warn(' -', e);
    } else {
      console.log('Sem erros de console. Travessia completa verificada de ponta a ponta.');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('portals screenshot failed:', err);
  process.exit(1);
});
