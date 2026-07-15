/**
 * src/p2p-ui.ts
 *
 * HUD panel for "modo tempo real (P2P)" (R7, D-25c) — the opt-in toggle, its
 * honest pt-BR explanation, and the current status line. This module owns
 * the one localStorage flag that remembers consent and the DOM; all
 * networking/WebRTC lives in p2p.ts, all signaling in p2p-signaling.ts. It
 * is the thing that actually calls startP2P()/handle.stop() as the toggle
 * flips, so main.ts only has to wire a few callbacks once (world bounds,
 * where to hand fresh ghost positions).
 *
 * Consent (D-25c, "transparência radical"): OFF by default. The explanation
 * below is shown in full whenever this panel renders — logged-out, opted-out
 * AND opted-in alike — not hidden behind a one-time modal, so a player can
 * re-read exactly what they agreed to at any time. No RTCPeerConnection, no
 * signaling channel, no DataChannel of any kind exists until the player
 * flips the toggle: `startP2P` (p2p.ts) is only ever called from the
 * change handler below, and nowhere else in this module or main.ts.
 *
 * Requires login (D-25c: "signaling needs token" — p2p-signaling.ts posts
 * comments as the player's own GitHub identity): while logged out, the
 * toggle is disabled and says so, matching the pattern nativos.ts/trade.ts
 * already use for "readOnly" actions that need auth.
 */
import { getLogin, isLoggedIn, peekLogin } from './auth';
import { startP2P, type Face, type P2PHandle, type P2PStatusSnapshot, type PeerGhost } from './p2p';
import type { OpenSignaling } from './p2p-signaling';

const CONSENT_STORAGE_KEY = 'nos_p2p_opt_in';

export function isP2POptedIn(): boolean {
  return localStorage.getItem(CONSENT_STORAGE_KEY) === '1';
}

function setOptedIn(value: boolean): void {
  if (value) localStorage.setItem(CONSENT_STORAGE_KEY, '1');
  else localStorage.removeItem(CONSENT_STORAGE_KEY);
}

/**
 * QA-only injection seam (site/qa/p2p-screenshot.mjs): if a page script sets
 * this global BEFORE the toggle is flipped, it replaces GitHub issue-comment
 * signaling with a same-origin stub (a BroadcastChannel, in the QA script)
 * so two Playwright tabs can negotiate a REAL RTCPeerConnection without any
 * real network egress — see p2p-signaling.ts's SignalingChannel interface,
 * which the stub must satisfy. A plain property read, not a feature flag:
 * it silently no-ops (falls through to the real openGitHubSignaling) in
 * every real player's session, where it is never set.
 */
function qaSignalingOverride(): OpenSignaling | undefined {
  return (window as unknown as { __NOS_QA_SIGNALING__?: OpenSignaling }).__NOS_QA_SIGNALING__;
}

/**
 * D-25c "transparência radical" — this copy must be ACCURATE, not
 * reassuring: only the position DATA travels browser-to-browser. The
 * connection INVITE travels through GitHub as a comment on a public issue,
 * and that invite contains the player's public IP address, signed by their
 * GitHub username, readable by anyone — and it can outlive the session
 * (closing the tab skips the cleanup edit; only a graceful toggle-off/
 * logout rewrites the comment). Say all of that plainly.
 */
const EXPLANATION =
  'Liga uma conexão direta entre o seu navegador e o de outros jogadores para ver o vulto deles se mover ao vivo. ' +
  'Transparência total: o convite de conexão é publicado como comentário numa issue PÚBLICA do GitHub, assinado pelo seu usuário e contendo seu endereço IP — qualquer pessoa pode ler, e o comentário pode continuar lá depois que você sair (fechar a aba não o apaga; desligar o modo, sim). ' +
  'Pela conexão direta só viaja a posição do seu vulto (a Intenção) — o mundo oficial não passa por aqui. Pode desligar quando quiser.';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusLabel(status: P2PStatusSnapshot): string {
  if (!status.enabled) return 'P2P: desligado';
  if (status.connected.length === 0) return 'P2P: procurando pares';
  if (status.connected.length === 1) return `P2P: conectado a @${status.connected[0]} (1)`;
  return `P2P: conectado a ${status.connected.length} pares (${status.connected.map((l) => `@${l}`).join(', ')})`;
}

export interface P2PUiHost {
  root: HTMLElement;
  /** Live getter for the world bounds a ghost's position must be clamped to (portal travel changes this — see main.ts). */
  getWorldBounds: () => { width: number; height: number };
  /** Called on every ghost-set change so main.ts can hand fresh positions to the renderer. */
  onGhostsChanged: (ghosts: ReadonlyMap<string, PeerGhost>) => void;
}

export interface P2PController {
  /** Re-renders the panel (call after auth state changes, e.g. from main.ts's handleAuthChange). */
  refresh(): void;
  /** Drives ghost interpolation — call once per render frame. No-ops when P2P isn't connected to anyone. */
  tick(dtSeconds: number): void;
  /** Reports the LOCAL player's current position to any connected peers — call once per frame while NOT visiting another world (see main.ts: P2P is scoped to O Coração, portal-visited worlds use a different coordinate space). No-ops when nobody is connected. */
  reportPosition(x: number, y: number, face?: Face): void;
}

/**
 * Builds the P2P panel controller and does its first render into
 * `host.root`. Call once at startup (main.ts) and keep the returned
 * controller for the lifetime of the page — unlike the other HUD panels,
 * this one owns a live network session that must survive across unrelated
 * re-renders, so it cannot be a stateless "call again to refresh" function.
 */
export function createP2PPanel(host: P2PUiHost): P2PController {
  let handle: P2PHandle | null = null;
  let currentStatus: P2PStatusSnapshot = { enabled: false, searching: false, connected: [] };
  let statusLineEl: HTMLElement | null = null;
  /**
   * Guards the gap between "decided to connect" and `startP2P` actually
   * assigning `handle` (both the toggle's own async login check and the
   * auto-resume path below await `getLogin()` first) - without this, two
   * `render()` calls landing close together (e.g. handleAuthChange firing
   * twice) could each see `!handle` and both end up calling `enable()`,
   * opening two concurrent P2P sessions.
   */
  let connecting = false;

  function paintStatus(): void {
    if (statusLineEl) statusLineEl.textContent = statusLabel(currentStatus);
  }

  function enable(login: string): void {
    setOptedIn(true);
    connecting = false;
    handle = startP2P({
      login,
      getWorldBounds: host.getWorldBounds,
      onStatus: (status) => {
        currentStatus = status;
        paintStatus();
      },
      onGhostsChanged: host.onGhostsChanged,
      openSignaling: qaSignalingOverride(),
    });
  }

  async function disable(): Promise<void> {
    setOptedIn(false);
    connecting = false;
    const h = handle;
    handle = null;
    currentStatus = { enabled: false, searching: false, connected: [] };
    paintStatus();
    host.onGhostsChanged(new Map());
    if (h) await h.stop();
  }

  function render(): void {
    const root = host.root;
    root.replaceChildren();
    root.appendChild(el('h2', 'hud-mural-title', 'Tempo real (P2P)'));
    root.appendChild(el('p', 'p2p-hint', EXPLANATION));

    if (!isLoggedIn()) {
      if (handle) void disable(); // login revoked/logged out mid-session — signaling can't continue without a token
      root.appendChild(el('p', 'p2p-hint', 'Entre com o GitHub (painel acima) para ligar — a sinalização usa seu login.'));
      const label = el('label', 'p2p-toggle-line');
      const toggle = el('input', 'p2p-toggle');
      toggle.type = 'checkbox';
      toggle.disabled = true;
      label.append(toggle, document.createTextNode(' modo tempo real (P2P)'));
      const statusLine = el('p', 'p2p-status', statusLabel(currentStatus));
      statusLineEl = statusLine;
      root.append(label, statusLine);
      return;
    }

    const label = el('label', 'p2p-toggle-line');
    const toggle = el('input', 'p2p-toggle');
    toggle.type = 'checkbox';
    toggle.checked = handle !== null || isP2POptedIn();
    label.append(toggle, document.createTextNode(' modo tempo real (P2P)'));
    const statusLine = el('p', 'p2p-status', statusLabel(currentStatus));
    statusLineEl = statusLine;
    root.append(label, statusLine);

    toggle.addEventListener('change', () => {
      root.querySelector('.p2p-error')?.remove();
      if (!toggle.checked) {
        void disable();
        return;
      }
      if (connecting || handle) return;
      connecting = true;
      void (async () => {
        const login = (await getLogin()) ?? peekLogin();
        if (!login) {
          connecting = false;
          toggle.checked = false;
          root.appendChild(el('p', 'p2p-error', 'Não foi possível confirmar seu login do GitHub agora — tente de novo.'));
          return;
        }
        enable(login);
      })();
    });

    // Auto-resume: the player had already opted in (localStorage) before
    // this render (e.g. a previous page load, or the panel re-rendering
    // after some OTHER login event) and is still logged in — reconnect
    // without making them re-click the toggle.
    if (isP2POptedIn() && !handle && !connecting) {
      connecting = true;
      void (async () => {
        const login = (await getLogin()) ?? peekLogin();
        connecting = false;
        if (login && !handle) enable(login);
      })();
    }
  }

  render();

  return {
    refresh: render,
    tick(dtSeconds: number): void {
      handle?.updateInterpolation(dtSeconds);
    },
    reportPosition(x: number, y: number, face?: Face): void {
      handle?.reportLocalPosition(x, y, face);
    },
  };
}
