/**
 * src/input.ts
 *
 * Pan-by-drag and zoom controls for both mouse and touch, driving a
 * Camera. Touch: one finger pans, two fingers pinch-zoom around their
 * midpoint. `touch-action: none` (see style.css) plus preventDefault here
 * stops the page itself from scrolling/zooming on mobile.
 */
import type { Camera } from './camera';

interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function attachPointerControls(
  canvas: HTMLCanvasElement,
  camera: Camera,
  onTap?: (x: number, y: number) => void
): void {
  // --- Mouse drag & tap ---
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let mouseStartX = 0;
  let mouseStartY = 0;
  let mouseStartTime = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    mouseStartTime = Date.now();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    camera.pan(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;

    // Detect click / tap
    const duration = Date.now() - mouseStartTime;
    const dist = Math.hypot(e.clientX - mouseStartX, e.clientY - mouseStartY);
    if (duration < 250 && dist < 8 && onTap) {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      onTap(clickX, clickY);
    }
  });

  window.addEventListener('blur', () => {
    dragging = false;
  });

  // --- Wheel zoom (desktop trackpad/mouse) ---
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.pow(1.0015, -e.deltaY);
      camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    },
    { passive: false },
  );

  // --- Touch: 1 finger pan/tap, 2 fingers pinch-zoom ---
  const touchPoints = new Map<number, Point>();
  let lastPinchDist: number | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let singleTouchId: number | null = null;

  function currentMidpointCss(rect: DOMRect): Point | null {
    const pts = Array.from(touchPoints.values());
    if (pts.length < 2) return null;
    const [a, b] = pts;
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
  }

  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY });
      }

      if (touchPoints.size === 1) {
        const only = Array.from(touchPoints.values())[0];
        if (only) {
          lastX = only.x;
          lastY = only.y;
          touchStartX = only.x;
          touchStartY = only.y;
          touchStartTime = Date.now();
          singleTouchId = e.changedTouches[0]!.identifier;
        }
      } else if (touchPoints.size >= 2) {
        singleTouchId = null;
        const pts = Array.from(touchPoints.values());
        const [a, b] = pts;
        if (a && b) lastPinchDist = distance(a, b);
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();

      if (touchPoints.size === 1) {
        const t = e.changedTouches[0];
        if (t && t.identifier === singleTouchId) {
          touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY });
          camera.pan(t.clientX - lastX, t.clientY - lastY);
          lastX = t.clientX;
          lastY = t.clientY;
        }
        return;
      }

      for (const t of Array.from(e.changedTouches)) {
        touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (touchPoints.size >= 2) {
        const pts = Array.from(touchPoints.values());
        const [a, b] = pts;
        if (!a || !b) return;
        const dist = distance(a, b);
        const mid = currentMidpointCss(rect);
        if (lastPinchDist !== null && mid !== null && lastPinchDist > 0) {
          camera.zoomAt(mid.x, mid.y, dist / lastPinchDist);
        }
        lastPinchDist = dist;
      }
    },
    { passive: false },
  );

  function releaseTouches(e: TouchEvent): void {
    const wasSingleTouch = touchPoints.size === 1 && singleTouchId !== null;
    let singleTouchEndedPoint: Point | null = null;

    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === singleTouchId) {
        singleTouchEndedPoint = { x: t.clientX, y: t.clientY };
      }
      touchPoints.delete(t.identifier);
    }
    lastPinchDist = null;

    if (wasSingleTouch && singleTouchEndedPoint && onTap) {
      const duration = Date.now() - touchStartTime;
      const dist = Math.hypot(singleTouchEndedPoint.x - touchStartX, singleTouchEndedPoint.y - touchStartY);
      if (duration < 250 && dist < 12) {
        const rect = canvas.getBoundingClientRect();
        const clickX = singleTouchEndedPoint.x - rect.left;
        const clickY = singleTouchEndedPoint.y - rect.top;
        onTap(clickX, clickY);
      }
    }

    singleTouchId = null;

    const only = Array.from(touchPoints.values())[0];
    if (only) {
      lastX = only.x;
      lastY = only.y;
    }
  }

  canvas.addEventListener('touchend', releaseTouches);
  canvas.addEventListener('touchcancel', releaseTouches);

  // iOS Safari's non-standard gesture events also trigger native pinch-zoom
  // of the page unless suppressed explicitly.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
}
