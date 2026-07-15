/**
 * src/oficinas.ts
 *
 * "Oficinas" - A Fábrica até a tela (R4, D-23/D-25a): the 4 máquinas-
 * sintetizador (Forja/Cozinha/Bancada/Estaleiro), where each one stands,
 * what it fabricates, and a one-tap action per receita - the same "link
 * pré-preenchido + agir daqui" pattern trade.ts/nativos.ts already use.
 * Catalog/recipes are imported straight from engine/fabrication.ts
 * (MACHINES/SYNTHESIS_RECIPES) - this panel never redefines its own numbers,
 * so screen and engine can never drift (same reasoning as trade.ts's
 * TRADE_RECIPES import).
 *
 * Player-aware, read-only: when a login is saved (meu-no.ts, itself either
 * typed by hand or auto-filled by auth.ts once a player is authenticated),
 * each recipe shows whether the CURRENT inventory+items already cover it
 * ("✓ você tem os materiais" / "faltam: 2 pedra") - computed here with
 * getOwn/getItemQty straight off world.players[login], the same public
 * Registro meu-no.ts reads. This is a preview only: engine/fabrication.ts's
 * attemptSynthesis re-checks everything for real when the tick runs, so a
 * stale/racy preview here can never desync the actual outcome.
 *
 * XSS: same rule as the rest of the HUD - every string lands via
 * textContent, never innerHTML. Machine names/descriptions/recipe text are
 * all our own trusted engine data, not player input, but the habit is the
 * rule regardless.
 *
 * R6 (D-17): `readOnly` (main.ts, true while visiting another world through
 * a portal) hides the "abrir /sintetizar" link and "agir daqui" button -
 * MACHINE_IDS is a fixed engine list, not read off `world.machines`, so
 * without this a visited world with no oficinas of its own would still show
 * fully clickable synthesis actions that quietly target O Coração's tick
 * instead. The recipe text and materials preview stay visible either way.
 */
import type { MachineId, Player, ResourceType, World } from '../../engine/types';
import { getItemQty, getOwn, MACHINE_IDS, RESOURCE_LABELS_PTBR, RESOURCE_TYPES } from '../../engine/types';
import {
  describeInputs,
  FABRICATION_RANGE_TILES,
  itemLabel,
  MACHINES,
  SYNTHESIS_RECIPES,
  type SynthesisRecipe,
} from '../../engine/fabrication';
import { createCommandIssue, isLoggedIn } from './auth';
import { getSavedLogin } from './meu-no';

const ISSUE_BASE_URL = 'https://github.com/brigsd/nos/issues/new';

function sintetizarIssueUrl(recipeId: string): string {
  const params = new URLSearchParams({ template: 'sintetizar.yml', receita: recipeId });
  return `${ISSUE_BASE_URL}?${params.toString()}`;
}

/** Handles a click on "agir daqui": POST the /sintetizar issue via the API, falling back to the pre-filled link on any failure. */
function actOnRecipe(button: HTMLButtonElement, fallbackHref: string, recipeId: string): void {
  button.disabled = true;
  button.textContent = 'enviando…';
  createCommandIssue('Comando: /sintetizar', { Receita: recipeId })
    .then(({ number }) => {
      button.textContent = `enviado (#${number})`;
    })
    .catch((err: unknown) => {
      console.warn('Não deu para agir direto, abrindo a issue:', err);
      window.open(fallbackHref, '_blank', 'noopener,noreferrer');
      button.disabled = false;
      button.textContent = 'agir daqui';
    });
}

/** Whether `key` names one of the 3 base resources, as opposed to a crafted ITEM_CATALOG id - local mirror of engine/fabrication.ts's private isResourceType (not exported; this display-only check has no business reaching for a non-exported engine helper). */
function isResourceKey(key: string): key is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(key);
}

/** How many units of input token `key` (resource or item id) `player` currently holds. */
function heldQty(player: Player, key: string): number {
  return isResourceKey(key) ? (player.inventory[key] ?? 0) : getItemQty(player, key);
}

/** pt-BR label for an input token (resource or item id). */
function tokenLabel(key: string): string {
  return isResourceKey(key) ? RESOURCE_LABELS_PTBR[key] : itemLabel(key);
}

interface MaterialsCheck {
  ok: boolean;
  text: string;
}

/**
 * Compares `player`'s CURRENT holdings against `inputs` - a display-only
 * preview of what attemptSynthesis (engine/fabrication.ts) would find right
 * now. Mirrors that function's own missing-materials loop but reports the
 * shortfall (needed - held), not the full requirement, matching the
 * "faltam: 2 pedra" phrasing this panel promises.
 */
function checkMaterials(player: Player, inputs: Record<string, number>): MaterialsCheck {
  const missing: string[] = [];
  for (const [key, needed] of Object.entries(inputs)) {
    const shortfall = needed - heldQty(player, key);
    if (shortfall > 0) missing.push(`${shortfall} ${tokenLabel(key)}`);
  }
  return missing.length === 0
    ? { ok: true, text: '✓ você tem os materiais' }
    : { ok: false, text: `faltam: ${missing.join(', ')}` };
}

/** pt-BR one-line summary of a recipe, e.g. "1 Luvas de Forja — a partir de 2 pedra + 1 madeira · 5 energia". */
function describeSynthesis(recipe: SynthesisRecipe): string {
  return `${recipe.output.quantity} ${itemLabel(recipe.output.itemId)} — a partir de ${describeInputs(recipe.inputs)} · ${recipe.energyCost} energia`;
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

function recipeItem(recipeId: string, recipe: SynthesisRecipe, player: Player | undefined, readOnly: boolean): HTMLElement {
  const item = el('li', 'oficina-recipe');
  item.appendChild(el('p', 'oficina-recipe-desc', describeSynthesis(recipe)));

  if (player) {
    const status = checkMaterials(player, recipe.inputs);
    item.appendChild(
      el('p', `oficina-recipe-status ${status.ok ? 'oficina-status-ok' : 'oficina-status-missing'}`, status.text),
    );
  }

  if (readOnly) return item; // R6/D-17: informational only while visiting - see module doc.

  const link = el('a', 'oficina-recipe-link', 'abrir /sintetizar');
  link.href = sintetizarIssueUrl(recipeId);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `Abrir a issue /sintetizar ${recipeId}`;
  item.appendChild(link);

  if (isLoggedIn()) {
    const act = el('button', 'oficina-recipe-act', 'agir daqui');
    act.type = 'button';
    act.title = `Enviar /sintetizar ${recipeId} direto pela API`;
    act.addEventListener('click', () => actOnRecipe(act, link.href, recipeId));
    item.appendChild(act);
  }

  return item;
}

function machineCard(world: World, machineId: MachineId, player: Player | undefined, readOnly: boolean): HTMLElement {
  const catalog = MACHINES[machineId];
  const card = el('li', 'oficina-machine');

  const header = el('p', 'oficina-machine-header');
  const machine = getOwn(world.machines, machineId);
  const where = machine ? `em (${machine.position.x}, ${machine.position.y})` : `ainda não erguida n'O Coração`;
  header.append(
    el('span', 'hud-mural-author', catalog.name),
    document.createTextNode(' '),
    el('span', 'oficina-machine-where', where),
  );
  card.appendChild(header);

  card.appendChild(el('p', 'oficina-machine-desc', catalog.description));

  const recipes = el('ul', 'oficina-recipes');
  for (const [recipeId, recipe] of Object.entries(SYNTHESIS_RECIPES)) {
    if (recipe.machine !== machineId) continue;
    recipes.appendChild(recipeItem(recipeId, recipe, player, readOnly));
  }
  card.appendChild(recipes);

  return card;
}

/**
 * Renders the panel into `rootEl` (a <details> body). Pure function of
 * `world` plus the saved login (meu-no.ts's localStorage pick) - call again
 * whenever either changes. `readOnly` (R6, D-17): true while visiting
 * another world through a portal - see recipeItem's doc.
 */
export function renderOficinas(rootEl: HTMLElement, world: World, readOnly = false): void {
  rootEl.replaceChildren();

  rootEl.appendChild(
    el(
      'p',
      'oficina-hint',
      readOnly
        ? 'Você está de visita — dá pra ver as receitas, mas sintetizar só funciona n\'O Coração.'
        : `Chegue a até ${FABRICATION_RANGE_TILES} tiles da oficina certa com os materiais na mochila — a síntese é instantânea e é selada na próxima batida.`,
    ),
  );

  const login = getSavedLogin();
  const player = login ? getOwn(world.players, login) : undefined;
  if (!player) {
    rootEl.appendChild(
      el('p', 'oficina-hint', 'Diga quem você é em "Meu Nó" para ver se você já tem os materiais de cada receita.'),
    );
  }

  const list = el('ul', 'oficina-list');
  for (const machineId of MACHINE_IDS) {
    list.appendChild(machineCard(world, machineId, player, readOnly));
  }
  rootEl.appendChild(list);
}
