import { describe, expect, it } from 'vitest';
import type { Native, Player } from './types';
import { getPulso, RESOURCE_TYPES } from './types';
import {
  describeRecipe,
  describeSide,
  executeTrade,
  TRADE_RANGE_TILES,
  TRADE_RECIPES,
} from './economy';
import { PLAYER_PROXIMITY_TILES } from './behavior';

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

function native(overrides: Partial<Native> = {}): Native {
  return {
    id: 'raiz',
    name: 'Raiz',
    position: { x: 30, y: 31 },
    behaviorTree: 'merchant',
    behaviorState: '{}',
    inventory: { wood: 10 },
    hp: 100,
    faction: 'merchant',
    ...overrides,
  };
}

describe('executeTrade', () => {
  it('sells wood for ₱: item moves to the native, ₱ is minted for the player', () => {
    const outcome = executeTrade(player({ inventory: { wood: 2 } }), native(), 'vender_madeira');
    expect(outcome.success).toBe(true);
    expect(outcome.player.inventory).toEqual({ wood: 1 });
    expect(getPulso(outcome.player)).toBe(5);
    expect(outcome.native.inventory).toEqual({ wood: 11 });
    expect(outcome.given).toEqual({ wood: 1 });
    expect(outcome.received).toEqual({});
    expect(outcome.pulsoDelta).toBe(5);
  });

  it('buys wood with ₱: ₱ is burned, the item leaves the native pack', () => {
    const outcome = executeTrade(player({ pulso: 25 }), native(), 'comprar_madeira');
    expect(outcome.success).toBe(true);
    expect(getPulso(outcome.player)).toBe(15);
    expect(outcome.player.inventory).toEqual({ wood: 1 });
    expect(outcome.native.inventory).toEqual({ wood: 9 });
    expect(outcome.pulsoDelta).toBe(-10);
  });

  it('barters items with no ₱ leg (pulsoDelta 0)', () => {
    const outcome = executeTrade(
      player({ inventory: { wood: 3 } }),
      native({ inventory: { wood: 10, pulse_fragment: 2 } }),
      'madeira_por_fragmento',
    );
    expect(outcome.success).toBe(true);
    expect(outcome.player.inventory).toEqual({ pulse_fragment: 1 });
    expect(outcome.native.inventory).toEqual({ wood: 13, pulse_fragment: 1 });
    expect(outcome.pulsoDelta).toBe(0);
  });

  it('fails barter when the native cannot cover the item leg (goods are conserved, never minted)', () => {
    const outcome = executeTrade(player({ inventory: { wood: 3 } }), native(), 'madeira_por_fragmento');
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain('não carrega fragmento de pulso suficiente');
  });

  it('treats a pre-economy player (pulso undefined) as ₱0', () => {
    const legacy = player({ inventory: { wood: 1 } });
    delete legacy.pulso;
    const outcome = executeTrade(legacy, native(), 'vender_madeira');
    expect(outcome.success).toBe(true);
    expect(outcome.player.pulso).toBe(5);
  });

  it('fails when the player lacks the ₱ the recipe asks', () => {
    const before = player({ pulso: 3 });
    const outcome = executeTrade(before, native(), 'comprar_madeira');
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain('Pulso insuficiente');
    expect(outcome.player).toBe(before); // untouched, same reference
    expect(outcome.pulsoDelta).toBe(0);
  });

  it('fails when the player lacks the items the recipe asks', () => {
    const outcome = executeTrade(player(), native(), 'vender_madeira');
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain('Falta madeira');
  });

  it('fails when the native does not carry what it would hand over', () => {
    const outcome = executeTrade(player({ pulso: 100 }), native({ inventory: {} }), 'comprar_madeira');
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain('não carrega madeira suficiente');
  });

  it('fails cleanly for an unknown recipe', () => {
    const outcome = executeTrade(player(), native(), 'vender_alma');
    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain('Nenhum Nativo conhece a troca');
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'treats hostile recipe key %s as "no such recipe" (getOwn), never as an inherited built-in',
    (hostileKey) => {
      const before = player({ pulso: 1000, inventory: { wood: 9 } });
      const outcome = executeTrade(before, native(), hostileKey);
      expect(outcome.success).toBe(false);
      expect(outcome.player).toBe(before);
      expect(outcome.native.inventory).toEqual({ wood: 10 });
      // And executing it must not have polluted Object.prototype either.
      expect(Object.prototype).not.toHaveProperty('gives');
    },
  );

  it('is deterministic and pure: same inputs => same outcome, inputs never mutated', () => {
    const p = player({ inventory: { wood: 5 }, pulso: 7 });
    const n = native();
    const first = executeTrade(p, n, 'vender_madeira');
    const second = executeTrade(p, n, 'vender_madeira');
    expect(second).toEqual(first);
    expect(p.inventory).toEqual({ wood: 5 }); // caller's objects untouched
    expect(p.pulso).toBe(7);
    expect(n.inventory).toEqual({ wood: 10 });
  });

  it('drops zeroed inventory entries instead of keeping "wood: 0" around', () => {
    const outcome = executeTrade(player({ inventory: { wood: 1 } }), native(), 'vender_madeira');
    expect(outcome.success).toBe(true);
    expect('wood' in outcome.player.inventory).toBe(false);
  });
});

describe('TRADE_RECIPES board sanity (anti-drift)', () => {
  it('every recipe side only references known resource types and positive quantities', () => {
    for (const [key, recipe] of Object.entries(TRADE_RECIPES)) {
      for (const side of [recipe.gives, recipe.receives]) {
        if (side.pulso !== undefined) {
          expect(side.pulso, `${key} pulso leg`).toBeGreaterThan(0);
          expect(Number.isInteger(side.pulso), `${key} pulso leg is an integer`).toBe(true);
        }
        for (const [resource, qty] of Object.entries(side.items ?? {})) {
          expect(RESOURCE_TYPES, `${key} references known resource`).toContain(resource);
          expect(qty, `${key} ${resource} quantity`).toBeGreaterThan(0);
        }
      }
      // A trade with an empty side would mint goods/₱ from nothing (or burn
      // them into nothing) - every recipe must exchange something for something.
      expect(describeSide(recipe.gives), `${key} gives something`).not.toBe('nada');
      expect(describeSide(recipe.receives), `${key} receives something`).not.toBe('nada');
    }
  });

  it('every buy price is above the matching sell price (the ₱ spread is the currency sink)', () => {
    const pairs: Array<[string, string]> = [
      ['comprar_madeira', 'vender_madeira'],
      ['comprar_pedra', 'vender_pedra'],
      ['comprar_fragmento', 'vender_fragmento'],
    ];
    for (const [buy, sell] of pairs) {
      const buyPrice = TRADE_RECIPES[buy]!.gives.pulso!;
      const sellPrice = TRADE_RECIPES[sell]!.receives.pulso!;
      expect(buyPrice, `${buy} > ${sell}`).toBeGreaterThan(sellPrice);
    }
  });

  it('keeps the trade range equal to the radius where Nativos greet players (behavior.ts)', () => {
    expect(TRADE_RANGE_TILES).toBe(PLAYER_PROXIMITY_TILES);
  });

  it('describes recipes in pt-BR for feedback and the site price board', () => {
    expect(describeRecipe(TRADE_RECIPES['vender_madeira']!)).toBe('1 madeira → ₱5');
    expect(describeRecipe(TRADE_RECIPES['comprar_fragmento']!)).toBe('₱25 → 1 fragmento de pulso');
    expect(describeRecipe(TRADE_RECIPES['madeira_por_fragmento']!)).toBe('3 madeira → 1 fragmento de pulso');
  });
});
