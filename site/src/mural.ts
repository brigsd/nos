/**
 * src/mural.ts
 *
 * Renders "O Mural" — the HUD panel listing the world's most recent public
 * happenings: `/dizer` messages (`player_said`), settled trades
 * (`trade_completed`, v2 economy), Nativos answering players
 * (`native_replied`, v2 light interaction), and items synthesized at A
 * Fábrica (`item_synthesized`, v2.5). This is a plain DOM overlay, not
 * canvas: it reads `world.events` (already fetched once by src/world.ts,
 * same as the rest of the HUD) and writes list items. Deliberately kept out
 * of src/renderer.ts so it can't collide with the map-drawing work
 * happening there in parallel.
 *
 * Security: a player's message is untrusted free text (issue-command input,
 * up to 280 chars, see engine/commands.ts's `/dizer` handler). Every piece
 * of it is written with `textContent` — never `innerHTML` — so it can never
 * be parsed as markup/script by a viewer's browser, no matter what a player
 * types.
 */
import type {
  ItemSynthesizedEvent,
  NativeRepliedEvent,
  NativeSpokeEvent,
  PlayerSaidEvent,
  TradeCompletedEvent,
  World,
  WorldEvent,
} from '../../engine/types';
import { getOwn } from '../../engine/types';
import { describeSide } from '../../engine/economy';
import { inMachinePhrase, itemLabel } from '../../engine/fabrication';

/** How many of the most recent entries the Mural shows at once. */
const MAX_ENTRIES = 8;

type MuralEvent = PlayerSaidEvent | TradeCompletedEvent | NativeRepliedEvent | ItemSynthesizedEvent | NativeSpokeEvent;

function isMuralEvent(event: WorldEvent): event is MuralEvent {
  return (
    event.type === 'player_said' ||
    event.type === 'trade_completed' ||
    event.type === 'native_replied' ||
    event.type === 'item_synthesized' ||
    // falas ambiente dos Nativos E dos Habitantes d'A Clareira (/habitar, D-34)
    event.type === 'native_spoke'
  );
}

/** "agora" on the current beat, "há N pulsos" otherwise — Pulso/batida is the world's unit of time (docs/LORE.md). */
function pulseAgo(eventTick: number, currentTick: number): string {
  const delta = currentTick - eventTick;
  if (delta <= 0) return 'agora';
  if (delta === 1) return 'há 1 pulso';
  return `há ${delta} pulsos`;
}

/**
 * pt-BR one-line summary of a settled trade, e.g.
 * "deu 1 madeira e levou ₱5 — negócio com Raiz". Item legs come straight
 * from the event; the ₱ leg is reconstructed from pulsoDelta's sign.
 */
function tradeSummary(event: TradeCompletedEvent, world: World): string {
  const nativeName = getOwn(world.natives ?? {}, event.nativeId)?.name ?? event.nativeId;
  const gave = describeSide({ items: event.given, pulso: event.pulsoDelta < 0 ? -event.pulsoDelta : 0 });
  const got = describeSide({ items: event.received, pulso: event.pulsoDelta > 0 ? event.pulsoDelta : 0 });
  return `deu ${gave} e levou ${got} — negócio com ${nativeName}`;
}

/**
 * pt-BR one-line summary of a synthesis at A Fábrica, e.g.
 * "sintetizou 1 lanterna na Bancada".
 */
function synthesisSummary(event: ItemSynthesizedEvent): string {
  return `sintetizou ${event.output.quantity} ${itemLabel(event.output.itemId)} ${inMachinePhrase(event.machineId)}`;
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

    // Untrusted player text (and engine-built summaries alike): textContent
    // only, never innerHTML.
    const message = document.createElement('span');
    message.className = 'hud-mural-message';

    if (event.type === 'player_said') {
      author.textContent = `@${event.login}`;
      message.textContent = event.message;
      line.append(author, document.createTextNode(' '), message);
    } else if (event.type === 'trade_completed') {
      // A settled trade: "@alice deu 1 madeira e levou ₱5 — negócio com Raiz".
      author.textContent = `@${event.login}`;
      message.textContent = tradeSummary(event, world);
      message.classList.add('hud-mural-trade');
      line.append(author, document.createTextNode(' '), message);
    } else if (event.type === 'native_spoke') {
      // Um Nativo ou Habitante falando na praça: "brasa · ferro bom não tem pressa."
      const speakerName = getOwn(world.natives ?? {}, event.nativeId)?.name ?? event.nativeId;
      author.textContent = speakerName;
      author.classList.add('hud-mural-native');
      message.textContent = event.message;
      line.append(author, document.createTextNode(' '), message);
    } else if (event.type === 'native_replied') {
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
    } else {
      // A Fábrica synthesis: "@alice sintetizou 1 lanterna na Bancada".
      author.textContent = `@${event.login}`;
      message.textContent = synthesisSummary(event);
      message.classList.add('hud-mural-synthesis');
      line.append(author, document.createTextNode(' '), message);
    }

    const when = document.createElement('span');
    when.className = 'hud-mural-when';
    when.textContent = pulseAgo(event.tick, world.meta.tickCount);

    item.append(line, when);
    listEl.appendChild(item);
  }
}
