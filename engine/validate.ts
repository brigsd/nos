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

/** Structural check for "is this value shaped like a Position" - used to find position-bearing fields on any event, generically. */
function isPosition(value: unknown): value is Position {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number'
  );
}

/**
 * Field names that carry a Position on one or more WorldEvent variants today
 * (player_moved's from/to, resource_collected's position). Deliberately not
 * a per-event-type if/else: any current or future event whose payload has
 * one of these fields gets bounds-checked automatically - e.g. if
 * NativeSpokeEvent ever grows a `position`, or a v2.x event reuses `from`/
 * `to`, no new branch has to be added here.
 */
const EVENT_POSITION_FIELDS = ['position', 'from', 'to'] as const;

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

  // Os Nativos (v2, optional): same id-matches-its-map-key and in-bounds
  // checks as players above, so a Native is held to exactly the same
  // integrity bar a player is.
  for (const [id, native] of Object.entries(world.natives ?? {})) {
    if (native.id !== id) {
      errors.push(`natives["${id}"].id ("${native.id}") does not match its map key`);
    }
    const nativePositionError = boundsError(`natives["${id}"].position`, native.position, world);
    if (nativePositionError) errors.push(nativePositionError);
  }

  // A Fábrica's oficinas (v2.5, optional): same id-matches-its-map-key and
  // in-bounds checks as Nativos/players above.
  for (const [id, machine] of Object.entries(world.machines ?? {})) {
    if (machine.id !== id) {
      errors.push(`machines["${id}"].id ("${machine.id}") does not match its map key`);
    }
    const machinePositionError = boundsError(`machines["${id}"].position`, machine.position, world);
    if (machinePositionError) errors.push(machinePositionError);
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

    // Same idea as the login cross-check above, for the one event type that
    // references a Native instead of a Player (native_spoke).
    if ('nativeId' in event && !(event.nativeId in (world.natives ?? {}))) {
      errors.push(`${label}.nativeId ("${event.nativeId}") does not exist in natives`);
    }

    // Same idea again, for item_synthesized's machineId (A Fábrica, v2.5).
    if ('machineId' in event && !(event.machineId in (world.machines ?? {}))) {
      errors.push(`${label}.machineId ("${event.machineId}") does not exist in machines`);
    }

    // Generic position-bounds pass (see EVENT_POSITION_FIELDS above): the
    // schema already guarantees x/y are non-negative integers wherever they
    // appear, but only this layer knows the map's actual width/height.
    for (const field of EVENT_POSITION_FIELDS) {
      const value = (event as unknown as Record<string, unknown>)[field];
      if (isPosition(value)) {
        const positionError = boundsError(`${label}.${field}`, value, world);
        if (positionError) errors.push(positionError);
      }
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
