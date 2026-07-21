/* validate-world: carrega world/heart.json e roda assertValidWorld — o gate de sanidade do estado do mundo. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidWorld } from '../validate';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(moduleDir, '..', '..', 'world', 'heart.json');

try {
  const raw: unknown = JSON.parse(readFileSync(worldPath, 'utf-8'));
  assertValidWorld(raw);
  console.log('✅ world/heart.json is valid!');
  process.exit(0);
} catch (err: any) {
  console.error('❌ world/heart.json validation failed:', err.message);
  process.exit(1);
}
