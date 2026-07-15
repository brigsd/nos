/**
 * engine/tick.ts
 *
 * The Pulse (docs/GDD.md "O tick", D-11, D-19): advances a World by however
 * many beats are due at `nowUnixSeconds`. Pure and deterministic - time
 * always arrives as an explicit parameter; this module never reads the
 * system clock (see scripts/tick.ts for the one place that boundary is
 * allowed to be crossed).
 *
 * Each beat: +1 meta.tickCount, +WORLD_MINUTES_PER_TICK meta.worldTime, every
 * Native's behavior tree evaluated once (engine/natives.ts - a no-op until
 * `world.natives` is seeded, see engine/mapgen.ts's seedInitialNatives), and
 * one `core_pulse` event appended to the log. That event type already
 * exists in engine/types.ts ("O Núcleo bate a cada tick", GDD) - it was
 * reserved by T1 for exactly this, so no new event type is needed here.
 *
 * Scheduling model (D-19 self-correction):
 * Beats are anchored to a fixed genesis instant instead of a persisted
 * "last tick" timestamp, so no extra wall-clock field has to live in
 * WorldMeta/the schema. Beat N is due once real time reaches
 * `HEART_GENESIS_UNIX_SECONDS + N * TICK_INTERVAL_SECONDS`. Given the
 * current `tickCount` and `nowUnixSeconds`, the number of beats due is:
 *
 *   dueByNow       = floor((now - GENESIS) / TICK_INTERVAL_SECONDS)
 *   ticksToProcess = dueByNow - tickCount
 *
 * - 0  -> the world is already caught up (e.g. a workflow_dispatch fired a
 *         few minutes after the last cron beat) - advanceWorld is a no-op.
 * - 1  -> the common case: the cron fired on schedule.
 * - 2+ -> the cron was delayed or skipped one or more times; advanceWorld
 *         processes every missed beat in this one call (capped - see
 *         MAX_CATCHUP_TICKS below) instead of letting worldTime/tickCount
 *         silently drift away from real time.
 *
 * This only stays correct because every call that processes >=1 beat always
 * advances tickCount to exactly `dueByNow` (or the cap). So the next call's
 * `dueByNow - tickCount` is always a true count of NEW intervals that
 * started since the last confirmed beat, with nothing extra to persist.
 *
 * Callers that want to know how many beats a call processed (e.g. to log
 * D-19 compensation, or to build the `tick: batida #N` commit message) can
 * just diff `result.meta.tickCount - world.meta.tickCount`; a diff > 1
 * means (diff - 1) beats were compensated.
 */

import type { CorePulseEvent, World, WorldEvent } from './types';
import type { Command, CommandResult } from './commands';
import { processCommands } from './commands';
import { tickNatives } from './natives';

/**
 * Real-world seconds between two beats - matches the hourly cron in
 * .github/workflows/tick.yml (D-11, GDD "o tick").
 */
export const TICK_INTERVAL_SECONDS = 60 * 60;

/** Minutes of world-time a single beat advances (1 beat = 1 in-world hour). */
export const WORLD_MINUTES_PER_TICK = 60;

/**
 * Unix seconds (UTC) for 2026-07-14T00:00:00Z - the day every decision in
 * docs/DECISIONS.md was made and O Coração's "commit-primordial" seed was
 * born. The fixed anchor for tick scheduling (tick 0's instant); see the
 * module docs above. A constant, never Date.now().
 */
export const HEART_GENESIS_UNIX_SECONDS = 1_783_987_200;

/**
 * Hard cap on world.events: the oldest events are dropped once exceeded so
 * world/*.json (and every tick's diff) stays small forever, independent of
 * how long the world has been running (D-04's "constant cost per tick").
 */
export const MAX_EVENTS = 500;

/**
 * Safety cap on how many missed beats a single advanceWorld() call will
 * backfill (D-19). Keeps one tick job's work bounded and fast
 * (docs/ARCHITECTURE.md: "jobs de tick devem terminar em minutos") even if
 * the schedule were somehow dormant for a long stretch. Beats beyond the
 * cap are simply left for later calls to pick up - a world that's behind
 * self-heals a bit more on every subsequent invocation instead of one job
 * doing unbounded work.
 */
export const MAX_CATCHUP_TICKS = 24;

/** Appends `event`, trimming the oldest entries so the log never exceeds MAX_EVENTS. */
function appendEvent(events: readonly WorldEvent[], event: WorldEvent): WorldEvent[] {
  const kept = events.length >= MAX_EVENTS ? events.slice(events.length - MAX_EVENTS + 1) : events.slice();
  kept.push(event);
  return kept;
}

/** Applies exactly one beat: +1 tick, +WORLD_MINUTES_PER_TICK world-time, one Natives tick, one core_pulse event. */
function beatOnce(world: World): World {
  const tickCount = world.meta.tickCount + 1;
  const worldTime = world.meta.worldTime + WORLD_MINUTES_PER_TICK;

  // Os Nativos act once per beat, before the pulse that marks it official.
  // Sub-seed derived from the world's own seed + this beat's tick number -
  // deterministic, never Date.now()/Math.random().
  const tickSeed = `${world.meta.seed}-tick-${tickCount}`;

  // Issue #28: os Nativos run unattended on every single beat, forever - a
  // bug in a behavior tree must never be able to freeze the whole world.
  // If tickNatives throws, log it and skip the Nativos for this beat only;
  // the clock (tickCount/worldTime) and the core_pulse event below still
  // land exactly as if nothing had happened, and the next beat gets a fresh
  // chance to run them again.
  let worldAfterNatives = world;
  let nativeEvents: WorldEvent[] = [];
  try {
    const nativesResult = tickNatives(world, tickSeed, tickCount, worldTime);
    worldAfterNatives = nativesResult.world;
    nativeEvents = nativesResult.events;
  } catch (err) {
    console.error(`beatOnce: tickNatives threw on beat #${tickCount} - skipping os Nativos for this beat:`, err);
  }

  let events = worldAfterNatives.events;
  for (const nativeEvent of nativeEvents) {
    events = appendEvent(events, nativeEvent);
  }

  const pulse: CorePulseEvent = { type: 'core_pulse', tick: tickCount, worldTime };
  events = appendEvent(events, pulse);

  return {
    ...worldAfterNatives,
    meta: { ...worldAfterNatives.meta, tickCount, worldTime },
    events,
  };
}

/** How many beats are due at `nowUnixSeconds`, given `tickCount` have already happened. Never negative. */
function ticksDue(tickCount: number, nowUnixSeconds: number): number {
  const dueByNow = Math.floor((nowUnixSeconds - HEART_GENESIS_UNIX_SECONDS) / TICK_INTERVAL_SECONDS);
  return Math.max(0, dueByNow - tickCount);
}

export interface AdvanceWorldResult {
  world: World;
  commandResults: CommandResult[];
}

/**
 * Advances `world` to `nowUnixSeconds`, processing player commands on the first beat
 * and processing every beat that's due (capped at MAX_CATCHUP_TICKS per call).
 *
 * When no beat is due yet, returns the input world and empty command results.
 */
export function advanceWorld(
  world: World,
  nowUnixSeconds: number,
  commands: Command[] = []
): AdvanceWorldResult {
  const ticksToProcess = Math.min(ticksDue(world.meta.tickCount, nowUnixSeconds), MAX_CATCHUP_TICKS);

  if (ticksToProcess === 0) {
    return { world, commandResults: [] };
  }

  let next = world;
  let commandResults: CommandResult[] = [];

  // Process commands on the very first beat transition
  if (commands.length > 0) {
    const nextTick = world.meta.tickCount + 1;
    const nextWorldTime = world.meta.worldTime + WORLD_MINUTES_PER_TICK;
    const processed = processCommands(world, commands, nextTick, nextWorldTime);
    next = processed.world;
    commandResults = processed.results;
  }

  for (let i = 0; i < ticksToProcess; i++) {
    next = beatOnce(next);
  }

  return { world: next, commandResults };
}
