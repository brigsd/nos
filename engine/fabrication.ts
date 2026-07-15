/**
 * engine/fabrication.ts
 *
 * A Fábrica (D-23, D-25a): O Coração é o hub industrial pacífico do
 * metaverso. Jogadores trazem recursos e fabricam, via receitas fixas, tudo
 * que os mundos usam. 4 máquinas-sintetizador, definidas pelo DESTINO do
 * item (D-25a):
 *   - Forja      - tudo que se EQUIPA (arma, armadura, vestível)
 *   - Cozinha    - tudo que se CONSOME (comida, poção, remédio)
 *   - Bancada    - tudo que se USA/LIGA (ferramenta, aparelho, peça)
 *   - Estaleiro  - tudo que se PILOTA (veículo; montado com peças das outras)
 *
 * Estética "sintetizador atemporal" (D-25a): o estilo do produto vem da
 * RECEITA/materiais (dados), nunca de uma máquina duplicada - por isso as 4
 * máquinas abaixo são a lista inteira, para sempre; um novo destino é uma
 * decisão de produto, não de engine.
 *
 * Pure and deterministic - no RNG at all: synthesis is instant once the
 * requirements are met (minigames plug in later, per ofício - design do
 * ideador, D-24). If a future recipe ever needs a random outcome, seed it
 * `${world.meta.seed}-sintese-${issue}`, the same per-event derivation
 * family `/conversar` already uses (engine/commands.ts) - never
 * Date.now()/Math.random().
 *
 * Security: `attemptSynthesis`'s `recipeId` comes straight from a
 * player-authored issue. The lookup goes through `getOwn` (Object.hasOwn) -
 * a hostile key like "__proto__" or "constructor" resolves to `undefined`
 * ("no such recipe"), never to an inherited Object.prototype built-in. Same
 * class of defense as economy.ts's TRADE_RECIPES lookup (docs/CONTINUITY.md,
 * "Segurança do pipeline").
 */

import type { Inventory, MachineId, Player, ResourceType } from './types';
import { getItemQty, getOwn, RESOURCE_LABELS_PTBR, RESOURCE_TYPES } from './types';

/** Chebyshev distance (tiles) within which a player can use a machine - same radius as trading/talking with os Nativos (D-25a keeps A Fábrica's "come here to act" feel consistent with the rest of O Coração). */
export const FABRICATION_RANGE_TILES = 3;

// ---------------------------------------------------------------------------
// MACHINES - the 4 oficinas, catalog data (id/name/grammar/destino). World
// placement (actual map position) is separate - see engine/mapgen.ts's
// seedFactoryMachines, which builds World.machines Machine entries from this
// catalog plus a deterministic position near o Núcleo.
// ---------------------------------------------------------------------------

export interface MachineCatalogEntry {
  id: MachineId;
  name: string;
  /** pt-BR grammatical article ("a Forja", "o Estaleiro") - lets callers build correct phrases ("na Bancada", "no Estaleiro") without hardcoding gender per call site. */
  article: 'a' | 'o';
  /** pt-BR one-liner describing this machine's destino (D-25a) - what kind of item it synthesizes. */
  description: string;
}

export const MACHINES: Record<MachineId, MachineCatalogEntry> = {
  forja: {
    id: 'forja',
    name: 'Forja',
    article: 'a',
    description: 'Forja tudo que se equipa: armas, armaduras, vestíveis.',
  },
  cozinha: {
    id: 'cozinha',
    name: 'Cozinha',
    article: 'a',
    description: 'Cozinha tudo que se consome: comida, poção, remédio.',
  },
  bancada: {
    id: 'bancada',
    name: 'Bancada',
    article: 'a',
    description: 'Bancada tudo que se usa ou liga: ferramenta, aparelho, peça.',
  },
  estaleiro: {
    id: 'estaleiro',
    name: 'Estaleiro',
    article: 'o',
    description: 'Estaleiro tudo que se pilota: veículos, montados com peças das outras máquinas.',
  },
};

/** pt-BR phrase like "na Bancada" / "no Estaleiro" for a machine id (falls back to the raw id if unknown, so a hostile/stale id never throws). */
export function inMachinePhrase(machineId: string): string {
  const machine = getOwn(MACHINES, machineId);
  if (!machine) return machineId;
  return `${machine.article === 'a' ? 'na' : 'no'} ${machine.name}`;
}

// ---------------------------------------------------------------------------
// ITEM_CATALOG - every craftable item, defined by its destino (category).
// ---------------------------------------------------------------------------

export type ItemCategory = 'equipavel' | 'consumivel' | 'aparelho' | 'veiculo';

export const ITEM_CATEGORIES: readonly ItemCategory[] = ['equipavel', 'consumivel', 'aparelho', 'veiculo'];

export interface ItemDef {
  id: string;
  namePtBR: string;
  category: ItemCategory;
  /** Rough craft complexity, 1 = básico. Not a stat (mundo pacífico, sem combate) - just orders the recipe list for players. */
  tier: number;
}

export const ITEM_CATALOG: Record<string, ItemDef> = {
  // Forja - equipavel
  luvas_de_forja: { id: 'luvas_de_forja', namePtBR: 'Luvas de Forja', category: 'equipavel', tier: 1 },
  armadura_de_pulso: { id: 'armadura_de_pulso', namePtBR: 'Armadura de Pulso', category: 'equipavel', tier: 2 },
  // Cozinha - consumivel
  racao_de_viagem: { id: 'racao_de_viagem', namePtBR: 'Ração de Viagem', category: 'consumivel', tier: 1 },
  elixir_de_pulso: { id: 'elixir_de_pulso', namePtBR: 'Elixir de Pulso', category: 'consumivel', tier: 2 },
  // Bancada - aparelho (inclui "peça básica", o elo da cadeia com o Estaleiro)
  peca_basica: { id: 'peca_basica', namePtBR: 'Peça Básica', category: 'aparelho', tier: 1 },
  lanterna: { id: 'lanterna', namePtBR: 'Lanterna', category: 'aparelho', tier: 1 },
  kit_de_ferramentas: { id: 'kit_de_ferramentas', namePtBR: 'Kit de Ferramentas', category: 'aparelho', tier: 2 },
  // Estaleiro - veiculo (montado com peças da Bancada)
  carrinho_de_maos: { id: 'carrinho_de_maos', namePtBR: 'Carrinho de Mãos', category: 'veiculo', tier: 1 },
  bicicleta_do_nucleo: { id: 'bicicleta_do_nucleo', namePtBR: 'Bicicleta do Núcleo', category: 'veiculo', tier: 2 },
};

/** pt-BR display name for an item id (falls back to the raw id if unknown, so a stale/hostile id never throws). */
export function itemLabel(itemId: string): string {
  return getOwn(ITEM_CATALOG, itemId)?.namePtBR ?? itemId;
}

// ---------------------------------------------------------------------------
// SYNTHESIS_RECIPES - data-driven: recipeId -> machine, inputs, output,
// energyCost. `inputs` keys are either a ResourceType (engine/types.ts) or
// an ITEM_CATALOG id - resolved generically by isResourceType() below, so a
// recipe can consume raw resources, other crafted items, or both (the
// Estaleiro recipes do exactly that: peça básica + raw resources).
//
// Convention (not enforced structurally): recipeId equals its own
// output.itemId, so `/sintetizar lanterna` reads naturally as "make a
// lantern" - a future recipe is free to break this (e.g. an upgrade path)
// without any engine change.
// ---------------------------------------------------------------------------

export interface SynthesisRecipe {
  machine: MachineId;
  /** What the player must hold: resource type or item id -> quantity. Energy is checked/charged separately by engine/commands.ts, same as every other costed command. */
  inputs: Record<string, number>;
  output: { itemId: string; quantity: number };
  energyCost: number;
}

export const SYNTHESIS_RECIPES: Record<string, SynthesisRecipe> = {
  luvas_de_forja: {
    machine: 'forja',
    inputs: { stone: 2, wood: 1 },
    output: { itemId: 'luvas_de_forja', quantity: 1 },
    energyCost: 5,
  },
  armadura_de_pulso: {
    machine: 'forja',
    inputs: { stone: 4, pulse_fragment: 1 },
    output: { itemId: 'armadura_de_pulso', quantity: 1 },
    energyCost: 12,
  },
  racao_de_viagem: {
    machine: 'cozinha',
    inputs: { wood: 3 },
    output: { itemId: 'racao_de_viagem', quantity: 2 },
    energyCost: 4,
  },
  elixir_de_pulso: {
    machine: 'cozinha',
    inputs: { pulse_fragment: 1, stone: 1 },
    output: { itemId: 'elixir_de_pulso', quantity: 1 },
    energyCost: 8,
  },
  peca_basica: {
    machine: 'bancada',
    inputs: { wood: 2, stone: 2 },
    output: { itemId: 'peca_basica', quantity: 3 },
    energyCost: 6,
  },
  lanterna: {
    machine: 'bancada',
    inputs: { stone: 1, pulse_fragment: 1 },
    output: { itemId: 'lanterna', quantity: 1 },
    energyCost: 5,
  },
  kit_de_ferramentas: {
    machine: 'bancada',
    inputs: { wood: 4, stone: 2 },
    output: { itemId: 'kit_de_ferramentas', quantity: 1 },
    energyCost: 9,
  },
  carrinho_de_maos: {
    machine: 'estaleiro',
    inputs: { peca_basica: 2, wood: 2 },
    output: { itemId: 'carrinho_de_maos', quantity: 1 },
    energyCost: 15,
  },
  bicicleta_do_nucleo: {
    machine: 'estaleiro',
    inputs: { peca_basica: 3, stone: 2, pulse_fragment: 1 },
    output: { itemId: 'bicicleta_do_nucleo', quantity: 1 },
    energyCost: 20,
  },
};

/** Whether `key` names one of the 3 base resources (engine/types.ts), as opposed to a crafted item id. */
function isResourceType(key: string): key is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(key);
}

/** How many units of input token `key` (resource or item id) `player` currently holds. */
function heldQty(player: Player, key: string): number {
  return isResourceType(key) ? (player.inventory[key] ?? 0) : getItemQty(player, key);
}

/** pt-BR label for an input token (resource or item id). */
function tokenLabel(key: string): string {
  return isResourceType(key) ? RESOURCE_LABELS_PTBR[key] : itemLabel(key);
}

/** pt-BR one-line summary of a recipe's inputs, e.g. "2 pedra + 1 madeira". Used by feedback text and (later) the site's oficina panel. */
export function describeInputs(inputs: Record<string, number>): string {
  const parts = Object.entries(inputs).map(([key, qty]) => `${qty} ${tokenLabel(key)}`);
  return parts.length > 0 ? parts.join(' + ') : 'nada';
}

/**
 * Discriminated on `success` so callers get `output` narrowed to non-null
 * for free on the success branch (no `!` assertions needed) - unlike
 * economy.ts's TradeOutcome (which stays useful shaped even on failure via
 * empty `given`/`received`), a failed synthesis has no output at all.
 */
export type SynthesisOutcome =
  | { success: true; message: string; player: Player; output: { itemId: string; quantity: number } }
  | { success: false; message: string; player: Player; output: null };

function failure(player: Player, message: string): SynthesisOutcome {
  return { success: false, message, player, output: null };
}

/**
 * Resolves one synthesis for `player` against the recipe keyed by `recipeId`
 * (player-supplied string - looked up with getOwn, see module docs). Pure
 * and total: bad input returns a failure outcome with `player` untouched; it
 * never throws.
 *
 * Deliberately does NOT check or charge energy - engine/commands.ts owns
 * every command's energy cost/check (MOVE_ENERGY_COST, COLLECT_ENERGY_COST,
 * TRADE_ENERGY_COST are all applied there too), and only commands.ts has the
 * machine-proximity context needed before this is even worth calling. This
 * mirrors engine/economy.ts's executeTrade, which is likewise energy-agnostic.
 */
export function attemptSynthesis(player: Player, recipeId: string): SynthesisOutcome {
  const recipe = getOwn(SYNTHESIS_RECIPES, recipeId);
  if (!recipe) {
    return failure(player, `Nenhuma receita chamada "${recipeId}" é conhecida pelas oficinas.`);
  }

  const missing: string[] = [];
  for (const [key, needed] of Object.entries(recipe.inputs)) {
    const held = heldQty(player, key);
    if (held < needed) {
      missing.push(`${needed} ${tokenLabel(key)} (você tem ${held})`);
    }
  }
  if (missing.length > 0) {
    return failure(player, `Faltam materiais: ${missing.join(', ')}.`);
  }

  const nextInventory: Inventory = { ...player.inventory };
  const nextItems: Record<string, number> = { ...player.items };
  for (const [key, qty] of Object.entries(recipe.inputs)) {
    if (isResourceType(key)) {
      nextInventory[key] = (nextInventory[key] ?? 0) - qty;
      if (nextInventory[key] === 0) delete nextInventory[key];
    } else {
      nextItems[key] = (nextItems[key] ?? 0) - qty;
      if (nextItems[key] === 0) delete nextItems[key];
    }
  }

  const { itemId, quantity } = recipe.output;
  nextItems[itemId] = (nextItems[itemId] ?? 0) + quantity;

  const updatedPlayer: Player = { ...player, inventory: nextInventory, items: nextItems };

  return {
    success: true,
    message: `Sintetizado ${quantity} ${itemLabel(itemId)} ${inMachinePhrase(recipe.machine)}, a partir de ${describeInputs(recipe.inputs)}.`,
    player: updatedPlayer,
    output: { itemId, quantity },
  };
}
