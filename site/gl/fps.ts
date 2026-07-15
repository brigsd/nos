/**
 * gl/fps.ts
 *
 * Rolling FPS/frame-time meter shared by both renderers, and read directly
 * by the Playwright bench script (gl/qa/bench-and-screens.mjs) through the
 * window.glProto API in main.ts - so the numbers in docs/R3 come straight
 * from requestAnimationFrame deltas, not a synthetic estimate.
 */
export class FpsMeter {
  private frameCount = 0;
  private windowStartMs = 0;
  private lastFrameMs = 0;
  private frameTimes: number[] = [];
  fps = 0;
  avgFrameMs = 0;
  p95FrameMs = 0;

  reset(nowMs: number): void {
    this.frameCount = 0;
    this.windowStartMs = nowMs;
    this.lastFrameMs = nowMs;
    this.frameTimes = [];
    this.fps = 0;
    this.avgFrameMs = 0;
    this.p95FrameMs = 0;
  }

  /** Call once per rendered frame. */
  tick(nowMs: number): void {
    if (this.windowStartMs === 0) {
      this.reset(nowMs);
      return;
    }
    const dt = nowMs - this.lastFrameMs;
    this.lastFrameMs = nowMs;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    this.frameCount++;

    const elapsed = nowMs - this.windowStartMs;
    if (elapsed > 0) {
      this.fps = (this.frameCount * 1000) / elapsed;
    }
    if (this.frameTimes.length > 0) {
      const sorted = [...this.frameTimes].sort((a, b) => a - b);
      this.avgFrameMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      this.p95FrameMs = sorted[p95Index] ?? this.avgFrameMs;
    }
  }
}
