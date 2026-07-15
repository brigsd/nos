/**
 * src/meu-no.ts
 *
 * "Meu Nó" - the HUD panel showing the player's OFFICIAL belongings: Pulso
 * (₱), energia and inventário, straight from the world state the tick wrote
 * (the Registro, D-22 - never a client-side guess). The site has no login
 * yet (OAuth is D-13, v2), so the player tells the HUD who they are once;
 * the choice persists in localStorage and only ever selects which PUBLIC
 * world entry to display - it grants nothing and is not authentication.
 *
 * DOM-overlay module in the mural.ts mold: pure function of `world` plus a
 * tiny bit of local state (the remembered login). All text lands via
 * `textContent` - a login string is player-typed input.
 *
 * R4 (D-23): also shows crafted `items` (A Fábrica, engine/fabrication.ts)
 * alongside the raw-resource `inventory` - same "missing means zero, read it
 * through the getter" habit as Pulso/energia, via getItemQty.
 */
import type { World } from '../../engine/types';
import { getItemQty, getOwn, getPulso, RESOURCE_LABELS_PTBR, RESOURCE_TYPES } from '../../engine/types';
import { ITEM_CATALOG, itemLabel } from '../../engine/fabrication';

/** localStorage key for "which GitHub login is mine". Deliberately NOT nos_username (that one names the local ghost). */
const LOGIN_STORAGE_KEY = 'nos_login';

/** GitHub's own login shape - anything else is not worth remembering. */
const LOGIN_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

export function getSavedLogin(): string | null {
  const raw = localStorage.getItem(LOGIN_STORAGE_KEY);
  if (!raw) return null;
  const login = raw.trim();
  return LOGIN_PATTERN.test(login) && login.length <= 39 ? login : null;
}

function saveLogin(login: string): void {
  localStorage.setItem(LOGIN_STORAGE_KEY, login);
}

function clearLogin(): void {
  localStorage.removeItem(LOGIN_STORAGE_KEY);
}

/**
 * Auto-fill hook for auth.ts/auth-ui.ts (R2, D-13): once the player has
 * actually authenticated with GitHub, their login is no longer a guess - use
 * it to pick the public entry to display, same as if they had typed it
 * themselves. Silently ignores anything that doesn't look like a GitHub
 * login (defense in depth; the caller already gets `login` from GitHub's own
 * `GET /user`, but this module never trusts an input string on its say-so).
 */
export function setSavedLogin(login: string): void {
  if (LOGIN_PATTERN.test(login) && login.length <= 39) saveLogin(login);
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

/** One "label: value" stat line. */
function statLine(label: string, value: string): HTMLElement {
  const line = el('p', 'meuno-line');
  line.append(el('span', 'meuno-label', label), document.createTextNode(' '), el('span', 'meuno-value', value));
  return line;
}

/**
 * Renders the panel into `rootEl`. Call again with a fresh `world` to
 * refresh. Re-renders itself in place when the player saves/clears a login.
 *
 * `onLoginChange` (R4): optional hook fired right after a save/clear, so a
 * sibling panel whose content also depends on the saved login (oficinas.ts's
 * per-recipe materials preview) can refresh itself too - same "notify on
 * change" shape as main.ts's own renderAuth(authEl, refreshAuthenticatedPanels).
 * Threaded through every recursive self-call so it keeps working after the
 * first save/clear, not just once.
 */
export function renderMeuNo(rootEl: HTMLElement, world: World, onLoginChange?: () => void): void {
  rootEl.replaceChildren();
  rootEl.appendChild(el('h2', 'hud-mural-title', 'Meu Nó'));

  const login = getSavedLogin();

  if (!login) {
    // Ask once who this viewer is in the world.
    const hint = el('p', 'meuno-hint', 'Diga quem você é para ver seu Registro: Pulso, energia e mochila.');
    const form = el('form', 'meuno-form');
    const input = el('input', 'meuno-input');
    input.type = 'text';
    input.placeholder = 'seu login do GitHub';
    input.maxLength = 39;
    input.autocomplete = 'off';
    input.spellcheck = false;
    const button = el('button', 'meuno-button', 'Lembrar');
    button.type = 'submit';
    form.append(input, button);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const value = input.value.trim();
      if (!LOGIN_PATTERN.test(value) || value.length > 39) {
        input.setCustomValidity('Isso não parece um login do GitHub.');
        input.reportValidity();
        return;
      }
      saveLogin(value);
      renderMeuNo(rootEl, world, onLoginChange);
      onLoginChange?.();
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
    rootEl.append(hint, form);
    return;
  }

  const who = el('p', 'meuno-line');
  who.append(el('span', 'hud-mural-author', `@${login}`));
  const forget = el('button', 'meuno-forget', 'não sou eu');
  forget.type = 'button';
  forget.addEventListener('click', () => {
    clearLogin();
    renderMeuNo(rootEl, world, onLoginChange);
    onLoginChange?.();
  });
  who.append(document.createTextNode(' '), forget);
  rootEl.appendChild(who);

  // getOwn, same habit as the engine: `login` is player-typed input, so a
  // hostile "__proto__" must read as "not in the world", never as a built-in.
  const player = getOwn(world.players, login);
  if (!player) {
    const missing = el('p', 'meuno-hint', 'Esse Nó ainda não foi escrito na Crônica.');
    const enter = el('a', 'meuno-cta', 'Abrir /entrar');
    enter.href = 'https://github.com/brigsd/nos/issues/new?template=entrar.yml';
    enter.target = '_blank';
    enter.rel = 'noopener noreferrer';
    rootEl.append(missing, enter);
    return;
  }

  rootEl.appendChild(statLine('Pulso', `₱${getPulso(player)}`));
  rootEl.appendChild(statLine('Energia', String(player.energy)));

  const items = RESOURCE_TYPES.filter((resource) => (player.inventory[resource] ?? 0) > 0).map(
    (resource) => `${player.inventory[resource]} ${RESOURCE_LABELS_PTBR[resource]}`,
  );
  rootEl.appendChild(statLine('Mochila', items.length > 0 ? items.join(' · ') : 'vazia'));

  // A Fábrica (R4): itens fabricados, na ordem fixa do ITEM_CATALOG (mesmo
  // papel que RESOURCE_TYPES cumpre acima para a mochila) em vez da ordem de
  // inserção de player.items, que varia por jogador conforme o que cada um
  // sintetizou primeiro.
  const crafted = Object.keys(ITEM_CATALOG)
    .filter((itemId) => getItemQty(player, itemId) > 0)
    .map((itemId) => `${getItemQty(player, itemId)} ${itemLabel(itemId)}`);
  rootEl.appendChild(statLine('Fabricados', crafted.length > 0 ? crafted.join(' · ') : 'nenhum'));
}
