#!/usr/bin/env node
/**
 * scripts/validate-worlds.ts
 *
 * R6 fase 1 (Portais, D-17): validates the portal registry protocol's data
 * files - `worlds/registry.json` (shape only; it isn't a World, it's the
 * hall's own index) plus every other `worlds/*.json` world file (full
 * schema + semantic validation via engine/validate.ts's assertValidWorld -
 * the exact same gate `npm run validate-world` already runs against
 * world/heart.json, generalized here to the whole worlds/ directory instead
 * of one hardcoded path).
 *
 * Also cross-checks that every registry entry's `worldUrl`, when it names a
 * local file rather than an absolute http(s) URL (a future federated repo's
 * own raw URL), actually resolves to a file on disk - catches a typo'd path
 * at authoring time instead of a 404 in a player's browser.
 *
 * Invoked via `npm run validate-worlds` (see package.json). Deliberately not
 * wired into .github/workflows/ci.yml in this slice - workflows/ is out of
 * scope for this task; see docs/PORTALS_PROTOCOL.md for the follow-up.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidWorld } from '../engine/validate';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const worldsDir = path.join(moduleDir, '..', 'worlds');
const REGISTRY_FILE = 'registry.json';

interface PortalRegistryEntryLike {
  id?: unknown;
  name?: unknown;
  worldUrl?: unknown;
  clientHint?: unknown;
  status?: unknown;
  descriptionPtBR?: unknown;
}

function validateRegistryShape(raw: unknown, errors: string[]): void {
  if (!Array.isArray(raw)) {
    errors.push(`${REGISTRY_FILE}: expected a top-level array`);
    return;
  }

  const seenIds = new Set<string>();
  (raw as PortalRegistryEntryLike[]).forEach((entry, index) => {
    const label = `${REGISTRY_FILE}[${index}]`;

    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      errors.push(`${label}.id must be a non-empty string`);
    } else if (seenIds.has(entry.id)) {
      errors.push(`${label}.id ("${entry.id}") is duplicated`);
    } else {
      seenIds.add(entry.id);
    }

    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      errors.push(`${label}.name must be a non-empty string`);
    }
    if (typeof entry.descriptionPtBR !== 'string' || entry.descriptionPtBR.length === 0) {
      errors.push(`${label}.descriptionPtBR must be a non-empty string`);
    }
    if (entry.status !== 'aberto' && entry.status !== 'em_breve') {
      errors.push(`${label}.status must be "aberto" or "em_breve" (got ${JSON.stringify(entry.status)})`);
    }
    if (entry.worldUrl !== undefined && typeof entry.worldUrl !== 'string') {
      errors.push(`${label}.worldUrl must be a string when present`);
    }
    if (entry.clientHint !== undefined && typeof entry.clientHint !== 'string') {
      errors.push(`${label}.clientHint must be a string when present`);
    }
    if (entry.status === 'aberto' && !entry.worldUrl) {
      errors.push(`${label}: status "aberto" requires a worldUrl`);
    }
    if (typeof entry.worldUrl === 'string' && !/^https?:\/\//i.test(entry.worldUrl)) {
      const resolved = path.join(moduleDir, '..', entry.worldUrl);
      if (!existsSync(resolved)) {
        errors.push(
          `${label}.worldUrl ("${entry.worldUrl}") does not resolve to a file on disk (${path.relative(process.cwd(), resolved)})`,
        );
      }
    }
  });
}

function run(): void {
  const errors: string[] = [];

  const registryPath = path.join(worldsDir, REGISTRY_FILE);
  if (!existsSync(registryPath)) {
    console.error(`❌ ${REGISTRY_FILE} not found at ${registryPath}`);
    process.exit(1);
  }
  const registryRaw: unknown = JSON.parse(readFileSync(registryPath, 'utf-8'));
  validateRegistryShape(registryRaw, errors);

  const worldFiles = readdirSync(worldsDir).filter((f) => f.endsWith('.json') && f !== REGISTRY_FILE);
  if (worldFiles.length === 0) {
    errors.push(`no world files found in ${worldsDir} (besides ${REGISTRY_FILE})`);
  }

  for (const file of worldFiles) {
    const filePath = path.join(worldsDir, file);
    try {
      const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
      assertValidWorld(raw);
      console.log(`✅ worlds/${file} is a valid World`);
    } catch (err) {
      errors.push(`worlds/${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ worlds/ validation failed:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`\n✅ ${REGISTRY_FILE} and all ${worldFiles.length} world file(s) under worlds/ are valid.`);
}

run();
