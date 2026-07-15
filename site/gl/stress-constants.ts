/**
 * gl/stress-constants.ts
 *
 * Shared by both stress renderers so the two draw the exact same layout at
 * the exact same on-screen size. STRESS_FIELD_TILES_W x _H (gl/stress.ts)
 * at this scale fills exactly the 1280x800 viewport used everywhere else
 * in this prototype (site/qa/screenshot.mjs uses the same size).
 */
export const STRESS_PX_PER_TILE = 8;
export const STRESS_SPRITE_SIZE_PX = 16;
