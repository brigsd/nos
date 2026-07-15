/**
 * src/main.ts
 *
 * Entry point: loads world state + sprites, instantiates the local player,
 * wires up keydown and tap controls, and runs the render loop.
 */
import './style.css';
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

  const world = worldResult.value;
  const sprites: Sprites = spritesResult.value;

  hideStatus(statusEl);
  hudEl.style.visibility = 'visible';
  worldNameEl.textContent = world.meta.name;
  tickEl.textContent = String(world.meta.tickCount);
  renderMural(muralListEl, world);

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
  renderAuth(authEl, refreshAuthenticatedPanels);
  refreshAuthenticatedPanels();

  // localPlayer instantiation
  const localPlayer = new LocalPlayer(30, 30);

  // Update total players (other players + 1 local player)
  const totalPlayersCount = Object.keys(world.players).length + 1;
  playersEl.textContent = pluralPt(totalPlayersCount, 'jogador', 'jogadores');

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
