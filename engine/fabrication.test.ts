import { describe, expect, it } from 'vitest';
import type { Player } from './types';
import { MAX_ENERGY, RESOURCE_TYPES } from './types';
import { PLAYER_PROXIMITY_TILES } from './behavior';
import { TRADE_RANGE_TILES } from './economy';
import {
  attemptSynthesis,
  describeInputs,
  FABRICATION_RANGE_TILES,
  inMachinePhrase,
  ITEM_CATALOG,
  ITEM_CATEGORIES,
  itemLabel,
  MACHINES,
  SYNTHESIS_RECIPES,
} from './fabrication';

function player(overrides: Partial<Player> = {}): Player {
  return {
    login: 'alice',
    position: { x: 30, y: 30 },
    inventory: {},
    energy: 50,
    pulso: 0,
    ...overrides,
  };
}

describe('MACHINES catalog (anti-drift)', () => {
  it('has exactly the 4 oficinas from D-25a, each keyed by its own id', () => {
    expect(Object.keys(MACHINES).sort()).toEqual(['bancada', 'cozinha', 'estaleiro', 'forja']);
    for (const [key, machine] of Object.entries(MACHINES)) {
      expect(machine.id).toBe(key);
      expect(machine.name.length).toBeGreaterThan(0);
      expect(['a', 'o']).toContain(machine.article);
      expect(machine.description.length).toBeGreaterThan(0);
    }
  });

  it('builds a grammatically-tagged phrase for a known machine, and falls back to the raw id for an unknown one', () => {
    expect(inMachinePhrase('bancada')).toBe('na Bancada');
    expect(inMachinePhrase('estaleiro')).toBe('no Estaleiro');
    expect(inMachinePhrase('forja')).toBe('na Forja');
    expect(inMachinePhrase('cozinha')).toBe('na Cozinha');
    expect(inMachinePhrase('fantasma')).toBe('fantasma');
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'treats hostile machine id %s as unknown (getOwn), never as an inherited built-in',
    (hostileKey) => {
      expect(inMachinePhrase(hostileKey)).toBe(hostileKey);
    },
  );
});

describe('ITEM_CATALOG (anti-drift)', () => {
  it('every entry is keyed by its own id and carries a non-empty pt-BR name', () => {
    for (const [key, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.id).toBe(key);
      expect(item.namePtBR.length).toBeGreaterThan(0);
      expect(ITEM_CATEGORIES).toContain(item.category);
      expect(Number.isInteger(item.tier)).toBe(true);
      expect(item.tier).toBeGreaterThan(0);
    }
  });

  it('has between 8 and 12 items, spanning all 4 categories (one per destino)', () => {
    const count = Object.keys(ITEM_CATALOG).length;
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(12);
    const categories = new Set(Object.values(ITEM_CATALOG).map((item) => item.category));
    expect(categories).toEqual(new Set(ITEM_CATEGORIES));
  });

  it('resolves a label for a known item, and falls back to the raw id for an unknown one', () => {
    expect(itemLabel('lanterna')).toBe('Lanterna');
    expect(itemLabel('fantasma')).toBe('fantasma');
  });
});

describe('SYNTHESIS_RECIPES board sanity (anti-drift)', () => {
  it('every recipe references a known machine, only known resource/item input tokens, and a known output item', () => {
    for (const [recipeId, recipe] of Object.entries(SYNTHESIS_RECIPES)) {
      expect(MACHINES, `${recipeId} machine`).toHaveProperty(recipe.machine);

      for (const [token, qty] of Object.entries(recipe.inputs)) {
        const isKnownResource = (RESOURCE_TYPES as readonly string[]).includes(token);
        const isKnownItem = Object.hasOwn(ITEM_CATALOG, token);
        expect(isKnownResource || isKnownItem, `${recipeId} input "${token}" is a known resource or item`).toBe(
          true,
        );
        expect(Number.isInteger(qty), `${recipeId} input "${token}" quantity is an integer`).toBe(true);
        expect(qty, `${recipeId} input "${token}" quantity`).toBeGreaterThan(0);
      }

      expect(Object.keys(recipe.inputs).length, `${recipeId} has at least one input`).toBeGreaterThan(0);
      expect(ITEM_CATALOG, `${recipeId} output item exists in the catalog`).toHaveProperty(recipe.output.itemId);
      expect(Number.isInteger(recipe.output.quantity), `${recipeId} output quantity is an integer`).toBe(true);
      expect(recipe.output.quantity, `${recipeId} output quantity`).toBeGreaterThan(0);

      expect(Number.isInteger(recipe.energyCost), `${recipeId} energyCost is an integer`).toBe(true);
      expect(recipe.energyCost, `${recipeId} energyCost positive`).toBeGreaterThan(0);
      // A recipe that costs more energy than a player can ever hold could
      // never be completed, even from full energy - the same sanity bound
      // STARTING_ENERGY is held to against the schema (validate.test.ts).
      expect(recipe.energyCost, `${recipeId} energyCost fits within MAX_ENERGY`).toBeLessThanOrEqual(MAX_ENERGY);
    }
  });

  it('has between 8 and 12 recipes, at least 2 for each of the 4 machines', () => {
    const count = Object.keys(SYNTHESIS_RECIPES).length;
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(12);

    const perMachine = new Map<string, number>();
    for (const recipe of Object.values(SYNTHESIS_RECIPES)) {
      perMachine.set(recipe.machine, (perMachine.get(recipe.machine) ?? 0) + 1);
    }
    for (const machineId of Object.keys(MACHINES)) {
      expect(perMachine.get(machineId) ?? 0, `${machineId} has at least 2 recipes`).toBeGreaterThanOrEqual(2);
    }
  });

  it('proves the production chain: peça básica is made at the Bancada and consumed by Estaleiro recipes', () => {
    const peca = SYNTHESIS_RECIPES['peca_basica'];
    expect(peca).toBeDefined();
    expect(peca!.machine).toBe('bancada');
    expect(peca!.output.itemId).toBe('peca_basica');

    const estaleiroRecipesUsingPeca = Object.values(SYNTHESIS_RECIPES).filter(
      (recipe) => recipe.machine === 'estaleiro' && 'peca_basica' in recipe.inputs,
    );
    expect(estaleiroRecipesUsingPeca.length).toBeGreaterThan(0);
  });

  it('describes recipe inputs in pt-BR', () => {
    expect(describeInputs(SYNTHESIS_RECIPES['lanterna']!.inputs)).toBe('1 pedra + 1 fragmento de pulso');
    expect(describeInputs({})).toBe('nada');
  });

  it('keeps the fabrication range equal to the radius used for trading/talking with os Nativos (consistent "come here to act" feel)', () => {
    expect(FABRICATION_RANGE_TILES).toBe(PLAYER_PROXIMITY_TILES);
    expect(FABRICATION_RANGE_TILES).toBe(TRADE_RANGE_TILES);
  });
});

describe('attemptSynthesis', () => {
  it('synthesizes a lanterna at the Bancada from raw resources, consuming inputs and producing the item', () => {
    const before = player({ inventory: { stone: 2, pulse_fragment: 3 } });
    const outcome = attemptSynthesis(before, 'lanterna');
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error('unreachable');
    expect(outcome.output).toEqual({ itemId: 'lanterna', quantity: 1 });
    expect(outcome.player.inventory).toEqual({ stone: 1, pulse_fragment: 2 });
    expect(outcome.player.items).toEqual({ lanterna: 1 });
    expect(outcome.message).toContain('Lanterna');
  });

  it('synthesizes peça básica (Bancada) then consumes it at the Estaleiro to build a carrinho de mãos - the full production chain', () => {
    const afterPecas = attemptSynthesis(player({ inventory: { wood: 4, stone: 4 } }), 'peca_basica');
    expect(afterPecas.success).toBe(true);
    if (!afterPecas.success) throw new Error('unreachable');
    expect(afterPecas.player.items).toEqual({ peca_basica: 3 });
    expect(afterPecas.player.inventory).toEqual({ wood: 2, stone: 2 });

    const afterCarrinho = attemptSynthesis(afterPecas.player, 'carrinho_de_maos');
    expect(afterCarrinho.success).toBe(true);
    if (!afterCarrinho.success) throw new Error('unreachable');
    expect(afterCarrinho.output).toEqual({ itemId: 'carrinho_de_maos', quantity: 1 });
    expect(afterCarrinho.player.items).toEqual({ peca_basica: 1, carrinho_de_maos: 1 });
    expect(afterCarrinho.player.inventory).toEqual({ stone: 2 });
  });

  it('fails cleanly for an unknown recipe, player untouched', () => {
    const before = player({ inventory: { wood: 99 } });
    const outcome = attemptSynthesis(before, 'espada_lendaria');
    expect(outcome.success).toBe(false);
    expect(outcome.output).toBeNull();
    expect(outcome.message).toContain('Nenhuma receita chamada');
    expect(outcome.player).toBe(before);
  });

  it('fails and names exactly what is missing (resources) - graceful, pt-BR, specific', () => {
    const outcome = attemptSynthesis(player({ inventory: { stone: 1 } }), 'lanterna');
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain('Faltam materiais');
    expect(outcome.message).toContain('1 fragmento de pulso (você tem 0)');
  });

  it('fails and names exactly what is missing (an intermediate item, not yet crafted)', () => {
    const outcome = attemptSynthesis(player({ inventory: { wood: 10 } }), 'carrinho_de_maos');
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain('2 Peça Básica (você tem 0)');
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'treats hostile recipe id %s as "no such recipe" (getOwn), never as an inherited built-in',
    (hostileKey) => {
      const before = player({ inventory: { wood: 99, stone: 99, pulse_fragment: 99 } });
      const outcome = attemptSynthesis(before, hostileKey);
      expect(outcome.success).toBe(false);
      expect(outcome.player).toBe(before);
      expect(Object.prototype).not.toHaveProperty('machine');
    },
  );

  it('is deterministic and pure: same inputs => same outcome, caller objects never mutated', () => {
    const before = player({ inventory: { stone: 2, pulse_fragment: 1 } });
    const first = attemptSynthesis(before, 'lanterna');
    const second = attemptSynthesis(before, 'lanterna');
    expect(second).toEqual(first);
    expect(before.inventory).toEqual({ stone: 2, pulse_fragment: 1 });
    expect(before.items).toBeUndefined();
  });

  it('drops zeroed inventory entries instead of keeping e.g. "stone: 0" around', () => {
    const outcome = attemptSynthesis(player({ inventory: { stone: 1, pulse_fragment: 1 } }), 'lanterna');
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error('unreachable');
    expect('stone' in outcome.player.inventory).toBe(false);
    expect('pulse_fragment' in outcome.player.inventory).toBe(false);
  });

  it('stacks output onto an existing items balance rather than overwriting it', () => {
    const withOne = player({ inventory: { stone: 4, pulse_fragment: 2 }, items: { lanterna: 5 } });
    const outcome = attemptSynthesis(withOne, 'lanterna');
    expect(outcome.success).toBe(true);
    if (!outcome.success) throw new Error('unreachable');
    expect(outcome.player.items).toEqual({ lanterna: 6 });
  });
});
