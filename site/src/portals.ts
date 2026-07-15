/**
 * src/portals.ts
 *
 * R6 fase 1 (Portais, D-17): "O Salão de Portais" — the registry of worlds a
 * player can travel to, plus the client-side plumbing for a *visita*: fetch
 * the destination's world.json, validate it, and hand it back so main.ts can
 * swap it in for the world on screen (the same `let world` + applyFreshWorld
 * path R5 built) and pick a safe arrival tile. This module never mutates
 * main.ts's state directly — it's data + pure DOM renderers + one async
 * fetch helper, the same "pure function of its inputs, call again to
 * refresh" shape as mural.ts/trade.ts/nativos.ts/oficinas.ts. The actual
 * orchestration (pausing/resuming the live poll, moving the camera,
 * teleporting the local player) lives in main.ts, which already owns every
 * piece of mutable state that touches.
 *
 * Full federation — the D-21 check-in/check-out ledger, acting from inside a
 * visited world — is explicitly NOT this slice; see docs/PORTALS_PROTOCOL.md.
 *
 * XSS: every string that reaches the DOM here (registry name/description,
 * a fetch failure message) goes through textContent, never innerHTML — the
 * same rule every other HUD panel in this codebase follows.
 */
import { getTile, type Position, type World } from '../../engine/types';
import { isPlausibleWorld } from './live';

export type PortalStatus = 'aberto' | 'em_breve';

export interface PortalRegistryEntry {
  /** Stable ascii-lowercase identifier - a technical key, never player-facing text. Unique within the registry. */
  id: string;
  /** Display name shown in the Salão de Portais (pt-BR, may be accented). */
  name: string;
  /**
   * Where to fetch this world's `World` JSON: an absolute http(s) URL (a raw
   * URL on a federated repo elsewhere) or a path relative to the site root
   * (a world that lives in this same repo, e.g. "world/heart.json",
   * "worlds/atrio.json"). Absent for an 'em_breve' entry with nothing
   * published yet.
   */
  worldUrl?: string;
  /**
   * Short, informational compatibility note (docs/PORTALS_PROTOCOL.md) - not
   * gated on programmatically in this slice; isPlausibleWorld is the actual
   * safety net for anything actually fetched.
   */
  clientHint?: string;
  status: PortalStatus;
  descriptionPtBR: string;
}

export type PortalRegistry = PortalRegistryEntry[];

/** Relative to index.html, same convention as world.ts's FALLBACK_WORLD_URL. */
const REGISTRY_URL = './worlds/registry.json';

/** Generous but bounded, same spirit as world.ts's LIVE_TIMEOUT_MS/live.ts's POLL_TIMEOUT_MS - a hung fetch must never wedge "atravessar" forever. */
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Cache-bust, same reasoning as world.ts: an intermediate CDN must never
  // serve a stale registry or a stale snapshot of a visited world.
  const bust = url.includes('?') ? '&' : '?';
  try {
    return await fetch(`${url}${bust}t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isPlausibleEntry(value: unknown): value is PortalRegistryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length === 0) return false;
  if (typeof e.name !== 'string' || e.name.length === 0) return false;
  if (typeof e.descriptionPtBR !== 'string' || e.descriptionPtBR.length === 0) return false;
  if (e.status !== 'aberto' && e.status !== 'em_breve') return false;
  if (e.worldUrl !== undefined && typeof e.worldUrl !== 'string') return false;
  if (e.clientHint !== undefined && typeof e.clientHint !== 'string') return false;
  return true;
}

/** Structural sanity check on the fetched registry - same spirit/rigor as live.ts's isPlausibleWorld for a World, guarding the render code from a malformed worlds/registry.json without needing a full schema for it. */
function isPlausibleRegistry(value: unknown): value is PortalRegistry {
  return Array.isArray(value) && value.every(isPlausibleEntry);
}

/**
 * Loads the portal registry. Never rejects — any failure (network, HTTP
 * error, malformed JSON, implausible shape) is logged and degrades to an
 * empty registry, so a broken/offline worlds/registry.json can never break
 * the core "look at O Coração" experience (same "fail soft" habit as
 * world.ts/live.ts).
 */
export async function loadPortalRegistry(): Promise<PortalRegistry> {
  try {
    const res = await fetchWithTimeout(REGISTRY_URL, FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed: unknown = await res.json();
    if (!isPlausibleRegistry(parsed)) throw new Error('formato inesperado');
    return parsed;
  } catch (err) {
    console.warn('Não foi possível carregar o registro de portais:', err);
    return [];
  }
}

function resolveWorldUrl(worldUrl: string): string {
  return /^https?:\/\//i.test(worldUrl) ? worldUrl : `./${worldUrl}`;
}

/**
 * Fetches and validates the World behind a registry entry, reusing live.ts's
 * isPlausibleWorld rather than growing a second opinion of what a "real"
 * World looks like (the task's own instruction: share the check, don't
 * duplicate it). Throws a ready-to-show pt-BR message on any failure —
 * nothing about the caller's current world/camera/localPlayer changes until
 * this resolves, so a failed crossing is a no-op, never a half-applied one.
 */
export async function fetchPortalWorld(entry: PortalRegistryEntry): Promise<World> {
  if (!entry.worldUrl) {
    throw new Error(`"${entry.name}" ainda não tem um mundo publicado.`);
  }
  const url = resolveWorldUrl(entry.worldUrl);

  let res: Response;
  try {
    res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  } catch {
    throw new Error(`Não foi possível alcançar "${entry.name}" agora. Confira sua conexão e tente de novo.`);
  }
  if (!res.ok) {
    throw new Error(`"${entry.name}" respondeu com um erro (HTTP ${res.status}).`);
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new Error(`O mundo de "${entry.name}" veio ilegível.`);
  }
  if (!isPlausibleWorld(parsed)) {
    throw new Error(`O mundo de "${entry.name}" não tem o formato esperado — a travessia foi recusada.`);
  }
  return parsed;
}

/**
 * A safe, in-bounds, walkable arrival tile for a freshly-entered world: the
 * exact centre when possible (every world this slice ships keeps its centre
 * clear on purpose — see worlds/atrio.json's "chegada" clearing), else the
 * nearest walkable tile found by an expanding ring search. Bounded by the
 * map's own size, so a pathological all-water world can't spin forever;
 * falls back to (0, 0) in that (should-be-impossible for a schema-valid,
 * mapgen-style world) case rather than throwing and aborting the crossing.
 */
export function findArrivalTile(world: World): Position {
  const cx = Math.floor(world.width / 2);
  const cy = Math.floor(world.height / 2);
  const isWalkable = (x: number, y: number): boolean => {
    const tile = getTile(world, x, y);
    return tile !== undefined && tile.biome !== 'water';
  };
  if (isWalkable(cx, cy)) return { x: cx, y: cy };

  // Defense in depth (PR #44 review): isPlausibleWorld already caps world
  // dimensions at 512, but this search must never be the thing that freezes
  // the page - a small cap is plenty to find land on any sane map.
  const maxRadius = Math.min(Math.max(world.width, world.height), 64);
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue; // ring only - smaller radii already tried
        const x = cx + dx;
        const y = cy + dy;
        if (isWalkable(x, y)) return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// Rendering — "O Salão de Portais" panel + the persistent "visitando" banner.
// Both are pure functions of their inputs, same shape as the rest of the
// HUD's DOM-overlay modules: call again whenever something relevant changes.
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const STATUS_LABEL: Record<PortalStatus, string> = {
  aberto: 'aberto',
  em_breve: 'em breve',
};

const STATUS_CLASS: Record<PortalStatus, string> = {
  aberto: 'aberto',
  em_breve: 'em-breve',
};

export interface PortalsViewState {
  registry: PortalRegistry;
  /** id of the entry currently on screen (e.g. 'coracao') - null before the registry/current world is known. */
  currentId: string | null;
  /** id of the entry whose crossing is in flight, if any - every OTHER "atravessar" button disables while it resolves (one crossing at a time). */
  pendingId: string | null;
  /** Message from the last failed crossing, if any - shown once, cleared on the next attempt. */
  error: string | null;
}

function portalCard(
  entry: PortalRegistryEntry,
  state: PortalsViewState,
  onAtravessar: (entry: PortalRegistryEntry) => void,
): HTMLElement {
  const card = el('li', 'portal-card');

  const header = el('p', 'portal-header');
  header.append(
    el('span', 'hud-mural-author', entry.name),
    document.createTextNode(' '),
    el('span', `portal-status portal-status-${STATUS_CLASS[entry.status]}`, STATUS_LABEL[entry.status]),
  );
  card.appendChild(header);

  card.appendChild(el('p', 'portal-desc', entry.descriptionPtBR));
  if (entry.clientHint) {
    card.appendChild(el('p', 'portal-hint', `compatibilidade: ${entry.clientHint}`));
  }

  const button = el('button', 'portal-act', 'atravessar');
  button.type = 'button';

  const isHere = entry.id === state.currentId;
  const isPending = entry.id === state.pendingId;

  if (isPending) {
    button.textContent = 'atravessando…';
    button.disabled = true;
  } else if (isHere) {
    button.textContent = 'você está aqui';
    button.disabled = true;
  } else if (entry.status !== 'aberto') {
    button.textContent = 'em breve';
    button.disabled = true;
  } else {
    button.disabled = state.pendingId !== null;
    button.addEventListener('click', () => onAtravessar(entry));
  }
  card.appendChild(button);

  return card;
}

/**
 * Renders "O Salão de Portais" into `rootEl` (a <details> body). Pure
 * function of `state` — call again whenever the registry loads, a crossing
 * starts/finishes, or the current world changes. `onAtravessar` is fired on
 * click for any entry whose button isn't disabled; the caller (main.ts)
 * drives the actual crossing and is expected to call this renderer again
 * (with an updated `state`) to reflect progress/errors — this module never
 * mutates a button in place after the click that triggered it.
 */
export function renderPortais(
  rootEl: HTMLElement,
  state: PortalsViewState,
  onAtravessar: (entry: PortalRegistryEntry) => void,
): void {
  rootEl.replaceChildren();

  rootEl.appendChild(
    el(
      'p',
      'portal-hint',
      "Você pode viajar e olhar — seu Registro continua n'O Coração até você voltar para agir de lá.",
    ),
  );

  if (state.registry.length === 0) {
    rootEl.appendChild(el('p', 'portal-empty', 'Nenhum portal encontrado agora.'));
    return;
  }

  const list = el('ul', 'portal-list');
  for (const entry of state.registry) {
    list.appendChild(portalCard(entry, state, onAtravessar));
  }
  rootEl.appendChild(list);

  if (state.error) {
    rootEl.appendChild(el('p', 'portal-error', state.error));
  }
}

/**
 * Renders the persistent "você está de visita" banner. `worldName` null
 * hides it (home in O Coração); a name shows it with a "voltar" action.
 */
export function renderVisitBanner(rootEl: HTMLElement, worldName: string | null, onVoltar: () => void): void {
  rootEl.replaceChildren();

  if (worldName === null) {
    rootEl.hidden = true;
    return;
  }
  rootEl.hidden = false;

  const line = el('p', 'visiting-line');
  line.append(
    document.createTextNode('Você está de visita em '),
    el('strong', 'visiting-name', worldName),
    document.createTextNode(" — seu Registro continua n'O Coração."),
  );
  rootEl.appendChild(line);

  const button = el('button', 'visiting-voltar', 'voltar ao Coração');
  button.type = 'button';
  button.addEventListener('click', onVoltar);
  rootEl.appendChild(button);
}
