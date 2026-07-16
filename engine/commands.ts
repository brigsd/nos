/**
 * engine/commands.ts
 *
 * Handles parsing, validation, and deterministic execution of player commands.
 * Commands are parsed from issue structures and executed sequentially,
 * updating the world state and producing feedback results.
 */

import type { World, Player, Position, WorldEvent, ResourceType } from './types';
import { STARTING_ENERGY, STARTING_PULSO, MAX_ENERGY, ACTIONS_PER_TICK, HABITANTES_CANONICOS, getOwn, getTile, tileIndex } from './types';
import { executeTrade, TRADE_ENERGY_COST, TRADE_RANGE_TILES } from './economy';
import { conversationReply, PLAYER_PROXIMITY_TILES } from './behavior';
import { attemptSynthesis, FABRICATION_RANGE_TILES, inMachinePhrase, itemLabel, SYNTHESIS_RECIPES } from './fabrication';
import { Rng } from './rng';

export { ACTIONS_PER_TICK };

export type CommandType = 'entrar' | 'mover' | 'coletar' | 'dizer' | 'trocar' | 'conversar' | 'sintetizar' | 'habitar';

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

/**
 * Parser for /trocar params from an issue-form markdown body ("### Nativo" /
 * "### Troca" headings), with a plain-text "trocar <nativo> <troca>"
 * fallback. Values are normalized to lowercase; anything beyond a simple
 * id-ish token fails to parse here (the handler re-validates both strings
 * via getOwn regardless - parsing is convenience, never the security gate).
 */
export function parseTrocarParams(body: string): { nativeId: string; tradeType: string } | null {
  const nativeMatch = body.match(/(?:### )?Nativo\s*[\r\n]+\s*([A-Za-z0-9_\-]+)/i);
  const tradeMatch = body.match(/(?:### )?Troca\s*[\r\n]+\s*([A-Za-z0-9_\-]+)/i);
  if (nativeMatch?.[1] && tradeMatch?.[1]) {
    return { nativeId: nativeMatch[1].trim().toLowerCase(), tradeType: tradeMatch[1].trim().toLowerCase() };
  }
  const words = body.trim().split(/\s+/);
  if (words.length >= 3 && words[0]?.toLowerCase().replace(/^\//, '') === 'trocar' && words[1] && words[2]) {
    return { nativeId: words[1].toLowerCase(), tradeType: words[2].toLowerCase() };
  }
  return null;
}

/**
 * Parser for the /conversar target from an issue-form markdown body
 * ("### Nativo" heading), with a plain-text "conversar <nativo>" fallback.
 * Normalized to lowercase; the handler re-validates via getOwn regardless -
 * parsing is convenience, never the security gate.
 */
export function parseConversarTarget(body: string): string | null {
  const match = body.match(/(?:### )?Nativo\s*[\r\n]+\s*([A-Za-z0-9_\-]+)/i);
  if (match?.[1]) {
    return match[1].trim().toLowerCase();
  }
  const words = body.trim().split(/\s+/);
  if (words.length >= 2 && words[0]?.toLowerCase().replace(/^\//, '') === 'conversar' && words[1]) {
    return words[1].toLowerCase();
  }
  return null;
}

/**
 * Parser for the /sintetizar recipe id from an issue-form markdown body
 * ("### Receita" heading), with a plain-text "sintetizar <receita>"
 * fallback. Normalized to lowercase; the handler re-validates via getOwn
 * regardless - parsing is convenience, never the security gate.
 */
export function parseSintetizarRecipe(body: string): string | null {
  const match = body.match(/(?:### )?Receita\s*[\r\n]+\s*([A-Za-z0-9_\-]+)/i);
  if (match?.[1]) {
    return match[1].trim().toLowerCase();
  }
  const words = body.trim().split(/\s+/);
  if (words.length >= 2 && words[0]?.toLowerCase().replace(/^\//, '') === 'sintetizar' && words[1]) {
    return words[1].toLowerCase();
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

/**
 * Habitantes (D-34): quem pode dirigir quais mentes via /habitar.
 * A "mão" dos Habitantes é um PAT do guardião (brigsd/nos-mentes posta a
 * issue com a conta dele) — allowlist DUPLA: o login precisa estar aqui, e
 * só pode falar pelos habitantes listados. Mudar isto é um PR auditável.
 */
export const MENTES_GUARDIAS: Record<string, readonly string[]> = {
  brigsd: HABITANTES_CANONICOS,
};
export const HABITAR_MAX_POR_TICK = 2;
export const HABITAR_MAX_MENSAGEM = 240;

/** Parser dos params de /habitar: aceita o formato de issue-form e o inline */
export function parseHabitarParams(body: string): { habitante: string; mensagem: string } | null {
  const hab = body.match(/(?:### )?Habitante\s*[\r\n]+\s*([a-z0-9_-]+)/i);
  const msg = body.match(/(?:### )?Mensagem\s*[\r\n]+([\s\S]+)/i);
  if (hab?.[1] && msg?.[1]) {
    return { habitante: hab[1].trim().toLowerCase(), mensagem: msg[1].trim() };
  }
  const inline = body.trim().match(/^\/?habitar\s+([a-z0-9_-]+)\s+([\s\S]+)/i);
  if (inline?.[1] && inline?.[2]) {
    return { habitante: inline[1].toLowerCase(), mensagem: inline[2].trim() };
  }
  return null;
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
    } else if (title.toLowerCase().startsWith('comando: /trocar') || title.toLowerCase().includes('/trocar')) {
      type = 'trocar';
      params = parseTrocarParams(body);
    } else if (title.toLowerCase().startsWith('comando: /conversar') || title.toLowerCase().includes('/conversar')) {
      type = 'conversar';
      params = parseConversarTarget(body);
    } else if (title.toLowerCase().startsWith('comando: /sintetizar') || title.toLowerCase().includes('/sintetizar')) {
      type = 'sintetizar';
      params = parseSintetizarRecipe(body);
    } else if (title.toLowerCase().startsWith('comando: /habitar') || title.toLowerCase().includes('/habitar')) {
      type = 'habitar';
      params = parseHabitarParams(body);
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
  // /habitar (Habitantes, D-34): a mente (brigsd/nos-mentes) dirige a FALA
  // de um habitante d'A Clareira. Roda antes do gate de jogador: tem
  // orçamento PRÓPRIO por habitante (não come as ações do guardião) e não
  // exige avatar — o habitante não é um Nó, é gente da cidade.
  if (cmd.type === 'habitar') {
    const permitidos = getOwn(MENTES_GUARDIAS, cmd.login);
    if (!permitidos) {
      return {
        world,
        result: { id: cmd.id, login: cmd.login, success: false, message: 'Falha: este login não guarda nenhuma mente (allowlist MENTES_GUARDIAS).' },
      };
    }
    const habitante = typeof cmd.params?.habitante === 'string' ? cmd.params.habitante.toLowerCase() : '';
    const mensagem = typeof cmd.params?.mensagem === 'string' ? cmd.params.mensagem.trim() : '';
    if (!permitidos.includes(habitante)) {
      return {
        world,
        result: { id: cmd.id, login: cmd.login, success: false, message: `Falha: habitante desconhecido ou fora da sua guarda: "${habitante}".` },
      };
    }
    if (!mensagem) {
      return {
        world,
        result: { id: cmd.id, login: cmd.login, success: false, message: 'Falha: mensagem ausente ou vazia (### Habitante / ### Mensagem no corpo).' },
      };
    }
    if (mensagem.length > HABITAR_MAX_MENSAGEM) {
      return {
        world,
        result: { id: cmd.id, login: cmd.login, success: false, message: `Falha: mensagem excede ${HABITAR_MAX_MENSAGEM} caracteres (${mensagem.length}).` },
      };
    }
    const budgetKey = `habitar:${habitante}`;
    const usado = actionCounts.get(budgetKey) || 0;
    if (usado >= HABITAR_MAX_POR_TICK) {
      return {
        world,
        result: { id: cmd.id, login: cmd.login, success: false, message: `Falha: ${habitante} já falou o bastante nesta batida (${HABITAR_MAX_POR_TICK}).` },
      };
    }
    actionCounts.set(budgetKey, usado + 1);
    const falaEvent: WorldEvent = {
      type: 'native_spoke',
      tick: currentTick,
      worldTime: currentWorldTime,
      nativeId: habitante,
      message: mensagem,
    };
    return {
      world: { ...world, events: [...world.events, falaEvent] },
      result: { id: cmd.id, login: cmd.login, success: true, message: `${habitante} falou n'A Clareira: "${mensagem}"` },
    };
  }

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
      pulso: STARTING_PULSO,
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

  if (cmd.type === 'trocar') {
    const params = cmd.params as { nativeId?: unknown; tradeType?: unknown } | null;
    if (!params || typeof params.nativeId !== 'string' || typeof params.tradeType !== 'string') {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: 'Falha: Parâmetros da troca ausentes ou inválidos (preencha Nativo e Troca).',
        },
      };
    }
    const { nativeId, tradeType } = params;

    // getOwn (issue #28): nativeId is player-supplied. A plain
    // world.natives[nativeId] would resolve "__proto__"/"constructor" to an
    // inherited built-in instead of "not found" - this is the exact v2
    // `/trocar __proto__` lockup bug, kept dead here by construction.
    const native = getOwn(world.natives, nativeId);
    if (!native) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Nenhum Nativo chamado "${nativeId}" habita O Coração.`,
        },
      };
    }

    if (player.energy < TRADE_ENERGY_COST) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Energia insuficiente para trocar (necessita de ${TRADE_ENERGY_COST}, você tem ${player.energy}).`,
        },
      };
    }

    // Same "near" radius the Nativos use to greet a player (behavior.ts) -
    // if they offer, the offer is valid.
    const dx = Math.abs(player.position.x - native.position.x);
    const dy = Math.abs(player.position.y - native.position.y);
    if (dx > TRADE_RANGE_TILES || dy > TRADE_RANGE_TILES) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message:
            `Falha: ${native.name} está longe demais para negociar (alcance de ${TRADE_RANGE_TILES} tiles). ` +
            `Você em (${player.position.x}, ${player.position.y}), ${native.name} em (${native.position.x}, ${native.position.y}).`,
        },
      };
    }

    const outcome = executeTrade(player, native, tradeType);
    if (!outcome.success) {
      return {
        world,
        result: { id: cmd.id, login: cmd.login, success: false, message: `Falha: ${outcome.message}` },
      };
    }

    const updatedPlayer: Player = {
      ...outcome.player,
      energy: player.energy - TRADE_ENERGY_COST,
    };

    const tradeEvent: WorldEvent = {
      type: 'trade_completed',
      tick: currentTick,
      worldTime: currentWorldTime,
      login: cmd.login,
      nativeId,
      given: outcome.given,
      received: outcome.received,
      pulsoDelta: outcome.pulsoDelta,
    };

    return {
      world: {
        ...world,
        players: { ...world.players, [cmd.login]: updatedPlayer },
        natives: { ...world.natives, [nativeId]: outcome.native },
        events: [...world.events, tradeEvent],
      },
      result: {
        id: cmd.id,
        login: cmd.login,
        success: true,
        message: `${outcome.message} Energia restante: ${updatedPlayer.energy}.`,
      },
    };
  }

  if (cmd.type === 'conversar') {
    const nativeId = cmd.params;
    if (typeof nativeId !== 'string' || nativeId.length === 0) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: 'Falha: Diga com qual Nativo você quer conversar (ex.: gota, raiz, cinza).',
        },
      };
    }

    // getOwn (issue #28): nativeId is player-supplied. A plain
    // world.natives[nativeId] would resolve "__proto__"/"constructor" to an
    // inherited built-in instead of "not found" - the exact class of the v2
    // lockup bug, kept dead here by construction.
    const native = getOwn(world.natives, nativeId);
    if (!native) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Nenhum Nativo chamado "${nativeId}" habita O Coração.`,
        },
      };
    }

    // Talking costs no energy (like /dizer) but does need presence: the same
    // radius in which a Native notices a player (behavior.ts).
    const dx = Math.abs(player.position.x - native.position.x);
    const dy = Math.abs(player.position.y - native.position.y);
    if (dx > PLAYER_PROXIMITY_TILES || dy > PLAYER_PROXIMITY_TILES) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message:
            `Falha: ${native.name} não te ouve daí (chegue a ${PLAYER_PROXIMITY_TILES} tiles). ` +
            `Você em (${player.position.x}, ${player.position.y}), ${native.name} em (${native.position.x}, ${native.position.y}).`,
        },
      };
    }

    // Deterministic per-event seed: world seed + issue number, the same
    // derivation family beatOnce uses for the Nativos (`seed-tick-N`). Same
    // world + same command => same reply, no matter when the tick runs.
    const rng = new Rng(`${world.meta.seed}-conversa-${cmd.id}`);
    const reply = conversationReply(native, player, rng);

    const repliedEvent: WorldEvent = {
      type: 'native_replied',
      tick: currentTick,
      worldTime: currentWorldTime,
      nativeId,
      login: cmd.login,
      message: reply,
    };

    return {
      world: { ...world, events: [...world.events, repliedEvent] },
      result: {
        id: cmd.id,
        login: cmd.login,
        success: true,
        message: `${native.name} responde: "${reply}"`,
      },
    };
  }

  if (cmd.type === 'sintetizar') {
    const recipeId = cmd.params;
    if (typeof recipeId !== 'string' || recipeId.length === 0) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: 'Falha: Diga qual receita você quer sintetizar (ex.: lanterna, peca_basica, carrinho_de_maos).',
        },
      };
    }

    // getOwn (issue #28): recipeId is player-supplied. A plain
    // SYNTHESIS_RECIPES[recipeId] would resolve "__proto__"/"constructor" to
    // an inherited built-in instead of "not found" - the exact class of the
    // v2 lockup bug, kept dead here by construction.
    const recipe = getOwn(SYNTHESIS_RECIPES, recipeId);
    if (!recipe) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Nenhuma receita chamada "${recipeId}" é conhecida pelas oficinas.`,
        },
      };
    }

    // getOwn again: recipe.machine is our own trusted data (not directly
    // player-controlled), but the lookup habit is the rule regardless
    // (same reasoning applies everywhere a string indexes a dictionary).
    const machine = getOwn(world.machines, recipe.machine);
    if (!machine) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: A oficina ainda não foi erguida n'O Coração - tente de novo após a próxima batida.`,
        },
      };
    }

    const dx = Math.abs(player.position.x - machine.position.x);
    const dy = Math.abs(player.position.y - machine.position.y);
    if (dx > FABRICATION_RANGE_TILES || dy > FABRICATION_RANGE_TILES) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message:
            `Falha: ${machine.name} está longe demais (alcance de ${FABRICATION_RANGE_TILES} tiles). ` +
            `Você em (${player.position.x}, ${player.position.y}), ${machine.name} em (${machine.position.x}, ${machine.position.y}).`,
        },
      };
    }

    if (player.energy < recipe.energyCost) {
      return {
        world,
        result: {
          id: cmd.id,
          login: cmd.login,
          success: false,
          message: `Falha: Energia insuficiente para sintetizar (necessita de ${recipe.energyCost}, você tem ${player.energy}).`,
        },
      };
    }

    const outcome = attemptSynthesis(player, recipeId);
    if (!outcome.success) {
      return {
        world,
        result: { id: cmd.id, login: cmd.login, success: false, message: `Falha: ${outcome.message}` },
      };
    }

    const updatedPlayer: Player = {
      ...outcome.player,
      energy: player.energy - recipe.energyCost,
    };

    const synthesizedEvent: WorldEvent = {
      type: 'item_synthesized',
      tick: currentTick,
      worldTime: currentWorldTime,
      login: cmd.login,
      machineId: recipe.machine,
      recipeId,
      output: outcome.output,
    };

    return {
      world: {
        ...world,
        players: { ...world.players, [cmd.login]: updatedPlayer },
        events: [...world.events, synthesizedEvent],
      },
      result: {
        id: cmd.id,
        login: cmd.login,
        success: true,
        message:
          `Sintetizado! Você recebeu ${outcome.output.quantity} ${itemLabel(outcome.output.itemId)} ${inMachinePhrase(recipe.machine)}. ` +
          `Energia restante: ${updatedPlayer.energy}.`,
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
