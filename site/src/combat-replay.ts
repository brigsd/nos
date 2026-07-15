/**
 * src/combat-replay.ts
 *
 * O replay de combate (D-05): the tick already resolved the whole fight and
 * recorded its turn-by-turn script in a `combat_resolved` event - this
 * module only PLAYS IT BACK. Nothing here decides damage, outcome or loot;
 * the client is a projector, never a referee.
 *
 * Two surfaces, driven by the same clock:
 *  - canvas: per action, a slash flash on the struck tile and a floating
 *    damage number (drawn by drawFx, called from renderer.ts each frame);
 *  - DOM: the "Combate" HUD panel, revealing one pt-BR log line per action
 *    in sync, then the outcome line (XP/espólio/queda).
 *
 * All DOM text lands via textContent (logins are player-typed input).
 */
import type { CombatAction, CombatResolvedEvent, Native, Player, World, WorldEvent } from '../../engine/types';
import { getOwn, TILE_SIZE_PX } from '../../engine/types';
import { RESOURCE_LABELS_PTBR, RESOURCE_TYPES } from '../../engine/types';
import type { Camera } from './camera';

/** How long each action of the script stays on stage. */
const STEP_MS = 900;

/** Replay fights from up to this many beats ago - a viewer arriving late still sees the last clash. */
const RECENT_TICKS = 3;

/** Red for blows landing, parchment for dodges (Resurrect 64). */
const HIT_COLOR = '#e83b3b';
const DODGE_COLOR = '#c7dcd0';

function isCombatResolved(event: WorldEvent): event is CombatResolvedEvent {
  return event.type === 'combat_resolved';
}

/** The most recent fight still worth replaying, if any. */
export function findRecentCombat(world: World): CombatResolvedEvent | undefined {
  return world.events
    .filter(isCombatResolved)
    .filter((event) => world.meta.tickCount - event.tick <= RECENT_TICKS)
    .at(-1);
}

/** pt-BR log line for one action of the script. */
function actionLine(action: CombatAction, event: CombatResolvedEvent, nativeName: string): string {
  const actorIsPlayer = action.actor === event.login;
  const actorLabel = actorIsPlayer ? `@${event.login}` : nativeName;
  const targetLabel = action.target === event.login ? `@${event.login}` : nativeName;
  if (action.kind === 'dodge') {
    return `${actorLabel} erra o golpe — ${targetLabel} esquiva.`;
  }
  const verb = action.kind === 'attack' ? 'golpeia' : 'revida';
  return `${actorLabel} ${verb} ${targetLabel}: −${action.damage}`;
}

/** pt-BR closing line: what the Crônica keeps of this fight. */
function outcomeLine(event: CombatResolvedEvent, nativeName: string): string {
  if (event.outcome === 'victory') {
    const loot = RESOURCE_TYPES.filter((r) => (event.loot[r] ?? 0) > 0)
      .map((r) => `${event.loot[r]} ${RESOURCE_LABELS_PTBR[r]}`)
      .join(' + ');
    return `${nativeName} desfaleceu. +${event.xpGained} XP${loot ? `, espólio: ${loot}` : ''}.`;
  }
  if (event.outcome === 'defeat') {
    return `@${event.login} caiu. Acordou no ponto inicial — inteiro, mas mais leve.`;
  }
  return `Cinco turnos e ninguém cedeu. Cada um voltou para o seu lado.`;
}

export class CombatReplay {
  private readonly event: CombatResolvedEvent;
  private readonly nativeName: string;
  private readonly logEl: HTMLOListElement;
  private startMs: number | null = null;
  private revealed = 0;
  private outcomeShown = false;

  constructor(
    private readonly world: World,
    event: CombatResolvedEvent,
    private readonly panelEl: HTMLDetailsElement,
    logEl: HTMLOListElement,
    titleEl: HTMLElement,
  ) {
    this.event = event;
    this.logEl = logEl;
    this.nativeName = getOwn(world.natives ?? {}, event.nativeId)?.name ?? event.nativeId;

    titleEl.textContent = `@${event.login} × ${this.nativeName}`;
    logEl.replaceChildren();
    panelEl.hidden = false;
    // A fight on the CURRENT beat opens the panel by itself - it is the one
    // thing happening in the world right now. Older ones stay discreet.
    if (event.tick === world.meta.tickCount) panelEl.open = true;
  }

  /** Index of the action currently on stage; actions.length when the replay is over. */
  private stepIndex(nowMs: number): number {
    if (this.startMs === null) this.startMs = nowMs;
    return Math.min(this.event.actions.length, Math.floor((nowMs - this.startMs) / STEP_MS));
  }

  /** Reveals log lines up to (and including) the current step; appends the outcome at the end. */
  private syncLog(step: number): void {
    while (this.revealed < Math.min(step + 1, this.event.actions.length)) {
      const action = this.event.actions[this.revealed]!;
      const item = document.createElement('li');
      item.className = 'combate-line';
      if (action.kind !== 'dodge') item.classList.add('combate-hit');
      item.textContent = actionLine(action, this.event, this.nativeName);
      this.logEl.appendChild(item);
      this.revealed++;
    }
    if (!this.outcomeShown && step >= this.event.actions.length) {
      const item = document.createElement('li');
      item.className = `combate-line combate-outcome combate-${this.event.outcome}`;
      item.textContent = outcomeLine(this.event, this.nativeName);
      this.logEl.appendChild(item);
      this.outcomeShown = true;
    }
  }

  /** Screen anchor (tile) for whoever `id` names, best-effort against the post-fight world. */
  private anchorFor(id: string): { x: number; y: number } | null {
    const native: Native | undefined = getOwn(this.world.natives ?? {}, this.event.nativeId);
    if (id === this.event.nativeId) return native?.position ?? null;
    const player: Player | undefined = getOwn(this.world.players, this.event.login);
    if (!player || !native) return player?.position ?? native?.position ?? null;
    // The world state holds the POST-fight position: after a defeat the
    // player has already respawned far away, but the blows landed beside the
    // Native - anchor there so the scene stays coherent.
    const dx = Math.abs(player.position.x - native.position.x);
    const dy = Math.abs(player.position.y - native.position.y);
    if (dx <= 2 && dy <= 2) return player.position;
    return { x: native.position.x, y: native.position.y + 1 };
  }

  /**
   * Draws the current step's effects. Called once per frame from
   * renderer.ts, after the world is painted. Also drives the DOM log so the
   * two surfaces cannot drift.
   */
  drawFx(ctx: CanvasRenderingContext2D, camera: Camera, nowMs: number): void {
    const step = this.stepIndex(nowMs);
    this.syncLog(step);
    if (step >= this.event.actions.length) return; // replay over - the log remains

    const action = this.event.actions[step]!;
    const progress = ((nowMs - (this.startMs ?? nowMs)) % STEP_MS) / STEP_MS;
    const anchor = this.anchorFor(action.target);
    if (!anchor) return;

    const x0 = camera.worldToScreenX(anchor.x * TILE_SIZE_PX);
    const x1 = camera.worldToScreenX((anchor.x + 1) * TILE_SIZE_PX);
    const y0 = camera.worldToScreenY(anchor.y * TILE_SIZE_PX);
    const y1 = camera.worldToScreenY((anchor.y + 1) * TILE_SIZE_PX);
    const cx = (x0 + x1) / 2;

    ctx.save();
    if (action.kind !== 'dodge') {
      // Slash: two quick diagonal strokes across the struck tile, fading out.
      ctx.globalAlpha = Math.max(0, 1 - progress * 1.6);
      ctx.strokeStyle = HIT_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + 2);
      ctx.lineTo(x1 - 2, y1 - 2);
      ctx.moveTo(x1 - 4, y0 + 3);
      ctx.lineTo(x0 + 4, y1 - 3);
      ctx.stroke();
    }

    // Floating number (or "esquiva"), rising and fading.
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.font = 'bold 11px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const text = action.kind === 'dodge' ? 'esquiva' : `−${action.damage}`;
    const floatY = y0 - 6 - progress * 14;
    ctx.fillStyle = '#2e222f';
    ctx.fillText(text, cx + 1, floatY + 1);
    ctx.fillStyle = action.kind === 'dodge' ? DODGE_COLOR : HIT_COLOR;
    ctx.fillText(text, cx, floatY);
    ctx.restore();
  }
}

/**
 * Wires the panel for the most recent fight, if any. Returns the replay the
 * render loop should drive, or null when there is nothing to show (panel
 * stays hidden).
 */
export function setupCombatReplay(
  world: World,
  panelEl: HTMLDetailsElement,
  titleEl: HTMLElement,
  logEl: HTMLOListElement,
): CombatReplay | null {
  const event = findRecentCombat(world);
  if (!event) {
    panelEl.hidden = true;
    return null;
  }
  return new CombatReplay(world, event, panelEl, logEl, titleEl);
}
