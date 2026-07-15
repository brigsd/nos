#!/usr/bin/env node
/**
 * site/qa/p2p-screenshot.mjs
 *
 * R7 "Fluidez A" (D-25c) QA: TWO real tabs (same browser context, same
 * origin) running the built site end-to-end, proving REAL
 * RTCPeerConnections + DataChannels negotiate and exchange live positions.
 * Only the SIGNALING transport is faked — a same-origin BroadcastChannel,
 * injected via the `window.__NOS_QA_SIGNALING__` hook p2p-ui.ts checks (see
 * its module doc) — every RTCPeerConnection/RTCDataChannel here is the
 * real browser API, negotiating for real with the SAME `stun:
 * stun.l.google.com:19302` config production uses (p2p.ts never branches
 * on being under test). Host-to-host candidates connect on localhost
 * without STUN actually being reachable (task's own note) — p2p.ts's
 * ICE_GATHERING_TIMEOUT_MS safety net means an unreachable STUN lookup in
 * this sandbox degrades to "proceed with host candidates" rather than
 * hanging.
 *
 * Auth is faked too (seeded localStorage token + a routed /user response):
 * this sandbox has no egress to api.github.com (same limitation
 * screenshot.mjs/portals-screenshot.mjs already document for
 * raw.githubusercontent.com), and this script's job is to prove the WebRTC
 * layer, not auth.ts, which already has its own verified behaviour (R2).
 * Every OTHER api.github.com call is explicitly ABORTED (not just
 * unrouted) so a real signaling call slipping past the QA hook would fail
 * loudly here instead of hanging or silently no-opping.
 *
 * Third "peer" (Mallory): a hand-rolled, NON-p2p.ts WebRTC script injected
 * into page A, listening on the same BroadcastChannel from page load. It
 * deliberately targets only Bob's broadcast offer (bypassing the real
 * tie-break's "whichever offer arrives first" ambiguity so the test is
 * deterministic — see the inline comment) and, once its DataChannel is
 * open, sends a burst of malformed payloads followed by exactly one valid
 * `pos` message — proving p2p.ts's inbound validation against a REAL
 * DataChannel, not a mocked parser call.
 *
 *   cd site && npm run build
 *   node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5090 &
 *   node qa/p2p-screenshot.mjs [url]
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://127.0.0.1:5090';

function installRtcCounter() {
  window.__nosRtcCount = 0;
  const OriginalRTCPeerConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = new Proxy(OriginalRTCPeerConnection, {
    construct(target, args) {
      window.__nosRtcCount = (window.__nosRtcCount || 0) + 1;
      return Reflect.construct(target, args);
    },
  });
}

function installQaSignaling() {
  // Satisfies p2p-signaling.ts's SignalingChannel interface with a
  // same-origin BroadcastChannel instead of GitHub issue comments — see
  // p2p-ui.ts's qaSignalingOverride(). pausePolling/resumePolling are
  // no-ops: a BroadcastChannel is push-delivered, there is no polling loop
  // to pause.
  window.__NOS_QA_SIGNALING__ = async function (login) {
    const bc = new BroadcastChannel('nos-qa-p2p-signaling');
    let handler = null;
    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.from === login) return;
      if (handler) handler(msg);
    };
    return {
      async send(msg) {
        bc.postMessage(msg);
      },
      onMessage(h) {
        handler = h;
      },
      pausePolling() {},
      resumePolling() {},
      async close() {
        bc.close();
      },
    };
  };
}

function installMalloryPeer() {
  // A hand-rolled WebRTC "peer" that never imports p2p.ts — raw browser
  // APIs only, so garbage sent over its DataChannel is a genuine
  // arms-length test of p2p.ts's inbound validation. Deterministically
  // targets Bob's offer only (real players use the generic
  // `myLogin > offer.from` tie-break, which would race between answering
  // Alice's vs Bob's offer depending on arrival order — hardcoding the
  // target keeps THIS test's outcome deterministic without weakening what
  // it proves about p2p.ts).
  window.__nosMalloryLog = [];
  window.__nosMalloryChannel = null;
  const bc = new BroadcastChannel('nos-qa-p2p-signaling');
  const login = 'mallory';
  let handled = false;
  bc.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || handled) return;
    if (msg.kind !== 'offer' || msg.from !== 'bob') return;
    handled = true;
    void (async () => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.onconnectionstatechange = () => window.__nosMalloryLog.push('state:' + pc.connectionState);
      pc.ondatachannel = (ev2) => {
        window.__nosMalloryChannel = ev2.channel;
        ev2.channel.onopen = () => window.__nosMalloryLog.push('open');
      };
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve();
        };
        setTimeout(resolve, 8000);
      });
      // RTCSessionDescription is a class instance, not a plain object -
      // postMessage's structured-clone algorithm rejects it outright (the
      // same DataCloneError p2p.ts's own plainSdp() helper works around).
      const local = pc.localDescription;
      bc.postMessage({ v: 1, kind: 'answer', from: login, to: msg.from, sdp: { type: local.type, sdp: local.sdp } });
    })();
  };
}

async function seedPage(page, login, { withMallory = false } = {}) {
  await page.addInitScript(installRtcCounter);
  await page.addInitScript(installQaSignaling);
  if (withMallory) await page.addInitScript(installMalloryPeer);
  await page.addInitScript((l) => {
    localStorage.setItem('nos_token', `qa-fake-token-${l}`);
    localStorage.setItem('nos_token_login', l);
  }, login);
  await page.route('https://api.github.com/**', (route) => {
    const reqUrl = route.request().url();
    if (reqUrl === 'https://api.github.com/user') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ login }) });
    }
    // Anything else (notably live.ts's own Camada B world-polling, an
    // UNRELATED R5 feature that also activates once isLoggedIn() is true)
    // is expected to fail here — this sandbox has no real egress to
    // api.github.com regardless, and live.ts already degrades gracefully
    // (documented in its own QA). Fail fast and quiet; the assertion that
    // matters is that no SIGNALING traffic succeeds, which the rest of this
    // script proves structurally (the BroadcastChannel stub is what
    // actually carries every offer/answer).
    return route.abort('failed');
  });
}

async function waitForWorldLoaded(page) {
  await page.waitForFunction(() => document.getElementById('stat-tick')?.textContent?.trim() !== '—', { timeout: 20000 });
}

async function statusText(page) {
  return page.textContent('#hud-p2p .p2p-status');
}

async function ghostsOn(page) {
  return page.evaluate(() => window.__NOS_QA_P2P_GHOSTS__ ?? []);
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await context.newPage(); // alice
    const pageB = await context.newPage(); // bob

    const errorsA = [];
    const errorsB = [];
    pageA.on('pageerror', (err) => errorsA.push(String(err)));
    pageB.on('pageerror', (err) => errorsB.push(String(err)));

    await seedPage(pageA, 'alice', { withMallory: true });
    await seedPage(pageB, 'bob');

    await pageA.goto(url, { waitUntil: 'load', timeout: 30000 });
    await pageB.goto(url, { waitUntil: 'load', timeout: 30000 });
    await waitForWorldLoaded(pageA);
    await waitForWorldLoaded(pageB);
    await pageA.waitForTimeout(300);
    await pageB.waitForTimeout(300);

    // --- (1) opt-in gate: no RTCPeerConnection before consent -------------
    const rtcBeforeA = await pageA.evaluate(() => window.__nosRtcCount);
    const rtcBeforeB = await pageB.evaluate(() => window.__nosRtcCount);
    console.log(`(1) RTCPeerConnection antes do consentimento: A=${rtcBeforeA} B=${rtcBeforeB}`);
    if (rtcBeforeA !== 0 || rtcBeforeB !== 0) {
      throw new Error('RTCPeerConnection foi criada antes do jogador consentir (falha no gate de opt-in).');
    }
    const initialStatusA = await statusText(pageA);
    const initialStatusB = await statusText(pageB);
    if (!initialStatusA.includes('desligado') || !initialStatusB.includes('desligado')) {
      throw new Error(`Status inicial deveria ser "desligado": A="${initialStatusA}" B="${initialStatusB}"`);
    }

    // --- (2) turn P2P on for both real players -----------------------------
    await pageA.click('#hud-p2p .p2p-toggle');
    await pageB.click('#hud-p2p .p2p-toggle');

    await pageA.waitForFunction(() => document.querySelector('#hud-p2p .p2p-status')?.textContent?.includes('procurando'), {
      timeout: 5000,
    });
    console.log('(2) ambos os lados entraram em "procurando pares" imediatamente após o consentimento.');

    await pageA.waitForFunction(() => document.querySelector('#hud-p2p .p2p-status')?.textContent?.includes('conectado'), {
      timeout: 30000,
    });
    await pageB.waitForFunction(() => document.querySelector('#hud-p2p .p2p-status')?.textContent?.includes('conectado'), {
      timeout: 30000,
    });
    const statusA = await statusText(pageA);
    const statusB = await statusText(pageB);
    console.log(`(2) status A: "${statusA}"`);
    console.log(`(2) status B: "${statusB}"`);
    if (!statusA.includes('@bob')) throw new Error(`Status de A não menciona @bob: "${statusA}"`);
    if (!statusB.includes('@alice')) throw new Error(`Status de B não menciona @alice: "${statusB}"`);

    const rtcAfterA = await pageA.evaluate(() => window.__nosRtcCount);
    const rtcAfterB = await pageB.evaluate(() => window.__nosRtcCount);
    console.log(`(2) RTCPeerConnection criadas após consentimento: A=${rtcAfterA} B=${rtcAfterB} (inclui a de "mallory" em A)`);
    if (rtcAfterA < 1 || rtcAfterB < 1) throw new Error('Nenhuma RTCPeerConnection real foi criada após o consentimento.');

    // --- (3) move player A, assert B receives pos updates + draws the ghost ---
    await pageA.screenshot({ path: path.join(__dirname, 'p2p-a-connected.png') });
    await pageB.screenshot({ path: path.join(__dirname, 'p2p-b-before-move.png') });

    // The very first `reportLocalPosition` call to a given peer always
    // sends (see p2p.ts: a peer with no `lastSentByPeer` entry yet can't be
    // judged "unchanged") - but it still needs at least one
    // requestAnimationFrame tick plus the DataChannel round trip, so poll
    // rather than assuming it has already landed the instant the status
    // text flipped to "conectado".
    await pageB.waitForFunction(() => (window.__NOS_QA_P2P_GHOSTS__ ?? []).some((g) => g.login === 'alice'), { timeout: 5000 });
    const ghostsBeforeMove = await ghostsOn(pageB);
    const aliceGhostBefore = ghostsBeforeMove.find((g) => g.login === 'alice');
    console.log(`(3) vulto de @alice em B antes de mover: ${JSON.stringify(aliceGhostBefore)}`);
    if (!aliceGhostBefore) throw new Error('B não recebeu NENHUMA posição de A logo após conectar.');

    // main.ts's keydown handler ignores every key while focus sits on an
    // <input>/<textarea> (so typing in a form doesn't also walk the
    // avatar) - clicking the P2P toggle just above left focus ON that
    // checkbox. Blur it explicitly rather than clicking the map (which
    // would ALSO trigger tap-to-move/pathfinding via attachPointerControls
    // and confuse the "moved right by keyboard" assertion below).
    await pageA.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    for (let i = 0; i < 8; i++) {
      await pageA.keyboard.press('ArrowRight');
      await pageA.waitForTimeout(220); // matches LocalPlayer.speed (5 tiles/s = 200ms/tile) so each press lands on a settled tile
    }
    // Outbound throttle is ~10-15Hz + interpolation on B's side - give both a moment to settle.
    await pageB.waitForFunction(
      (startX) => {
        const g = (window.__NOS_QA_P2P_GHOSTS__ ?? []).find((gg) => gg.login === 'alice');
        return !!g && g.x > startX + 1.5;
      },
      aliceGhostBefore.x,
      { timeout: 12000 },
    );
    const ghostsAfterMove = await ghostsOn(pageB);
    const aliceGhostAfter = ghostsAfterMove.find((g) => g.login === 'alice');
    console.log(`(3) vulto de @alice em B depois de mover: ${JSON.stringify(aliceGhostAfter)}`);
    if (!aliceGhostAfter || aliceGhostAfter.x <= aliceGhostBefore.x + 1.5) {
      throw new Error(`Posição do vulto não avançou como esperado: antes=${aliceGhostBefore.x} depois=${aliceGhostAfter?.x}`);
    }
    if (aliceGhostAfter.face !== 'right') {
      throw new Error(`Face esperada "right" (moveu para a direita), veio "${aliceGhostAfter.face}".`);
    }

    await pageB.screenshot({ path: path.join(__dirname, 'p2p-b-after-move.png') });
    // A tight crop around the local-avatar/ghost cluster: at the default
    // "whole map visible" zoom the two are small and easy to miss in the
    // full 1280x800 frame (the map fills most of it) - this close-up is
    // what actually makes the translucent ghost legible at a glance.
    // Region hand-picked against this exact scenario (both players spawn
    // at (30,30), world center (32,32) stays centred on screen at this
    // zoom per Camera.clamp - see camera.ts) and confirmed empirically
    // during development to frame both the local avatar and the moved
    // ghost.
    await pageB.screenshot({ path: path.join(__dirname, 'p2p-b-after-move-closeup.png'), clip: { x: 590, y: 340, width: 200, height: 100 } });
    console.log(
      '(3) screenshots -> p2p-b-before-move.png / p2p-b-after-move.png / p2p-b-after-move-closeup.png (vulto translúcido de @alice visível e deslocado)',
    );

    // --- (4) garbage inbound messages are dropped (real DataChannel, "mallory") ---
    await pageA.waitForFunction(() => window.__nosMalloryChannel && window.__nosMalloryChannel.readyState === 'open', {
      timeout: 20000,
    });
    console.log('(4) canal de dados de "mallory" (peer não-p2p.ts) conectado a @bob.');

    await pageA.evaluate(() => {
      const garbage = [
        'isto não é json',
        JSON.stringify({ t: 'pos', x: 'nao-e-numero', y: 5 }),
        JSON.stringify({ t: 'pos' }), // faltam x/y
        JSON.stringify({ t: 'huh', x: 1, y: 1 }), // tipo desconhecido
        '{"t":"pos","x":1,"y":2,"face":"de-lado"}', // face inválida -> mensagem inteira descartada
        JSON.stringify({ t: 'pos', x: null, y: 1 }),
        JSON.stringify([1, 2, 3]),
        JSON.stringify({ t: 'pos', x: Infinity, y: 1 }),
      ];
      for (const g of garbage) window.__nosMalloryChannel.send(g);
    });
    await pageB.waitForTimeout(800);
    const ghostsAfterGarbage = await ghostsOn(pageB);
    if (ghostsAfterGarbage.some((g) => g.login === 'mallory')) {
      throw new Error(`Lixo criou um vulto para "mallory": ${JSON.stringify(ghostsAfterGarbage)}`);
    }
    console.log('(4) nenhuma das 8 mensagens-lixo criou um vulto para "mallory" — descartadas silenciosamente.');
    if (errorsB.length > 0) throw new Error(`B registrou erro(s) de página após o lixo: ${errorsB.join(' | ')}`);

    await pageA.evaluate(() => window.__nosMalloryChannel.send(JSON.stringify({ t: 'pos', x: 40, y: 41 })));
    await pageB.waitForFunction(() => (window.__NOS_QA_P2P_GHOSTS__ ?? []).some((g) => g.login === 'mallory'), { timeout: 5000 });
    const malloryGhost = (await ghostsOn(pageB)).find((g) => g.login === 'mallory');
    console.log(`(4) UMA mensagem válida após o lixo criou o vulto certo: ${JSON.stringify(malloryGhost)}`);
    if (!malloryGhost || Math.abs(malloryGhost.x - 40) > 0.5 || Math.abs(malloryGhost.y - 41) > 0.5) {
      throw new Error(`Vulto de "mallory" não bate com a posição válida (40,41): ${JSON.stringify(malloryGhost)}`);
    }
    const statusBWithMallory = await statusText(pageB);
    if (!statusBWithMallory.includes('2 pares')) {
      throw new Error(`B deveria listar 2 pares conectados (alice + mallory): "${statusBWithMallory}"`);
    }
    console.log(`(4) status B com os dois pares: "${statusBWithMallory}"`);

    // --- (5) clean teardown -------------------------------------------------
    await pageA.click('#hud-p2p .p2p-toggle'); // alice desliga
    await pageA.waitForFunction(() => document.querySelector('#hud-p2p .p2p-status')?.textContent === 'P2P: desligado', {
      timeout: 10000,
    });
    // A REMOTE signal, not a local flag: B must observe alice's connection
    // actually closing (real DataChannel/RTCPeerConnection teardown), while
    // the UNRELATED "mallory" connection stays up.
    await pageB.waitForFunction(() => !(window.__NOS_QA_P2P_GHOSTS__ ?? []).some((g) => g.login === 'alice'), { timeout: 10000 });
    const statusBAfterAliceLeft = await statusText(pageB);
    console.log(`(5) status B depois de A desligar: "${statusBAfterAliceLeft}"`);
    if (!statusBAfterAliceLeft.includes('@mallory') || statusBAfterAliceLeft.includes('@alice')) {
      throw new Error(`Teardown de A deveria remover só @alice, mantendo @mallory: "${statusBAfterAliceLeft}"`);
    }

    await pageB.click('#hud-p2p .p2p-toggle'); // bob desliga
    await pageB.waitForFunction(() => document.querySelector('#hud-p2p .p2p-status')?.textContent === 'P2P: desligado', {
      timeout: 10000,
    });
    await pageA.waitForFunction(
      () => (window.__nosMalloryLog ?? []).some((l) => l === 'state:closed' || l === 'state:disconnected' || l === 'state:failed'),
      { timeout: 10000 },
    );
    const malloryLog = await pageA.evaluate(() => window.__nosMalloryLog);
    console.log(`(5) B desligou; "mallory" (peer não-real) observou a queda: ${JSON.stringify(malloryLog)}`);
    console.log('(5) teardown limpo confirmado dos dois lados reais (@alice e @bob) — remoto observou a desconexão, não só um flag local.');

    // --- final report ---------------------------------------------------
    const consoleErrs = [...errorsA, ...errorsB];
    if (consoleErrs.length > 0) {
      throw new Error(`Erros de página inesperados: ${consoleErrs.join(' | ')}`);
    }
    console.log('\nTUDO PASSOU: opt-in gate, conexão real A<->B, posição ao vivo + interpolação, lixo descartado, teardown limpo (observado remotamente).');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('p2p screenshot falhou:', err);
  process.exit(1);
});
