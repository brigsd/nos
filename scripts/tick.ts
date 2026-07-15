#!/usr/bin/env node
/**
 * scripts/tick.ts
 *
 * The tick entrypoint: loads world/heart.json, validates it, advances it to
 * "now" via engine/tick.ts's advanceWorld, validates the result, and writes
 * it back with the canonical serializer. Invoked by
 * .github/workflows/tick.yml on every cron/workflow_dispatch firing, and
 * locally via `npm run tick`.
 *
 * It also processes pending player commands from `pending_commands.json` if present
 * and writes the results to `command_results.json` for feedback.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceWorld } from '../engine/tick';
import { serializeWorld } from '../engine/serialize';
import { assertValidWorld } from '../engine/validate';
import { parseRawIssues } from '../engine/commands';
import type { Command } from '../engine/commands';
import { seedInitialNatives } from '../engine/mapgen';
import type { World } from '../engine/types';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.join(moduleDir, '..', 'world', 'heart.json');
const pendingCommandsPath = path.join(moduleDir, '..', 'pending_commands.json');
const commandResultsPath = path.join(moduleDir, '..', 'command_results.json');

/** Resolves "now" from a CLI arg, then TICK_NOW, then (only as a last resort) the real clock. */
function resolveNow(argv: readonly string[], env: NodeJS.ProcessEnv): number {
  const override = argv[2] ?? env['TICK_NOW'];
  if (override !== undefined && override !== '') {
    const parsed = Number(override);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid time override ${JSON.stringify(override)}: expected Unix seconds.`);
    }
    return Math.floor(parsed);
  }
  return Math.floor(Date.now() / 1000);
}

function main(): void {
  const raw: unknown = JSON.parse(readFileSync(worldPath, 'utf-8'));
  assertValidWorld(raw); // raw is now narrowed to World

  // One-time, additive, idempotent retrofit: a world saved before os
  // Nativos existed (like the live world/heart.json) gets gota/raiz/cinza
  // seeded in here, deterministically, without touching tickCount/players/
  // events. seedInitialNatives() is itself a no-op once world.natives is
  // populated, so this guard is just an (unnecessary but cheap) early-out -
  // never hand-edit world/heart.json to add this instead.
  let world: World = raw;
  const wasSeeded = !world.natives;
  if (wasSeeded) {
    world = seedInitialNatives(world);
    assertValidWorld(world); // gate the seeded state exactly like any tick output
  }

  let commands: Command[] = [];
  if (existsSync(pendingCommandsPath)) {
    try {
      const rawIssues = JSON.parse(readFileSync(pendingCommandsPath, 'utf-8'));
      if (Array.isArray(rawIssues)) {
        commands = parseRawIssues(rawIssues);
        console.log(`Loaded ${commands.length} pending command(s) from pending_commands.json`);
      }
    } catch (err) {
      console.error('Error reading pending_commands.json:', err);
    }
  }

  const tickCountBefore = world.meta.tickCount;
  const now = resolveNow(process.argv, process.env);
  const { world: result, commandResults } = advanceWorld(world, now, commands);

  assertValidWorld(result); // never write state the tick's own gate wouldn't accept

  writeFileSync(worldPath, serializeWorld(result), 'utf-8');

  // Update README stats
  updateReadme(result.meta.tickCount, Object.keys(result.players).length);

  // Write command results if we processed any
  if (commands.length > 0) {
    writeFileSync(commandResultsPath, JSON.stringify(commandResults, null, 2), 'utf-8');
    console.log(`Wrote ${commandResults.length} command result(s) to command_results.json`);
  }

  const processed = result.meta.tickCount - tickCountBefore;
  if (processed === 0) {
    // No new beat was due, but commands (if any) were still applied at the
    // current tick (issue #27 fix): the world may well have changed, so don't
    // claim it didn't. The commit step decides what actually needs pushing.
    const applied = commandResults.length;
    console.log(
      applied > 0
        ? `No new beat due - tick #${tickCountBefore} stands, but processed ${applied} between-beats command(s).` +
            (wasSeeded ? ' (Nativos seeded this run)' : '')
        : wasSeeded
          ? `Nativos semeados (gota, raiz, cinza) - tick #${tickCountBefore} stands, no new beat due yet.`
          : `No beat due yet - tick #${tickCountBefore} stands, world unchanged.`,
    );
    return;
  }

  const compensated = processed - 1;
  console.log(
    `Tick #${result.meta.tickCount}: processed ${processed} beat(s)` +
      (compensated > 0 ? ` (${compensated} compensated per D-19)` : '') +
      (wasSeeded ? ' (Nativos seeded this run)' : '') +
      ` - world time now ${result.meta.worldTime} min.`,
  );
}

function updateReadme(tickCount: number, playerCount: number): void {
  const readmePath = path.join(moduleDir, '..', 'README.md');
  if (!existsSync(readmePath)) return;
  try {
    const content = readFileSync(readmePath, 'utf-8');
    const statsString = `<!-- stats-start -->
### Status do Mundo

- 💓 **Batidas (Ticks):** \`${tickCount}\`
- 👥 **Jogadores Ativos:** \`${playerCount}\`
<!-- stats-end -->`;

    const updated = content.replace(
      /<!-- stats-start -->[\s\S]*<!-- stats-end -->/,
      statsString
    );
    writeFileSync(readmePath, updated, 'utf-8');
  } catch (err) {
    console.error('Failed to update README.md:', err);
  }
}

try {
  main();
} catch (err) {
  // Issue #28: last line of defense for the "Run world tick" Action step.
  // This deliberately does NOT mask the failure or write any fallback
  // state - a genuine state/seed/validation bug (corrupt world/heart.json,
  // assertValidWorld rejecting the input or the freshly-advanced result, a
  // bad TICK_NOW override, a disk write failure, ...) is real and must
  // still fail this step loudly (non-zero exit) so a human notices, same as
  // an unhandled throw always did. All this adds is richer context in the
  // log before that happens.
  console.error('FATAL: npm run tick failed. Nothing here retries or writes fallback state on top of it.');
  console.error(`  world file: ${worldPath}`);
  console.error(`  pending commands file present: ${existsSync(pendingCommandsPath)}`);
  console.error(err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err));
  process.exitCode = 1;
}
