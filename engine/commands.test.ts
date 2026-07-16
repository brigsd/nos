import { describe, expect, it, vi } from 'vitest';
import type { Machine, Native, World, Player } from './types';
import {
  parseHabitarParams,
  parseMoverCoords,
  parseDizerMessage,
  parseTrocarParams,
  parseConversarTarget,
  parseSintetizarRecipe,
  parseRawIssues,
  processCommands,
  applyCommand,
} from './commands';
import { CONVERSATION_REPLIES, PLAYER_PROXIMITY_TILES } from './behavior';
import { FABRICATION_RANGE_TILES } from './fabrication';

function mockWorld(): World {
  return {
    meta: { name: 'O Coração', seed: 'seed-1', tickCount: 5, worldTime: 300 },
    width: 64,
    height: 64,
    tiles: Array.from({ length: 64 * 64 }, (_, i) => {
      // Create some resources for test
      if (i === 30 * 64 + 30) return { biome: 'meadow', resource: 'wood' };
      if (i === 31 * 64 + 30) return { biome: 'water' };
      return { biome: 'meadow' };
    }),
    players: {},
    events: [],
  };
}

describe('parseMoverCoords', () => {
  it('parses structured markdown body', () => {
    const body = `### Coordenada X\n\n12\n\n### Coordenada Y\n\n34`;
    expect(parseMoverCoords(body)).toEqual({ x: 12, y: 34 });
  });

  it('parses raw text fallback', () => {
    const body = `ir para 10 -25`;
    expect(parseMoverCoords(body)).toEqual({ x: 10, y: -25 });
  });

  it('returns null on invalid body', () => {
    expect(parseMoverCoords('hello world')).toBeNull();
  });
});

describe('parseDizerMessage', () => {
  it('parses structured markdown body', () => {
    const body = `### Mensagem\n\nOlá, mundo!`;
    expect(parseDizerMessage(body)).toBe('Olá, mundo!');
  });

  it('parses raw body fallback', () => {
    const body = `  Olá, pessoal!  `;
    expect(parseDizerMessage(body)).toBe('Olá, pessoal!');
  });
});

describe('parseRawIssues', () => {
  it('correctly maps issues to commands', () => {
    const issues = [
      {
        number: 10,
        title: 'Comando: /entrar',
        body: '',
        author: { login: 'tester1' },
        createdAt: '2026-07-14T20:00:00Z',
      },
      {
        number: 11,
        title: 'Comando: /mover',
        body: '### Coordenada X\n\n30\n\n### Coordenada Y\n\n30',
        user: { login: 'tester1' },
        created_at: '2026-07-14T20:01:00Z',
      },
    ];

    const parsed = parseRawIssues(issues);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      id: 10,
      login: 'tester1',
      type: 'entrar',
      params: null,
      createdAt: '2026-07-14T20:00:00Z',
    });
    expect(parsed[1]).toEqual({
      id: 11,
      login: 'tester1',
      type: 'mover',
      params: { x: 30, y: 30 },
      createdAt: '2026-07-14T20:01:00Z',
    });
  });
});

describe('processCommands execution pipeline', () => {
  it('processes /entrar command successfully and rejects duplicates', () => {
    const world = mockWorld();
    const commands = [
      { id: 1, login: 'alice', type: 'entrar' as const, params: null, createdAt: '2026-07-14T20:00:00Z' },
      { id: 2, login: 'alice', type: 'entrar' as const, params: null, createdAt: '2026-07-14T20:01:00Z' },
    ];

    const res = processCommands(world, commands, 6, 360);
    expect(Object.keys(res.world.players)).toContain('alice');
    expect(res.world.players['alice']?.position).toEqual({ x: 30, y: 30 });
    expect(res.results).toHaveLength(2);
    expect(res.results[0]?.success).toBe(true);
    expect(res.results[1]?.success).toBe(false); // Duplicate entrant rejected
  });

  it('rejects commands for non-existent players', () => {
    const world = mockWorld();
    const commands = [
      { id: 1, login: 'alice', type: 'mover' as const, params: { x: 30, y: 30 }, createdAt: '2026-07-14T20:00:00Z' },
    ];
    const res = processCommands(world, commands, 6, 360);
    expect(res.results[0]?.success).toBe(false);
  });

  it('validates movement restrictions (adjacent, water bounds, energy)', () => {
    const world = mockWorld();
    // Pre-insert player alice at (30,30)
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 10 };

    const commands = [
      // 1. Valid move to (29,30)
      { id: 1, login: 'alice', type: 'mover' as const, params: { x: 29, y: 30 }, createdAt: '2026-07-14T20:00:00Z' },
      // 2. Invalid move to water (30,31)
      { id: 2, login: 'alice', type: 'mover' as const, params: { x: 30, y: 31 }, createdAt: '2026-07-14T20:01:00Z' },
      // 3. Invalid too far move to (40,40)
      { id: 3, login: 'alice', type: 'mover' as const, params: { x: 40, y: 40 }, createdAt: '2026-07-14T20:02:00Z' },
    ];

    const res = processCommands(world, commands, 6, 360);
    expect(res.results[0]?.success).toBe(true);
    expect(res.results[1]?.success).toBe(false);
    expect(res.results[2]?.success).toBe(false);
    expect(res.world.players['alice']?.position).toEqual({ x: 29, y: 30 });
    expect(res.world.players['alice']?.energy).toBe(9); // 10 - 1 cost
  });

  it('restricts actions per player to 3 per tick', () => {
    const world = mockWorld();
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 50 };

    const commands = [
      { id: 1, login: 'alice', type: 'mover' as const, params: { x: 29, y: 30 }, createdAt: '2026-07-14T20:00:00Z' },
      { id: 2, login: 'alice', type: 'mover' as const, params: { x: 30, y: 30 }, createdAt: '2026-07-14T20:01:00Z' },
      { id: 3, login: 'alice', type: 'mover' as const, params: { x: 29, y: 30 }, createdAt: '2026-07-14T20:02:00Z' },
      { id: 4, login: 'alice', type: 'mover' as const, params: { x: 30, y: 30 }, createdAt: '2026-07-14T20:03:00Z' },
    ];

    const res = processCommands(world, commands, 6, 360);
    expect(res.results[0]?.success).toBe(true);
    expect(res.results[1]?.success).toBe(true);
    expect(res.results[2]?.success).toBe(true);
    expect(res.results[3]?.success).toBe(false); // 4th action rejected
  });

  it('runs resource collection successfully', () => {
    const world = mockWorld();
    // Wood resource is on (30,30) in mockWorld
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 10 };

    const commands = [
      { id: 1, login: 'alice', type: 'coletar' as const, params: null, createdAt: '2026-07-14T20:00:00Z' },
    ];

    const res = processCommands(world, commands, 6, 360);
    expect(res.results[0]?.success).toBe(true);
    expect(res.world.players['alice']?.inventory.wood).toBe(1);
    expect(res.world.players['alice']?.energy).toBe(5); // 10 - 5 cost
    // Tile should be depleted of resource
    expect(res.world.tiles[30 * 64 + 30]?.resource).toBeUndefined();
  });

  it('supports message broadcasting via /dizer', () => {
    const world = mockWorld();
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 10 };

    const commands = [
      { id: 1, login: 'alice', type: 'dizer' as const, params: 'Olá!', createdAt: '2026-07-14T20:00:00Z' },
    ];

    const res = processCommands(world, commands, 6, 360);
    expect(res.results[0]?.success).toBe(true);
    expect(res.world.events).toHaveLength(1);
    expect(res.world.events[0]).toEqual({
      type: 'player_said',
      tick: 6,
      worldTime: 360,
      login: 'alice',
      message: 'Olá!',
    });
  });
});

describe('/trocar - comércio com os Nativos (v2 economia)', () => {
  function raiz(overrides: Partial<Native> = {}): Native {
    return {
      id: 'raiz',
      name: 'Raiz',
      position: { x: 31, y: 29 },
      behaviorTree: 'merchant',
      behaviorState: '{}',
      inventory: { wood: 10 },
      hp: 100,
      faction: 'merchant',
      ...overrides,
    };
  }

  function tradeWorld(): World {
    const world = mockWorld();
    world.players['alice'] = {
      login: 'alice',
      position: { x: 30, y: 30 },
      inventory: { wood: 2 },
      energy: 10,
      pulso: 0,
    };
    world.natives = { raiz: raiz() };
    return world;
  }

  function trocar(id: number, params: unknown) {
    return { id, login: 'alice', type: 'trocar' as const, params: params as any, createdAt: '2026-07-14T20:00:00Z' };
  }

  it('completes a sale: item to the native, ₱ to the player, 1 energy spent, event recorded', () => {
    const world = tradeWorld();
    const res = processCommands(world, [trocar(1, { nativeId: 'raiz', tradeType: 'vender_madeira' })], 6, 360);

    expect(res.results[0]?.success).toBe(true);
    expect(res.results[0]?.message).toContain('Troca selada com Raiz');
    const alice = res.world.players['alice']!;
    expect(alice.pulso).toBe(5);
    expect(alice.inventory).toEqual({ wood: 1 });
    expect(alice.energy).toBe(9);
    expect(res.world.natives?.['raiz']?.inventory).toEqual({ wood: 11 });
    expect(res.world.events).toHaveLength(1);
    expect(res.world.events[0]).toEqual({
      type: 'trade_completed',
      tick: 6,
      worldTime: 360,
      login: 'alice',
      nativeId: 'raiz',
      given: { wood: 1 },
      received: {},
      pulsoDelta: 5,
    });
  });

  it('is deterministic: the same world and command always settle identically', () => {
    const cmd = trocar(1, { nativeId: 'raiz', tradeType: 'vender_madeira' });
    const first = processCommands(tradeWorld(), [cmd], 6, 360);
    const second = processCommands(tradeWorld(), [cmd], 6, 360);
    expect(second.world).toEqual(first.world);
    expect(second.results).toEqual(first.results);
  });

  it('rejects a trade with an unknown native, leaving the world untouched', () => {
    const world = tradeWorld();
    const res = processCommands(world, [trocar(1, { nativeId: 'fantasma', tradeType: 'vender_madeira' })], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Nenhum Nativo chamado "fantasma"');
    expect(res.world.players['alice']?.energy).toBe(10); // nothing spent
    expect(res.world.events).toHaveLength(0);
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'treats hostile native id %s as "not found" (getOwn) without throwing or freezing the batch',
    (hostileKey) => {
      const world = tradeWorld();
      const res = processCommands(
        world,
        [
          trocar(1, { nativeId: hostileKey, tradeType: 'vender_madeira' }),
          // A healthy command right after proves the batch keeps flowing.
          { id: 2, login: 'alice', type: 'dizer' as const, params: 'sigo aqui', createdAt: '2026-07-14T20:01:00Z' },
        ],
        6,
        360,
      );
      expect(res.results[0]?.success).toBe(false);
      expect(res.results[0]?.message).toContain('Nenhum Nativo chamado');
      expect(res.results[1]?.success).toBe(true);
    },
  );

  it('treats a hostile trade type (__proto__) as an unknown recipe', () => {
    const world = tradeWorld();
    const res = processCommands(world, [trocar(1, { nativeId: 'raiz', tradeType: '__proto__' })], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Nenhum Nativo conhece a troca');
    expect(res.world.events).toHaveLength(0);
  });

  it('rejects trading beyond the greeting radius (3 tiles, Chebyshev)', () => {
    const world = tradeWorld();
    world.natives!['raiz'] = raiz({ position: { x: 34, y: 30 } }); // dx 4 > 3
    const res = processCommands(world, [trocar(1, { nativeId: 'raiz', tradeType: 'vender_madeira' })], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('longe demais');
  });

  it('allows trading exactly at the edge of the radius', () => {
    const world = tradeWorld();
    world.natives!['raiz'] = raiz({ position: { x: 33, y: 27 } }); // dx 3, dy 3
    const res = processCommands(world, [trocar(1, { nativeId: 'raiz', tradeType: 'vender_madeira' })], 6, 360);
    expect(res.results[0]?.success).toBe(true);
  });

  it('rejects the trade when energy is short, before anything moves', () => {
    const world = tradeWorld();
    world.players['alice']!.energy = 0;
    const res = processCommands(world, [trocar(1, { nativeId: 'raiz', tradeType: 'vender_madeira' })], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Energia insuficiente');
    expect(res.world.players['alice']?.inventory).toEqual({ wood: 2 });
  });

  it('surfaces the economy failure reason when the player cannot pay', () => {
    const world = tradeWorld();
    const res = processCommands(world, [trocar(1, { nativeId: 'raiz', tradeType: 'comprar_madeira' })], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Pulso insuficiente');
    expect(res.world.players['alice']?.energy).toBe(10); // failed trade costs nothing
  });

  it('rejects malformed params without throwing', () => {
    const world = tradeWorld();
    const res = processCommands(world, [trocar(1, null), trocar(2, { nativeId: 42, tradeType: [] })], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[1]?.success).toBe(false);
  });
});

describe('parseTrocarParams', () => {
  it('parses the issue-form markdown body', () => {
    const body = '### Nativo\n\nRaiz\n\n### Troca\n\nvender_madeira';
    expect(parseTrocarParams(body)).toEqual({ nativeId: 'raiz', tradeType: 'vender_madeira' });
  });

  it('parses the free-text fallback "/trocar raiz vender_madeira"', () => {
    expect(parseTrocarParams('/trocar raiz vender_madeira')).toEqual({
      nativeId: 'raiz',
      tradeType: 'vender_madeira',
    });
    expect(parseTrocarParams('trocar gota comprar_pedra')).toEqual({
      nativeId: 'gota',
      tradeType: 'comprar_pedra',
    });
  });

  it('returns null when either field is missing', () => {
    expect(parseTrocarParams('### Nativo\n\nraiz')).toBeNull();
    expect(parseTrocarParams('')).toBeNull();
    expect(parseTrocarParams('bom dia')).toBeNull();
  });

  it('is mapped from issues by parseRawIssues', () => {
    const parsed = parseRawIssues([
      {
        number: 40,
        title: 'Comando: /trocar',
        body: '### Nativo\n\nraiz\n\n### Troca\n\nvender_madeira',
        author: { login: 'tester1' },
        createdAt: '2026-07-14T20:00:00Z',
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: 'trocar', params: { nativeId: 'raiz', tradeType: 'vender_madeira' } });
  });
});

describe('processCommands - per-command failure isolation (issue #28)', () => {
  it('a command whose handler throws does not take down the batch: the rest still process, the bad one becomes a failure result', () => {
    const world = mockWorld();
    const commands = [
      { id: 1, login: 'alice', type: 'entrar' as const, params: null, createdAt: '2026-07-14T20:00:00Z' },
      { id: 2, login: 'bob', type: 'entrar' as const, params: null, createdAt: '2026-07-14T20:01:00Z' },
      { id: 3, login: 'carol', type: 'entrar' as const, params: null, createdAt: '2026-07-14T20:02:00Z' },
    ];

    // Injected handler (processCommands' applyCommandFn seam, issue #28):
    // behaves exactly like the real applyCommand for every command except
    // #2, which it makes throw - simulating a bug in a future handler
    // (combate/economia) without needing a real throwing path in
    // applyCommand today.
    const throwingApply: typeof applyCommand = (w, cmd, counts, tick, wt) => {
      if (cmd.id === 2) {
        throw new Error('simulated handler bug (issue #28 test)');
      }
      return applyCommand(w, cmd, counts, tick, wt);
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = processCommands(world, commands, 6, 360, throwingApply);

      expect(res.results).toHaveLength(3);
      expect(res.results[0]).toMatchObject({ id: 1, login: 'alice', success: true });
      expect(res.results[1]).toEqual({
        id: 2,
        login: 'bob',
        success: false,
        message: 'Falha inesperada ao processar este comando.',
      });
      expect(res.results[2]).toMatchObject({ id: 3, login: 'carol', success: true }); // batch kept going after the throw

      // The two healthy commands actually landed; the thrown one left no trace.
      expect(Object.keys(res.world.players).sort()).toEqual(['alice', 'carol']);

      // The real error was logged for debugging, not swallowed silently.
      expect(errorSpy).toHaveBeenCalled();
      const loggedArgs = errorSpy.mock.calls.flat();
      expect(loggedArgs.some((arg) => arg instanceof Error && arg.message === 'simulated handler bug (issue #28 test)')).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('a thrown command leaves the world exactly as it was before it (currentWorld is not advanced for it)', () => {
    const world = mockWorld();
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 10 };

    const commands = [
      // Would succeed if it ran, but the injected handler forces it to throw.
      { id: 1, login: 'alice', type: 'mover' as const, params: { x: 29, y: 30 }, createdAt: '2026-07-14T20:00:00Z' },
      // A second, real move right after - must still see alice at her ORIGINAL spot,
      // proving command 1's throw did not partially apply or corrupt the world.
      { id: 2, login: 'alice', type: 'mover' as const, params: { x: 29, y: 30 }, createdAt: '2026-07-14T20:01:00Z' },
    ];

    const throwingApply: typeof applyCommand = (w, cmd, counts, tick, wt) => {
      if (cmd.id === 1) throw new Error('simulated handler bug');
      return applyCommand(w, cmd, counts, tick, wt);
    };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = processCommands(world, commands, 6, 360, throwingApply);

      expect(res.results[0]?.success).toBe(false);
      expect(res.results[1]?.success).toBe(true);
      // Only command 2's single move/energy cost applied - command 1 left no trace.
      expect(res.world.players['alice']?.position).toEqual({ x: 29, y: 30 });
      expect(res.world.players['alice']?.energy).toBe(9);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('a normal batch (no injected handler) behaves exactly as before - the test seam is a no-op by default', () => {
    const world = mockWorld();
    const commands = [
      { id: 1, login: 'alice', type: 'entrar' as const, params: null, createdAt: '2026-07-14T20:00:00Z' },
    ];
    const res = processCommands(world, commands, 6, 360);
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.success).toBe(true);
    expect(res.world.players['alice']).toBeDefined();
  });
});

describe('/conversar - interação leve com os Nativos (v2)', () => {
  function gotaAt(x: number, y: number, overrides: Partial<Native> = {}): Native {
    return {
      id: 'gota',
      name: 'Gota',
      position: { x, y },
      behaviorTree: 'wanderer',
      behaviorState: '{}',
      inventory: {},
      hp: 100,
      faction: 'wanderer',
      ...overrides,
    };
  }

  function converseWorld(): World {
    const world = mockWorld();
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 10 };
    world.natives = { gota: gotaAt(31, 29) };
    return world;
  }

  function conversar(id: number, params: unknown) {
    return {
      id,
      login: 'alice',
      type: 'conversar' as const,
      params: params as any,
      createdAt: '2026-07-14T20:00:00Z',
    };
  }

  it('the Native answers: native_replied event recorded, feedback carries the line, zero energy spent', () => {
    const world = converseWorld();
    const res = processCommands(world, [conversar(1, 'gota')], 6, 360);

    expect(res.results[0]?.success).toBe(true);
    expect(res.world.events).toHaveLength(1);
    const event = res.world.events[0]!;
    expect(event).toMatchObject({ type: 'native_replied', tick: 6, worldTime: 360, nativeId: 'gota', login: 'alice' });
    const message = (event as { message?: string }).message ?? '';
    expect(CONVERSATION_REPLIES['gota']).toContain(message);
    expect(res.results[0]?.message).toContain(message);
    expect(res.results[0]?.message).toContain('Gota responde');
    expect(res.world.players['alice']?.energy).toBe(10); // talking is free
  });

  it('is deterministic: same world + same issue number => same reply, always', () => {
    const first = processCommands(converseWorld(), [conversar(7, 'gota')], 6, 360);
    const second = processCommands(converseWorld(), [conversar(7, 'gota')], 6, 360);
    expect(second.world).toEqual(first.world);
    expect(second.results).toEqual(first.results);
  });

  it('different issue numbers may draw different lines (per-event seed)', () => {
    const replies = new Set<string>();
    for (let issue = 1; issue <= 30; issue++) {
      const res = processCommands(converseWorld(), [conversar(issue, 'gota')], 6, 360);
      const event = res.world.events[0] as { message?: string };
      replies.add(event.message ?? '');
    }
    expect(replies.size).toBeGreaterThan(1);
  });

  it('rejects an unknown native, world untouched', () => {
    const res = processCommands(converseWorld(), [conversar(1, 'fantasma')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Nenhum Nativo chamado "fantasma"');
    expect(res.world.events).toHaveLength(0);
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'treats hostile native id %s as "not found" (getOwn) and the batch keeps flowing',
    (hostileKey) => {
      const res = processCommands(
        converseWorld(),
        [
          conversar(1, hostileKey),
          { id: 2, login: 'alice', type: 'dizer' as const, params: 'sigo aqui', createdAt: '2026-07-14T20:01:00Z' },
        ],
        6,
        360,
      );
      expect(res.results[0]?.success).toBe(false);
      expect(res.results[0]?.message).toContain('Nenhum Nativo chamado');
      expect(res.results[1]?.success).toBe(true);
    },
  );

  it('rejects talking from beyond the proximity radius', () => {
    const world = converseWorld();
    world.natives!['gota'] = gotaAt(30 + PLAYER_PROXIMITY_TILES + 1, 30);
    const res = processCommands(world, [conversar(1, 'gota')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('não te ouve daí');
  });

  it('allows talking exactly at the edge of the radius', () => {
    const world = converseWorld();
    world.natives!['gota'] = gotaAt(30 + PLAYER_PROXIMITY_TILES, 30 - PLAYER_PROXIMITY_TILES);
    const res = processCommands(world, [conversar(1, 'gota')], 6, 360);
    expect(res.results[0]?.success).toBe(true);
  });

  it('rejects malformed params without throwing', () => {
    const res = processCommands(converseWorld(), [conversar(1, null), conversar(2, 42)], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[1]?.success).toBe(false);
  });

  it('requires /entrar first, like every other action', () => {
    const world = converseWorld();
    delete world.players['alice'];
    const res = processCommands(world, [conversar(1, 'gota')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('/entrar');
  });
});

describe('parseConversarTarget', () => {
  it('parses the issue-form markdown body', () => {
    expect(parseConversarTarget('### Nativo\n\nGota')).toBe('gota');
  });

  it('parses the free-text fallback', () => {
    expect(parseConversarTarget('/conversar raiz')).toBe('raiz');
    expect(parseConversarTarget('conversar cinza')).toBe('cinza');
  });

  it('returns null when no target is present', () => {
    expect(parseConversarTarget('')).toBeNull();
    expect(parseConversarTarget('bom dia')).toBeNull();
  });

  it('is mapped from issues by parseRawIssues', () => {
    const parsed = parseRawIssues([
      {
        number: 50,
        title: 'Comando: /conversar',
        body: '### Nativo\n\ngota',
        author: { login: 'tester1' },
        createdAt: '2026-07-14T20:00:00Z',
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: 'conversar', params: 'gota' });
  });
});

describe('/sintetizar - A Fábrica (v2.5, D-23/D-25a)', () => {
  function bancada(overrides: Partial<Machine> = {}): Machine {
    return { id: 'bancada', name: 'Bancada', position: { x: 30, y: 30 }, ...overrides };
  }

  function fabricationWorld(): World {
    const world = mockWorld();
    world.players['alice'] = {
      login: 'alice',
      position: { x: 30, y: 30 },
      inventory: { stone: 2, pulse_fragment: 1 },
      energy: 50,
      pulso: 0,
    };
    world.machines = { bancada: bancada() };
    return world;
  }

  function sintetizar(id: number, params: unknown) {
    return {
      id,
      login: 'alice',
      type: 'sintetizar' as const,
      params: params as any,
      createdAt: '2026-07-14T20:00:00Z',
    };
  }

  it('synthesizes a lanterna at the Bancada: inputs consumed, item added, energy spent, event recorded', () => {
    const world = fabricationWorld();
    const res = processCommands(world, [sintetizar(1, 'lanterna')], 6, 360);

    expect(res.results[0]?.success).toBe(true);
    expect(res.results[0]?.message).toContain('Sintetizado!');
    expect(res.results[0]?.message).toContain('Lanterna');
    expect(res.results[0]?.message).toContain('na Bancada');

    const alice = res.world.players['alice']!;
    expect(alice.inventory).toEqual({ stone: 1 }); // pulse_fragment fully consumed, 1 stone left over
    expect(alice.items).toEqual({ lanterna: 1 });
    expect(alice.energy).toBe(45); // lanterna energyCost = 5

    expect(res.world.events).toHaveLength(1);
    expect(res.world.events[0]).toEqual({
      type: 'item_synthesized',
      tick: 6,
      worldTime: 360,
      login: 'alice',
      machineId: 'bancada',
      recipeId: 'lanterna',
      output: { itemId: 'lanterna', quantity: 1 },
    });
  });

  it('is deterministic: the same world and command always settle identically', () => {
    const cmd = sintetizar(1, 'lanterna');
    const first = processCommands(fabricationWorld(), [cmd], 6, 360);
    const second = processCommands(fabricationWorld(), [cmd], 6, 360);
    expect(second.world).toEqual(first.world);
    expect(second.results).toEqual(first.results);
  });

  it('rejects an unknown recipe, leaving the world untouched', () => {
    const world = fabricationWorld();
    const res = processCommands(world, [sintetizar(1, 'espada_lendaria')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Nenhuma receita chamada "espada_lendaria"');
    expect(res.world.players['alice']?.energy).toBe(50); // nothing spent
    expect(res.world.events).toHaveLength(0);
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'treats hostile recipe id %s as "not found" (getOwn) without throwing or freezing the batch',
    (hostileKey) => {
      const world = fabricationWorld();
      const res = processCommands(
        world,
        [
          sintetizar(1, hostileKey),
          // A healthy command right after proves the batch keeps flowing.
          { id: 2, login: 'alice', type: 'dizer' as const, params: 'sigo aqui', createdAt: '2026-07-14T20:01:00Z' },
        ],
        6,
        360,
      );
      expect(res.results[0]?.success).toBe(false);
      expect(res.results[0]?.message).toContain('Nenhuma receita chamada');
      expect(res.results[1]?.success).toBe(true);
    },
  );

  it('rejects when the required machine has not been seeded into the world yet', () => {
    const world = fabricationWorld();
    world.machines = {};
    const res = processCommands(world, [sintetizar(1, 'lanterna')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('oficina ainda não foi erguida');
  });

  it('rejects synthesizing beyond the fabrication radius', () => {
    const world = fabricationWorld();
    world.players['alice']!.position = { x: 30 + FABRICATION_RANGE_TILES + 1, y: 30 };
    const res = processCommands(world, [sintetizar(1, 'lanterna')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Bancada está longe demais');
    expect(res.world.events).toHaveLength(0);
  });

  it('allows synthesizing exactly at the edge of the radius', () => {
    const world = fabricationWorld();
    world.players['alice']!.position = { x: 30 + FABRICATION_RANGE_TILES, y: 30 };
    const res = processCommands(world, [sintetizar(1, 'lanterna')], 6, 360);
    expect(res.results[0]?.success).toBe(true);
  });

  it('rejects the synthesis when energy is short, before anything moves', () => {
    const world = fabricationWorld();
    world.players['alice']!.energy = 2; // lanterna costs 5
    const res = processCommands(world, [sintetizar(1, 'lanterna')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Energia insuficiente');
    expect(res.world.players['alice']?.inventory).toEqual({ stone: 2, pulse_fragment: 1 }); // untouched
  });

  it('surfaces the missing-materials reason, naming what is missing, when the player cannot pay', () => {
    const world = fabricationWorld();
    world.players['alice']!.inventory = { stone: 1 };
    const res = processCommands(world, [sintetizar(1, 'lanterna')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Faltam materiais');
    expect(res.results[0]?.message).toContain('fragmento de pulso');
  });

  it('rejects malformed params without throwing', () => {
    const world = fabricationWorld();
    const res = processCommands(world, [sintetizar(1, null)], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Diga qual receita');
  });

  it('requires /entrar first, like every other action', () => {
    const world = mockWorld();
    world.machines = { bancada: bancada() };
    const res = processCommands(world, [sintetizar(1, 'lanterna')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('/entrar');
  });

  it('proves the production chain end to end: peça básica (Bancada) feeds carrinho de mãos (Estaleiro)', () => {
    const world = fabricationWorld();
    world.players['alice']!.inventory = { wood: 6, stone: 6 };
    world.machines = {
      bancada: bancada(),
      estaleiro: { id: 'estaleiro', name: 'Estaleiro', position: { x: 30, y: 30 } },
    };

    const afterPecas = processCommands(world, [sintetizar(1, 'peca_basica')], 6, 360);
    expect(afterPecas.results[0]?.success).toBe(true);
    expect(afterPecas.world.players['alice']?.items).toEqual({ peca_basica: 3 });

    const afterCarrinho = processCommands(afterPecas.world, [sintetizar(2, 'carrinho_de_maos')], 7, 420);
    expect(afterCarrinho.results[0]?.success).toBe(true);
    expect(afterCarrinho.results[0]?.message).toContain('Carrinho de Mãos');
    expect(afterCarrinho.world.players['alice']?.items).toEqual({ peca_basica: 1, carrinho_de_maos: 1 });
  });
});

describe('parseSintetizarRecipe', () => {
  it('parses the issue-form markdown body', () => {
    expect(parseSintetizarRecipe('### Receita\n\nLanterna')).toBe('lanterna');
  });

  it('parses the free-text fallback "/sintetizar lanterna"', () => {
    expect(parseSintetizarRecipe('/sintetizar lanterna')).toBe('lanterna');
    expect(parseSintetizarRecipe('sintetizar peca_basica')).toBe('peca_basica');
  });

  it('returns null when no recipe is present', () => {
    expect(parseSintetizarRecipe('')).toBeNull();
    expect(parseSintetizarRecipe('bom dia')).toBeNull();
  });

  it('is mapped from issues by parseRawIssues', () => {
    const parsed = parseRawIssues([
      {
        number: 51,
        title: 'Comando: /sintetizar',
        body: '### Receita\n\nlanterna',
        author: { login: 'tester1' },
        createdAt: '2026-07-14T20:00:00Z',
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: 'sintetizar', params: 'lanterna' });
  });
});

describe('/habitar - as mentes dirigem os Habitantes (D-34)', () => {
  const habitarCmd = (params: any, login = 'brigsd', id = 90) =>
    ({ id, login, type: 'habitar' as const, params, createdAt: '2026-07-16T12:00:00Z' });

  it('guardião autorizado faz um habitante falar: vira native_spoke no mundo', () => {
    const world = mockWorld();
    const res = processCommands(world, [habitarCmd({ habitante: 'brasa', mensagem: 'Ferro bom não tem pressa.' })], 66, 3960);
    expect(res.results[0]?.success).toBe(true);
    expect(res.world.events).toHaveLength(1);
    expect(res.world.events[0]).toEqual({
      type: 'native_spoke',
      tick: 66,
      worldTime: 3960,
      nativeId: 'brasa',
      message: 'Ferro bom não tem pressa.',
    });
  });

  it('não exige avatar de jogador nem consome o orçamento de ações do guardião', () => {
    const world = mockWorld();
    world.players['brigsd'] = { login: 'brigsd', position: { x: 30, y: 30 }, inventory: {}, energy: 10 };
    const cmds = [
      habitarCmd({ habitante: 'brasa', mensagem: 'a' }, 'brigsd', 1),
      habitarCmd({ habitante: 'broa', mensagem: 'b' }, 'brigsd', 2),
      { id: 3, login: 'brigsd', type: 'dizer' as const, params: 'oi', createdAt: '2026-07-16T12:00:00Z' },
    ];
    const res = processCommands(world, cmds, 66, 3960);
    expect(res.results.map((r) => r.success)).toEqual([true, true, true]);
  });

  it('rejeita login fora da allowlist e habitante fora da guarda', () => {
    const world = mockWorld();
    const intruso = processCommands(world, [habitarCmd({ habitante: 'brasa', mensagem: 'oi' }, 'mallory')], 66, 3960);
    expect(intruso.results[0]?.success).toBe(false);
    expect(intruso.world.events).toHaveLength(0);
    const gota = processCommands(world, [habitarCmd({ habitante: 'gota', mensagem: 'oi' })], 66, 3960);
    expect(gota.results[0]?.success).toBe(false);
  });

  it('rejeita mensagem vazia/longa e aplica o teto por habitante por tick', () => {
    const world = mockWorld();
    expect(processCommands(world, [habitarCmd({ habitante: 'brasa', mensagem: '' })], 66, 3960).results[0]?.success).toBe(false);
    expect(processCommands(world, [habitarCmd({ habitante: 'brasa', mensagem: 'x'.repeat(241) })], 66, 3960).results[0]?.success).toBe(false);
    const tres = [1, 2, 3].map((n) => habitarCmd({ habitante: 'quilha', mensagem: `fala ${n}` }, 'brigsd', n));
    const res = processCommands(world, tres, 66, 3960);
    expect(res.results.map((r) => r.success)).toEqual([true, true, false]);
  });
});

describe('parseHabitarParams', () => {
  it('lê o formato de issue-form (### Habitante / ### Mensagem)', () => {
    expect(parseHabitarParams('### Habitante\nbrasa\n\n### Mensagem\nFerro bom não tem pressa.')).toEqual({
      habitante: 'brasa',
      mensagem: 'Ferro bom não tem pressa.',
    });
  });
  it('lê o formato inline e devolve null sem params', () => {
    expect(parseHabitarParams('/habitar quilha a doca aponta pro vazio')).toEqual({
      habitante: 'quilha',
      mensagem: 'a doca aponta pro vazio',
    });
    expect(parseHabitarParams('sem nada aqui')).toBeNull();
  });
});
