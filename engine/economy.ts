/**
 * engine/economy.ts
 *
 * A economia d'O Coração (v2): Pulso (₱) e o comércio com os Nativos.
 * Pure and deterministic - no RNG at all in this module: a trade is a fixed
 * recipe, so "same player + same native + same recipe => same outcome"
 * trivially holds. The tick is the economy's central bank: ₱ is minted when
 * a Native pays a player and burned when a player pays a Native (natives do
 * not hold ₱ themselves - only goods). O Pulso jamais é conversível em
 * dinheiro real, em nenhuma direção (D-20).
 *
 * Security: `executeTrade`'s `tradeType` (and the caller's native id) come
 * straight from a player-authored issue. Every dictionary lookup keyed by
 * those strings goes through `getOwn` (Object.hasOwn) - a hostile key like
 * "__proto__" or "constructor" resolves to `undefined` ("no such recipe"),
 * never to an inherited Object.prototype built-in. This is exactly the v2
 * lockup bug (`/trocar __proto__`) being kept dead (docs/CONTINUITY.md,
 * "Segurança do pipeline").
 */

import type { Inventory, Native, Player, ResourceType } from './types';
import { getOwn, getPulso, RESOURCE_LABELS_PTBR, RESOURCE_TYPES } from './types';

/** Energy cost of one /trocar action (cheap - talking business is not hard labor). */
export const TRADE_ENERGY_COST = 1;

/**
 * Chebyshev distance (tiles) within which a player can trade with a Native.
 * Deliberately equal to engine/behavior.ts's PLAYER_PROXIMITY_TILES: the
 * radius where a merchant greets you ("Quer trocar?") is the radius where
 * the offer is actually valid. An anti-drift test pins the two together.
 */
export const TRADE_RANGE_TILES = 3;

/**
 * One side of a trade: item quantities and/or a ₱ amount. Item keys are
 * always drawn from RESOURCE_TYPES; `pulso` is the currency leg.
 */
export interface TradeSide {
  items?: Inventory;
  pulso?: number;
}

export interface TradeRecipe {
  /** What the player hands over. */
  gives: TradeSide;
  /** What the player gets back. */
  receives: TradeSide;
}

/**
 * The fixed price board every Nativo honors (v2 keeps one shared board; a
 * per-native board is a later refinement). Buy prices sit above sell prices
 * on purpose - the spread is the world's only ₱ sink today, so the currency
 * cannot inflate without bound. Balance numbers follow the frozen v2
 * reference (colaborador2/v2 economy.ts).
 */
export const TRADE_RECIPES: Record<string, TradeRecipe> = {
  comprar_madeira: { gives: { pulso: 10 }, receives: { items: { wood: 1 } } },
  vender_madeira: { gives: { items: { wood: 1 } }, receives: { pulso: 5 } },
  comprar_pedra: { gives: { pulso: 10 }, receives: { items: { stone: 1 } } },
  vender_pedra: { gives: { items: { stone: 1 } }, receives: { pulso: 5 } },
  comprar_fragmento: { gives: { pulso: 25 }, receives: { items: { pulse_fragment: 1 } } },
  vender_fragmento: { gives: { items: { pulse_fragment: 1 } }, receives: { pulso: 20 } },
  fragmento_por_madeira: { gives: { items: { pulse_fragment: 1 } }, receives: { items: { wood: 3 } } },
  madeira_por_fragmento: { gives: { items: { wood: 3 } }, receives: { items: { pulse_fragment: 1 } } },
  fragmento_por_pedra: { gives: { items: { pulse_fragment: 1 } }, receives: { items: { stone: 3 } } },
  pedra_por_fragmento: { gives: { items: { stone: 3 } }, receives: { items: { pulse_fragment: 1 } } },
};

/** Player-facing pt-BR one-liner for a recipe, e.g. "1 madeira → ₱5". Used by feedback text and the site's price board. */
export function describeRecipe(recipe: TradeRecipe): string {
  return `${describeSide(recipe.gives)} → ${describeSide(recipe.receives)}`;
}

/** Player-facing pt-BR rendering of one side of a trade, e.g. "₱10" or "3 madeira". */
export function describeSide(side: TradeSide): string {
  const parts: string[] = [];
  if (side.pulso) parts.push(`₱${side.pulso}`);
  for (const resource of RESOURCE_TYPES) {
    const qty = side.items?.[resource];
    if (qty) parts.push(`${qty} ${RESOURCE_LABELS_PTBR[resource]}`);
  }
  return parts.length > 0 ? parts.join(' + ') : 'nada';
}

export interface TradeOutcome {
  success: boolean;
  /** Player-facing pt-BR feedback (failure reason, or a summary of the completed trade). */
  message: string;
  /** Unchanged on failure. */
  player: Player;
  /** Unchanged on failure. */
  native: Native;
  /** Items the player handed over (empty on failure). */
  given: Inventory;
  /** Items the player received (empty on failure). */
  received: Inventory;
  /** Net ₱ change for the player (0 on failure or pure barter). */
  pulsoDelta: number;
}

function failure(player: Player, native: Native, message: string): TradeOutcome {
  return { success: false, message, player, native, given: {}, received: {}, pulsoDelta: 0 };
}

/**
 * Resolves one trade between `player` and `native` for the recipe keyed by
 * `tradeType` (player-supplied string - looked up with getOwn, see module
 * docs). Pure and total: bad input returns a failure outcome with both
 * parties untouched; it never throws.
 *
 * Item legs are conserved: what the player gives lands in the native's
 * pack, what the player receives leaves it (a native cannot sell goods it
 * does not carry). The ₱ leg is minted/burned by the tick (module docs).
 */
export function executeTrade(player: Player, native: Native, tradeType: string): TradeOutcome {
  const recipe = getOwn(TRADE_RECIPES, tradeType);
  if (!recipe) {
    return failure(player, native, `Nenhum Nativo conhece a troca "${tradeType}".`);
  }

  const playerItems: Inventory = { ...player.inventory };
  const nativeItems: Inventory = { ...native.inventory };
  let pulso = getPulso(player);

  // 1. The player must hold everything the recipe asks of them.
  const givesPulso = recipe.gives.pulso ?? 0;
  if (pulso < givesPulso) {
    return failure(player, native, `Pulso insuficiente: a troca pede ₱${givesPulso} e você carrega ₱${pulso}.`);
  }
  for (const resource of RESOURCE_TYPES) {
    const needed = recipe.gives.items?.[resource] ?? 0;
    const held = playerItems[resource] ?? 0;
    if (held < needed) {
      return failure(
        player,
        native,
        `Falta ${RESOURCE_LABELS_PTBR[resource]}: a troca pede ${needed} e você carrega ${held}.`,
      );
    }
  }

  // 2. The native must carry every item it is about to hand over.
  for (const resource of RESOURCE_TYPES) {
    const needed = recipe.receives.items?.[resource] ?? 0;
    const held = nativeItems[resource] ?? 0;
    if (held < needed) {
      return failure(
        player,
        native,
        `${native.name} não carrega ${RESOURCE_LABELS_PTBR[resource]} suficiente (tem ${held}, a troca pede ${needed}).`,
      );
    }
  }

  // 3. Settle both legs. Item legs move between the two packs; the ₱ leg is
  // minted/burned (natives hold no ₱).
  pulso = pulso - givesPulso + (recipe.receives.pulso ?? 0);
  const given: Inventory = {};
  const received: Inventory = {};
  for (const resource of RESOURCE_TYPES) {
    const out = recipe.gives.items?.[resource] ?? 0;
    if (out > 0) {
      playerItems[resource] = (playerItems[resource] ?? 0) - out;
      nativeItems[resource] = (nativeItems[resource] ?? 0) + out;
      given[resource] = out;
    }
    const back = recipe.receives.items?.[resource] ?? 0;
    if (back > 0) {
      nativeItems[resource] = (nativeItems[resource] ?? 0) - back;
      playerItems[resource] = (playerItems[resource] ?? 0) + back;
      received[resource] = back;
    }
  }
  dropZeroEntries(playerItems);
  dropZeroEntries(nativeItems);

  const pulsoDelta = (recipe.receives.pulso ?? 0) - givesPulso;
  const updatedPlayer: Player = { ...player, inventory: playerItems, pulso };
  const updatedNative: Native = { ...native, inventory: nativeItems };

  return {
    success: true,
    message:
      `Troca selada com ${native.name}: você deu ${describeSide(recipe.gives)} ` +
      `e recebeu ${describeSide(recipe.receives)}. Saldo: ₱${pulso}.`,
    player: updatedPlayer,
    native: updatedNative,
    given,
    received,
    pulsoDelta,
  };
}

/** Removes zeroed item entries so inventories stay as sparse as the schema expects ("missing key means zero"). */
function dropZeroEntries(inventory: Inventory): void {
  for (const resource of RESOURCE_TYPES) {
    if (inventory[resource] === 0) delete inventory[resource];
  }
}
