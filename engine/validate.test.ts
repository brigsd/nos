import { describe, expect, it } from 'vitest';
import { assertValidWorld, validateWorld, worldSchema } from './validate';
import {
  MAX_ENERGY,
  NATIVE_MESSAGE_MAX_LENGTH,
  STARTING_ENERGY,
  STARTING_PULSO,
  TILE_DECOS,
  TILE_DECO_OBJECTS,
} from './types';
import type { Machine, Native, World } from './types';
import { ITEM_CATALOG, MACHINES } from './fabrication';

function gota(overrides: Partial<Native> = {}): Native {
  return {
    id: 'gota',
    name: 'Gota',
    position: { x: 1, y: 1 },
    behaviorTree: 'wanderer',
    behaviorState: '{}',
    inventory: { pulse_fragment: 2 },
    hp: 100,
    faction: 'wanderer',
    ...overrides,
  };
}

function bancada(overrides: Partial<Machine> = {}): Machine {
  return { id: 'bancada', name: 'Bancada', position: { x: 1, y: 1 }, ...overrides };
}

function validWorld(): World {
  return {
    meta: { name: 'Test World', seed: 'seed-1', tickCount: 3, worldTime: 180 },
    width: 2,
    height: 2,
    tiles: [
      { biome: 'meadow' },
      { biome: 'forest', resource: 'wood' },
      { biome: 'ruins', resource: 'stone' },
      { biome: 'core' },
    ],
    players: {
      octocat: {
        login: 'octocat',
        position: { x: 0, y: 0 },
        inventory: { wood: 2, pulse_fragment: 1 },
        energy: 80,
      },
    },
    events: [
      { type: 'player_joined', tick: 0, worldTime: 0, login: 'octocat' },
      {
        type: 'player_moved',
        tick: 1,
        worldTime: 60,
        login: 'octocat',
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
      },
      {
        type: 'resource_collected',
        tick: 2,
        worldTime: 120,
        login: 'octocat',
        resource: 'wood',
        quantity: 1,
        position: { x: 1, y: 0 },
      },
      { type: 'player_said', tick: 2, worldTime: 120, login: 'octocat', message: 'Olá, Coração.' },
      { type: 'core_pulse', tick: 3, worldTime: 180 },
    ],
  };
}

/** A deep clone of a valid world, loosely typed so tests can build malformed fixtures on purpose. */
function invalidatableClone(): Record<string, unknown> {
  return structuredClone(validWorld()) as unknown as Record<string, unknown>;
}

describe('validateWorld - accepts valid state', () => {
  it('accepts a well-formed world', () => {
    const result = validateWorld(validWorld());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts a world with no players and no events yet (genesis)', () => {
    const world = validWorld();
    world.players = {};
    world.events = [];
    expect(validateWorld(world).valid).toBe(true);
  });

  it('accepts a GitHub login with multiple non-consecutive hyphens', () => {
    // Regression guard for the tightened Login regex: real GitHub logins
    // like "foo-bar-baz" must keep validating even though "foo--bar" must not.
    // Events are cleared so this only exercises the Login pattern itself,
    // not the (separately-tested) events-vs-players login cross-check.
    const world = validWorld();
    const player = world.players['octocat']!;
    delete world.players['octocat'];
    world.players['foo-bar-baz'] = { ...player, login: 'foo-bar-baz' };
    world.events = [];
    expect(validateWorld(world).valid).toBe(true);
  });

  it('accepts a world with no natives field at all (pre-Nativos backward compatibility)', () => {
    const world = validWorld();
    expect(world.natives).toBeUndefined();
    expect(validateWorld(world).valid).toBe(true);
  });

  it('accepts a well-formed Native and a native_spoke event referencing it', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push({ type: 'native_spoke', tick: 3, worldTime: 180, nativeId: 'gota', message: 'Olá, viajante.' });
    const result = validateWorld(world);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts an empty natives object', () => {
    const world = validWorld();
    world.natives = {};
    expect(validateWorld(world).valid).toBe(true);
  });

  it('accepts a player with a pulso balance and one without (pre-economy backward compatibility)', () => {
    const world = validWorld();
    world.players['octocat']!.pulso = 15;
    expect(validateWorld(world).valid).toBe(true);

    delete world.players['octocat']!.pulso;
    expect(validateWorld(world).valid).toBe(true);
  });

  it('accepts a well-formed trade_completed event (₱ paid and ₱ earned)', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push(
      {
        type: 'trade_completed',
        tick: 3,
        worldTime: 180,
        login: 'octocat',
        nativeId: 'gota',
        given: { wood: 1 },
        received: {},
        pulsoDelta: 5,
      },
      {
        type: 'trade_completed',
        tick: 3,
        worldTime: 180,
        login: 'octocat',
        nativeId: 'gota',
        given: {},
        received: { pulse_fragment: 1 },
        pulsoDelta: -25,
      },
    );
    const tradeResult = validateWorld(world);
    expect(tradeResult.errors).toEqual([]);
    expect(tradeResult.valid).toBe(true);
  });

  it('accepts a well-formed native_replied event referencing a living native and player', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push({
      type: 'native_replied',
      tick: 3,
      worldTime: 180,
      nativeId: 'gota',
      login: 'octocat',
      message: 'Hm.',
    });
    const result = validateWorld(world);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts a world with no machines field at all (pre-Fábrica backward compatibility)', () => {
    const world = validWorld();
    expect(world.machines).toBeUndefined();
    expect(validateWorld(world).valid).toBe(true);
  });

  it('accepts the 4 well-formed oficinas and a player with crafted items', () => {
    const world = validWorld();
    world.machines = {
      forja: { id: 'forja', name: 'Forja', position: { x: 0, y: 0 } },
      cozinha: { id: 'cozinha', name: 'Cozinha', position: { x: 1, y: 0 } },
      bancada: bancada({ position: { x: 0, y: 1 } }),
      estaleiro: { id: 'estaleiro', name: 'Estaleiro', position: { x: 1, y: 1 } },
    };
    world.players['octocat']!.items = { lanterna: 1, peca_basica: 3 };
    const result = validateWorld(world);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts an empty machines object', () => {
    const world = validWorld();
    world.machines = {};
    expect(validateWorld(world).valid).toBe(true);
  });

  it('accepts a well-formed item_synthesized event referencing a living machine and player', () => {
    const world = validWorld();
    world.machines = { bancada: bancada() };
    world.events.push({
      type: 'item_synthesized',
      tick: 3,
      worldTime: 180,
      login: 'octocat',
      machineId: 'bancada',
      recipeId: 'lanterna',
      output: { itemId: 'lanterna', quantity: 1 },
    });
    const result = validateWorld(world);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('validateWorld - rejects invalid state', () => {
  it('rejects data that is not an object at all', () => {
    expect(validateWorld(null).valid).toBe(false);
    expect(validateWorld('not a world').valid).toBe(false);
    expect(validateWorld(42).valid).toBe(false);
  });

  it('rejects a world missing a required top-level field', () => {
    const world = invalidatableClone();
    delete world['meta'];
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an unknown biome value', () => {
    const world = structuredClone(validWorld());
    // @ts-expect-error - deliberately invalid for the test
    world.tiles[0].biome = 'lava';
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a tiles array whose length does not match width * height', () => {
    const world = structuredClone(validWorld());
    world.tiles.push({ biome: 'meadow' });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/tiles\.length/);
  });

  it('rejects negative energy', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.energy = -5;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects energy above the maximum', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.energy = 999;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a malformed GitHub login (leading hyphen)', () => {
    const world = structuredClone(validWorld());
    const player = world.players['octocat']!;
    delete world.players['octocat'];
    world.players['-bad-login'] = { ...player, login: '-bad-login' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a malformed GitHub login (consecutive hyphens)', () => {
    // GitHub logins never contain "--" - confirm the schema regex actually
    // enforces that instead of just single-hyphen-somewhere-in-the-middle.
    const world = structuredClone(validWorld());
    const player = world.players['octocat']!;
    delete world.players['octocat'];
    world.players['a--b'] = { ...player, login: 'a--b' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a malformed GitHub login (trailing hyphen)', () => {
    const world = structuredClone(validWorld());
    const player = world.players['octocat']!;
    delete world.players['octocat'];
    world.players['bad-login-'] = { ...player, login: 'bad-login-' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a player whose login does not match its map key', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.login = 'someoneelse';
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/does not match its map key/);
  });

  it('rejects a player positioned outside the map bounds', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.position = { x: 999, y: 999 };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/out of bounds/);
  });

  it('rejects a negative inventory quantity', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.inventory.wood = -3;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an extra/unknown property at the world root', () => {
    const world = invalidatableClone();
    world['extra'] = 'not allowed';
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a tile whose resource does not match its biome (wood on water)', () => {
    const world = structuredClone(validWorld());
    world.tiles[0] = { biome: 'water', resource: 'wood' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a tile whose resource does not match its biome (stone outside ruins)', () => {
    const world = structuredClone(validWorld());
    world.tiles[0] = { biome: 'meadow', resource: 'stone' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a pulse fragment sitting on water', () => {
    const world = structuredClone(validWorld());
    world.tiles[0] = { biome: 'water', resource: 'pulse_fragment' };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an event with an unknown type', () => {
    const world: World = structuredClone(validWorld());
    // @ts-expect-error - deliberately invalid for the test
    world.events.push({ type: 'reversao', tick: 4, worldTime: 240 });
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an event missing a field required by its type', () => {
    const world = invalidatableClone();
    (world['events'] as unknown[]).push({ type: 'player_said', tick: 4, worldTime: 240, login: 'octocat' });
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a player_moved event whose "to" position is out of the map bounds', () => {
    // The exact repro from issue #13: this passed validation before events
    // were bounds-checked at all.
    const world = structuredClone(validWorld());
    world.events.push({
      type: 'player_moved',
      tick: 4,
      worldTime: 240,
      login: 'octocat',
      from: { x: 0, y: 0 },
      to: { x: 999999, y: 999999 },
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/events\[\d+\] \(player_moved\).*\.to.*out of bounds/);
  });

  it('rejects a player_moved event whose "from" position is out of the map bounds', () => {
    const world = structuredClone(validWorld());
    world.events.push({
      type: 'player_moved',
      tick: 4,
      worldTime: 240,
      login: 'octocat',
      from: { x: 999999, y: 999999 },
      to: { x: 0, y: 0 },
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/events\[\d+\] \(player_moved\).*\.from.*out of bounds/);
  });

  it('rejects a resource_collected event whose position is out of the map bounds', () => {
    const world = structuredClone(validWorld());
    world.events.push({
      type: 'resource_collected',
      tick: 4,
      worldTime: 240,
      login: 'octocat',
      resource: 'wood',
      quantity: 1,
      position: { x: 999999, y: 999999 },
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/events\[\d+\] \(resource_collected\).*\.position.*out of bounds/);
  });

  it('accepts a core_pulse event with an out-of-range tick but does not touch position/login checks', () => {
    // core_pulse has neither a position nor a login - sanity check that the
    // new per-event checks do not misfire on the one event type that has
    // neither field.
    const world = structuredClone(validWorld());
    world.events.push({ type: 'core_pulse', tick: 4, worldTime: 240 });
    expect(validateWorld(world).valid).toBe(true);
  });

  it('rejects a player_joined event referencing a login absent from players', () => {
    const world = structuredClone(validWorld());
    world.events.push({ type: 'player_joined', tick: 4, worldTime: 240, login: 'ghost' });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/events\[\d+\] \(player_joined\).*\.login \("ghost"\) does not exist in players/);
  });

  it('rejects a player_said event referencing a login absent from players', () => {
    const world = structuredClone(validWorld());
    world.events.push({
      type: 'player_said',
      tick: 4,
      worldTime: 240,
      login: 'ghost',
      message: 'Quem sou eu?',
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/does not exist in players/);
  });

  it('rejects a Native positioned outside the map bounds', () => {
    const world = structuredClone(validWorld());
    world.natives = { gota: gota({ position: { x: 999999, y: 999999 } }) };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/natives\["gota"\]\.position.*out of bounds/);
  });

  it('rejects a Native whose id does not match its map key', () => {
    const world = structuredClone(validWorld());
    world.natives = { gota: gota({ id: 'someoneelse' }) };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/natives\["gota"\]\.id \("someoneelse"\) does not match its map key/);
  });

  it('rejects an unknown Native faction', () => {
    const world = structuredClone(validWorld());
    // @ts-expect-error - deliberately invalid for the test
    world.natives = { gota: gota({ faction: 'villain' }) };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a Native missing a required field', () => {
    const world = invalidatableClone();
    const badGota: Record<string, unknown> = { ...gota() };
    delete badGota['hp'];
    world['natives'] = { gota: badGota };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a native_spoke event whose nativeId is absent from natives', () => {
    const world = structuredClone(validWorld());
    world.natives = { gota: gota() };
    world.events.push({ type: 'native_spoke', tick: 4, worldTime: 240, nativeId: 'ghost', message: 'Eco...' });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/events\[\d+\] \(native_spoke\)\.nativeId \("ghost"\) does not exist in natives/);
  });

  it('rejects a native_spoke event when the world has no natives at all', () => {
    const world = structuredClone(validWorld());
    world.events.push({ type: 'native_spoke', tick: 4, worldTime: 240, nativeId: 'gota', message: 'Eco...' });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/does not exist in natives/);
  });

  it('rejects a native_spoke message over the 280-char limit', () => {
    const world = structuredClone(validWorld());
    world.natives = { gota: gota() };
    world.events.push({
      type: 'native_spoke',
      tick: 4,
      worldTime: 240,
      nativeId: 'gota',
      message: 'x'.repeat(281),
    });
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects negative Native hp', () => {
    const world = structuredClone(validWorld());
    world.natives = { gota: gota({ hp: -1 }) };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a negative pulso balance (₱ debt does not exist)', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.pulso = -1;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a fractional pulso balance (₱ is indivisible)', () => {
    const world = structuredClone(validWorld());
    world.players['octocat']!.pulso = 2.5;
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a trade_completed event whose login is not a living player', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push({
      type: 'trade_completed',
      tick: 3,
      worldTime: 180,
      login: 'fantasma',
      nativeId: 'gota',
      given: { wood: 1 },
      received: {},
      pulsoDelta: 5,
    });
    const tradeResult = validateWorld(world);
    expect(tradeResult.valid).toBe(false);
    expect(tradeResult.errors.join('\n')).toContain('does not exist in players');
  });

  it('rejects a native_replied event whose login is not a living player', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push({
      type: 'native_replied',
      tick: 3,
      worldTime: 180,
      nativeId: 'gota',
      login: 'fantasma',
      message: 'Hm.',
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('does not exist in players');
  });

  it('rejects a trade_completed event whose nativeId is not a living native', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push({
      type: 'trade_completed',
      tick: 3,
      worldTime: 180,
      login: 'octocat',
      nativeId: 'raiz',
      given: { wood: 1 },
      received: {},
      pulsoDelta: 5,
    });
    const tradeResult = validateWorld(world);
    expect(tradeResult.valid).toBe(false);
    expect(tradeResult.errors.join('\n')).toContain('does not exist in natives');
  });

  it('rejects a native_replied event whose nativeId is not a living native', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push({
      type: 'native_replied',
      tick: 3,
      worldTime: 180,
      nativeId: 'raiz',
      login: 'octocat',
      message: 'Hm.',
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('does not exist in natives');
  });

  it('rejects a native_replied message beyond the 280-char cap', () => {
    const world = validWorld();
    world.natives = { gota: gota() };
    world.events.push({
      type: 'native_replied',
      tick: 3,
      worldTime: 180,
      nativeId: 'gota',
      login: 'octocat',
      message: 'x'.repeat(281),
    });
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a Machine positioned outside the map bounds', () => {
    const world = structuredClone(validWorld());
    world.machines = { bancada: bancada({ position: { x: 999999, y: 999999 } }) };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/machines\["bancada"\]\.position.*out of bounds/);
  });

  it('rejects a Machine whose id does not match its map key', () => {
    const world = structuredClone(validWorld());
    world.machines = { bancada: bancada({ id: 'forja' }) };
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/machines\["bancada"\]\.id \("forja"\) does not match its map key/);
  });

  it('rejects an unknown MachineId', () => {
    const world = structuredClone(validWorld());
    // @ts-expect-error - deliberately invalid for the test
    world.machines = { fabricaFantasma: bancada({ id: 'fabricaFantasma' }) };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a Machine missing a required field', () => {
    const world = invalidatableClone();
    const badMachine: Record<string, unknown> = { ...bancada() };
    delete badMachine['name'];
    world['machines'] = { bancada: badMachine };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects a player.items entry keyed by an unknown item id', () => {
    const world = invalidatableClone();
    (world['players'] as Record<string, Record<string, unknown>>)['octocat']!['items'] = { espada_lendaria: 1 };
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an item_synthesized event whose machineId is absent from machines', () => {
    const world = structuredClone(validWorld());
    world.machines = { bancada: bancada() };
    world.events.push({
      type: 'item_synthesized',
      tick: 4,
      worldTime: 240,
      login: 'octocat',
      machineId: 'estaleiro',
      recipeId: 'carrinho_de_maos',
      output: { itemId: 'carrinho_de_maos', quantity: 1 },
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(
      /events\[\d+\] \(item_synthesized\)\.machineId \("estaleiro"\) does not exist in machines/,
    );
  });

  it('rejects an item_synthesized event when the world has no machines at all', () => {
    const world = structuredClone(validWorld());
    world.events.push({
      type: 'item_synthesized',
      tick: 4,
      worldTime: 240,
      login: 'octocat',
      machineId: 'bancada',
      recipeId: 'lanterna',
      output: { itemId: 'lanterna', quantity: 1 },
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/does not exist in machines/);
  });

  it('rejects an item_synthesized event whose login is not a living player', () => {
    const world = structuredClone(validWorld());
    world.machines = { bancada: bancada() };
    world.events.push({
      type: 'item_synthesized',
      tick: 4,
      worldTime: 240,
      login: 'ghost',
      machineId: 'bancada',
      recipeId: 'lanterna',
      output: { itemId: 'lanterna', quantity: 1 },
    });
    const result = validateWorld(world);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/does not exist in players/);
  });

  it('rejects an item_synthesized event with an unknown output itemId', () => {
    const world = structuredClone(validWorld());
    world.machines = { bancada: bancada() };
    world.events.push({
      type: 'item_synthesized',
      tick: 4,
      worldTime: 240,
      login: 'octocat',
      machineId: 'bancada',
      output: { itemId: 'espada_lendaria', quantity: 1 },
      recipeId: 'espada_lendaria',
    });
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an item_synthesized event with a non-positive output quantity', () => {
    const world = structuredClone(validWorld());
    world.machines = { bancada: bancada() };
    world.events.push({
      type: 'item_synthesized',
      tick: 4,
      worldTime: 240,
      login: 'octocat',
      machineId: 'bancada',
      recipeId: 'lanterna',
      output: { itemId: 'lanterna', quantity: 0 },
    });
    expect(validateWorld(world).valid).toBe(false);
  });
});

describe('assertValidWorld', () => {
  it('does not throw for a valid world', () => {
    expect(() => assertValidWorld(validWorld())).not.toThrow();
  });

  it('throws a readable error for invalid state', () => {
    const world = invalidatableClone();
    delete world['events'];
    expect(() => assertValidWorld(world)).toThrow(/Invalid world state/);
  });
});

describe('worldSchema vs. types.ts constants (anti-drift)', () => {
  // engine/types.ts is the documented source of truth (see its file header)
  // and engine/schema/world.schema.json is hand-maintained to mirror it -
  // nothing regenerates one from the other. If a bound like MAX_ENERGY ever
  // changes in one place and not the other, these tests fail loudly instead
  // of quietly letting the two disagree until a real player is wrongly
  // rejected (or wrongly accepted).
  const schema = worldSchema as {
    definitions: {
      Player: {
        properties: { energy: { minimum: number; maximum: number }; pulso: { minimum: number } };
      };
      NativeSpokeEvent: { properties: { message: { minLength: number; maxLength: number } } };
      NativeRepliedEvent: { properties: { message: { minLength: number; maxLength: number } } };
    };
  };
  const energySchema = schema.definitions.Player.properties.energy;
  const nativeMessageSchema = schema.definitions.NativeSpokeEvent.properties.message;
  const pulsoSchema = schema.definitions.Player.properties.pulso;

  it('keeps the schema Player.energy.maximum equal to MAX_ENERGY', () => {
    expect(energySchema.maximum).toBe(MAX_ENERGY);
  });

  it('keeps the schema Player.energy.minimum at zero', () => {
    expect(energySchema.minimum).toBe(0);
  });

  it('keeps STARTING_ENERGY inside the schema-allowed energy range', () => {
    // A freshly-created player (commands.ts "entrar") is given
    // STARTING_ENERGY outright; if that ever exceeded the schema's cap, the
    // very first tick a player joins would produce an invalid world.
    expect(STARTING_ENERGY).toBeGreaterThanOrEqual(energySchema.minimum);
    expect(STARTING_ENERGY).toBeLessThanOrEqual(energySchema.maximum);
  });

  it('keeps the schema NativeSpokeEvent.message.maxLength equal to NATIVE_MESSAGE_MAX_LENGTH', () => {
    // engine/behavior.ts truncates every spoken line to NATIVE_MESSAGE_MAX_LENGTH
    // before emitting the event; if the schema's cap ever drifted below that,
    // a Native speaking its own scripted dialogue could fail validation.
    expect(nativeMessageSchema.maxLength).toBe(NATIVE_MESSAGE_MAX_LENGTH);
  });

  it('keeps the schema NativeSpokeEvent.message.minLength at 1 (no empty falas)', () => {
    expect(nativeMessageSchema.minLength).toBe(1);
  });

  it('keeps the schema Player.pulso.minimum at zero (₱ debt does not exist)', () => {
    expect(pulsoSchema.minimum).toBe(0);
  });

  it('keeps STARTING_PULSO schema-legal, so /entrar can never mint an invalid player', () => {
    expect(STARTING_PULSO).toBeGreaterThanOrEqual(pulsoSchema.minimum);
    expect(Number.isInteger(STARTING_PULSO)).toBe(true);
  });

  it('keeps the schema NativeRepliedEvent.message caps in step with NATIVE_MESSAGE_MAX_LENGTH', () => {
    // engine/behavior.ts's conversationReply truncates to NATIVE_MESSAGE_MAX_LENGTH,
    // exactly like the autonomous falas - the two event types must never drift apart.
    const repliedMessageSchema = schema.definitions.NativeRepliedEvent.properties.message;
    expect(repliedMessageSchema.maxLength).toBe(NATIVE_MESSAGE_MAX_LENGTH);
    expect(repliedMessageSchema.minLength).toBe(1);
  });

  it('keeps the schema MachineId enum equal to MACHINES catalog keys (A Fábrica, v2.5)', () => {
    const machineIdSchema = (worldSchema as { definitions: { MachineId: { enum: string[] } } }).definitions
      .MachineId;
    expect(machineIdSchema.enum.slice().sort()).toEqual(Object.keys(MACHINES).sort());
  });

  it('keeps the schema ItemId enum equal to ITEM_CATALOG keys (A Fábrica, v2.5) - hand-mirrored, pinned here', () => {
    const itemIdSchema = (worldSchema as { definitions: { ItemId: { enum: string[] } } }).definitions.ItemId;
    expect(itemIdSchema.enum.slice().sort()).toEqual(Object.keys(ITEM_CATALOG).sort());
  });

  it('keeps the schema TileDeco enum equal to TILE_DECOS (A Cidade, R7) - hand-mirrored, pinned here', () => {
    const tileDecoSchema = (worldSchema as { definitions: { TileDeco: { enum: string[] } } }).definitions.TileDeco;
    expect(tileDecoSchema.enum.slice().sort()).toEqual(TILE_DECOS.slice().sort());
  });

  it('keeps TILE_DECO_OBJECTS a strict subset of TILE_DECOS (every standing-object kind is a legal deco)', () => {
    for (const deco of TILE_DECO_OBJECTS) expect(TILE_DECOS).toContain(deco);
    expect(TILE_DECO_OBJECTS.length).toBeLessThan(TILE_DECOS.length);
  });
});

describe('Tile.deco (A Cidade, R7 - purely visual decoration layer)', () => {
  it('accepts every TileDeco kind on a meadow tile', () => {
    for (const deco of TILE_DECOS) {
      const world = validWorld();
      world.tiles[0] = { biome: 'meadow', deco };
      const result = validateWorld(world);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('accepts deco alongside a resource (a fragment lying on the pavement is legal)', () => {
    const world = validWorld();
    world.tiles[1] = { biome: 'forest', resource: 'wood', deco: 'trail' };
    expect(validateWorld(world).valid).toBe(true);
  });

  it('rejects deco on water (o rio continua protagonista - CITY_PLAN)', () => {
    const world = validWorld();
    world.tiles[0] = { biome: 'water', deco: 'plaza' } as World['tiles'][number];
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects deco on the Núcleo itself (core tiles stay untouched - CITY_PLAN)', () => {
    const world = validWorld();
    world.tiles[3] = { biome: 'core', deco: 'pylon' } as World['tiles'][number];
    expect(validateWorld(world).valid).toBe(false);
  });

  it('rejects an unknown deco kind', () => {
    const world = invalidatableClone();
    (world['tiles'] as Array<Record<string, unknown>>)[0] = { biome: 'meadow', deco: 'neon_sign' };
    expect(validateWorld(world).valid).toBe(false);
  });
});
