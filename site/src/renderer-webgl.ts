/**
 * src/renderer-webgl.ts
 *
 * D-26 — the opt-in WebGL window (PixiJS). THIS FILE IS THE SEAM, not yet
 * the scene: the real Pixi port (evidence branch `claude/r3-webgl-comparativo`,
 * PR #41) lands here as its own slice; until then the factory refuses
 * cleanly and main.ts falls back to the Canvas2D window, so flipping the
 * flag is always safe, today and forever (Canvas2D is the PERMANENT
 * fallback, not a transition state).
 *
 * Loaded ONLY via dynamic import() behind the localStorage flag
 * (`nos_renderer` = 'webgl' — see main.ts selectRenderer): a player who
 * never opts in never downloads a byte of this module or, later, of Pixi.
 *
 * Port contract (for the coming slice): implement `Renderer` from
 * renderer.ts. `render(scene, nowMs)` receives the full FrameScene every
 * frame — a retained-mode scene graph should diff against it (world
 * changes by reference on live updates/portal travel) rather than rebuild.
 * Bring your OWN canvas element: the page's canvas may already have
 * produced a 2D context, and a canvas that has can never produce a WebGL
 * context (see createCanvasRenderer's destroy() note).
 */
import type { Renderer } from './renderer';

export function createWebGLRenderer(_canvas: HTMLCanvasElement): Renderer | null {
  console.warn('Janela WebGL ainda não portada (D-26) — usando a janela Canvas2D.');
  return null;
}
