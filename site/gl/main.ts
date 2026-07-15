/**
 * gl/main.ts
 *
 * R3 prototype entry point. Loads world/heart.json (local copy only, see
 * world-load.ts) once, builds BOTH renderers up front, then drives exactly
 * ONE of them per animation frame based on the current toggle state - so
 * neither renderer ever pays for the other's idle upkeep, keeping the FPS
 * numbers honest.
 *
 * Exposes `window.glProto` so gl/qa/bench-and-screens.mjs (Playwright) can
 * drive every combination (renderer x scene x sprite count x time-of-day)
 * without reloading the page or clicking through the HUD.
 */
import './style.css';
import { Application } from 'pixi.js';
import { TILE_SIZE_PX } from '../../engine/types';
import { Camera } from './camera';
import { loadWorldLocal } from './world-load';
import { loadSpritesCanvas, type Sprites as CanvasSprites } from './sprites-canvas';
import { loadSpritesPixi } from './sprites-pixi';
import { drawCanvasWorldFrame } from './canvas-world';
import { PixiWorldScene } from './pixi-world';
import { drawCanvasStressFrame } from './canvas-stress';
import { PixiStressScene } from './pixi-stress';
import { genStressSprites, type StressSprite } from './stress';
import { FpsMeter } from './fps';
import { createCrtFilter, setCrtResolution } from './pixi-filters';

const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;
const DAY_MINUTES = 24 * 60;

export type RendererKind = 'canvas' | 'pixi';
export type SceneMode = 'world' | 'stress';
export type TimeOfDay = 'live' | 'day' | 'night';

export interface GlProtoStats {
  renderer: RendererKind;
  mode: SceneMode;
  stressCount: number;
  timeOfDay: TimeOfDay;
  crt: boolean;
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
}

export interface GlProtoApi {
  ready: boolean;
  setRenderer(r: RendererKind): void;
  setMode(m: SceneMode): void;
  setStressCount(n: number): void;
  setTimeOfDay(t: TimeOfDay): void;
  setCrt(on: boolean): void;
  resetFps(): void;
  getStats(): GlProtoStats;
}

declare global {
  interface Window {
    glProto?: GlProtoApi;
  }
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado no HTML.`);
  return el as T;
}

function timeOverrideMinutes(t: TimeOfDay): number | undefined {
  switch (t) {
    case 'day':
      return DAY_MINUTES / 2;
    case 'night':
      return 0;
    default:
      return undefined;
  }
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
  const canvas2dEl = requireEl<HTMLCanvasElement>('canvas-2d');
  const canvasPixiEl = requireEl<HTMLCanvasElement>('canvas-pixi');
  const statusEl = requireEl<HTMLDivElement>('status');
  const statsEl = requireEl<HTMLDivElement>('hud-stats');
  const ctlRenderer = requireEl<HTMLSelectElement>('ctl-renderer');
  const ctlMode = requireEl<HTMLSelectElement>('ctl-mode');
  const ctlStressCount = requireEl<HTMLSelectElement>('ctl-stress-count');
  const ctlStressCountLabel = requireEl<HTMLSpanElement>('ctl-stress-count-label');
  const ctlStressCountWrap = requireEl<HTMLLabelElement>('ctl-stress-count-wrap');
  const ctlTime = requireEl<HTMLSelectElement>('ctl-time');
  const ctlCrt = requireEl<HTMLInputElement>('ctl-crt');

  showStatus(statusEl, 'Carregando O Coração (cópia local) e sprites...');

  const ctx2dMaybe = canvas2dEl.getContext('2d');
  if (!ctx2dMaybe) {
    showStatus(statusEl, 'Este navegador não suporta canvas 2D.');
    return;
  }
  const ctx2d: CanvasRenderingContext2D = ctx2dMaybe;

  const app = new Application();
  await app.init({
    canvas: canvasPixiEl,
    width: VIEWPORT_W,
    height: VIEWPORT_H,
    resolution: 1,
    autoDensity: false,
    background: 0x100c15,
    antialias: false,
    preference: 'webgl',
    powerPreference: 'high-performance',
  });
  app.ticker.stop(); // driven manually from the single rAF loop below

  const [world, canvasSprites, pixiSprites] = await Promise.all([loadWorldLocal(), loadSpritesCanvas(), loadSpritesPixi()]);

  hideStatus(statusEl);

  const camera = new Camera(world.width * TILE_SIZE_PX, world.height * TILE_SIZE_PX);
  camera.setViewport(VIEWPORT_W, VIEWPORT_H);

  const pixiWorldScene = new PixiWorldScene(world, pixiSprites);
  pixiWorldScene.resize(VIEWPORT_W, VIEWPORT_H);
  pixiWorldScene.applyCamera(camera.x, camera.y, camera.zoom);

  const canvasVariantSheets: CanvasSprites[keyof CanvasSprites][] = [
    canvasSprites.no_avatar,
    canvasSprites.nativoGota,
    canvasSprites.nativoRaiz,
    canvasSprites.nativoCinza,
  ];

  const pixiStressScene = new PixiStressScene(pixiSprites.no_avatar.frames[0]!);

  const crtFilter = createCrtFilter(VIEWPORT_W, VIEWPORT_H);
  setCrtResolution(crtFilter, VIEWPORT_W, VIEWPORT_H);

  app.stage.addChild(pixiWorldScene.stageRoot);
  app.stage.addChild(pixiStressScene.container);

  const state = {
    renderer: 'canvas' as RendererKind,
    mode: 'world' as SceneMode,
    stressCount: 1000,
    timeOfDay: 'live' as TimeOfDay,
    crt: false,
  };

  let canvasStressSprites: StressSprite[] = genStressSprites(state.stressCount);
  pixiStressScene.setCount(state.stressCount);

  const fps = new FpsMeter();

  function applyRendererVisibility(): void {
    if (state.renderer === 'canvas') {
      canvas2dEl.classList.remove('hidden');
      canvasPixiEl.classList.add('hidden');
    } else {
      canvas2dEl.classList.add('hidden');
      canvasPixiEl.classList.remove('hidden');
    }
  }

  function applyCrt(): void {
    app.stage.filters = state.crt ? [crtFilter] : [];
  }

  function syncControls(): void {
    ctlRenderer.value = state.renderer;
    ctlMode.value = state.mode;
    ctlStressCount.value = String(state.stressCount);
    ctlStressCountLabel.textContent = state.stressCount.toLocaleString('pt-BR');
    ctlTime.value = state.timeOfDay;
    ctlCrt.checked = state.crt;
    ctlStressCountWrap.style.display = state.mode === 'stress' ? '' : 'none';
  }

  applyRendererVisibility();
  applyCrt();
  syncControls();

  function updateStatsHud(): void {
    const modeLabel = state.mode === 'world' ? 'mundo' : `estresse (${state.stressCount.toLocaleString('pt-BR')} sprites)`;
    statsEl.textContent =
      `${state.renderer === 'canvas' ? 'Canvas 2D' : 'PixiJS/WebGL'} · ${modeLabel} · ` +
      `${fps.fps.toFixed(1)} fps · ${fps.avgFrameMs.toFixed(2)} ms/frame (méd.) · p95 ${fps.p95FrameMs.toFixed(2)} ms`;
  }

  function frame(nowMs: number): void {
    fps.tick(nowMs);
    const overrideMinutes = timeOverrideMinutes(state.timeOfDay);

    if (state.renderer === 'canvas') {
      if (state.mode === 'world') {
        drawCanvasWorldFrame(
          { ctx: ctx2d, world, sprites: canvasSprites, camera, dpr: 1, worldTimeOverrideMinutes: overrideMinutes },
          nowMs,
        );
      } else {
        drawCanvasStressFrame(
          {
            ctx: ctx2d,
            dpr: 1,
            viewportW: VIEWPORT_W,
            viewportH: VIEWPORT_H,
            sprites: canvasStressSprites,
            variantSheets: canvasVariantSheets,
          },
          nowMs,
        );
      }
    } else {
      if (state.mode === 'world') {
        pixiWorldScene.stageRoot.visible = true;
        pixiStressScene.container.visible = false;
        pixiWorldScene.update(nowMs, overrideMinutes);
      } else {
        pixiWorldScene.stageRoot.visible = false;
        pixiStressScene.container.visible = true;
        pixiStressScene.update(nowMs);
      }
      app.render();
    }

    updateStatsHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- window.glProto (Playwright/automation control) ----------------------
  const api: GlProtoApi = {
    ready: true,
    setRenderer(r) {
      state.renderer = r;
      applyRendererVisibility();
      syncControls();
      fps.reset(performance.now());
    },
    setMode(m) {
      state.mode = m;
      syncControls();
      fps.reset(performance.now());
    },
    setStressCount(n) {
      state.stressCount = n;
      canvasStressSprites = genStressSprites(n);
      pixiStressScene.setCount(n);
      syncControls();
      fps.reset(performance.now());
    },
    setTimeOfDay(t) {
      state.timeOfDay = t;
      syncControls();
    },
    setCrt(on) {
      state.crt = on;
      applyCrt();
      syncControls();
    },
    resetFps() {
      fps.reset(performance.now());
    },
    getStats() {
      return {
        renderer: state.renderer,
        mode: state.mode,
        stressCount: state.stressCount,
        timeOfDay: state.timeOfDay,
        crt: state.crt,
        fps: fps.fps,
        avgFrameMs: fps.avgFrameMs,
        p95FrameMs: fps.p95FrameMs,
      };
    },
  };
  window.glProto = api;

  // --- Controls (manual/human use) -----------------------------------------
  ctlRenderer.addEventListener('change', () => api.setRenderer(ctlRenderer.value as RendererKind));
  ctlMode.addEventListener('change', () => api.setMode(ctlMode.value as SceneMode));
  ctlStressCount.addEventListener('change', () => api.setStressCount(Number(ctlStressCount.value)));
  ctlTime.addEventListener('change', () => api.setTimeOfDay(ctlTime.value as TimeOfDay));
  ctlCrt.addEventListener('change', () => api.setCrt(ctlCrt.checked));

  // Convenience for manual testing: ?renderer=pixi&mode=stress&stress=5000&time=night&crt=1
  const params = new URLSearchParams(location.search);
  const qRenderer = params.get('renderer');
  const qMode = params.get('mode');
  const qStress = params.get('stress');
  const qTime = params.get('time');
  const qCrt = params.get('crt');
  if (qRenderer === 'canvas' || qRenderer === 'pixi') api.setRenderer(qRenderer);
  if (qMode === 'world' || qMode === 'stress') api.setMode(qMode);
  if (qStress) api.setStressCount(Number(qStress));
  if (qTime === 'live' || qTime === 'day' || qTime === 'night') api.setTimeOfDay(qTime);
  if (qCrt === '1' || qCrt === 'true') api.setCrt(true);
}

main().catch((err) => {
  console.error(err);
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'Algo deu errado ao carregar o protótipo R3. Veja o console.';
    statusEl.hidden = false;
  }
});
