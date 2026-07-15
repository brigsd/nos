/**
 * src/live-indicator.ts
 *
 * "Pulso ao vivo" (R5, D-24) — the tiny HUD dot + label that tells the
 * player, honestly, how fresh the world on screen is and which polling
 * tier (src/live.ts) is feeding it: Camada B (logged in, updates within
 * ~3s) or Camada C (anonymous, a ~60s nudge off a CDN copy that can itself
 * lag up to ~5min). Pure presentation over a `LiveStatus` snapshot —
 * live.ts owns the actual network/polling logic, this module only paints,
 * same division of labor as renderer.ts vs the engine. A local 1s ticker
 * keeps the "atualizado há Xs" copy honest between polls, without waiting
 * for the next network event.
 */
import type { LiveStatus } from './live';

/** pt-BR "há Xs/min/h" — deliberately coarse (not a live stopwatch) so it reads as an honest approximation. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 3) return 'agora';
  if (totalSeconds < 60) return `há ${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `há ${totalMinutes}min`;
  const totalHours = Math.floor(totalMinutes / 60);
  return `há ${totalHours}h`;
}

export interface LiveIndicatorEls {
  /** Gets the tier/paused modifier classes that style the dot (see style.css). */
  root: HTMLElement;
  /** Pulses once per genuinely new change (CSS animation, retriggered via class removal + reflow). */
  dot: HTMLElement;
  label: HTMLElement;
}

function paint(els: LiveIndicatorEls, status: LiveStatus): void {
  els.root.classList.toggle('live-indicator-paused', status.paused);
  els.root.classList.toggle('live-indicator-tier-b', status.tier === 'b' && !status.paused);
  els.root.classList.toggle('live-indicator-tier-c', status.tier === 'c' && !status.paused);

  if (status.paused) {
    els.label.textContent = 'em pausa · volte à aba para atualizar';
    els.root.title = 'A atualização automática pausa enquanto esta aba fica em segundo plano.';
    return;
  }

  if (status.tier === 'b') {
    els.label.textContent = `ao vivo · batida ${status.tickCount ?? '—'}`;
    els.root.title = 'Camada B: conectado com login do GitHub, verifica a cada ~3s.';
  } else {
    const anchor = status.lastChangedAt ?? status.lastCheckedAt;
    els.label.textContent = `atualizado ${formatElapsed(Date.now() - anchor)}`;
    els.root.title = 'Camada C: sem login, verifica a cada ~60s numa cópia pública que pode atrasar até ~5min.';
  }
}

function pulseOnce(dot: HTMLElement): void {
  dot.classList.remove('live-dot-pulse');
  void dot.offsetWidth; // force reflow so re-adding the class restarts the CSS animation, even mid-pulse
  dot.classList.add('live-dot-pulse');
}

let tickerHandle: ReturnType<typeof setInterval> | undefined;

/**
 * Wires the indicator into `els` and returns the callback to pass as
 * `startLivePolling`'s `onStatus` (src/live.ts). Also (re)starts a 1s
 * repaint ticker so the elapsed-time copy keeps advancing between polls.
 */
export function renderLiveIndicator(els: LiveIndicatorEls): (status: LiveStatus) => void {
  let latest: LiveStatus | null = null;

  clearInterval(tickerHandle); // idempotent — only one ticker alive at a time
  tickerHandle = setInterval(() => {
    if (latest) paint(els, latest);
  }, 1000);

  return (status: LiveStatus) => {
    const previousChangeAt = latest?.lastChangedAt ?? null;
    latest = status;
    paint(els, status);
    if (status.lastChangedAt !== null && status.lastChangedAt !== previousChangeAt) {
      pulseOnce(els.dot);
    }
  };
}
