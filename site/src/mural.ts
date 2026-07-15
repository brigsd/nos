/**
 * src/mural.ts
 *
 * Renders "O Mural" — the HUD panel listing the world's most recent voices:
 * /dizer messages from players (`player_said`) and, since the v2 light
 * interaction, Nativos answering players (`native_replied`). This is
 * a plain DOM overlay, not canvas: it reads `world.events` (already fetched
 * once by src/world.ts, same as the rest of the HUD) and writes list items.
 * Deliberately kept out of src/renderer.ts so it can't collide with the
 * map-drawing work happening there in parallel.
 *
 * Security: a player's message is untrusted free text (issue-command input,
 * up to 280 chars, see engine/commands.ts's `/dizer` handler). Every piece
 * of it is written with `textContent` — never `innerHTML` — so it can never
 * be parsed as markup/script by a viewer's browser, no matter what a player
 * types.
 */
import type { NativeRepliedEvent, PlayerSaidEvent, World, WorldEvent } from '../../engine/types';
import { getOwn } from '../../engine/types';

/** How many of the most recent entries the Mural shows at once. */
const MAX_ENTRIES = 8;

type MuralEvent = PlayerSaidEvent | NativeRepliedEvent;

function isMuralEvent(event: WorldEvent): event is MuralEvent {
  return event.type === 'player_said' || event.type === 'native_replied';
}

/** "agora" on the current beat, "há N pulsos" otherwise — Pulso/batida is the world's unit of time (docs/LORE.md). */
function pulseAgo(eventTick: number, currentTick: number): string {
  const delta = currentTick - eventTick;
  if (delta <= 0) return 'agora';
  if (delta === 1) return 'há 1 pulso';
  return `há ${delta} pulsos`;
}

/**
 * Renders the last `MAX_ENTRIES` mural events (newest first) into `listEl`.
 * Pure function of `world` - call again whenever a freshly fetched world
 * should replace what's on screen.
 */
export function renderMural(listEl: HTMLOListElement, world: World): void {
  const entries = world.events.filter(isMuralEvent).slice(-MAX_ENTRIES).reverse();

  listEl.replaceChildren();

  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'hud-mural-empty';
    empty.textContent = 'Ninguém disse nada ainda.';
    listEl.appendChild(empty);
    return;
  }

  for (const event of entries) {
    const item = document.createElement('li');
    item.className = 'hud-mural-entry';

    const line = document.createElement('p');
    line.className = 'hud-mural-line';

    const author = document.createElement('span');
    author.className = 'hud-mural-author';

    // Untrusted player text: textContent only, never innerHTML.
    const message = document.createElement('span');
    message.className = 'hud-mural-message';

    if (event.type === 'player_said') {
      author.textContent = `@${event.login}`;
      message.textContent = event.message;
      line.append(author, document.createTextNode(' '), message);
    } else {
      // A Native answering someone: "Gota → @alice: ..." (getOwn - the
      // nativeId inside a validated event is safe, but the habit is the rule).
      const nativeName = getOwn(world.natives ?? {}, event.nativeId)?.name ?? event.nativeId;
      author.textContent = nativeName;
      author.classList.add('hud-mural-native');
      message.textContent = event.message;
      const addressee = document.createElement('span');
      addressee.className = 'hud-mural-to';
      addressee.textContent = `→ @${event.login}`;
      line.append(author, document.createTextNode(' '), addressee, document.createTextNode(' '), message);
    }

    const when = document.createElement('span');
    when.className = 'hud-mural-when';
    when.textContent = pulseAgo(event.tick, world.meta.tickCount);

    item.append(line, when);
    listEl.appendChild(item);
  }
}
