/**
 * engine/commands.ts
 *
 * Handles parsing, validation, and deterministic execution of player commands.
 * Commands are parsed from issue structures and executed sequentially,
 * updating the world state and producing feedback results.
 */

import type { World, Player, Position, WorldEvent, ResourceType } from './types';
import { STARTING_ENERGY, MAX_ENERGY, getOwn, getTile, tileIndex } from './types';

export type CommandType = 'entrar' | 'mover' | 'coletar' | 'dizer';

export interface Command {
  id: number; // issue number
  login: string; // author login
  type: CommandType;
  params: any;
  createdAt: string; // ISO timestamp
}

export interface CommandResult {
  id: number;
  login: string;
  success: boolean;
  message: string;
}

export interface ProcessedCommandsResult {
  world: World;
  results: CommandResult[];
}

export const ACTIONS_PER_TICK = 3;
export const MOVE_ENERGY_COST = 1;
export const COLLECT_ENERGY_COST = 5;

/** Parser for coordinate variables from markdown body */
export function parseMoverCoords(body: string): { x: number; y: number } | null {
  const xMatch = body.match(/(?:Coordenada X|X|### X)\s*[\r\n]+([0-9\-]+)/i);
  const yMatch = body.match(/(?:Coordenada Y|Y|### Y)\s*[\r\n]+([0-9\-]+)/i);
  if (xMatch && yMatch && xMatch[1] && yMatch[1]) {
    return { x: parseInt(xMatch[1], 10), y: parseInt(yMatch[1], 10) };
  }
  const nums = body.match(/-?\d+/g);
  if (nums && nums.length >= 2 && nums[0] && nums[1]) {
    return { x: parseInt(nums[0], 10), y: parseInt(nums[1], 10) };
  }
  return null;
}

/** Parser for message text from markdown body */
export function parseDizerMessage(body: string): string {
  const match = body.match(/(?:Mensagem|### Mensagem)\s*[\r\n]+([\s\S]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return body.trim();
}

/** Parses raw issue objects from GitHub API into Command structures */
export function parseRawIssues(rawIssues: any[]): Command[] {
  const commands: Command[] = [];

  for (const issue of rawIssues) {
    const title = (issue.title || '').trim();
    const body = issue.body || '';
    const login = issue.author?.login || issue.user?.login;
    const createdAt = issue.createdAt || issue.created_at;

    if (!login || !createdAt) continue;

    let type: CommandType | null = null;
    let params: any = null;

    if (title.toLowerCase().startsWith('comando: /entrar') || title.toLowerCase().includes('/entrar')) {
      type = 'entrar';
    } else if (title.toLowerCase().startsWith('comando: /mover') || title.toLowerCase().includes('/mover')) {
      type = 'mover';
      params = parseMoverCoords(body);
    } else if (title.toLowerCase().startsWith('comando: /coletar') || title.toLowerCase().includes('/coletar')) {
      type = 'coletar';
    } else if (title.toLowerCase().startsWith('comando: /dizer') || title.toLowerCase().includes('/dizer')) {
      type = 'dizer';
      params = parseDizerMessage(body);
    }

    if (type) {
      commands.push({
        id: issue.number,
        login,
        type,
        params,
        createdAt,
      });
    }
  }

  return commands;
}

/** Applies a single command to the world state. Pure and deterministic. */
export function applyCommand(
  world: World,
  cmd: Command,
  actionCounts: Map<string, number>,
  currentTick: number,
  currentWorldTime: number
): { world: World; result: CommandResult } {
  const count = actionCounts.get(cmd.login) || 0;
  if (count >= ACTIONS_PER_TICK) {
    return {
      world,
      result: {
        id: cmd.id,
        login: cmd.login,
        success: false,
        message: `Comando rejeitado: limite de ${ACTIONS_PER_TICK} ações por jogador por tick excedido.`,
      },
    };
  }
  actionCounts.set(cmd.login, count + 1);

  // getOwn (issue #28): cmd.login is player-supplied. A plain
  // world.players[cmd.login] would resolve hostile keys like "__proto__" or
  // "constructor" to an inherited Object.prototype built-in (truthy, but
  // shaped nothing like a Player) instead of "not found" - getOwn collapses
  // that to a clean `undefined`, same as any other absent player.
  const player = getOwn(world.players, cmd.login);

  if (cmd.type === 'entrar') {
    if (player) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: 'Falha: Você já entrou no mundo anteriormente.',
        },
      };
    }

    const spawnPos: Position = { x: 30, y: 30 };
    const newPlayer: Player = {
      login: cmd.login,
      position: spawnPos,
      inventory: {},
      energy: STARTING_ENERGY,
    };

    const joinEvent: WorldEvent = {
      type: 'player_joined',
      tick: currentTick,
      worldTime: currentWorldTime,
      login: cmd.login,
    };

    const nextPlayers = { ...world.players, [cmd.login]: newPlayer };
    const nextEvents = [...world.events, joinEvent];

    return {
      world: { ...world, players: nextPlayers, events: nextEvents },
      result: {
        id: cmd.id,
        login: cmd.login,
        success: true,
        message: `Bem-vindo ao Coração! Seu avatar foi criado com sucesso em (${spawnPos.x}, ${spawnPos.y}).`,
      },
    };
  }

  // All other commands require the player to exist
  if (!player) {
    return {
      world,
      result: {
        id: cmd.id,
        login: cmd.login,
        success: false,
        message: 'Falha: Você precisa entrar no mundo primeiro utilizando o comando /entrar.',
      },
    };
  }

  if (cmd.type === 'mover') {
    const coords = cmd.params;
    if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: 'Falha: Coordenadas de destino inválidas ou ausentes.',
        },
      };
    }

    if (player.energy < MOVE_ENERGY_COST) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Energia insuficiente para mover (necessita de ${MOVE_ENERGY_COST}, você tem ${player.energy}).`,
        },
      };
    }

    const tile = getTile(world, coords.x, coords.y);
    if (!tile || tile.biome === 'water') {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: 'Falha: O local de destino é inválido ou intransponível (água/fora do mapa).',
        },
      };
    }

    // adjacency check
    const dx = Math.abs(coords.x - player.position.x);
    const dy = Math.abs(coords.y - player.position.y);
    if (dx > 1 || dy > 1) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Você só pode se mover 1 tile por ação (tentou ir de (${player.position.x}, ${player.position.y}) para (${coords.x}, ${coords.y})).`,
        },
      };
    }

    const moveEvent: WorldEvent = {
      type: 'player_moved',
      tick: currentTick,
      worldTime: currentWorldTime,
      login: cmd.login,
      from: player.position,
      to: coords,
    };

    const updatedPlayer: Player = {
      ...player,
      position: coords,
      energy: player.energy - MOVE_ENERGY_COST,
    };

    const nextPlayers = { ...world.players, [cmd.login]: updatedPlayer };
    const nextEvents = [...world.events, moveEvent];

    return {
      world: { ...world, players: nextPlayers, events: nextEvents },
      result: {
        id: cmd.id,
        login: cmd.login,
        success: true,
        message: `Movido com sucesso de (${player.position.x}, ${player.position.y}) para (${coords.x}, ${coords.y}). Energia restante: ${updatedPlayer.energy}.`,
      },
    };
  }

  if (cmd.type === 'coletar') {
    if (player.energy < COLLECT_ENERGY_COST) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Energia insuficiente para coletar (necessita de ${COLLECT_ENERGY_COST}, você tem ${player.energy}).`,
        },
      };
    }

    const idx = tileIndex(player.position.x, player.position.y, world.width);
    const tile = world.tiles[idx];
    if (!tile || !tile.resource) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Não há recursos disponíveis para coletar na sua posição atual (${player.position.x}, ${player.position.y}).`,
        },
      };
    }

    const resource = tile.resource;
    const collectEvent: WorldEvent = {
      type: 'resource_collected',
      tick: currentTick,
      worldTime: currentWorldTime,
      login: cmd.login,
      resource,
      quantity: 1,
      position: player.position,
    };

    const nextInventory = { ...player.inventory };
    nextInventory[resource] = (nextInventory[resource] || 0) + 1;

    const updatedPlayer: Player = {
      ...player,
      inventory: nextInventory,
      energy: player.energy - COLLECT_ENERGY_COST,
    };

    // Remove resource from world tile
    const nextTiles = [...world.tiles];
    nextTiles[idx] = { ...tile, resource: undefined };

    const nextPlayers = { ...world.players, [cmd.login]: updatedPlayer };
    const nextEvents = [...world.events, collectEvent];

    return {
      world: { ...world, tiles: nextTiles, players: nextPlayers, events: nextEvents },
      result: {
        id: cmd.id,
        login: cmd.login,
        success: true,
        message: `Coleta efetuada! Adicionado 1x ${resource} ao seu inventário. Energia restante: ${updatedPlayer.energy}.`,
      },
    };
  }

  if (cmd.type === 'dizer') {
    const msg = (cmd.params || '').trim();
    if (!msg) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: 'Falha: Mensagem de texto ausente ou vazia.',
        },
      };
    }

    if (msg.length > 280) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Mensagem excede o limite máximo de 280 caracteres (comprimento atual: ${msg.length}).`,
        },
      };
    }

    const speakEvent: WorldEvent = {
      type: 'player_said',
      tick: currentTick,
      worldTime: currentWorldTime,
      login: cmd.login,
      message: msg,
    };

    const nextEvents = [...world.events, speakEvent];

    return {
      world: { ...world, events: nextEvents },
      result: {
        id: cmd.id,
        login: cmd.login,
        success: true,
        message: 'Fala publicada no mural do mundo.',
      },
    };
  }

  return {
    world,
    result: {
      id: cmd.id,
      login: cmd.login,
      success: false,
      message: 'Falha: Tipo de comando desconhecido.',
    },
  };
}

/**
 * Processes a batch of commands sequentially. Sorting is deterministic.
 *
 * `applyCommandFn` defaults to the real `applyCommand` and exists as a test
 * seam only (issue #28): it lets tests inject a handler that throws, to
 * prove the per-command try/catch below actually isolates a bad command
 * without a real throwing code path having to exist in `applyCommand` today.
 * No production caller ever passes it.
 */
export function processCommands(
  world: World,
  commands: Command[],
  tickNum: number,
  worldTime: number,
  applyCommandFn: typeof applyCommand = applyCommand,
): ProcessedCommandsResult {
  // Sort by time, then issue id
  const sorted = [...commands].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });

  const actionCounts = new Map<string, number>();
  const results: CommandResult[] = [];
  let currentWorld = world;

  for (const cmd of sorted) {
    // Issue #28: a command handler is untrusted-input surface. If
    // applyCommand throws for any reason, the world is left exactly as it
    // was before this command (currentWorld is simply not reassigned), the
    // offending command still gets a failure CommandResult - so
    // scripts/respond-issues.ts can comment on and close its issue,
    // breaking the "issue never closes -> reappears every tick -> tick
    // jams forever" loop - and the loop continues with the rest of the
    // batch. One bad command must never be able to take down the whole
    // tick.
    try {
      const { world: nextWorld, result } = applyCommandFn(
        currentWorld,
        cmd,
        actionCounts,
        tickNum,
        worldTime
      );
      currentWorld = nextWorld;
      results.push(result);
    } catch (err) {
      console.error(
        `processCommands: applyCommand threw for command #${cmd.id} (${cmd.type} by ${cmd.login}) - skipping it, world left unchanged for this command:`,
        err,
      );
      results.push({
        id: cmd.id,
        login: cmd.login,
        success: false,
        message: 'Falha inesperada ao processar este comando.',
      });
    }
  }

  return {
    world: currentWorld,
    results,
  };
}
