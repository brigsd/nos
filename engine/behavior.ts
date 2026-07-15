/**
 * engine/behavior.ts
 *
 * Deterministic Behavior Tree (BT) evaluator for os Nativos (NPCs, v2).
 * Pure and deterministic: every random choice is drawn from the `Rng`
 * instance passed in by the caller (engine/natives.ts) - never
 * Date.now()/Math.random() (see docs/ARCHITECTURE.md, principle 4).
 *
 * A behavior tree is a small, data-described decision graph:
 *  - `selector`  runs its children in order, stops at the first success.
 *  - `sequence`  runs its children in order, stops at the first failure.
 *  - `condition` a pure boolean check against world/native state.
 *  - `action`    the only node type allowed to change the world or emit
 *                events.
 *
 * Falas (dialogue) are scripted pt-BR strings, not an LLM call - v2 sem LLM
 * em runtime (docs/GDD.md "NPCs", docs/DECISIONS.md D-09). D-15's GitHub
 * Models integration is a later, optional v2.5 layer on top of this.
 */

import type { Native, NativeSpokeEvent, Player, Position, World, WorldEvent } from './types';
import { NATIVE_MESSAGE_MAX_LENGTH, RESOURCE_TYPES, getOwn, getTile } from './types';
import type { Rng } from './rng';

export type BTNodeStatus = 'success' | 'failure';

export interface BTNode {
  type: 'sequence' | 'selector' | 'condition' | 'action';
  name: string;
  children?: BTNode[];
  conditionName?: string;
  actionName?: string;
}

export interface BTEvalResult {
  status: BTNodeStatus;
  world: World;
  events: WorldEvent[];
}

/** Chebyshev-distance (tiles) within which a player counts as "near" a Native. */
export const PLAYER_PROXIMITY_TILES = 3;

/** Beats a Native must wait after speaking before it can speak again. */
export const DIALOGUE_COOLDOWN_TICKS = 10;

/**
 * Home tile per Native id. Currently only consulted by the `merchant` and
 * `guardian` trees' "go home when no player is around" branch - kept keyed
 * by id (not faction) so each of the 3 Nativos can eventually get a
 * bespoke home independent of their archetype.
 */
export const NPC_HOMES: Record<string, Position> = {
  gota: { x: 0, y: 0 },
  raiz: { x: 43, y: 6 },
  cinza: { x: 25, y: 8 },
};

/** Scripted (non-LLM) dialogue pools, keyed by action name. See docs/LORE.md for tone/lexicon. */
export const DIALOGUES: Record<string, string[]> = {
  say_lore: [
    'O rio estava mais largo antes.',
    'O Núcleo bate, e nós andamos.',
    'Ouvi dizer que o Coração nem sempre foi assim.',
  ],
  say_greeting: [
    'Trago coisas da floresta. Quer trocar?',
    'Preciso de fragmentos de pulso.',
    'Madeira por pedra? Ou talvez algo mais valioso?',
  ],
  say_warning: [
    'As pedras lembram. Você não.',
    'Não se aproxime das ruínas profundas sem cuidado.',
    'O Detached Head vigia de longe.',
  ],
};

// ---------------------------------------------------------------------------
// Conversas (v2 "interação leve"): scripted replies for /conversar. Unlike
// DIALOGUES above (autonomous small talk the trees emit on their own beat),
// these are ANSWERS - a Native responding to a specific player who walked up
// and spoke to it. Same rules: pt-BR, LORE voice, no LLM in runtime (D-09).
// ---------------------------------------------------------------------------

/** Reply pools keyed by Native id, so each of the three keeps their own voice. */
export const CONVERSATION_REPLIES: Record<string, string[]> = {
  gota: [
    'Você fala como quem chegou faz pouco. Todos chegam.',
    'O rio muda de ideia a cada batida. Eu só acompanho.',
    'Se procura o começo, procure o Commit Primordial. Ninguém achou ainda.',
    'Eu já fui mais longe. O mapa acabou antes de mim.',
    'Anda comigo um pouco. O Coração é menor a dois.',
  ],
  raiz: [
    'Conversa é de graça. O resto tem preço.',
    'Trago madeira da floresta funda. Fragmentos abrem meu melhor estoque.',
    'Os Nós sempre querem falar do mundo. Eu prefiro falar de troca.',
    'A floresta dá, a floresta toma. Eu só faço a ponte.',
  ],
  cinza: [
    'As ruínas não gostam de pergunta. Eu respondo por elas.',
    'Vigio o que restou. Alguém precisa.',
    'Não desça onde a pedra escurece. O Detached Head não conversa.',
    'Você grava tudo, eu sei. As pedras também.',
  ],
};

/** What a Native with no pool of its own says - a future Nativo degrades to terse, never to a crash. */
export const CONVERSATION_FALLBACK_REPLIES: string[] = [
  'Hm.',
  'O vento responde por mim.',
];

/** Extra line a merchant drops when the player's pack isn't empty - a nudge toward a future trade. */
export const MERCHANT_BAG_REPLY = 'Sua mochila faz barulho. Isso se resolve com uma troca.';

/**
 * Picks the line `native` answers `player` with. Deterministic: every draw
 * comes from the caller's `rng` (engine/commands.ts seeds it per event from
 * the world seed + issue number), so the same conversation always lands the
 * same words. The pool lookup goes through getOwn out of habit - `native.id`
 * comes from validated world state today, but this function must stay safe
 * even if a future caller hands it something player-shaped.
 */
export function conversationReply(native: Native, player: Player, rng: Rng): string {
  const pool = [...(getOwn(CONVERSATION_REPLIES, native.id) ?? CONVERSATION_FALLBACK_REPLIES)];
  const carriesSomething = RESOURCE_TYPES.some((resource) => (player.inventory[resource] ?? 0) > 0);
  if (native.faction === 'merchant' && carriesSomething) {
    pool.push(MERCHANT_BAG_REPLY);
  }
  const line = pool[rng.nextInt(0, pool.length - 1)] ?? CONVERSATION_FALLBACK_REPLIES[0]!;
  return line.slice(0, NATIVE_MESSAGE_MAX_LENGTH);
}

/** Shape used to persist a Native's small scratch state across beats (Native.behaviorState, JSON-encoded). */
interface BehaviorState {
  lastSpokenTick?: number;
}

function parseBehaviorState(raw: string): BehaviorState {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as BehaviorState) : {};
  } catch {
    return {};
  }
}

/** Evaluates a BT node for a given Native. Returns status, the (possibly updated) world, and any emitted events. */
export function evaluateBTNode(
  node: BTNode,
  nativeId: string,
  world: World,
  rng: Rng,
  tickNum: number,
  worldTime: number,
): BTEvalResult {
  const native = world.natives?.[nativeId];
  if (!native) {
    return { status: 'failure', world, events: [] };
  }

  if (node.type === 'selector') {
    let currentWorld = world;
    for (const child of node.children ?? []) {
      const result = evaluateBTNode(child, nativeId, currentWorld, rng, tickNum, worldTime);
      if (result.status === 'success') {
        return result;
      }
      // Failed: fall through to the next selector child, carrying forward
      // whatever (non-)changes the failed child already made.
      currentWorld = result.world;
    }
    return { status: 'failure', world: currentWorld, events: [] };
  }

  if (node.type === 'sequence') {
    let accumulatedEvents: WorldEvent[] = [];
    let currentWorld = world;
    for (const child of node.children ?? []) {
      const result = evaluateBTNode(child, nativeId, currentWorld, rng, tickNum, worldTime);
      accumulatedEvents = [...accumulatedEvents, ...result.events];
      currentWorld = result.world;
      if (result.status === 'failure') {
        return { status: 'failure', world: currentWorld, events: accumulatedEvents };
      }
    }
    return { status: 'success', world: currentWorld, events: accumulatedEvents };
  }

  if (node.type === 'condition') {
    const success = evaluateCondition(node.conditionName ?? '', native, world);
    return { status: success ? 'success' : 'failure', world, events: [] };
  }

  if (node.type === 'action') {
    return executeAction(node.actionName ?? '', native, world, rng, tickNum, worldTime);
  }

  return { status: 'failure', world, events: [] };
}

/** Pure boolean checks a `condition` BT node can branch on. */
export function evaluateCondition(name: string, native: Native, world: World): boolean {
  if (name === 'is_player_near') {
    return Object.values(world.players).some((player) => {
      const dx = Math.abs(player.position.x - native.position.x);
      const dy = Math.abs(player.position.y - native.position.y);
      return dx <= PLAYER_PROXIMITY_TILES && dy <= PLAYER_PROXIMITY_TILES;
    });
  }

  if (name === 'is_at_home') {
    const home = NPC_HOMES[native.id];
    return home ? native.position.x === home.x && native.position.y === home.y : true;
  }

  return false;
}

/** The 4-connected neighbor tiles of `from` that are on the map and not water. */
function walkableNeighbors(world: World, from: Position): Position[] {
  const deltas: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  return deltas
    .map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy }))
    .filter((pos) => {
      const tile = getTile(world, pos.x, pos.y);
      return tile !== undefined && tile.biome !== 'water';
    });
}

function withNativePosition(world: World, native: Native, position: Position): World {
  return {
    ...world,
    natives: { ...world.natives, [native.id]: { ...native, position } },
  };
}

function withNativeBehaviorState(world: World, native: Native, behaviorState: BehaviorState): World {
  return {
    ...world,
    natives: { ...world.natives, [native.id]: { ...native, behaviorState: JSON.stringify(behaviorState) } },
  };
}

/** Side-effecting behaviors an `action` BT node can execute. Exported for direct unit testing (engine/behavior.test.ts). */
export function executeAction(
  name: string,
  native: Native,
  world: World,
  rng: Rng,
  tickNum: number,
  worldTime: number,
): BTEvalResult {
  if (name === 'idle') {
    return { status: 'success', world, events: [] };
  }

  if (name === 'wander') {
    const options = walkableNeighbors(world, native.position);
    if (options.length === 0) {
      return { status: 'success', world, events: [] }; // boxed in - stand still
    }
    const choice = options[rng.nextInt(0, options.length - 1)]!;
    return { status: 'success', world: withNativePosition(world, native, choice), events: [] };
  }

  if (name === 'move_towards_home') {
    const home = NPC_HOMES[native.id];
    const current = native.position;
    if (!home || (current.x === home.x && current.y === home.y)) {
      return { status: 'success', world, events: [] };
    }

    // Greedy step toward home: prefer the diagonal, then horizontal, then
    // vertical - first one that lands on a walkable tile wins. Deterministic
    // (no RNG involved), so two Nativos in the same spot always agree on
    // which way "closer" is.
    const stepX = Math.sign(home.x - current.x);
    const stepY = Math.sign(home.y - current.y);
    const candidates: Position[] = [
      { x: current.x + stepX, y: current.y + stepY },
      { x: current.x + stepX, y: current.y },
      { x: current.x, y: current.y + stepY },
    ];

    const nextPos =
      candidates.find((pos) => {
        const tile = getTile(world, pos.x, pos.y);
        return tile !== undefined && tile.biome !== 'water';
      }) ?? current;

    return { status: 'success', world: withNativePosition(world, native, nextPos), events: [] };
  }

  if (name === 'say_lore' || name === 'say_greeting' || name === 'say_warning') {
    const behaviorState = parseBehaviorState(native.behaviorState);

    if (behaviorState.lastSpokenTick !== undefined && tickNum - behaviorState.lastSpokenTick < DIALOGUE_COOLDOWN_TICKS) {
      return { status: 'success', world, events: [] }; // cooldown active - stay quiet, but this is not a failure
    }

    const pool = DIALOGUES[name] ?? [];
    if (pool.length === 0) {
      return { status: 'failure', world, events: [] };
    }

    const message = pool[rng.nextInt(0, pool.length - 1)]!.slice(0, NATIVE_MESSAGE_MAX_LENGTH);
    const spokeEvent: NativeSpokeEvent = {
      type: 'native_spoke',
      tick: tickNum,
      worldTime,
      nativeId: native.id,
      message,
    };

    const nextWorld = withNativeBehaviorState(world, native, { ...behaviorState, lastSpokenTick: tickNum });
    return { status: 'success', world: nextWorld, events: [spokeEvent] };
  }

  return { status: 'failure', world, events: [] };
}

/**
 * The 3 behavior trees O Coração ships with, one per faction. Every Native
 * seeded by engine/mapgen.ts's seedInitialNatives references one of these by
 * name via its `behaviorTree` field.
 */
export const BEHAVIOR_TREES: Record<string, BTNode> = {
  wanderer: {
    type: 'selector',
    name: 'Wanderer Root',
    children: [
      {
        type: 'sequence',
        name: 'React to Player',
        children: [
          { type: 'condition', name: 'Player Near?', conditionName: 'is_player_near' },
          { type: 'action', name: 'Speak Lore', actionName: 'say_lore' },
          { type: 'action', name: 'Wander around', actionName: 'wander' },
        ],
      },
      { type: 'action', name: 'Default Wander', actionName: 'wander' },
    ],
  },
  merchant: {
    type: 'selector',
    name: 'Merchant Root',
    children: [
      {
        type: 'sequence',
        name: 'Greet Player',
        children: [
          { type: 'condition', name: 'Player Near?', conditionName: 'is_player_near' },
          { type: 'action', name: 'Say Greeting', actionName: 'say_greeting' },
        ],
      },
      {
        type: 'sequence',
        name: 'Return Home',
        children: [{ type: 'action', name: 'Go Home', actionName: 'move_towards_home' }],
      },
      { type: 'action', name: 'Idle', actionName: 'idle' },
    ],
  },
  guardian: {
    type: 'selector',
    name: 'Guardian Root',
    children: [
      {
        type: 'sequence',
        name: 'Warn Player',
        children: [
          { type: 'condition', name: 'Player Near?', conditionName: 'is_player_near' },
          { type: 'action', name: 'Say Warning', actionName: 'say_warning' },
        ],
      },
      {
        type: 'sequence',
        name: 'Return Home',
        children: [{ type: 'action', name: 'Go Home', actionName: 'move_towards_home' }],
      },
      { type: 'action', name: 'Idle', actionName: 'idle' },
    ],
  },
};
