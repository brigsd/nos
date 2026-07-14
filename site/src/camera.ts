/**
 * src/camera.ts
 *
 * Pan/zoom state for the map, in two coordinate spaces:
 *  - "world px": native art pixels, origin at the map's top-left corner
 *    (world width/height in tiles * TILE_SIZE_PX).
 *  - "screen/CSS px": the canvas's on-screen size, independent of
 *    devicePixelRatio (the renderer applies dpr as a separate transform).
 *
 * `x`/`y` are the world-px coordinates of the viewport's top-left corner;
 * `zoom` is CSS-px per world-px. Every mutation ends in `clamp()`, so the
 * map can never be panned or zoomed past its own edges.
 */

export interface Size {
  width: number;
  height: number;
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 0.1;
  maxZoom = 10;
  viewport: Size = { width: 0, height: 0 };

  constructor(
    public readonly worldWidthPx: number,
    public readonly worldHeightPx: number,
  ) {}

  private fitZoom(padding: number): number {
    if (this.viewport.width <= 0 || this.viewport.height <= 0) return 1;
    return Math.min(this.viewport.width / this.worldWidthPx, this.viewport.height / this.worldHeightPx) * padding;
  }

  /** Call on init and on every resize/orientation change. Refits (and re-centers) on the very first call. */
  setViewport(width: number, height: number): void {
    const isFirst = this.viewport.width === 0 && this.viewport.height === 0;
    this.viewport = { width, height };

    const fit = this.fitZoom(1);
    // A little extra room to zoom out past "whole map fits" so the island
    // can breathe in the dark background; a hard ceiling well above native
    // resolution for close-up inspection on mobile.
    this.minZoom = fit * 0.82;
    this.maxZoom = Math.max(fit * 10, 6);

    if (isFirst) {
      this.zoom = fit * 0.94;
      this.centerOnWorld(this.worldWidthPx / 2, this.worldHeightPx / 2);
    } else {
      this.zoom = clampNum(this.zoom, this.minZoom, this.maxZoom);
    }
    this.clamp();
  }

  centerOnWorld(worldX: number, worldY: number): void {
    this.x = worldX - this.viewport.width / 2 / this.zoom;
    this.y = worldY - this.viewport.height / 2 / this.zoom;
  }

  /** Keeps the viewport within the map's bounds; centers any axis where the map is smaller than the viewport. */
  clamp(): void {
    const viewWorldW = this.viewport.width / this.zoom;
    const viewWorldH = this.viewport.height / this.zoom;

    this.x =
      viewWorldW >= this.worldWidthPx
        ? (this.worldWidthPx - viewWorldW) / 2
        : clampNum(this.x, 0, this.worldWidthPx - viewWorldW);

    this.y =
      viewWorldH >= this.worldHeightPx
        ? (this.worldHeightPx - viewWorldH) / 2
        : clampNum(this.y, 0, this.worldHeightPx - viewWorldH);
  }

  /** Pan by a screen-space (CSS px) delta, e.g. mouse/touch movement. */
  pan(dxCss: number, dyCss: number): void {
    this.x -= dxCss / this.zoom;
    this.y -= dyCss / this.zoom;
    this.clamp();
  }

  /** Zoom by `factor`, keeping the world point under screen point (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const worldX = this.x + sx / this.zoom;
    const worldY = this.y + sy / this.zoom;
    this.zoom = clampNum(this.zoom * factor, this.minZoom, this.maxZoom);
    this.x = worldX - sx / this.zoom;
    this.y = worldY - sy / this.zoom;
    this.clamp();
  }

  /** World-px -> screen-px (CSS space), rounded so adjacent tiles always share an exact boundary (no seams). */
  worldToScreenX(worldX: number): number {
    return Math.round((worldX - this.x) * this.zoom);
  }

  worldToScreenY(worldY: number): number {
    return Math.round((worldY - this.y) * this.zoom);
  }

  screenToWorldX(screenX: number): number {
    return this.x + screenX / this.zoom;
  }

  screenToWorldY(screenY: number): number {
    return this.y + screenY / this.zoom;
  }
}
