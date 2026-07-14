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
import type { World } from './types';

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
    if (
      player.position.x < 0 ||
      player.position.x >= world.width ||
      player.position.y < 0 ||
      player.position.y >= world.height
    ) {
      errors.push(
        `players["${login}"].position (${player.position.x}, ${player.position.y}) is out of bounds`,
      );
    }
  }

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
