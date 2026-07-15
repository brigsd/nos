/**
 * engine/validate.ts
 *
 * The single gate between "some JSON" and "official world state". Every
 * write to world/*.json (mapgen output today, the tick output later) must
 * pass through here first. Invalid state must never be committed.
 *
 * Structural checks (types, enums, required fields, the resource/biome
 * correlation) live in engine/schema/world.schema.json and are enforced by
 * ajv. A handful of cross-field invariants that plain JSON Schema cannot
 * express (e.g. "tiles.length equals width * height") are checked here as a
 * second pass.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv, { type ErrorObject } from 'ajv';
import type { Position, World } from './types';
import { isInBounds } from './types';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(moduleDir, 'schema', 'world.schema.json');

/** The raw JSON Schema document, exposed for tooling/tests that want it directly. */
export const worldSchema: object = JSON.parse(readFileSync(schemaPath, 'utf-8')) as object;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(worldSchema);

export interface WorldValidationResult {
  valid: boolean;
  /** Human-readable (English) diagnostics; empty when `valid` is true. */
  errors: string[];
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return [];
  return errors.map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`.trim());
}

/**
 * Checks `position` against the map bounds of `world`. Returns a
 * human-readable error prefixed with `label` (e.g. `players["octocat"].position`
 * or `events[3].to`), or `null` when the position is in bounds.
 */
function boundsError(label: string, position: Position, world: World): string | null {
  if (isInBounds(position.x, position.y, world.width, world.height)) return null;
  return `${label} (${position.x}, ${position.y}) is out of bounds`;
}

/** Cross-field invariants the JSON Schema alone cannot express. */
function semanticErrors(world: World): string[] {
  const errors: string[] = [];
  const expectedTileCount = world.width * world.height;

  if (world.tiles.length !== expectedTileCount) {
    errors.push(
      `tiles.length (${world.tiles.length}) must equal width * height (${expectedTileCount})`,
    );
  }

  for (const [login, player] of Object.entries(world.players)) {
    if (player.login !== login) {
      errors.push(`players["${login}"].login ("${player.login}") does not match its map key`);
    }
    const playerPositionError = boundsError(`players["${login}"].position`, player.position, world);
    if (playerPositionError) errors.push(playerPositionError);
  }

  world.events.forEach((event, index) => {
    const label = `events[${index}] (${event.type})`;

    // Every event type except core_pulse carries the acting player's login;
    // it must still be a living player, the same way a comment/command from
    // a departed player would be. Catches events left dangling by a bug
    // upstream (e.g. a player removed without pruning their event history).
    if ('login' in event && !(event.login in world.players)) {
      errors.push(`${label}.login ("${event.login}") does not exist in players`);
    }

    // Position fields are only defined on these two event types (see
    // engine/types.ts); the schema already guarantees x/y are non-negative
    // integers, but only this layer knows the map's actual width/height.
    if (event.type === 'player_moved') {
      const fromError = boundsError(`${label}.from`, event.from, world);
      if (fromError) errors.push(fromError);
      const toError = boundsError(`${label}.to`, event.to, world);
      if (toError) errors.push(toError);
    } else if (event.type === 'resource_collected') {
      const positionError = boundsError(`${label}.position`, event.position, world);
      if (positionError) errors.push(positionError);
    }
  });

  return errors;
}

/** Validates unknown data against the world schema plus semantic invariants. */
export function validateWorld(data: unknown): WorldValidationResult {
  const structurallyValid = validateSchema(data);
  const errors = formatAjvErrors(validateSchema.errors);

  if (!structurallyValid) {
    return { valid: false, errors };
  }

  const semantic = semanticErrors(data as World);
  return { valid: semantic.length === 0, errors: [...errors, ...semantic] };
}

/** Throws with a readable message when `data` is not a valid World. */
export function assertValidWorld(data: unknown): asserts data is World {
  const result = validateWorld(data);
  if (!result.valid) {
    throw new Error(`Invalid world state:\n- ${result.errors.join('\n- ')}`);
  }
}
