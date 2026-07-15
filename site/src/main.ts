/**
 * src/main.ts
 *
 * Entry point: loads world state + sprites, instantiates the local player,
 * wires up keydown and tap controls, and runs the render loop.
 */
import './style.css';
import type { Position, World } from '../../engine/types';
import { TILE_SIZE_PX } from '../../engine/types';
import { Camera } from './camera';
import { attachPointerControls } from './input';
import { drawFrame } from './renderer';
import { renderMural } from './mural';
import { renderAuth } from './auth-ui';
import { renderMeuNo } from './meu-no';
import { renderComercio } from './trade';
import { renderNativos } from './nativos';
import { renderOficinas } from './oficinas';
import { loadSprites, type Sprites } from './sprites';
import { loadWorld } from './world';
import { LocalPlayer } from './player';
import { startLivePolling } from './live';
import { renderLiveIndicator } from './live-indicator';
import {
  fetchPortalWorld,
  findArrivalTile,
  loadPortalRegistry,
  renderPortais,
  renderVisitBanner,
  type PortalRegistry,
  type PortalRegistryEntry,
} from './portals';

function pluralPt(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado no HTML.`);
  return el as T;
}

function showStatus(el: HTMLElement, message: string): void {
  el.textContent = message;
  el.hidden = false;
}

function hideStatus(el: HTMLElement): void {
  el.hidden = true;
  el.textContent = '';
}

/**
 * O Salão de Portais' registry id for O Coração itself (worlds/registry.json)
 * - traveling "to" it (including via "voltar") always means refetch the LIVE
 * world and resume polling, never a static fetch of a snapshot (R6, D-17).
 */
const HOME_PORTAL_ID = 'coracao';

/**
 * Fixed, hand-picked O Coração tile for the portal marker (R6, D-17): the
 * centre of a clean 7x7 meadow clearing near the EASTERN edge (x>=54 within
 * a 2-tile radius), reachable on foot from spawn (30,30) without crossing
 * the river (verified by BFS over the live world/heart.json tiles during
 * authoring), 23+ tiles from every A Fábrica machine and 42+ tiles from
 * every Nativo. Deliberately the east edge, not the west: the HUD's left
 * column of panels (.hud-panel/.hud-auth/.hud-meuno/.hud-mural/...) covers
 * roughly the screen's left ~330px at the default "whole map visible" zoom,
 * and at that zoom the camera is fully clamped/centred (the map is smaller
 * than the viewport, so panning is a no-op until the player zooms in) - a
 * west-edge marker would sit permanently behind the HUD on first paint,
 * defeating the "click/tap the tile" affordance for anyone who hasn't
 * zoomed in yet. The east edge has no such conflict. See
 * docs/PORTALS_PROTOCOL.md / the PR description for the full check.
 */
const PORTAL_MARKER_POSITION: Position = { x: 57, y: 34 };

/** Chebyshev "within 1 tile" (same 8-neighbour adjacency engine/behavior.ts's PLAYER_PROXIMITY_TILES uses) that auto-opens the Portais panel while standing next to the marker. */
const PORTAL_PROXIMITY_TILES = 1;

function isNearPortalMarker(x: number, y: number): boolean {
  return (
    Math.abs(x - PORTAL_MARKER_POSITION.x) <= PORTAL_PROXIMITY_TILES &&
    Math.abs(y - PORTAL_MARKER_POSITION.y) <= PORTAL_PROXIMITY_TILES
  );
}

async function main(): Promise<void> {
  const canvas = requireEl<HTMLCanvasElement>('map');
  const statusEl = requireEl<HTMLDivElement>('status');
  const hudEl = requireEl<HTMLDivElement>('hud');
  const worldNameEl = requireEl<HTMLElement>('hud-world-name');
  const tickEl = requireEl<HTMLElement>('stat-tick');
  const playersEl = requireEl<HTMLElement>('stat-players');
  const muralListEl = requireEl<HTMLOListElement>('hud-mural-list');
  const authEl = requireEl<HTMLElement>('hud-auth');
  const meuNoEl = requireEl<HTMLElement>('hud-meuno');
  const comercioBodyEl = requireEl<HTMLDivElement>('hud-comercio-body');
  const nativosBodyEl = requireEl<HTMLDivElement>('hud-nativos-body');
  const oficinasBodyEl = requireEl<HTMLDivElement>('hud-oficinas-body');
  const portaisBodyEl = requireEl<HTMLDivElement>('hud-portais-body');
  const visitingEl = requireEl<HTMLElement>('hud-visiting');
  const liveEl = requireEl<HTMLElement>('hud-live');
  const liveDotEl = requireEl<HTMLElement>('hud-live-dot');
  const liveLabelEl = requireEl<HTMLElement>('hud-live-label');

  const maybeCtx = canvas.getContext('2d');
  if (!maybeCtx) {
    showStatus(statusEl, 'Este navegador não suporta canvas 2D — não é possível mostrar O Coração aqui.');
    return;
  }
  const ctx: CanvasRenderingContext2D = maybeCtx;

  showStatus(statusEl, 'Carregando O Coração…');

  const loaded = await Promise.allSettled([loadWorld(), loadSprites(), loadPortalRegistry()]);
  const [worldResult, spritesResult, registryResult] = loaded;

  if (worldResult.status === 'rejected' || spritesResult.status === 'rejected') {
    console.error('Falha ao carregar O Coração:', loaded);
    showStatus(statusEl, 'Não foi possível carregar O Coração. Verifique sua conexão e recarregue a página.');
    return;
  }

  // `world` is reassigned by src/live.ts's onWorld callback (R5, D-24) every
  // time a poll finds a genuinely fresher world, AND by a portal crossing
  // (R6, D-17, see atravessarPara/voltarAoCoracao below) - every closure
  // below that reads `world` at CALL time (frame(), the keydown/pointer
  // handlers, every renderX(el, world)) automatically picks up either kind
  // of refresh, no need to pass it around explicitly. Only localPlayer is
  // untouched by a LIVE refresh (it's the "intenção", D-12/D-22/D-25b - see
  // applyFreshWorld below) - a portal crossing DOES move it, deliberately,
  // via teleportLocalPlayer.
  let world = worldResult.value;
  const sprites: Sprites = spritesResult.value;
  // loadPortalRegistry() never rejects (fails soft to []) - registryResult
  // is always 'fulfilled' in practice; the ternary is defensive only.
  const portalRegistry: PortalRegistry = registryResult.status === 'fulfilled' ? registryResult.value : [];
  // Assigned near the end of main(), once the live indicator elements exist
  // to drive - declared here (not `const`) only so handleAuthChange below
  // can close over it ahead of time. Set back to null while visiting another
  // world (R6): O Coração's live poll pauses for the duration of a visit,
  // see atravessarPara/voltarAoCoracao.
  let liveHandle: ReturnType<typeof startLivePolling> | null = null;

  // R6 (D-17) — Portais/travessia state. `visitingWorldId` null means "home
  // in O Coração"; any other value is the registry id of the world currently
  // on screen. `homePosition` snapshots where the local avatar was standing
  // in O Coração right before the FIRST hop away from home, so "voltar"
  // restores it exactly instead of leaving the avatar wherever it last
  // wandered inside a visited world.
  let visitingWorldId: string | null = null;
  let homePosition: Position | null = null;
  let portalPendingId: string | null = null;
  let portalError: string | null = null;

  hideStatus(statusEl);
  hudEl.style.visibility = 'visible';
  worldNameEl.textContent = world.meta.name;
  tickEl.textContent = String(world.meta.tickCount);
  renderMural(muralListEl, world);

  function updatePlayerCount(): void {
    // other players in world state + 1 local player
    const totalPlayersCount = Object.keys(world.players).length + 1;
    playersEl.textContent = pluralPt(totalPlayersCount, 'jogador', 'jogadores');
  }

  // Auth-dependent panels (Meu Nó's auto-fill from the authenticated login,
  // Comércio/Nativos' "agir daqui" buttons, Oficinas' materials preview) -
  // re-rendered together whenever login state changes (R2, D-13). Meu Nó
  // also gets its own onLoginChange hook (R4): typing/forgetting a login
  // there doesn't touch the auth token, so it wouldn't otherwise reach this
  // function - only Oficinas' per-recipe preview actually depends on that
  // pick, so that's the only sibling it re-renders.
  //
  // R6 (D-17): every panel here also takes `readOnly` (true while visiting
  // another world through a portal) so their command links/"agir daqui"
  // buttons - which always target O Coração regardless of which world's
  // data is on screen - disappear for the duration of a visit. Reading
  // `visitingWorldId` fresh (a closure over the outer `let`, same pattern as
  // `world` itself) means this never goes stale.
  function refreshOficinas(): void {
    renderOficinas(oficinasBodyEl, world, visitingWorldId !== null);
  }
  function refreshAuthenticatedPanels(): void {
    const readOnly = visitingWorldId !== null;
    renderMeuNo(meuNoEl, world, refreshOficinas, readOnly);
    renderComercio(comercioBodyEl, world, readOnly);
    renderNativos(nativosBodyEl, world, readOnly);
    refreshOficinas();
  }
  // R5: an actual login/logout is the one event worth waking the live poller
  // for right away, so a Camada C -> B upgrade doesn't wait out a stale ~60s
  // timer (liveHandle is assigned near the end of main(), once the indicator
  // exists to drive - by the time a login/logout can actually fire this
  // callback, the assignment below has long since run).
  function handleAuthChange(): void {
    refreshAuthenticatedPanels();
    liveHandle?.refreshNow();
  }
  renderAuth(authEl, handleAuthChange);
  refreshAuthenticatedPanels();

  // localPlayer instantiation
  const localPlayer = new LocalPlayer(30, 30);

  updatePlayerCount();

  const camera = new Camera(world.width * TILE_SIZE_PX, world.height * TILE_SIZE_PX);
  let dpr = Math.min(window.devicePixelRatio || 1, 3);

  function resize(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    camera.setViewport(cssW, cssH);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  // Center camera on local player initially
  camera.centerOnWorld(localPlayer.x * TILE_SIZE_PX, localPlayer.y * TILE_SIZE_PX);
  camera.clamp();

  /** Moves the local avatar (the "intenção") straight to `pos`, clearing any pending path - used by portal travel, never by ordinary movement. */
  function teleportLocalPlayer(pos: Position): void {
    localPlayer.path = [];
    localPlayer.x = pos.x;
    localPlayer.y = pos.y;
    localPlayer.visualX = pos.x;
    localPlayer.visualY = pos.y;
  }

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key) {
      case 'w':
      case 'W':
      case 'ArrowUp':
        localPlayer.moveDir(0, -1, world);
        break;
      case 's':
      case 'S':
      case 'ArrowDown':
        localPlayer.moveDir(0, 1, world);
        break;
      case 'a':
      case 'A':
      case 'ArrowLeft':
        localPlayer.moveDir(-1, 0, world);
        break;
      case 'd':
      case 'D':
      case 'ArrowRight':
        localPlayer.moveDir(1, 0, world);
        break;
    }
  });

  // Tap-to-move click callback. R6 (D-17): tapping directly on O Coração's
  // portal marker opens the Portais panel instead of walking there - cheap,
  // no engine command (see the module doc). Only wired while actually home
  // (portalMarkerVisible below), matching where the marker is drawn.
  attachPointerControls(canvas, camera, (clickX, clickY) => {
    const worldX = camera.screenToWorldX(clickX);
    const worldY = camera.screenToWorldY(clickY);

    const tileX = Math.floor(worldX / TILE_SIZE_PX);
    const tileY = Math.floor(worldY / TILE_SIZE_PX);

    if (portalMarkerVisible() && tileX === PORTAL_MARKER_POSITION.x && tileY === PORTAL_MARKER_POSITION.y) {
      openPortaisPanel();
      return;
    }

    localPlayer.findPathTo(tileX, tileY, world);
  });

  // R5 (Fluidez B, D-24): keep the world fresh within seconds without a
  // reload - see live.ts for the tier design (Camada B logged-in ~3s /
  // Camada C anonymous ~60s) and live-indicator.ts for the HUD dot+label.
  const updateLiveIndicator = renderLiveIndicator({ root: liveEl, dot: liveDotEl, label: liveLabelEl });

  function applyFreshWorld(freshWorld: World): void {
    world = freshWorld;
    worldNameEl.textContent = world.meta.name;
    tickEl.textContent = String(world.meta.tickCount);
    updatePlayerCount();
    renderMural(muralListEl, world);
    refreshAuthenticatedPanels();
    // localPlayer (the "intenção") is deliberately left untouched here: only
    // the Registro (world state) refreshes on a live update: the player's
    // own optimistic position and any pending path keep going uninterrupted
    // (D-12/D-22/D-25b) - reassigning `world` above already makes THEIR OWN
    // Registro entry in world.players (the pale echo, block 3 of renderer.ts)
    // catch up to wherever the Pulse last wrote them, exactly like today.
    // Portal travel (R6) is the one caller that moves localPlayer - it does
    // so ITSELF, right after calling this function (see atravessarPara/
    // voltarAoCoracao), never inside applyFreshWorld.
    //
    // worldNameEl NOW re-derived on every call (R6, D-17 - this used to be
    // "set once at startup" per a since-updated comment here: O Coração's
    // own name/dimensions truly never change mid-session, but a portal
    // crossing swaps in an ENTIRELY different world, name included, so this
    // line is a no-op for the live-poll-of-O-Coração path and load-bearing
    // for the portal-travel path). The Camera's world bounds are the other
    // half of that old premise - still deliberately NOT touched here; a
    // portal crossing resizes the Camera itself (camera.resize(), see
    // atravessarPara/voltarAoCoracao) because ONLY the crossing knows the
    // new bounds are coming, whereas a live-poll refresh of the SAME world
    // never changes them.
  }

  // ---------------------------------------------------------------------
  // R6 (D-17) — O Salão de Portais: travessia sem sair do site.
  // ---------------------------------------------------------------------

  /** Whether the map marker should be drawn/interactive right now: only while home in O Coração, and only once there's actually somewhere to travel to. */
  function portalMarkerVisible(): boolean {
    return visitingWorldId === null && portalRegistry.length > 0;
  }

  function getPortalMarker(): Position | null {
    return portalMarkerVisible() ? PORTAL_MARKER_POSITION : null;
  }

  function openPortaisPanel(): void {
    const details = document.getElementById('hud-portais');
    if (details instanceof HTMLDetailsElement) details.open = true;
    details?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }

  function refreshPortaisUI(): void {
    renderPortais(
      portaisBodyEl,
      {
        registry: portalRegistry,
        currentId: visitingWorldId ?? HOME_PORTAL_ID,
        pendingId: portalPendingId,
        error: portalError,
      },
      (entry) => void atravessarPara(entry),
    );
    renderVisitBanner(visitingEl, visitingWorldId === null ? null : world.meta.name, () => void voltarAoCoracao());
  }

  /** Refetches O Coração fresh and resumes live polling - used both by "voltar" and by clicking the Coração entry itself while away (they're the same operation). */
  async function voltarAoCoracao(): Promise<void> {
    if (visitingWorldId === null || portalPendingId !== null) return;
    portalPendingId = HOME_PORTAL_ID;
    portalError = null;
    refreshPortaisUI();
    try {
      const freshHeart = await loadWorld();
      const back = homePosition ?? { x: 30, y: 30 };
      // Flip the state BEFORE applyFreshWorld: that call synchronously
      // re-renders every panel via refreshAuthenticatedPanels(), which reads
      // `visitingWorldId` to decide `readOnly` - flipping it after would
      // render this first pass with the STALE (still-visiting) flag, and
      // nothing would ever re-render it correctly afterward (bug caught in
      // QA: the panels stayed read-only after "voltar" until the next live
      // poll happened to fire).
      homePosition = null;
      visitingWorldId = null;
      applyFreshWorld(freshHeart);
      camera.resize(freshHeart.width * TILE_SIZE_PX, freshHeart.height * TILE_SIZE_PX);
      teleportLocalPlayer(back);
      camera.centerOnWorld((back.x + 0.5) * TILE_SIZE_PX, (back.y + 0.5) * TILE_SIZE_PX);
      camera.clamp();
      liveEl.hidden = false;
      liveHandle = startLivePolling({ initialWorld: freshHeart, onWorld: applyFreshWorld, onStatus: updateLiveIndicator });
    } catch (err) {
      // loadWorld() itself already falls back live-raw -> bundled copy, so
      // this only fires if BOTH fail - stay put (still "visiting", banner
      // and "voltar" remain so the player can retry) rather than pretend
      // we're home when the screen still shows someone else's map.
      console.warn('Falha ao voltar para O Coração:', err);
      portalError = 'Não foi possível voltar agora. Confira sua conexão e tente de novo.';
    } finally {
      portalPendingId = null;
      refreshPortaisUI();
    }
  }

  /** Fetches+validates `entry`'s world and, on success, swaps it in for the one on screen. A no-op (state-wise) on failure - see fetchPortalWorld's own doc. */
  async function atravessarPara(entry: PortalRegistryEntry): Promise<void> {
    if (entry.id === HOME_PORTAL_ID) {
      await voltarAoCoracao();
      return;
    }
    if (entry.id === visitingWorldId || portalPendingId !== null) return;

    portalPendingId = entry.id;
    portalError = null;
    refreshPortaisUI();
    try {
      const freshWorld = await fetchPortalWorld(entry);

      // Pause O Coração's live polling for the duration of the visit - only
      // meaningful on the FIRST hop away from home (liveHandle is already
      // null on a hop between two foreign worlds).
      liveHandle?.stop();
      liveHandle = null;
      liveEl.hidden = true;

      if (homePosition === null) {
        homePosition = { x: localPlayer.x, y: localPlayer.y };
      }

      // Flip the state BEFORE applyFreshWorld - see voltarAoCoracao's
      // matching comment: that call re-renders every panel synchronously,
      // reading `visitingWorldId` for `readOnly`, so it must already be
      // correct on this very first render of the arriving world.
      visitingWorldId = entry.id;
      applyFreshWorld(freshWorld);
      camera.resize(freshWorld.width * TILE_SIZE_PX, freshWorld.height * TILE_SIZE_PX);
      const arrival = findArrivalTile(freshWorld);
      teleportLocalPlayer(arrival);
      camera.centerOnWorld((arrival.x + 0.5) * TILE_SIZE_PX, (arrival.y + 0.5) * TILE_SIZE_PX);
      camera.clamp();
    } catch (err) {
      console.warn('Falha ao atravessar o portal:', err);
      portalError = err instanceof Error ? err.message : 'Não foi possível atravessar agora.';
    } finally {
      portalPendingId = null;
      refreshPortaisUI();
    }
  }

  refreshPortaisUI();

  liveHandle = startLivePolling({
    initialWorld: world,
    onWorld: applyFreshWorld,
    onStatus: updateLiveIndicator,
  });

  let lastTimeMs = performance.now();
  // Edge-triggered (R6, D-17): flips true the moment the local avatar first
  // comes within PORTAL_PROXIMITY_TILES of the marker, so standing there
  // opens the panel once, not every frame - a player who then closes it by
  // hand isn't fought back open until they actually step away and back.
  let wasNearPortal = false;

  function frame(nowMs: number): void {
    const deltaTimeSeconds = Math.min(0.1, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;

    localPlayer.update(deltaTimeSeconds, world);

    if (portalMarkerVisible()) {
      const nearNow = isNearPortalMarker(localPlayer.x, localPlayer.y);
      if (nearNow && !wasNearPortal) openPortaisPanel();
      wasNearPortal = nearNow;
    } else {
      wasNearPortal = false;
    }

    drawFrame({ ctx, world, sprites, camera, dpr, localPlayer, portalMarker: getPortalMarker() }, nowMs);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'Algo deu errado ao abrir O Coração. Recarregue a página.';
    statusEl.hidden = false;
  }
});
