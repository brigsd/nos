/**
 * src/nativos.ts
 *
 * "Nativos" - the HUD panel where the light NPC interaction reaches the
 * screen: who inhabits O Coração, where they are right now, their latest
 * answer to a player, and a one-tap "puxar conversa" link that opens a
 * pre-filled /conversar issue (the button-builds-the-issue pattern from
 * docs/GDD.md "Cliente"). Presentation only - the reply itself is rolled by
 * the tick, deterministically, on the server side.
 *
 * DOM-overlay module in the mural.ts mold; every string that ever came from
 * a player (logins) or from world state lands via textContent.
 */
import type { Native, NativeRepliedEvent, World, WorldEvent } from '../../engine/types';

const ISSUE_BASE_URL = 'https://github.com/brigsd/nos/issues/new';

function conversarIssueUrl(nativeId: string): string {
  const params = new URLSearchParams({ template: 'conversar.yml', nativo: nativeId });
  return `${ISSUE_BASE_URL}?${params.toString()}`;
}

/** Short pt-BR descriptor per faction (LORE voice: curto e concreto; Nativos são mestres de ofício, não guerreiros). */
const FACTION_DESCRIPTIONS: Record<Native['faction'], string> = {
  wanderer: 'colhe e mistura o que o rio larga',
  merchant: 'negocia o que a floresta dá',
  guardian: 'dá forma ao que restou das ruínas',
};

function isNativeReplied(event: WorldEvent): event is NativeRepliedEvent {
  return event.type === 'native_replied';
}

/** The most recent thing `nativeId` answered anyone, if any reply is still in the event log. */
function lastReply(world: World, nativeId: string): NativeRepliedEvent | undefined {
  return world.events.filter(isNativeReplied).filter((event) => event.nativeId === nativeId).at(-1);
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

function nativeCard(world: World, native: Native): HTMLElement {
  const card = el('li', 'nativo-card');

  const header = el('p', 'nativo-header');
  header.append(
    el('span', 'hud-mural-author', native.name),
    document.createTextNode(' '),
    el('span', 'nativo-desc', FACTION_DESCRIPTIONS[native.faction] ?? ''),
  );
  card.appendChild(header);

  const where = el('p', 'nativo-where', `agora em (${native.position.x}, ${native.position.y})`);
  card.appendChild(where);

  const reply = lastReply(world, native.id);
  if (reply) {
    const quote = el('p', 'nativo-quote');
    quote.append(
      el('span', 'nativo-quote-text', `“${reply.message}”`),
      document.createTextNode(' '),
      el('span', 'nativo-quote-to', `— para @${reply.login}`),
    );
    card.appendChild(quote);
  }

  const talk = el('a', 'nativo-talk', 'puxar conversa');
  talk.href = conversarIssueUrl(native.id);
  talk.target = '_blank';
  talk.rel = 'noopener noreferrer';
  talk.title = `Abrir a issue /conversar ${native.id}`;
  card.appendChild(talk);

  return card;
}

/**
 * Renders the panel into `rootEl` (a <details> body). Pure function of
 * `world` - call again when a fresh world arrives.
 */
export function renderNativos(rootEl: HTMLElement, world: World): void {
  rootEl.replaceChildren();

  const natives = Object.values(world.natives ?? {});
  if (natives.length === 0) {
    rootEl.appendChild(el('p', 'nativo-empty', 'Nenhum Nativo à vista.'));
    return;
  }

  rootEl.appendChild(
    el('p', 'nativo-empty', 'Chegue a até 3 tiles de um Nativo e puxe conversa — a resposta vem na próxima batida.'),
  );

  const list = el('ul', 'nativo-list');
  for (const native of natives.sort((a, b) => a.id.localeCompare(b.id))) {
    list.appendChild(nativeCard(world, native));
  }
  rootEl.appendChild(list);
}
