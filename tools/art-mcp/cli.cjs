#!/usr/bin/env node
'use strict';
/**
 * CLI fallback for the art toolkit — same functions as the MCP server, for
 * shells and CI. Usage:
 *
 *   node tools/art-mcp/cli.cjs gen --preset tijolo_rubro --size 64 --seed x
 *   node tools/art-mcp/cli.cjs audit --src caminho.json [--tileable]
 *   node tools/art-mcp/cli.cjs view --src caminho.json [--scale 8]
 *   node tools/art-mcp/cli.cjs tiled --src caminho.json
 *   node tools/art-mcp/cli.cjs preview --wall parede.json [--floor chao.json] [--billboard b.json]
 *   node tools/art-mcp/cli.cjs sheet --dir assets/sprites/src
 *   node tools/art-mcp/cli.cjs diff --before a.json --after b.json
 *   node tools/art-mcp/cli.cjs turnaround [--figure boneco.json]
 *   node tools/art-mcp/cli.cjs presets
 */

const toolkit = require('./toolkit.cjs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = /^-?\d+(\.\d+)?$/.test(next) ? Number(next) : next;
      i++;
    }
  }
  return args;
}

const [cmd, ...rest] = process.argv.slice(2);
const a = parseArgs(rest);

const commands = {
  gen: () =>
    toolkit.genTexture({
      preset: a.preset,
      params: { ...(a.size ? { size: a.size } : {}), ...(a.seed ? { seed: String(a.seed) } : {}), ...(a.name ? { name: String(a.name) } : {}) },
      srcOut: a.srcOut,
      viewOut: a.viewOut,
    }),
  audit: () => toolkit.auditSprite({ src: a.src, tileable: a.tileable === true ? true : undefined }),
  view: () => toolkit.viewSprite({ src: a.src, scale: a.scale, out: a.out }),
  tiled: () => toolkit.viewTiled({ src: a.src, out: a.out }),
  preview: () => toolkit.previewScene({ wall: a.wall, floor: a.floor, billboard: a.billboard, out: a.out }),
  sheet: () => toolkit.sheet({ dir: a.dir, out: a.out, scale: a.scale }),
  diff: () => toolkit.diff({ before: a.before, after: a.after, out: a.out }),
  turnaround: () => toolkit.turnaround({ figure: a.figure, viewSize: a.viewSize, scale: a.scale, out: a.out }),
  presets: () => toolkit.listPresets(),
};

if (!cmd || !commands[cmd]) {
  console.error(`comando desconhecido: ${cmd ?? '(nenhum)'} — tem: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}

const result = commands[cmd]();
console.log(JSON.stringify(result, null, 2));
// audit gate for CI: exit 1 on any error-level finding
const findings = result.findings ?? [];
if (findings.some((f) => f.level === 'error')) process.exit(1);
