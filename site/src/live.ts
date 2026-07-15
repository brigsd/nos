/**
 * src/live.ts
 *
 * R5 "Fluidez B" (D-24): keeps the world on screen fresh within seconds,
 * without a page reload, on top of the one-shot fetch in world.ts. Three
 * tiers, best available wins — the loop re-picks the best one on EVERY
 * cycle, so logging in/out or a token going bad mid-session upgrades or
 * downgrades automatically, with no restart needed:
 *
 *   Camada B (logged in, ~3s): GitHub's Contents API
 *   (`/repos/{owner}/{repo}/contents/world/heart.json?ref=main`) with
 *   `Accept: application/vnd.github.raw+json` so the response body IS the
 *   world JSON (no base64 envelope to unwrap). Every request carries
 *   `If-None-Match` with the ETag from the previous read: unchanged -> 304,
 *   which (per this task's research, trusted per the brief) does NOT count
 *   against the authenticated 5000 req/h budget — a 3s poll only "spends"
 *   quota on beats that actually changed something. api.github.com sends
 *   `Access-Control-Allow-Origin: *` on authenticated requests too (see
 *   auth.ts's CORS note), so this runs straight from the browser with the
 *   token auth.ts already stores — no relay needed.
 *
 *   Camada C (anonymous, ~60s): the same raw.githubusercontent.com URL
 *   world.ts uses for the initial paint (re-exported from there as
 *   `LIVE_WORLD_URL`, single source of truth), polled WITHOUT a
 *   cache-busting query param so it rides the CDN's own ~300s edge cache
 *   instead of fighting it — a gentle "keep the page alive" nudge for
 *   players who never log in, not a promise of low latency. Unauthenticated
 *   api.github.com is capped at 60 req/h/IP, which is exactly why Camada C
 *   avoids the API entirely and reads the CDN mirror instead.
 *
 *   Camada C is also the automatic fallback whenever Camada B can't be
 *   trusted: no token, or the token just failed outright (401, or an
 *   unexplained 403 — see `badToken` below). A *rate-limited* 403
 *   (`x-ratelimit-remaining: 0`, or a `Retry-After` header) is treated
 *   differently: the token itself is fine, so Camada B just backs off
 *   (until the reset time, capped at MAX_BACKOFF_MS) instead of downgrading
 *   for the rest of the session. Below the safety margin but not yet
 *   exhausted (`x-ratelimit-remaining < 100`), Camada B slows to
 *   TIER_B_BACKOFF_INTERVAL_MS (30s) rather than waiting for a hard 403.
 *
 * Change detection is uniform across both tiers and deliberately does NOT
 * rely only on `meta.tickCount`: a command applied between full batidas
 * (docs/CONTINUITY.md's PR #33 note — "/dizer"/"/mover"/"/trocar"/etc. can
 * commit without a `core_pulse`) leaves tickCount unchanged even though the
 * world genuinely moved. So every successfully parsed world is reduced to
 * `JSON.stringify(world)` and compared against the signature of whatever is
 * already on screen (seeded from `initialWorld` at startup) — `onWorld`
 * only fires when that signature actually differs. This also absorbs the
 * one edge case ETag/304 can't cover on its own: Camada B's very first
 * request has no stored ETag yet, so it always comes back 200 even if
 * nothing has changed since the page's initial load; the signature compare
 * quietly no-ops that spurious first read instead of re-rendering the HUD
 * for nothing.
 *
 * Visibility: polling pauses outright while `document.visibilityState ===
 * 'hidden'` (mobile battery + rate budget, per the task) and resumes with an
 * IMMEDIATE poll — not a stale queued timer — the moment the tab is visible
 * again.
 *
 * Honesty of `LiveStatus.lastCheckedAt` (what live-indicator.ts's "atualizado
 * há Xs" is anchored to): it only advances on a CONFIRMED read — a 304 ("still
 * this") or a successfully parsed 200 — never on a network error, timeout,
 * 401/403, or unexpected status. A network error still re-emits status (so
 * the HUD's tier badge stays accurate) via `emitStatus`, but leaves
 * `lastCheckedAt` alone via not calling `touchAndEmit` — otherwise a
 * persistently offline Camada C would keep resetting to "agora" every failed
 * cycle instead of honestly climbing to "há 2min", "há 5min", etc.
 *
 * Determinism note: this is site code, not engine code. The `Date.now()`
 * calls below are wall-clock bookkeeping for a client-side polling timer
 * (freshness display, backoff windows) — the same category as main.ts's
 * `performance.now()` render loop — and are never fed into world state. The
 * D-06/engine determinism rule (no Date.now/Math.random) governs `engine/`,
 * not this file (see CLAUDE.md).
 */
import type { World } from '../../engine/types';
import { GITHUB_REPO_NAME, GITHUB_REPO_OWNER } from './config';
import { getToken } from './auth';
import { LIVE_WORLD_URL } from './world';

const CONTENTS_API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/world/heart.json?ref=main`;

/** Camada B baseline cadence — cheap thanks to ETag/304 (see module doc). */
const TIER_B_INTERVAL_MS = 3000;
/** Camada B cadence once `x-ratelimit-remaining` drops under RATE_LIMIT_SAFETY_MARGIN. */
const TIER_B_BACKOFF_INTERVAL_MS = 30000;
/** Camada C cadence — well inside the CDN's own edge cache window, never fights it. */
const TIER_C_INTERVAL_MS = 60000;
/** Delay before the very first poll, so it doesn't compete with the page's own initial loadWorld()/loadSprites() fetches. */
const INITIAL_DELAY_MS = 2000;
/** Defensive threshold from the task brief: below this many requests left in the current window, Camada B slows down pre-emptively. */
const RATE_LIMIT_SAFETY_MARGIN = 100;
/** Upper bound on any single backoff wait, so a bad reset-time reading can never stall the loop indefinitely. */
const MAX_BACKOFF_MS = 5 * 60_000;
/** Hard per-attempt fetch timeout, so one hung request can never wedge the loop (mirrors world.ts's LIVE_TIMEOUT_MS). */
const POLL_TIMEOUT_MS = 8000;

export type LiveTier = 'b' | 'c';

export interface LiveStatus {
  /** Which polling tier produced the world currently on screen. */
  tier: LiveTier;
  /** Whether polling is currently paused (background tab). */
  paused: boolean;
  /** `Date.now()` of the last completed poll attempt (success or a handled error) — drives "atualizado há Xs". */
  lastCheckedAt: number;
  /** `Date.now()` of the last time a poll produced a world that actually differs from what's on screen; null before the first real change. */
  lastChangedAt: number | null;
  /** `meta.tickCount` of the world currently on screen. */
  tickCount: number | null;
}

/**
 * The sliver of `Document` this module actually needs — narrow on purpose
 * (interface segregation) so a QA/test harness can hand in a plain object
 * literal instead of faking the entire real `Document` interface.
 */
export interface VisibilityHost {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface StartLiveOptions {
  /** The world already painted at page load (src/world.ts) — seeds the change-detection baseline and the tier/tickCount shown before the first poll completes. */
  initialWorld: World;
  /** Called with a freshly fetched world whenever it differs from what's currently on screen. */
  onWorld: (world: World) => void;
  /** Called after every status-affecting event (poll attempt, pause/resume) so the HUD indicator (live-indicator.ts) can repaint. */
  onStatus: (status: LiveStatus) => void;
  /** Test/QA seam — defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Test/QA seam — defaults to the global `document`. */
  documentRef?: VisibilityHost;
  /** Test/QA seam — override the real cadences so a mocked run doesn't take minutes. Defaults match the production cadences documented above. */
  intervals?: { initial?: number; normal?: number; backoff?: number; anon?: number };
}

export interface LiveHandle {
  /** Stops polling and detaches the visibilitychange listener. Not called in production today (main() never tears down) — exists for QA/tests and general hygiene. */
  stop(): void;
  /** Cancels any pending timer and runs a poll cycle right away. Used after a login/logout so a tier upgrade doesn't wait out a stale Camada C timer. */
  refreshNow(): void;
}

/** Whether `value` carries a `position: {x: number, y: number}` — the one field renderer.ts dereferences unguarded for every player/native/machine it draws. */
function hasNumericPosition(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const pos = (value as { position?: unknown }).position;
  if (typeof pos !== 'object' || pos === null) return false;
  return typeof (pos as { x?: unknown }).x === 'number' && typeof (pos as { y?: unknown }).y === 'number';
}

/**
 * Whether `dict` is an object whose every value the client could draw/read
 * without throwing: a numeric position always, plus an `inventory` object
 * when `requireInventory` (players/natives — meu-no.ts and trade.ts index
 * into `.inventory[resource]` unguarded). Both fields are REQUIRED by the
 * real schema on all three entity types (engine/types.ts: Player, Native,
 * Machine), so this is a strict subset of what a legitimate tick commit
 * always satisfies — it can reject corrupt bodies, never real worlds.
 */
function isEntityDict(dict: unknown, requireInventory: boolean): boolean {
  if (typeof dict !== 'object' || dict === null) return false;
  for (const entity of Object.values(dict)) {
    if (!hasNumericPosition(entity)) return false;
    if (requireInventory) {
      const inv = (entity as { inventory?: unknown }).inventory;
      if (typeof inv !== 'object' || inv === null) return false;
    }
  }
  return true;
}

/**
 * Structural sanity check on whatever `fetch` handed back, before it's
 * trusted as a `World` — the full ajv schema in engine/validate.ts is
 * Node-only (reads schema/*.json off disk) and deliberately not pulled into
 * the client bundle for this. Beyond the top-level fields, it also checks
 * the per-entity dereferences the renderer/HUD actually perform (position on
 * everything drawable, inventory on players/natives): a plausible-but-corrupt
 * body — e.g. a Native without `position` — used to pass the shallow check
 * and only blow up later, INSIDE the render callback (review finding on
 * PR #43). Still deliberately not full schema validation: whatever this
 * misses is contained by the try/catch around `onWorld` in
 * consumeWorldResponse and the try/finally in runCycle, so the polling loop
 * survives regardless.
 *
 * Exported (R6, D-17): site/src/portals.ts reuses this exact check before
 * trusting a world fetched through a portal — a visited world deserves
 * exactly the same "won't crash the renderer" guarantee as O Coração's own
 * live poll, and the task is explicit that this must be shared, not
 * re-implemented a second time.
 */
export function isPlausibleWorld(value: unknown): value is World {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as { [key: string]: unknown };
  // Trust boundary (review finding on PR #44): a federated world is remote,
  // untrusted data. Unbounded dimensions freeze the page downstream (full-map
  // render, arrival-tile ring search) - a synchronous freeze no try/catch can
  // save. Positive integers, sane cap, and a tile grid that matches.
  if (!Number.isInteger(w.width) || !Number.isInteger(w.height)) return false;
  if ((w.width as number) < 1 || (w.height as number) > 512 || (w.width as number) > 512 || (w.height as number) < 1) return false;
  if (!Array.isArray(w.tiles)) return false;
  if (w.tiles.length !== (w.width as number) * (w.height as number)) return false;
  if (!Array.isArray(w.events)) return false;
  if (typeof w.meta !== 'object' || w.meta === null) return false;
  if (typeof (w.meta as { [key: string]: unknown }).tickCount !== 'number') return false;
  // Entity dicts: `players` is required; `natives`/`machines` are optional
  // (pre-v2/pre-v2.5 worlds) but must be sound when present.
  if (!isEntityDict(w.players, true)) return false;
  if (w.natives !== undefined && !isEntityDict(w.natives, true)) return false;
  if (w.machines !== undefined && !isEntityDict(w.machines, false)) return false;
  return true;
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Starts the polling loop and returns a handle to control it. Call once at
 * startup (main.ts); the returned handle's `stop`/`refreshNow` are the only
 * way to affect it afterwards — everything else is timer-driven.
 */
export function startLivePolling(options: StartLiveOptions): LiveHandle {
  const { initialWorld, onWorld, onStatus } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const doc = options.documentRef ?? document;
  const intervals = {
    initial: options.intervals?.initial ?? INITIAL_DELAY_MS,
    normal: options.intervals?.normal ?? TIER_B_INTERVAL_MS,
    backoff: options.intervals?.backoff ?? TIER_B_BACKOFF_INTERVAL_MS,
    anon: options.intervals?.anon ?? TIER_C_INTERVAL_MS,
  };

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let etag: string | null = null;
  /**
   * The token that just got a 401/unexplained-403 — Camada B stays off until
   * a DIFFERENT token shows up (login with a new one, or a plain logout).
   * Deliberately sticky for the session even though an unexplained 403 COULD
   * have been transient (a proxy hiccup, say) — review NIT on PR #43,
   * premise documented here by choice: the cost of being wrong is one
   * session on Camada C (still updating, just slower), while the cost of
   * retrying a genuinely forbidden call is hammering api.github.com every
   * 3s for as long as the tab lives. Logout/login or a page reload resets it.
   */
  let badToken: string | null = null;
  let rateLimited = false;
  let lastSignature = JSON.stringify(initialWorld);

  const status: LiveStatus = {
    tier: getToken() !== null ? 'b' : 'c',
    paused: doc.visibilityState === 'hidden',
    lastCheckedAt: Date.now(),
    lastChangedAt: null,
    tickCount: initialWorld.meta.tickCount,
  };
  onStatus({ ...status });

  /** Updates the tier shown in the HUD and re-emits status, WITHOUT touching `lastCheckedAt` — for attempts that didn't actually confirm anything about the world (network error, 401/403, an unexpected status). */
  function emitStatus(tier: LiveTier): void {
    if (stopped) return;
    status.tier = tier;
    onStatus({ ...status });
  }

  /** Same as `emitStatus`, but also stamps `lastCheckedAt` — only for a CONFIRMED read (304 "still this" or a parsed 200), so "atualizado há Xs" never lies by resetting to "agora" on a failed attempt (see module doc's honesty note). */
  function touchAndEmit(tier: LiveTier): void {
    if (stopped) return;
    status.lastCheckedAt = Date.now();
    emitStatus(tier);
  }

  /**
   * Parses+validates `res`'s body; if it differs from what's already on
   * screen, updates the shared change-tracking state and fires `onWorld`.
   * Never throws — a bad body is logged and quietly skipped, same "fall
   * back, don't fail" habit as world.ts/auth.ts.
   */
  async function consumeWorldResponse(res: Response): Promise<void> {
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (err) {
      console.warn('Mundo ao vivo veio ilegível (JSON inválido) — ignorando esta leitura.', err);
      return;
    }
    // stop() may have landed while the body was in flight (e.g. o jogador
    // atravessou um Portal, PR #44 review): a stopped handle must never emit.
    if (stopped) return;
    if (!isPlausibleWorld(parsed)) {
      console.warn('Mundo ao vivo veio com formato inesperado — ignorando esta leitura.');
      return;
    }
    const signature = JSON.stringify(parsed);
    if (signature === lastSignature) return; // identical to what's on screen — e.g. Camada B's un-ETagged first read
    lastSignature = signature;
    status.lastChangedAt = Date.now();
    status.tickCount = parsed.meta.tickCount;
    try {
      onWorld(parsed);
    } catch (err) {
      // A bug in the render callback must never kill the polling loop
      // (review finding on PR #43). The signature/status updates above stay
      // in place on purpose: main.ts swaps its `world` reference BEFORE any
      // panel render, so the page is on this world even if painting part of
      // it threw — and re-firing the identical body next cycle would just
      // re-throw identically (deterministic render code), spamming the log.
      console.warn('Falha ao aplicar o mundo novo na tela — o polling continua:', err);
    }
  }

  function applyRateLimitHeaders(res: Response): void {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === null) return;
    const remainingNum = Number(remaining);
    if (Number.isNaN(remainingNum)) return;
    rateLimited = remainingNum < RATE_LIMIT_SAFETY_MARGIN;
  }

  async function pollTierC(): Promise<number> {
    let res: Response;
    try {
      // Deliberately NO cache-busting query param and no `cache: 'no-store'`
      // — Camada C's whole point is to ride raw.githubusercontent.com's own
      // ~300s edge cache for free (see world.ts), never to fight it.
      res = await fetchWithTimeout(fetchFn, LIVE_WORLD_URL, {}, POLL_TIMEOUT_MS);
    } catch (err) {
      console.warn('Falha ao consultar o mundo ao vivo (Camada C):', err);
      emitStatus('c');
      return intervals.anon;
    }
    if (!res.ok) {
      console.warn(`Mundo ao vivo (Camada C) respondeu HTTP ${res.status}.`);
      emitStatus('c');
      return intervals.anon;
    }
    await consumeWorldResponse(res);
    touchAndEmit('c');
    return intervals.anon;
  }

  async function pollTierB(token: string): Promise<number> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (etag) headers['If-None-Match'] = etag;

    let res: Response;
    try {
      res = await fetchWithTimeout(fetchFn, CONTENTS_API_URL, { headers, cache: 'no-store' }, POLL_TIMEOUT_MS);
    } catch (err) {
      console.warn('Falha ao consultar o mundo ao vivo (Camada B):', err);
      emitStatus('b');
      return intervals.normal;
    }

    applyRateLimitHeaders(res);

    if (res.status === 401) {
      console.warn('Token recusado pelo GitHub ao consultar o mundo ao vivo — Camada B desativada para este token.');
      badToken = token;
      return pollTierC();
    }

    if (res.status === 403) {
      const retryAfterHeader = res.headers.get('retry-after');
      if (retryAfterHeader) {
        // Retry-After is GitHub explicitly telling us how long to stay away
        // - honoured as given, no MAX_BACKOFF_MS ceiling here (capping an
        // explicit server directive would defeat the point of it). BUT:
        // RFC 7231 allows delta-SECONDS or an HTTP-DATE, and Number() of the
        // date form is NaN - which, unguarded, became Math.max(backoff, NaN)
        // = NaN, and setTimeout(fn, NaN) fires IMMEDIATELY: same 403, same
        // NaN, an unbounded hot loop (review finding on PR #43, measured at
        // ~121 req/500ms driving this very module). A non-numeric value now
        // degrades to our own backoff cadence - self-correcting (the header
        // is re-read on the next poll) and free (a 403 while rate-limited
        // costs no extra quota).
        const retryAfterSeconds = Number(retryAfterHeader);
        emitStatus('b');
        return Number.isFinite(retryAfterSeconds)
          ? Math.max(intervals.backoff, retryAfterSeconds * 1000)
          : intervals.backoff;
      }
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        // Unlike Retry-After above, this wait is OUR OWN arithmetic on a raw
        // reset timestamp - MAX_BACKOFF_MS is a defensive ceiling against
        // that math going wrong (clock skew, a stale/misread header), not a
        // second-guess of GitHub. Re-checking a bit early is harmless (a 403
        // while already rate-limited doesn't cost more quota). Same NaN
        // guard as Retry-After above: a garbage reset header must degrade to
        // the backoff cadence, never reach setTimeout as NaN (review finding
        // on PR #43).
        const resetEpochSeconds = Number(res.headers.get('x-ratelimit-reset') ?? '0');
        const resetAtMs = Number.isFinite(resetEpochSeconds) ? resetEpochSeconds * 1000 : 0;
        emitStatus('b');
        return Math.min(Math.max(resetAtMs - Date.now(), intervals.backoff), MAX_BACKOFF_MS);
      }
      // Unexplained 403 on a public repo/path (not a rate limit) — treat like
      // an auth failure rather than hammering it every 3s. Note (review on
      // PR #43): GitHub's SECONDARY rate limit can also 403 with no
      // rate-limit headers at all; that case lands here too and downgrades
      // this session to Camada C. That is the safe direction - it stops
      // hitting the API entirely while the page keeps updating via the CDN;
      // logout/login (or a reload) restores Camada B.
      console.warn('GitHub recusou a consulta ao mundo ao vivo (HTTP 403 sem sinal de limite) — Camada B desativada para este token.');
      badToken = token;
      return pollTierC();
    }

    if (res.status === 304) {
      touchAndEmit('b');
      return rateLimited ? intervals.backoff : intervals.normal;
    }

    if (!res.ok) {
      console.warn(`Mundo ao vivo (Camada B) respondeu HTTP ${res.status}.`);
      emitStatus('b');
      return intervals.normal;
    }

    etag = res.headers.get('etag') ?? etag;
    await consumeWorldResponse(res);
    touchAndEmit('b');
    return rateLimited ? intervals.backoff : intervals.normal;
  }

  function scheduleNext(delayMs: number): void {
    if (stopped) return;
    // Last line of defense (review finding on PR #43, defense-in-depth with
    // the header guards in pollTierB): no computed delay may ever collapse
    // the loop into a hot spin. setTimeout coerces NaN/negative to 0ms =
    // immediate re-fire; if a bug upstream ever produces one again, fall
    // back to the normal cadence instead.
    const safeDelayMs = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : intervals.normal;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void runCycle();
    }, safeDelayMs);
  }

  async function runCycle(): Promise<void> {
    if (stopped) return;
    if (doc.visibilityState === 'hidden') {
      if (!status.paused) {
        status.paused = true;
        onStatus({ ...status });
      }
      return; // no reschedule — handleVisibilityChange resumes us
    }
    if (status.paused) status.paused = false;

    // Belt and braces (review finding on PR #43): NOTHING may kill the loop
    // by skipping scheduleNext — runCycle is fired as `void runCycle()`, so
    // an uncaught throw here would both orphan the loop forever AND surface
    // as an unhandled promise rejection. pollTierB/pollTierC already handle
    // their own errors and the onWorld callback is isolated inside
    // consumeWorldResponse, so anything landing in this catch is an
    // unexpected bug: log it, fall back to the backoff cadence (never a hot
    // loop), keep beating.
    let delayMs = intervals.backoff;
    try {
      const token = getToken();
      delayMs = token !== null && token !== badToken ? await pollTierB(token) : await pollTierC();
    } catch (err) {
      console.warn('Ciclo do mundo ao vivo falhou de forma inesperada — mantendo o loop vivo:', err);
    } finally {
      scheduleNext(delayMs);
    }
  }

  function handleVisibilityChange(): void {
    if (stopped) return;
    if (doc.visibilityState === 'hidden') {
      clearTimeout(timer);
      if (!status.paused) {
        status.paused = true;
        onStatus({ ...status });
      }
    } else if (status.paused) {
      clearTimeout(timer);
      // Tell the HUD we're live again BEFORE the resumed poll round-trips -
      // otherwise "em pausa" could linger on screen for up to POLL_TIMEOUT_MS
      // while the first resumed request is still in flight (review
      // suggestion on PR #43). runCycle's own unpause line stays as belt-
      // and-braces for any other path that reaches it while paused.
      status.paused = false;
      onStatus({ ...status });
      void runCycle(); // resume immediately, don't wait out a stale timer
    }
  }
  doc.addEventListener('visibilitychange', handleVisibilityChange);

  scheduleNext(intervals.initial);

  return {
    stop(): void {
      stopped = true;
      clearTimeout(timer);
      doc.removeEventListener('visibilitychange', handleVisibilityChange);
    },
    refreshNow(): void {
      if (stopped) return;
      clearTimeout(timer);
      void runCycle();
    },
  };
}
