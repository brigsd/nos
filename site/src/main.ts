/**
 * src/main.ts
 *
 * Entry point: loads world state + sprites, wires up the camera/input, and
 * runs the render loop. Kept intentionally thin - see world.ts, sprites.ts,
 * camera.ts, input.ts and renderer.ts for the actual logic.
 */
import './style.css';
import { TILE_SIZE_PX } from '../../engine/types';
import { Camera } from './camera';
import { attachPointerControls } from './input';
import { drawFrame } from './renderer';
import { loadSprites, type Sprites } from './sprites';
import { loadWorld } from './world';

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
  playersEl.textContent = pluralPt(Object.keys(world.players).length, 'jogador', 'jogadores');

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

  attachPointerControls(canvas, camera);

  function frame(nowMs: number): void {
    drawFrame({ ctx, world, sprites, camera, dpr }, nowMs);
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
