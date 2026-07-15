/**
 * gl/camera.ts
 *
 * Copy of site/src/camera.ts (see hash.ts for why this is a copy, not an
 * import). Same pan/zoom math for both renderers so neither gets a
 * favorable viewport for free.
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

  setViewport(width: number, height: number): void {
    const isFirst = this.viewport.width === 0 && this.viewport.height === 0;
    this.viewport = { width, height };

    const fit = this.fitZoom(1);
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

  pan(dxCss: number, dyCss: number): void {
    this.x -= dxCss / this.zoom;
    this.y -= dyCss / this.zoom;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const worldX = this.x + sx / this.zoom;
    const worldY = this.y + sy / this.zoom;
    this.zoom = clampNum(this.zoom * factor, this.minZoom, this.maxZoom);
    this.x = worldX - sx / this.zoom;
    this.y = worldY - sy / this.zoom;
    this.clamp();
  }

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
