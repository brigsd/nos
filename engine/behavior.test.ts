import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_TREES,
  DIALOGUES,
  DIALOGUE_COOLDOWN_TICKS,
  NPC_HOMES,
  PLAYER_PROXIMITY_TILES,
  evaluateBTNode,
  evaluateCondition,
  executeAction,
  type BTNode,
} from './behavior';
import { Rng } from './rng';
import type { Native, Player, World } from './types';
import { NATIVE_MESSAGE_MAX_LENGTH } from './types';

function meadowWorld(width: number, height: number): World {
  return {
    meta: { name: 'Test', seed: 'behavior-seed', tickCount: 10, worldTime: 600 },
    width,
    height,
    tiles: Array.from({ length: width * height }, () => ({ biome: 'meadow' as const })),
    players: {},
    events: [],
  };
}

function withNative(world: World, native: Native): World {
  return { ...world, natives: { ...world.natives, [native.id]: native } };
}

function gota(overrides: Partial<Native> = {}): Native {
  return {
    id: 'gota',
    name: 'Gota',
    position: { x: 2, y: 2 },
    behaviorTree: 'wanderer',
    behaviorState: '{}',
    inventory: {},
    hp: 100,
    faction: 'wanderer',
    ...overrides,
  };
}

function playerAt(login: string, x: number, y: number): Player {
  return { login, position: { x, y }, inventory: {}, energy: 100 };
}

describe('evaluateCondition', () => {
  it('is_player_near: true when a player is within PLAYER_PROXIMITY_TILES (Chebyshev)', () => {
    const world = meadowWorld(10, 10);
    world.players['alice'] = playerAt('alice', 2 + PLAYER_PROXIMITY_TILES, 2);
    expect(evaluateCondition('is_player_near', gota(), world)).toBe(true);
  });

  it('is_player_near: false just past the proximity radius', () => {
    const world = meadowWorld(10, 10);
    world.players['alice'] = playerAt('alice', 2 + PLAYER_PROXIMITY_TILES + 1, 2);
    expect(evaluateCondition('is_player_near', gota(), world)).toBe(false);
  });

  it('is_player_near: false with no players at all', () => {
    const world = meadowWorld(10, 10);
    expect(evaluateCondition('is_player_near', gota(), world)).toBe(false);
  });

  it('is_player_near: true using Chebyshev (diagonal) distance, not Manhattan', () => {
    const world = meadowWorld(10, 10);
    // Diagonally PLAYER_PROXIMITY_TILES away on both axes - Manhattan would
    // be 2x the radius, but Chebyshev (max of dx, dy) keeps it "near".
    world.players['alice'] = playerAt('alice', 2 + PLAYER_PROXIMITY_TILES, 2 + PLAYER_PROXIMITY_TILES);
    expect(evaluateCondition('is_player_near', gota(), world)).toBe(true);
  });

  it('is_at_home: true when the Native sits exactly on its NPC_HOMES tile', () => {
    const world = meadowWorld(50, 50);
    const raizHome = NPC_HOMES['raiz']!;
    const raiz = gota({ id: 'raiz', position: { ...raizHome } });
    expect(evaluateCondition('is_at_home', raiz, world)).toBe(true);
  });

  it('is_at_home: false when away from its NPC_HOMES tile', () => {
    const world = meadowWorld(50, 50);
    const raiz = gota({ id: 'raiz', position: { x: 0, y: 0 } });
    expect(evaluateCondition('is_at_home', raiz, world)).toBe(false);
    expect(NPC_HOMES['raiz']).not.toEqual({ x: 0, y: 0 });
  });

  it('is_at_home: defaults true for a Native id with no entry in NPC_HOMES', () => {
    const world = meadowWorld(10, 10);
    const stranger = gota({ id: 'stranger' });
    expect(evaluateCondition('is_at_home', stranger, world)).toBe(true);
  });

  it('an unknown condition name is always false', () => {
    const world = meadowWorld(10, 10);
    expect(evaluateCondition('does_not_exist', gota(), world)).toBe(false);
  });
});

describe('executeAction - idle', () => {
  it('succeeds without changing the world', () => {
    const world = withNative(meadowWorld(5, 5), gota());
    const result = executeAction('idle', gota(), world, new Rng('s'), 1, 60);
    expect(result.status).toBe('success');
    expect(result.world).toBe(world);
    expect(result.events).toEqual([]);
  });
});

describe('executeAction - wander', () => {
  it('moves to an orthogonally-adjacent tile', () => {
    const native = gota({ position: { x: 2, y: 2 } });
    const world = withNative(meadowWorld(5, 5), native);
    const result = executeAction('wander', native, world, new Rng('wander-seed'), 1, 60);

    expect(result.status).toBe('success');
    const finalPos = result.world.natives!['gota']!.position;
    const dist = Math.abs(finalPos.x - 2) + Math.abs(finalPos.y - 2);
    expect(dist).toBe(1);
  });

  it('never steps onto water', () => {
    const native = gota({ position: { x: 2, y: 2 } });
    let world = withNative(meadowWorld(5, 5), native);
    // Surround (2,2) with water on 3 sides, leaving only (3,2) walkable.
    const waterTile = { biome: 'water' as const };
    world = {
      ...world,
      tiles: world.tiles.map((tile, i) => {
        const x = i % world.width;
        const y = Math.floor(i / world.width);
        const isBlocked = (x === 1 && y === 2) || (x === 2 && y === 1) || (x === 2 && y === 3);
        return isBlocked ? waterTile : tile;
      }),
    };

    const result = executeAction('wander', native, world, new Rng('any-seed'), 1, 60);
    expect(result.world.natives!['gota']!.position).toEqual({ x: 3, y: 2 });
  });

  it('stands still (success, unchanged position) when fully boxed in', () => {
    // A 1x1 world: every neighbor of (0,0) is out of bounds.
    const native = gota({ position: { x: 0, y: 0 } });
    const world = withNative(meadowWorld(1, 1), native);
    const result = executeAction('wander', native, world, new Rng('boxed'), 1, 60);
    expect(result.status).toBe('success');
    expect(result.world.natives!['gota']!.position).toEqual({ x: 0, y: 0 });
  });

  it('is deterministic: same seed, same tick, same choice', () => {
    const native = gota({ position: { x: 2, y: 2 } });
    const world = withNative(meadowWorld(5, 5), native);
    const a = executeAction('wander', native, world, new Rng('fixed-seed'), 1, 60);
    const b = executeAction('wander', native, world, new Rng('fixed-seed'), 1, 60);
    expect(a.world.natives!['gota']!.position).toEqual(b.world.natives!['gota']!.position);
  });
});

describe('executeAction - move_towards_home', () => {
  it('steps diagonally closer to home when the diagonal tile is walkable', () => {
    const home = NPC_HOMES['raiz']!; // {43, 6}
    const native = gota({ id: 'raiz', position: { x: home.x - 2, y: home.y - 2 } });
    const world = withNative(meadowWorld(64, 64), native);

    const result = executeAction('move_towards_home', native, world, new Rng('s'), 1, 60);
    expect(result.world.natives!['raiz']!.position).toEqual({ x: home.x - 1, y: home.y - 1 });
  });

  it('falls back to a horizontal step when the diagonal tile is water', () => {
    const home = NPC_HOMES['raiz']!;
    const start = { x: home.x - 2, y: home.y - 2 };
    let world = withNative(meadowWorld(64, 64), gota({ id: 'raiz', position: start }));
    const diagonal = { x: start.x + 1, y: start.y + 1 };
    world = {
      ...world,
      tiles: world.tiles.map((tile, i) => {
        const x = i % world.width;
        const y = Math.floor(i / world.width);
        return x === diagonal.x && y === diagonal.y ? { biome: 'water' as const } : tile;
      }),
    };

    const result = executeAction('move_towards_home', world.natives!['raiz']!, world, new Rng('s'), 1, 60);
    expect(result.world.natives!['raiz']!.position).toEqual({ x: start.x + 1, y: start.y });
  });

  it('reaches and then stays at home across repeated steps', () => {
    const home = NPC_HOMES['cinza']!; // {25, 8}
    let native = gota({ id: 'cinza', position: { x: home.x - 1, y: home.y } });
    let world = withNative(meadowWorld(64, 64), native);

    const step1 = executeAction('move_towards_home', native, world, new Rng('s'), 1, 60);
    expect(step1.world.natives!['cinza']!.position).toEqual(home);

    native = step1.world.natives!['cinza']!;
    world = step1.world;
    const step2 = executeAction('move_towards_home', native, world, new Rng('s'), 2, 120);
    expect(step2.world.natives!['cinza']!.position).toEqual(home);
    expect(step2.world).toBe(world); // no-op: returns the same world reference
  });

  it('is a no-op success for a Native id with no entry in NPC_HOMES', () => {
    const native = gota({ id: 'stranger', position: { x: 5, y: 5 } });
    const world = withNative(meadowWorld(20, 20), native);
    const result = executeAction('move_towards_home', native, world, new Rng('s'), 1, 60);
    expect(result.status).toBe('success');
    expect(result.world).toBe(world);
  });
});

describe('executeAction - say_lore / say_greeting / say_warning', () => {
  it.each(['say_lore', 'say_greeting', 'say_warning'] as const)(
    '%s emits a native_spoke event with a message from its own pool',
    (actionName) => {
      const native = gota({ behaviorTree: 'wanderer' });
      const world = withNative(meadowWorld(5, 5), native);
      const result = executeAction(actionName, native, world, new Rng('dialogue-seed'), 5, 300);

      expect(result.status).toBe('success');
      expect(result.events).toHaveLength(1);
      const event = result.events[0]!;
      expect(event.type).toBe('native_spoke');
      expect(event).toMatchObject({ type: 'native_spoke', tick: 5, worldTime: 300, nativeId: 'gota' });
      expect(event.type === 'native_spoke' && DIALOGUES[actionName]).toContain(
        event.type === 'native_spoke' ? event.message : undefined,
      );
    },
  );

  it('every message respects NATIVE_MESSAGE_MAX_LENGTH', () => {
    for (const pool of Object.values(DIALOGUES)) {
      for (const line of pool) {
        expect(line.length).toBeLessThanOrEqual(NATIVE_MESSAGE_MAX_LENGTH);
      }
    }
  });

  it('persists lastSpokenTick into behaviorState after speaking', () => {
    const native = gota();
    const world = withNative(meadowWorld(5, 5), native);
    const result = executeAction('say_lore', native, world, new Rng('s'), 7, 420);
    const state = JSON.parse(result.world.natives!['gota']!.behaviorState) as { lastSpokenTick?: number };
    expect(state.lastSpokenTick).toBe(7);
  });

  it('stays quiet (success, no event) while the cooldown is active', () => {
    const native = gota({ behaviorState: JSON.stringify({ lastSpokenTick: 10 }) });
    const world = withNative(meadowWorld(5, 5), native);
    const result = executeAction('say_lore', native, world, new Rng('s'), 10 + DIALOGUE_COOLDOWN_TICKS - 1, 0);
    expect(result.status).toBe('success');
    expect(result.events).toEqual([]);
  });

  it('speaks again exactly once the cooldown has fully elapsed', () => {
    const native = gota({ behaviorState: JSON.stringify({ lastSpokenTick: 10 }) });
    const world = withNative(meadowWorld(5, 5), native);
    const result = executeAction('say_lore', native, world, new Rng('s'), 10 + DIALOGUE_COOLDOWN_TICKS, 0);
    expect(result.events).toHaveLength(1);
  });

  it('tolerates a corrupted behaviorState string instead of throwing', () => {
    const native = gota({ behaviorState: 'not json at all' });
    const world = withNative(meadowWorld(5, 5), native);
    expect(() => executeAction('say_lore', native, world, new Rng('s'), 1, 0)).not.toThrow();
  });
});

describe('executeAction - unknown action name', () => {
  it('fails safe instead of throwing', () => {
    const native = gota();
    const world = withNative(meadowWorld(5, 5), native);
    const result = executeAction('dance', native, world, new Rng('s'), 1, 0);
    expect(result.status).toBe('failure');
    expect(result.world).toBe(world);
    expect(result.events).toEqual([]);
  });
});

describe('evaluateBTNode - tree evaluation semantics', () => {
  it('a missing Native fails immediately without touching the world', () => {
    const world = meadowWorld(5, 5); // no natives at all
    const node: BTNode = { type: 'action', name: 'x', actionName: 'idle' };
    const result = evaluateBTNode(node, 'ghost', world, new Rng('s'), 1, 0);
    expect(result).toEqual({ status: 'failure', world, events: [] });
  });

  it('condition node: success when the condition holds', () => {
    const native = gota();
    const world = withNative(meadowWorld(5, 5), native);
    world.players['alice'] = playerAt('alice', native.position.x, native.position.y);
    const node: BTNode = { type: 'condition', name: 'near?', conditionName: 'is_player_near' };
    expect(evaluateBTNode(node, 'gota', world, new Rng('s'), 1, 0).status).toBe('success');
  });

  it('condition node: failure when the condition does not hold', () => {
    const world = withNative(meadowWorld(20, 20), gota());
    const node: BTNode = { type: 'condition', name: 'near?', conditionName: 'is_player_near' };
    expect(evaluateBTNode(node, 'gota', world, new Rng('s'), 1, 0).status).toBe('failure');
  });

  it('sequence: succeeds only when every child succeeds, aggregating their events', () => {
    const native = gota();
    let world = withNative(meadowWorld(5, 5), native);
    world.players['alice'] = playerAt('alice', native.position.x, native.position.y);
    const node: BTNode = {
      type: 'sequence',
      name: 'greet-and-idle',
      children: [
        { type: 'condition', name: 'near?', conditionName: 'is_player_near' },
        { type: 'action', name: 'speak', actionName: 'say_lore' },
        { type: 'action', name: 'idle', actionName: 'idle' },
      ],
    };
    const result = evaluateBTNode(node, 'gota', world, new Rng('s'), 1, 0);
    expect(result.status).toBe('success');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe('native_spoke');
  });

  it('sequence: stops at the first failing child but keeps earlier side effects', () => {
    const native = gota({ position: { x: 2, y: 2 } });
    const world = withNative(meadowWorld(5, 5), native);
    const node: BTNode = {
      type: 'sequence',
      name: 'wander-then-fail',
      children: [
        { type: 'action', name: 'wander', actionName: 'wander' }, // succeeds, moves the Native
        { type: 'condition', name: 'never', conditionName: 'does_not_exist' }, // always fails
        { type: 'action', name: 'idle', actionName: 'idle' }, // must NOT run
      ],
    };
    const result = evaluateBTNode(node, 'gota', world, new Rng('s'), 1, 0);
    expect(result.status).toBe('failure');
    // The wander step's movement is not rolled back by the later failure.
    const moved = result.world.natives!['gota']!.position;
    expect(Math.abs(moved.x - 2) + Math.abs(moved.y - 2)).toBe(1);
  });

  it('selector: returns the first child that succeeds', () => {
    const native = gota();
    let world = withNative(meadowWorld(20, 20), native); // no player nearby
    const node: BTNode = {
      type: 'selector',
      name: 'greet-or-idle',
      children: [
        {
          type: 'sequence',
          name: 'greet',
          children: [{ type: 'condition', name: 'near?', conditionName: 'is_player_near' }],
        },
        { type: 'action', name: 'idle', actionName: 'idle' },
      ],
    };
    const result = evaluateBTNode(node, 'gota', world, new Rng('s'), 1, 0);
    expect(result.status).toBe('success'); // fell through to idle
  });

  it('selector: fails only when every child fails', () => {
    const native = gota();
    const world = withNative(meadowWorld(20, 20), native);
    const node: BTNode = {
      type: 'selector',
      name: 'all-fail',
      children: [
        { type: 'condition', name: 'a', conditionName: 'does_not_exist' },
        { type: 'condition', name: 'b', conditionName: 'is_player_near' },
      ],
    };
    expect(evaluateBTNode(node, 'gota', world, new Rng('s'), 1, 0).status).toBe('failure');
  });

  it('an unrecognized node type fails safe instead of throwing', () => {
    const native = gota();
    const world = withNative(meadowWorld(5, 5), native);
    const node = { type: 'bogus', name: 'x' } as unknown as BTNode;
    expect(evaluateBTNode(node, 'gota', world, new Rng('s'), 1, 0).status).toBe('failure');
  });
});

describe('BEHAVIOR_TREES - decision cases end to end', () => {
  it('wanderer speaks and then wanders when a player is near', () => {
    const native = gota({ id: 'gota', behaviorTree: 'wanderer', position: { x: 10, y: 10 } });
    let world = withNative(meadowWorld(30, 30), native);
    world.players['alice'] = playerAt('alice', 10, 11);

    const result = evaluateBTNode(BEHAVIOR_TREES['wanderer']!, 'gota', world, new Rng('s'), 1, 60);
    expect(result.status).toBe('success');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe('native_spoke');
    const moved = result.world.natives!['gota']!.position;
    expect(Math.abs(moved.x - 10) + Math.abs(moved.y - 10)).toBe(1);
  });

  it('wanderer just wanders (no event) when alone', () => {
    const native = gota({ id: 'gota', behaviorTree: 'wanderer', position: { x: 10, y: 10 } });
    const world = withNative(meadowWorld(30, 30), native);

    const result = evaluateBTNode(BEHAVIOR_TREES['wanderer']!, 'gota', world, new Rng('s'), 1, 60);
    expect(result.status).toBe('success');
    expect(result.events).toEqual([]);
  });

  it('merchant greets a nearby player and does not move', () => {
    const home = NPC_HOMES['raiz']!;
    const native = gota({ id: 'raiz', behaviorTree: 'merchant', position: home });
    let world = withNative(meadowWorld(64, 64), native);
    world.players['alice'] = playerAt('alice', home.x, home.y);

    const result = evaluateBTNode(BEHAVIOR_TREES['merchant']!, 'raiz', world, new Rng('s'), 1, 60);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'native_spoke', nativeId: 'raiz' });
    expect(result.world.natives!['raiz']!.position).toEqual(home);
  });

  it('merchant heads home when alone and away from home', () => {
    const home = NPC_HOMES['raiz']!;
    const native = gota({ id: 'raiz', behaviorTree: 'merchant', position: { x: home.x - 3, y: home.y } });
    const world = withNative(meadowWorld(64, 64), native);

    const result = evaluateBTNode(BEHAVIOR_TREES['merchant']!, 'raiz', world, new Rng('s'), 1, 60);
    expect(result.status).toBe('success');
    expect(result.events).toEqual([]);
    expect(result.world.natives!['raiz']!.position).toEqual({ x: home.x - 2, y: home.y });
  });

  it('merchant idles once already home and alone', () => {
    const home = NPC_HOMES['raiz']!;
    const native = gota({ id: 'raiz', behaviorTree: 'merchant', position: home });
    const world = withNative(meadowWorld(64, 64), native);

    const result = evaluateBTNode(BEHAVIOR_TREES['merchant']!, 'raiz', world, new Rng('s'), 1, 60);
    expect(result.status).toBe('success');
    expect(result.world.natives!['raiz']!.position).toEqual(home);
  });

  it('guardian warns a nearby player instead of greeting', () => {
    const home = NPC_HOMES['cinza']!;
    const native = gota({ id: 'cinza', behaviorTree: 'guardian', position: home, faction: 'guardian' });
    let world = withNative(meadowWorld(64, 64), native);
    world.players['alice'] = playerAt('alice', home.x, home.y);

    const result = evaluateBTNode(BEHAVIOR_TREES['guardian']!, 'cinza', world, new Rng('s'), 1, 60);
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.type === 'native_spoke' && DIALOGUES['say_warning']).toContain(
      event.type === 'native_spoke' ? event.message : undefined,
    );
  });

  it.each(['wanderer', 'merchant', 'guardian'] as const)(
    'the %s tree is always well-formed (selector root, every leaf a known condition/action)',
    (treeName) => {
      const KNOWN_CONDITIONS = new Set(['is_player_near', 'is_at_home']);
      const KNOWN_ACTIONS = new Set(['idle', 'wander', 'move_towards_home', 'say_lore', 'say_greeting', 'say_warning']);

      function walk(node: BTNode): void {
        expect(['sequence', 'selector', 'condition', 'action']).toContain(node.type);
        if (node.type === 'condition') expect(KNOWN_CONDITIONS.has(node.conditionName ?? '')).toBe(true);
        if (node.type === 'action') expect(KNOWN_ACTIONS.has(node.actionName ?? '')).toBe(true);
        for (const child of node.children ?? []) walk(child);
      }

      const tree = BEHAVIOR_TREES[treeName]!;
      expect(tree.type).toBe('selector');
      walk(tree);
    },
  );
});
