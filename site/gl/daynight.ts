/**
 * gl/daynight.ts
 *
 * Shared, renderer-agnostic day/night math driven by world.meta.worldTime
 * (minutes since the Commit Primordial - engine/types.ts WorldMeta). Both
 * the canvas and the PixiJS renderer call the SAME pure functions here, so
 * neither implementation gets a different (easier/harder) lighting curve -
 * the comparison is about how cheaply/well each API expresses the same
 * effect, not about who has the prettier curve.
 *
 * engine/tick.ts: WORLD_MINUTES_PER_TICK = 60 (1 beat = 1 world-hour), so a
 * full day is 1440 world-minutes. That constant is engine-owned; this file
 * only assumes "some number of world-minutes make a day" via DAY_MINUTES
 * below, kept in sync by inspection (not imported - the world contract does
 * not define a "day length", only worldTime itself, so this is a rendering
 * decision, not an engine one).
 */

/** World-minutes in a full day/night cycle (24 world-hours). */
export const DAY_MINUTES = 24 * 60;

export interface DayNightState {
  /** 0 = midnight, 0.25 = sunrise (06:00), 0.5 = noon, 0.75 = sunset (18:00). */
  fraction: number;
  /** 0 (full daylight, no tint) .. 1 (deepest night, max tint). */
  darkness: number;
  /** 0..1 warm dawn/dusk glow strength, peaks at sunrise/sunset, ~0 at noon/midnight. */
  warmth: number;
  /** Night-tint color, 0xRRGGBB - a deep indigo, not pure black (reads as night without crushing the palette). */
  nightColor: number;
  /** Dawn/dusk warm glow color, 0xRRGGBB. */
  warmColor: number;
}

/** worldTime (minutes) -> 0..1 fraction of the day. */
export function timeOfDayFraction(worldTimeMinutes: number): number {
  const m = ((worldTimeMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return m / DAY_MINUTES;
}

/**
 * Smooth day/night curve from a 0..1 fraction. `darkness` follows a cosine
 * so it eases in/out around dawn and dusk instead of a hard cut; `warmth`
 * is a pair of bumps centered on the two twilight windows (Eastward/
 * Octopath reference: warm rim light at dawn/dusk, cool blue at night).
 */
/** Deepest-night darkness never quite reaches 1: Eastward/Octopath night scenes stay dark but keep terrain silhouettes legible, they don't crush to black. */
const MAX_DARKNESS = 0.82;

export function dayNightState(fraction: number): DayNightState {
  // cos(0) at noon (0.5) should be 1 (bright); cos should be -1 at midnight (0).
  const cosCurve = Math.cos((fraction - 0.5) * Math.PI * 2);
  const darkness = clamp01((1 - cosCurve) / 2) ** 1.35 * MAX_DARKNESS; // ease toward the extremes
  const dawn = twilightBump(fraction, 0.25);
  const dusk = twilightBump(fraction, 0.75);
  const warmth = clamp01(Math.max(dawn, dusk));

  return {
    fraction,
    darkness,
    warmth,
    nightColor: 0x1c1a42,
    warmColor: 0xff9a55,
  };
}

function twilightBump(fraction: number, center: number, width = 0.09): number {
  const d = Math.abs(fraction - center);
  const wrapped = Math.min(d, 1 - d);
  return clamp01(1 - wrapped / width);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
