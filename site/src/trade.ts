/**
 * src/trade.ts
 *
 * "Comércio" - the HUD panel where the economy reaches the screen: each
 * Nativo's stall (what it carries) and the trades it can actually honor
 * right now, each one a link to a pre-filled /trocar issue (the button-
 * builds-the-issue pattern from docs/GDD.md "Cliente"). The engine remains
 * the only authority: this panel only *proposes* commands, the tick settles
 * them.
 *
 * Prices/recipes are imported from engine/economy.ts - the price board on
 * screen is the very object the tick trades with, so they cannot drift.
 */
import type { Native, World } from '../../engine/types';
import { RESOURCE_LABELS_PTBR, RESOURCE_TYPES } from '../../engine/types';
import { describeRecipe, TRADE_RANGE_TILES, TRADE_RECIPES, type TradeRecipe } from '../../engine/economy';

const ISSUE_BASE_URL = 'https://github.com/brigsd/nos/issues/new';

function tradeIssueUrl(nativeId: string, tradeType: string): string {
  const params = new URLSearchParams({ template: 'trocar.yml', nativo: nativeId, troca: tradeType });
  return `${ISSUE_BASE_URL}?${params.toString()}`;
}

/** Whether `native` carries every item this recipe would hand to the player. */
function canFulfill(native: Native, recipe: TradeRecipe): boolean {
  return RESOURCE_TYPES.every((resource) => (native.inventory[resource] ?? 0) >= (recipe.receives.items?.[resource] ?? 0));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stallFor(native: Native): HTMLElement {
  const stall = el('li', 'trade-stall');

  const header = el('p', 'trade-stall-name');
  header.append(el('span', 'hud-mural-author', native.name));
  const stock = RESOURCE_TYPES.filter((resource) => (native.inventory[resource] ?? 0) > 0).map(
    (resource) => `${native.inventory[resource]} ${RESOURCE_LABELS_PTBR[resource]}`,
  );
  header.append(
    document.createTextNode(' '),
    el('span', 'trade-stall-stock', stock.length > 0 ? `carrega ${stock.join(', ')}` : 'de mãos vazias'),
  );
  stall.appendChild(header);

  const offers = el('ul', 'trade-offers');
  for (const [tradeType, recipe] of Object.entries(TRADE_RECIPES)) {
    if (!canFulfill(native, recipe)) continue; // only offers the Nativo can honor right now
    const offer = el('li', 'trade-offer');
    const link = el('a', 'trade-offer-link', describeRecipe(recipe));
    link.href = tradeIssueUrl(native.id, tradeType);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = `Abrir a issue /trocar ${native.id} ${tradeType}`;
    offer.appendChild(link);
    offers.appendChild(offer);
  }
  stall.appendChild(offers);
  return stall;
}

/**
 * Renders the trade panel into `rootEl` (a <details> body). Pure function
 * of `world` - call again when a fresh world arrives.
 */
export function renderComercio(rootEl: HTMLElement, world: World): void {
  rootEl.replaceChildren();

  const natives = Object.values(world.natives ?? {});
  if (natives.length === 0) {
    rootEl.appendChild(el('p', 'meuno-hint', 'Nenhum Nativo à vista para negociar.'));
    return;
  }

  rootEl.appendChild(
    el(
      'p',
      'meuno-hint',
      `Chegue a até ${TRADE_RANGE_TILES} tiles de um Nativo e escolha uma troca — cada uma custa 1 de energia e é selada na próxima batida.`,
    ),
  );

  const stalls = el('ul', 'trade-stalls');
  for (const native of natives.sort((a, b) => a.id.localeCompare(b.id))) {
    stalls.appendChild(stallFor(native));
  }
  rootEl.appendChild(stalls);
}
