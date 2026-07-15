import { describe, expect, it, vi } from 'vitest';
import type { CombatResolvedEvent, Native, World, Player } from './types';
import { getCombatStats } from './types';
import {
  parseMoverCoords,
  parseDizerMessage,
  parseAtacarTarget,
  parseRawIssues,
  processCommands,
  applyCommand,
} from './commands';
import { ATTACK_ENERGY_COST, LOOT_BY_FACTION, MAX_COMBAT_ROUNDS, RESPAWN_ENERGY, XP_BY_FACTION } from './combat';

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

describe('/atacar - combate por turnos (v2, D-05)', () => {
  function cinzaAt(x: number, y: number, overrides: Partial<Native> = {}): Native {
    return {
      id: 'cinza',
      name: 'Cinza',
      position: { x, y },
      behaviorTree: 'guardian',
      behaviorState: '{}',
      inventory: { stone: 10 },
      hp: 120,
      faction: 'guardian',
      ...overrides,
    };
  }

  function combatWorld(): World {
    const world = mockWorld();
    world.players['alice'] = { login: 'alice', position: { x: 30, y: 30 }, inventory: {}, energy: 50 };
    world.natives = { cinza: cinzaAt(31, 30) };
    return world;
  }

  function atacar(id: number, params: unknown) {
    return {
      id,
      login: 'alice',
      type: 'atacar' as const,
      params: params as any,
      createdAt: '2026-07-14T20:00:00Z',
    };
  }

  it('resolves a full fight: event recorded with the replay script, energy spent, hp persisted', () => {
    const world = combatWorld();
    const res = processCommands(world, [atacar(1, 'cinza')], 6, 360);

    expect(res.results[0]?.success).toBe(true);
    expect(res.world.events).toHaveLength(1);
    const event = res.world.events[0] as CombatResolvedEvent;
    expect(event).toMatchObject({ type: 'combat_resolved', tick: 6, worldTime: 360, login: 'alice', nativeId: 'cinza' });
    expect(['victory', 'defeat', 'standoff']).toContain(event.outcome);
    expect(event.actions.length).toBeGreaterThan(0);
    expect(event.actions.length).toBeLessThanOrEqual(MAX_COMBAT_ROUNDS * 2);
    expect(event.actions[0]?.actor).toBe('alice');

    const alice = res.world.players['alice']!;
    expect(alice.energy).toBe(50 - ATTACK_ENERGY_COST);
    expect(res.world.natives?.['cinza']?.hp).toBe(event.nativeHpAfter);
    // The Native is never deleted, whatever happened - it faints, it does not die.
    expect(res.world.natives?.['cinza']).toBeDefined();
  });

  it('is deterministic: same world + same issue number => the same fight, blow by blow', () => {
    const first = processCommands(combatWorld(), [atacar(9, 'cinza')], 6, 360);
    const second = processCommands(combatWorld(), [atacar(9, 'cinza')], 6, 360);
    expect(second.world).toEqual(first.world);
    expect(second.results).toEqual(first.results);
  });

  it('victory: faints the Native (hp 0), mints faction loot and applies XP - the stall stock is untouched', () => {
    const world = combatWorld();
    world.natives!['cinza'] = cinzaAt(31, 30, { hp: 1 });
    const res = processCommands(world, [atacar(1, 'cinza')], 6, 360);

    const event = res.world.events[0] as CombatResolvedEvent;
    expect(event.outcome).toBe('victory');
    expect(event.xpGained).toBe(XP_BY_FACTION.guardian);
    expect(res.world.natives?.['cinza']?.hp).toBe(0);
    expect(res.world.natives?.['cinza']?.inventory).toEqual({ stone: 10 }); // never stolen

    const alice = res.world.players['alice']!;
    expect(alice.inventory).toEqual(LOOT_BY_FACTION.guardian);
    expect(getCombatStats(alice).xp + (alice.level && alice.level > 1 ? 100 : 0)).toBe(XP_BY_FACTION.guardian);
  });

  it('defeat: the player wakes at (30, 30), healed, drained to the respawn energy, half XP gone', () => {
    // hp 1 attacker vs full guardian: hunt a seed (issue id) where the guardian wins.
    let defeat: { world: World; results: { success: boolean }[] } | undefined;
    let defeatEvent: CombatResolvedEvent | undefined;
    for (let issue = 1; issue <= 60 && !defeat; issue++) {
      const world = combatWorld();
      world.players['alice'] = { ...world.players['alice']!, hp: 1, maxHp: 100, xp: 50, position: { x: 31, y: 29 } };
      const res = processCommands(world, [atacar(issue, 'cinza')], 6, 360);
      const event = res.world.events[0] as CombatResolvedEvent;
      if (event.outcome === 'defeat') {
        defeat = res;
        defeatEvent = event;
      }
    }
    expect(defeat).toBeDefined();
    const alice = defeat!.world.players['alice']!;
    expect(alice.position).toEqual({ x: 30, y: 30 });
    expect(alice.hp).toBe(100); // healed on respawn
    expect(alice.energy).toBeLessThanOrEqual(RESPAWN_ENERGY);
    expect(alice.xp).toBe(25); // half of 50
    expect(defeatEvent!.xpGained).toBe(0);
    expect(defeatEvent!.loot).toEqual({});
  });

  it('rejects attacking a fainted Native', () => {
    const world = combatWorld();
    world.natives!['cinza'] = cinzaAt(31, 30, { hp: 0 });
    const res = processCommands(world, [atacar(1, 'cinza')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('desfalecido');
    expect(res.world.events).toHaveLength(0);
  });

  it('rejects an unknown target, world untouched', () => {
    const res = processCommands(combatWorld(), [atacar(1, 'fantasma')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Nenhum Nativo chamado "fantasma"');
    expect(res.world.events).toHaveLength(0);
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'treats hostile target %s as "not found" (getOwn) - the exact v2 lockup bug, dead - and the batch keeps flowing',
    (hostileKey) => {
      const res = processCommands(
        combatWorld(),
        [
          atacar(1, hostileKey),
          { id: 2, login: 'alice', type: 'dizer' as const, params: 'sigo de pé', createdAt: '2026-07-14T20:01:00Z' },
        ],
        6,
        360,
      );
      expect(res.results[0]?.success).toBe(false);
      expect(res.results[0]?.message).toContain('Nenhum Nativo chamado');
      expect(res.results[1]?.success).toBe(true);
    },
  );

  it('rejects a strike from beyond melee range (Chebyshev 1)', () => {
    const world = combatWorld();
    world.natives!['cinza'] = cinzaAt(32, 30);
    const res = processCommands(world, [atacar(1, 'cinza')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('fora do alcance');
  });

  it('allows a diagonal strike (still adjacent)', () => {
    const world = combatWorld();
    world.natives!['cinza'] = cinzaAt(31, 29);
    const res = processCommands(world, [atacar(1, 'cinza')], 6, 360);
    expect(res.results[0]?.success).toBe(true);
  });

  it('rejects the attack when energy is short, before any blood', () => {
    const world = combatWorld();
    world.players['alice']!.energy = ATTACK_ENERGY_COST - 1;
    const res = processCommands(world, [atacar(1, 'cinza')], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[0]?.message).toContain('Energia insuficiente');
    expect(res.world.natives?.['cinza']?.hp).toBe(120);
  });

  it('rejects malformed params without throwing', () => {
    const res = processCommands(combatWorld(), [atacar(1, null), atacar(2, 7)], 6, 360);
    expect(res.results[0]?.success).toBe(false);
    expect(res.results[1]?.success).toBe(false);
  });
});

describe('parseAtacarTarget', () => {
  it('parses the issue-form markdown body', () => {
    expect(parseAtacarTarget('### Alvo\n\nCinza')).toBe('cinza');
  });

  it('parses the free-text fallback', () => {
    expect(parseAtacarTarget('/atacar cinza')).toBe('cinza');
    expect(parseAtacarTarget('atacar gota')).toBe('gota');
  });

  it('returns null when no target is present', () => {
    expect(parseAtacarTarget('')).toBeNull();
    expect(parseAtacarTarget('bom dia')).toBeNull();
  });

  it('is mapped from issues by parseRawIssues', () => {
    const parsed = parseRawIssues([
      {
        number: 60,
        title: 'Comando: /atacar',
        body: '### Alvo\n\ncinza',
        author: { login: 'tester1' },
        createdAt: '2026-07-14T20:00:00Z',
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ type: 'atacar', params: 'cinza' });
  });
});
