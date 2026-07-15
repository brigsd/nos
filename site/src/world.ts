/**
 * src/world.ts
 *
 * Fetches the published world state. `World` is imported directly from the
 * engine by relative path - the client never redefines its own copy of the
 * shape, so it can never drift from what the tick actually writes.
 *
 * The world is read LIVE from raw.githubusercontent.com (main branch) so the
 * client reflects every tick immediately. Tick commits are made by
 * github-actions[bot], whose pushes do not trigger the Pages deploy
 * (GitHub anti-recursion), so a build-time copy would freeze at deploy time.
 * raw sends `access-control-allow-origin: *` (cache max-age 300s) — fine for an
 * hourly world. The build-time copy under ./world/ stays as an offline/failure
 * fallback so the map still paints if raw is unreachable.
 *
 * This one-shot fetch only covers the page's initial paint; src/live.ts polls
 * afterwards (R5, D-24) to keep it fresh without a reload — it re-exports
 * `LIVE_WORLD_URL` below (its Camada C/anonymous source) so the raw CDN URL
 * has exactly one definition site-wide.
 */
import type { World } from '../../engine/types';

/** Live world state on the default branch. Also Camada C's source in src/live.ts. */
export const LIVE_WORLD_URL = 'https://raw.githubusercontent.com/brigsd/nos/main/world/heart.json';
/** Build-time copy, relative to index.html (resolves at root and under /nos/ on Pages). */
const FALLBACK_WORLD_URL = './world/heart.json';

/** Fail the live fetch fast (network hang, flaky mobile) so the fallback paints without a long "Carregando". */
const LIVE_TIMEOUT_MS = 4000;

async function fetchWorld(url: string, timeoutMs?: number): Promise<World> {
  // Cache-bust so an intermediate CDN never serves a stale tick.
  const bust = url.includes('?') ? '&' : '?';
  const ctrl = timeoutMs ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(`${url}${bust}t=${Date.now()}`, { cache: 'no-store', signal: ctrl?.signal });
    if (!res.ok) {
      throw new Error(`Falha ao buscar ${url}: HTTP ${res.status}`);
    }
    return (await res.json()) as World;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadWorld(): Promise<World> {
  try {
    return await fetchWorld(LIVE_WORLD_URL, LIVE_TIMEOUT_MS);
  } catch (err) {
    // raw unreachable/slow (offline, rate limit, outage, flaky network) — fall back to the copy shipped with the site.
    console.warn('Estado ao vivo indisponível, usando cópia local:', err);
    return await fetchWorld(FALLBACK_WORLD_URL);
  }
}
