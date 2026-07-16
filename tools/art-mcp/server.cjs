#!/usr/bin/env node
'use strict';
/**
 * Minimal MCP (Model Context Protocol) server over stdio — zero npm deps,
 * same constraint as the rest of assets/tools. Speaks JSON-RPC 2.0, one
 * message per line (MCP stdio framing). Exposes the art toolkit as typed
 * tools so any MCP-capable agent (Claude Code picks it up via .mcp.json)
 * can author -> render -> audit -> iterate without shell plumbing.
 *
 * Protocol surface implemented: initialize, notifications/initialized,
 * tools/list, tools/call, ping. That is the complete flow Claude Code uses
 * for a local stdio tool server.
 */

const readline = require('readline');
const toolkit = require('./toolkit.cjs');

const PROTOCOL_VERSION = '2024-11-05';

const TOOLS = [
  {
    name: 'gen_texture',
    description:
      'Gera uma textura de parede FPS tileável (paleta do projeto) a partir de um preset paramétrico + overrides. Grava sprite-src JSON + view 3x3 e devolve os achados da auditoria. Presets: ' +
      Object.keys(toolkit.listPresets()).join(', '),
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', description: 'nome do preset (ver lista) — omita para params totalmente custom' },
        params: { type: 'object', description: 'overrides: size, seed, ramp, baseFreq, octaves, contrast, dither, bricks, grain, cracks, name' },
        srcOut: { type: 'string', description: 'caminho do sprite-src JSON de saída (opcional)' },
        viewOut: { type: 'string', description: 'caminho do PNG 3x3 de saída (opcional)' },
      },
    },
    handler: toolkit.genTexture,
  },
  {
    name: 'audit_sprite',
    description: 'Roda o crítico algorítmico (paleta, costuras, órfãos, banding, silhueta) num sprite-src JSON. Erros = bloqueia; warns = julgamento.',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string', description: 'caminho do sprite-src JSON' },
        tileable: { type: 'boolean', description: 'força checagem de costura (default: kinds wall/tile)' },
      },
      required: ['src'],
    },
    handler: toolkit.auditSprite,
  },
  {
    name: 'view_sprite',
    description: 'Render ampliado para o olho multimodal: cada frame Nx sobre fundo escuro E claro, grid de pixels, legenda da paleta usada. LEIA o PNG devolvido.',
    inputSchema: {
      type: 'object',
      properties: {
        src: { type: 'string' },
        scale: { type: 'number', description: 'ampliação (default 8)' },
        out: { type: 'string' },
      },
      required: ['src'],
    },
    handler: toolkit.viewSprite,
  },
  {
    name: 'view_tiled',
    description: 'Render 3x3 do wrap de uma textura tileável — costura aparece como linha. LEIA o PNG devolvido.',
    inputSchema: { type: 'object', properties: { src: { type: 'string' }, out: { type: 'string' } }, required: ['src'] },
    handler: toolkit.viewTiled,
  },
  {
    name: 'preview_scene',
    description:
      'Preview IN-ENGINE: renderiza parede/chão/billboard candidatos no corredor de auditoria com a matemática exata do protótipo FPS (DDA, floor casting, fog, shade). Como o jogador veria. LEIA o PNG devolvido.',
    inputSchema: {
      type: 'object',
      properties: {
        wall: { type: 'string', description: 'sprite-src da textura de parede (obrigatório)' },
        floor: { type: 'string', description: 'sprite-src do chão (opcional)' },
        billboard: { type: 'string', description: 'sprite-src do billboard, testado em 3 distâncias (opcional)' },
        out: { type: 'string' },
      },
      required: ['wall'],
    },
    handler: toolkit.previewScene,
  },
  {
    name: 'contact_sheet',
    description: 'Folha de contato de todos os sprite-src de um diretório — julgue consistência de estilo numa tela só. LEIA o PNG devolvido.',
    inputSchema: {
      type: 'object',
      properties: { dir: { type: 'string' }, out: { type: 'string' }, scale: { type: 'number' } },
      required: ['dir'],
    },
    handler: toolkit.sheet,
  },
  {
    name: 'diff_sprites',
    description: 'Antes/depois lado a lado + heatmap vermelho dos pixels alterados. Para revisar retoques. LEIA o PNG devolvido.',
    inputSchema: {
      type: 'object',
      properties: { before: { type: 'string' }, after: { type: 'string' }, out: { type: 'string' } },
      required: ['before', 'after'],
    },
    handler: toolkit.diff,
  },
  {
    name: 'turnaround',
    description:
      'Andaime de 8 direções: rasteriza um boneco-de-caixas (JSON de figura ou humanoide default) em S/SO/O/NO/N/NE/L/SE com luz fixa. Pinte pixel art POR CIMA de cada vista — anatomia e luz já consistentes. LEIA o PNG devolvido.',
    inputSchema: {
      type: 'object',
      properties: {
        figure: { type: 'string', description: 'caminho de um JSON {name, boxes:[{c,s,color}]} (opcional; default humanoide)' },
        viewSize: { type: 'number' },
        scale: { type: 'number' },
        out: { type: 'string' },
      },
    },
    handler: toolkit.turnaround,
  },
  {
    name: 'list_presets',
    description: 'Lista os presets de textura disponíveis com uma nota de intenção de cada um.',
    inputSchema: { type: 'object', properties: {} },
    handler: toolkit.listPresets,
  },
];

/* ---------- JSON-RPC over stdio, one message per line ---------- */

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // not JSON: ignore (robustness against stray output)
  }
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'nos-art-toolkit', version: '0.1.0' },
      });
    } else if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      // notifications carry no id and expect no reply
    } else if (method === 'ping') {
      reply(id, {});
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    } else if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        replyError(id, -32602, `tool desconhecida: ${params?.name}`);
        return;
      }
      const result = tool.handler(params?.arguments ?? {});
      reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } else if (id !== undefined) {
      replyError(id, -32601, `método não suportado: ${method}`);
    }
  } catch (err) {
    if (id !== undefined) {
      reply(id, { content: [{ type: 'text', text: `ERRO: ${err.message}` }], isError: true });
    }
  }
});
