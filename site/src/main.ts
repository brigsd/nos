/**
 * src/main.ts
 *
 * Entry point: loads world state + sprites, instantiates the local player,
 * wires up keydown and tap controls, and runs the render loop.
 */
import './style.css';
import type { World } from '../../engine/types';
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

  const loaded = await Promise.allSettled([loadWorld(), loadSprites()]);
  const [worldResult, spritesResult] = loaded;

  if (worldResult.status === 'rejected' || spritesResult.status === 'rejected') {
    console.error('Falha ao carregar O Coração:', loaded);
    showStatus(statusEl, 'Não foi possível carregar O Coração. Verifique sua conexão e recarregue a página.');
    return;
  }

  // `world` is reassigned by src/live.ts's onWorld callback (R5, D-24) every
  // time a poll finds a genuinely fresher world, so every closure below that
  // reads `world` at CALL time (frame(), the keydown/pointer handlers, every
  // renderX(el, world)) automatically picks up the refresh - no need to pass
  // it around explicitly. Only localPlayer stays untouched by a refresh
  // (it's the "intenção", D-12/D-22/D-25b - see applyFreshWorld below).
  let world = worldResult.value;
  const sprites: Sprites = spritesResult.value;
  // Assigned near the end of main(), once the live indicator elements exist
  // to drive - declared here (not `const`) only so handleAuthChange below
  // can close over it ahead of time.
  let liveHandle: ReturnType<typeof startLivePolling> | null = null;

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
  function refreshOficinas(): void {
    renderOficinas(oficinasBodyEl, world);
  }
  function refreshAuthenticatedPanels(): void {
    renderMeuNo(meuNoEl, world, refreshOficinas);
    renderComercio(comercioBodyEl, world);
    renderNativos(nativosBodyEl, world);
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

  // Tap-to-move click callback
  attachPointerControls(canvas, camera, (clickX, clickY) => {
    const worldX = camera.screenToWorldX(clickX);
    const worldY = camera.screenToWorldY(clickY);

    const tileX = Math.floor(worldX / TILE_SIZE_PX);
    const tileY = Math.floor(worldY / TILE_SIZE_PX);

    localPlayer.findPathTo(tileX, tileY, world);
  });

  // R5 (Fluidez B, D-24): keep the world fresh within seconds without a
  // reload - see live.ts for the tier design (Camada B logged-in ~3s /
  // Camada C anonymous ~60s) and live-indicator.ts for the HUD dot+label.
  const updateLiveIndicator = renderLiveIndicator({ root: liveEl, dot: liveDotEl, label: liveLabelEl });

  function applyFreshWorld(freshWorld: World): void {
    world = freshWorld;
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
    //
    // Also deliberately NOT re-derived here (review NIT on PR #43, premise
    // documented by choice): worldNameEl (meta.name) and the Camera's world
    // bounds (width/height), both set once at startup. For a given world
    // they are immutable by design - O Coração is a fixed 64x64 map
    // (WORLD_WIDTH/HEIGHT, engine/types.ts) and the tick never renames or
    // resizes it. If a future migration ever DID resize the world, this is
    // the spot that would need to rebuild the Camera (and re-run resize())
    // - until then, rebuilding per refresh would only fight the player's
    // pan/zoom for nothing.
  }

  liveHandle = startLivePolling({
    initialWorld: world,
    onWorld: applyFreshWorld,
    onStatus: updateLiveIndicator,
  });

  let lastTimeMs = performance.now();

  function frame(nowMs: number): void {
    const deltaTimeSeconds = Math.min(0.1, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;

    localPlayer.update(deltaTimeSeconds, world);

    drawFrame({ ctx, world, sprites, camera, dpr, localPlayer }, nowMs);
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
