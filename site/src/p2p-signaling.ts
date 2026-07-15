/**
 * src/p2p-signaling.ts
 *
 * R7 "Fluidez A" (D-25c): signaling transport for the camada Intenção's
 * WebRTC handshake. GitHub is the ONLY signaling channel (D-03/D-25c) — SDP
 * offers/answers travel as comments on a dedicated issue ("P2P: sala d'O
 * Coração"), found-or-created once per session and then polled with the
 * same conditional-request (ETag/304) discipline live.ts uses for the world
 * itself. This module is pure transport: it knows nothing about
 * RTCPeerConnection — p2p.ts is the only caller, and it depends on the
 * SignalingChannel interface below rather than on this file's concrete
 * GitHub implementation, so QA can swap in a same-origin BroadcastChannel
 * stub (site/qa/p2p-screenshot.mjs, via the window hook in p2p-ui.ts)
 * without touching a single line of production code.
 *
 * Safety net against the tick (verified against .github/workflows/tick.yml,
 * not merely assumed): the room issue's title is "P2P: sala d'O Coração" —
 * it does NOT start with "Comando:" and this module never applies the
 * `comando` label, so it fails BOTH halves of the tick's ingestion filter
 * (`(.title | ascii_downcase | startswith("comando:"))  or (any(.labels[]?;
 * .name == "comando"))`) and is therefore invisible to
 * `pending_commands.json`/`parseRawIssues`. Comments posted here don't even
 * reach the tick's trigger surface in the first place: the workflow only
 * listens for `issues: types: [opened]`, never `issue_comment` — so every
 * offer/answer comment this module posts on an ALREADY-open room issue is
 * 100% inert from the engine's point of view. The one moment this module
 * creates a new issue (find-or-create, below), that `opened` event DOES fire
 * the tick workflow, but its job-level `if:` gate (title/label check, same
 * rule) skips the job entirely for that trigger — see tick.yml.
 *
 * Non-goals (kept out of this file on purpose): world state, trust of any
 * kind, anything that could become a command. A remote peer's messages are
 * validated by p2p.ts, never here — this module only ever forwards opaque
 * `SignalingMessage` envelopes it can parse the SHAPE of, never their
 * meaning.
 */
import { GITHUB_REPO_NAME, GITHUB_REPO_OWNER } from './config';
import { getToken } from './auth';

/** Exact title match is load-bearing (see module doc) — never change this without re-checking it still fails tick.yml's "Comando:" prefix filter. */
export const ROOM_ISSUE_TITLE = "P2P: sala d'O Coração";

const API_BASE = 'https://api.github.com';
const ISSUES_URL = `${API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`;
const COMMENTS_URL_BASE = `${API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues/comments`;
const SEARCH_URL = `${API_BASE}/search/issues`;

/** Seed body for a freshly-created room issue — human context for anyone who stumbles on it (D-25c: radical transparency extends to the issue itself, not just the in-game toggle). */
const ROOM_ISSUE_BODY = [
  'Sala de sinalização WebRTC do "modo tempo real (P2P)" (D-25c).',
  '',
  "Jogadores logados trocam aqui, em comentários, os convites (oferta/resposta SDP) para conectar seus navegadores diretamente um ao outro — é assim que a Intenção de outro jogador aparece ao vivo no seu mapa. Esta issue NÃO é um comando: o Pulso (tick) a ignora por completo (título fora do padrão \"Comando:\", sem o label `comando`).",
  '',
  'Normal e esperado esta lista de comentários crescer sem nunca ser "resolvida" — não é um bug, é o rascunho de uma sala de espera. Comentários somem de relevância rápido (a sessão de quem os postou expira quando a aba fecha).',
].join('\n');

const GITHUB_HEADERS_JSON = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
} as const;

/** Comments are polled every 3-5s while negotiating (task spec) — inside that band, cheap thanks to ETag/304 (see live.ts, same trusted-fact status: a 304 response does not count against the authenticated rate limit). */
const POLL_INTERVAL_MS = 4000;

export interface SignalingMessage {
  v: 1;
  kind: 'offer' | 'answer';
  /** GitHub login of the sender — cross-checked against the comment's actual author below, never trusted from the JSON body alone (a forged `from` could otherwise impersonate someone else's login). */
  from: string;
  /** A specific login for an answer; `'*'` (broadcast) for an offer — the sender doesn't know who's listening yet. Presence is derived FROM these offers (see p2p.ts): posting one IS the "I'm online" beacon. */
  to: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalingChannel {
  /** Posts `msg` as a new fenced-JSON comment on the room issue. */
  send(msg: SignalingMessage): Promise<void>;
  /** Registers the handler fired for every fresh, well-formed, addressed-to-us-or-broadcast message from someone else. Replaces any previous handler (single-listener, same shape as live.ts's onWorld). */
  onMessage(handler: (msg: SignalingMessage) => void): void;
  /** Stops the polling cadence WITHOUT tearing down comments (spec: "stop when connected"). */
  pausePolling(): void;
  /** Re-arms polling — e.g. a connected peer dropped and a replacement must be found. */
  resumePolling(): void;
  /** Final teardown: stops polling and best-effort DELETEs this session's own comments (a PATCH would leave the IP readable in GitHub's public edit history — see close()). Never rejects — a failed delete is not worth blocking the rest of P2P teardown over. */
  close(): Promise<void>;
}

export type OpenSignaling = (login: string) => Promise<SignalingChannel>;

interface RawComment {
  id: number;
  user: { login?: string } | null;
  created_at: string;
  body: string;
}

const FENCE_RE = /```json\s*([\s\S]*?)\s*```/;

function isSdpLike(value: unknown): value is RTCSessionDescriptionInit {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (o.type === 'offer' || o.type === 'answer') && typeof o.sdp === 'string';
}

/** Parses+validates one comment body as a SignalingMessage. Never throws — a malformed/foreign comment is simply not a message (same "drop garbage" habit as p2p.ts's own inbound DataChannel validation). */
function parseMessage(body: string): SignalingMessage | null {
  const match = FENCE_RE.exec(body);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1] ?? '');
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (o.kind !== 'offer' && o.kind !== 'answer') return null;
  if (typeof o.from !== 'string' || o.from.length === 0) return null;
  if (typeof o.to !== 'string' || o.to.length === 0) return null;
  if (!isSdpLike(o.sdp)) return null;
  return { v: 1, kind: o.kind, from: o.from, to: o.to, sdp: o.sdp };
}

function formatMessage(msg: SignalingMessage): string {
  return '```json\n' + JSON.stringify(msg) + '\n```';
}

function authHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return { ...GITHUB_HEADERS_JSON, Authorization: `Bearer ${token}`, ...extra };
}

async function searchRoomIssue(token: string): Promise<number | null> {
  const q = `repo:${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME} type:issue in:title "${ROOM_ISSUE_TITLE}"`;
  const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(q)}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Busca da sala de sinalização P2P falhou (HTTP ${res.status}).`);
  const data = (await res.json()) as { items?: Array<{ number: number; title: string }> };
  // Exact-title match only — the search API is full-text/fuzzy, so a loose
  // hit ("P2P: sala d'O Coração — antiga" or similar) must never be adopted
  // as the room.
  const exact = (data.items ?? []).filter((it) => it.title === ROOM_ISSUE_TITLE);
  if (exact.length === 0) return null;
  // Deterministic pick if a race ever created more than one (two sessions
  // finding "none" at the same instant and both creating): oldest (lowest
  // number) wins, so every session converges on the same room even if a
  // duplicate briefly exists.
  exact.sort((a, b) => a.number - b.number);
  return exact[0]!.number;
}

async function createRoomIssue(token: string): Promise<number> {
  const res = await fetch(ISSUES_URL, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title: ROOM_ISSUE_TITLE, body: ROOM_ISSUE_BODY }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 404
        ? 'Esse token não consegue abrir a sala de sinalização P2P — é preciso um token clássico com o escopo "public_repo".'
        : `Não foi possível abrir a sala de sinalização P2P (HTTP ${res.status}).`,
    );
  }
  const data = (await res.json()) as { number: number };
  return data.number;
}

/**
 * Known limitation (accepted for this slice): GitHub's /search/issues is
 * eventually consistent — right after the room is first created (or ever
 * recreated), other sessions may not FIND it for seconds-to-minutes and
 * create duplicates. The lowest-number tie-break in searchRoomIssue makes
 * later sessions converge on one canonical room, but a session that
 * CREATED a duplicate keeps polling its own issue until the next
 * reload/re-toggle (this result is cached for the channel's lifetime), so
 * peers split across duplicates don't see each other until then.
 * Harmless beyond connectivity: duplicates fail tick.yml's `Comando:`
 * title gate like everything else here, so the engine never sees them.
 */
async function findOrCreateRoomIssue(token: string): Promise<number> {
  const found = await searchRoomIssue(token);
  if (found !== null) return found;
  return createRoomIssue(token);
}

/**
 * The real, production signaling channel. Requires a stored token (P2P is
 * login-gated — see p2p-ui.ts): throws immediately if none is present.
 */
export const openGitHubSignaling: OpenSignaling = async (login: string): Promise<SignalingChannel> => {
  const maybeToken = getToken();
  if (!maybeToken) throw new Error('Entre com o GitHub antes de ligar o modo tempo real (P2P).');
  // Re-bound to a definitely-non-null `const`: TypeScript's control-flow
  // narrowing above doesn't cross into the nested closures below (poll/
  // send/close each capture this by reference, not by the narrowed type at
  // the point they're declared).
  const token: string = maybeToken;

  const roomNumber = await findOrCreateRoomIssue(token);
  const commentsUrl = `${ISSUES_URL}/${roomNumber}/comments`;
  // Ignore stale comments (spec): anything posted before THIS session began
  // polling — dangling offers from a session that already ended (tab closed
  // without a clean teardown, a page reload, ...) must never be answered.
  // Known trade-off (documented in the PR/report): a peer who enables P2P
  // AFTER another peer has been waiting a while may not discover that
  // waiting peer if the waiting peer's own broadcast offer now reads as
  // "stale" to the newcomer and the login tie-break (p2p.ts) doesn't put
  // the newcomer in the "answerer" role for it — toggling P2P off/on (or a
  // reload) re-posts a fresh offer and resolves it immediately. A periodic
  // re-broadcast while `searching` would close this gap but is deliberately
  // deferred to keep this slice's protocol surface small.
  const sessionStartMs = Date.now();

  let etag: string | null = null;
  let handler: ((msg: SignalingMessage) => void) | null = null;
  let paused = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seenCommentIds = new Set<number>();
  const ownCommentIds: number[] = [];

  async function poll(): Promise<void> {
    if (stopped || paused) return;
    try {
      const headers = authHeaders(token);
      if (etag) headers['If-None-Match'] = etag;
      const res = await fetch(`${commentsUrl}?per_page=100`, { headers, cache: 'no-store' });
      if (res.status === 304) {
        // nothing new — same ETag/304 discipline as live.ts, and per the
        // same trusted research a 304 does not count against the
        // authenticated rate limit.
      } else if (res.ok) {
        etag = res.headers.get('etag') ?? etag;
        const comments = (await res.json()) as RawComment[];
        for (const c of comments) {
          if (seenCommentIds.has(c.id)) continue;
          seenCommentIds.add(c.id);
          if (c.user?.login === login) continue; // never react to our own posts
          if (new Date(c.created_at).getTime() < sessionStartMs) continue; // stale (see note above)
          const msg = parseMessage(c.body);
          if (!msg) continue; // malformed/unrelated comment — silently ignored
          if (msg.from !== c.user?.login) continue; // `from` must match the real comment author — blocks login impersonation
          if (msg.to !== '*' && msg.to !== login) continue; // not addressed to us
          handler?.(msg);
        }
      } else {
        console.warn(`Sala de sinalização P2P respondeu HTTP ${res.status}.`);
      }
    } catch (err) {
      console.warn('Falha ao consultar a sala de sinalização P2P:', err);
    } finally {
      if (!stopped && !paused) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }
  }

  void poll();

  return {
    async send(msg: SignalingMessage): Promise<void> {
      const res = await fetch(commentsUrl, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ body: formatMessage(msg) }),
      });
      if (!res.ok) throw new Error(`Não foi possível enviar o convite P2P (HTTP ${res.status}).`);
      const data = (await res.json()) as { id: number };
      ownCommentIds.push(data.id);
    },
    onMessage(h: (msg: SignalingMessage) => void): void {
      handler = h;
    },
    pausePolling(): void {
      paused = true;
      clearTimeout(timer);
    },
    resumePolling(): void {
      if (stopped || !paused) return;
      paused = false;
      void poll();
    },
    async close(): Promise<void> {
      stopped = true;
      clearTimeout(timer);
      // Best-effort tidy-up — DELETE, not a PATCH to "(encerrado)": GitHub
      // keeps a comment's edit history publicly readable (the "edited"
      // dropdown), so an edit would leave the SDP — and with it the
      // player's public IP — visible forever, silently breaking the
      // consent copy's promise that turning the mode off removes it
      // (D-25c). Deleting our own comment is allowed to the author, erases
      // body AND history, and any peer still polling simply stops seeing
      // the message — no separate "cancel" message kind needed.
      // Deliberately swallows every failure (offline, token revoked
      // mid-session, comment already gone): teardown must never throw and
      // block the rest of P2P shutdown over an issue-hygiene step.
      await Promise.allSettled(
        ownCommentIds.map((id) =>
          fetch(`${COMMENTS_URL_BASE}/${id}`, {
            method: 'DELETE',
            headers: authHeaders(token),
          }),
        ),
      );
    },
  };
};
