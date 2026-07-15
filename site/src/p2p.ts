/**
 * src/p2p.ts
 *
 * R7 "Fluidez A" (D-25c, docs/LORE.md "O Registro e a Intenção"): browser-to-
 * browser WebRTC between two logged-in players who are simultaneously
 * online, so each one's Intenção — their live, not-yet-written position —
 * can be seen moving in real time on the other's screen, the way the lore
 * already describes a Nó who "anda à frente de si mesmo". This is cosmetics
 * only: nothing here ever touches world state, an engine command, or
 * anything that reaches a commit. The Crônica (the tick's commits) remains
 * the only truth; a P2P peer's position is thrown away the moment the tab
 * closes.
 *
 * Sanctioned exception to 100% GitHub (D-03/D-25c): connecting two browsers
 * needs ICE candidates, and gathering a server-reflexive candidate needs a
 * STUN server — a stateless UDP echo service that only ever learns "what is
 * my public IP:port" (the same thing any video call already reveals to its
 * far end), never anything about the game. `stun:stun.l.google.com:19302`
 * is Google's long-standing public STUN server: free, keyless, and exactly
 * the one allowed non-GitHub network hop D-25c names. GitHub itself remains
 * the ONLY signaling channel (see p2p-signaling.ts) — no relay/TURN server,
 * no server of any kind that could see or touch game data.
 *
 * Non-trickle ICE, on purpose: signaling round-trips over GitHub comments at
 * ~3-5s per poll (p2p-signaling.ts), so exchanging candidates one at a time
 * as they trickle in would take many round trips just to get started.
 * Instead each side waits for its own ICE gathering to finish (or a safety
 * timeout) and sends ONE offer/answer with every candidate it found already
 * baked into the SDP — "vanilla ICE", the right trade for a slow-poll
 * signaling channel. It costs a few seconds of extra latency before the
 * very first connection attempt; nothing after that. On localhost (this
 * project's QA harness) gathering completes almost immediately with
 * host-only candidates, which is already enough to connect — see
 * site/qa/p2p-screenshot.mjs.
 *
 * Mesh formation without a coordinator: every peer, once, posts ONE
 * broadcast offer (`to: '*'`) — posting it IS the presence beacon (see
 * p2p-signaling.ts). Any peer who sees a foreign, fresh offer only answers
 * it if `myLogin > offer.from` (plain string comparison) — a simple,
 * coordination-free tie-break ("perfect negotiation" simplified for a
 * broadcast-offer world): for any pair, exactly one side ends up the
 * offerer and the other the answerer, so a pair never race into two
 * redundant connections. A given peer's own broadcast offer is claimed by
 * whichever foreign login answers it FIRST; later answers to the same offer
 * are ignored. Verified/scoped for exactly the product frame's stated case
 * — two players online at once; with 3+ players simultaneously online,
 * connectivity is not guaranteed to form a complete mesh (each peer's own
 * offer only ever completes with the first peer that answers it) — a
 * reasonable follow-up (re-post a fresh offer after a claim) is
 * straightforward but deliberately deferred to keep this slice's protocol
 * small and easy to verify.
 *
 * Wire protocol (DataChannel 'intencao', created unordered + unreliable —
 * see postBroadcastOffer's `createDataChannel` call: stale position packets
 * are worthless the moment a newer one exists, so dropping beats delaying/
 * retransmitting, the same trade every fast-paced multiplayer game makes
 * for position updates): `{t:'pos', x, y, face?}` sent on change at
 * ~10-15Hz (never 60 — the render loop interpolates between updates
 * instead). A per-peer heartbeat every few seconds both detects a peer
 * whose transport died without a clean close (see PEER_TIMEOUT_MS) AND
 * doubles as a position RESYNC: it re-sends that peer's last known `pos`
 * payload instead of a content-free ping (falling back to a bare `{t:'hb'}`
 * only if nothing has been sent to that peer yet) — cheap insurance against
 * the unreliable channel dropping an on-change update, most importantly the
 * very first one right after connecting, which nothing else would ever
 * retry while the local player stays still (see wireDataChannel).
 *
 * Untrusted input (product frame, D-25c): every inbound DataChannel message
 * is parsed defensively — malformed shape/non-finite numbers are dropped
 * silently, a well-typed-but-out-of-range position is clamped to the
 * CURRENT world's bounds (never dropped — still renders a sane ghost), and
 * processing itself is rate-limited per peer independent of whatever the
 * sender claims to be doing (never trust the remote to actually throttle
 * itself).
 */
import type { OpenSignaling, SignalingChannel, SignalingMessage } from './p2p-signaling';
import { openGitHubSignaling } from './p2p-signaling';

export type Face = 'up' | 'down' | 'left' | 'right';

interface PosMessage {
  t: 'pos';
  x: number;
  y: number;
  face?: Face;
}

interface HeartbeatMessage {
  t: 'hb';
}

type WireMessage = PosMessage | HeartbeatMessage;

/** A remote peer's live, interpolated position — cosmetics only, see module doc. */
export interface PeerGhost {
  login: string;
  x: number;
  y: number;
  face?: Face;
}

export interface P2PStatusSnapshot {
  /** False only once fully torn down (stop() called, or start failed outright). */
  enabled: boolean;
  /** True once signaling is up but no DataChannel is open to anyone yet. */
  searching: boolean;
  /** Logins with an OPEN DataChannel right now. */
  connected: string[];
}

export interface P2POptions {
  /** This session's own GitHub login — becomes `from` on everything we send, and the tie-break key. */
  login: string;
  /** Live getter so inbound positions always clamp to whichever world is on screen right now (portal travel changes it — see main.ts). */
  getWorldBounds: () => { width: number; height: number };
  onStatus: (status: P2PStatusSnapshot) => void;
  onGhostsChanged: (ghosts: ReadonlyMap<string, PeerGhost>) => void;
  /** DI seam — defaults to openGitHubSignaling. QA's only injection point (site/qa/p2p-screenshot.mjs via p2p-ui.ts's window hook) swaps this for a same-origin stub so two Playwright tabs can negotiate a REAL RTCPeerConnection without real network egress. */
  openSignaling?: OpenSignaling;
}

export interface P2PHandle {
  /** Advances ghost interpolation — call once per render frame. No-ops when nobody is connected. */
  updateInterpolation(dtSeconds: number): void;
  /** Reports the LOCAL player's current visual position to every connected peer — internally throttled to ~10-15Hz and only actually sent when the position (or face) changed. No-ops when nobody is connected (nothing to send to). */
  reportLocalPosition(x: number, y: number, face?: Face): void;
  /** Full teardown: closes every RTCPeerConnection/DataChannel and the signaling channel. Safe to call more than once. */
  stop(): Promise<void>;
}

/** Sanctioned exception to 100%-GitHub (D-03/D-25c) — see module doc above. Public, keyless, stateless: discovers each browser's own reflexive address, never relays game data. */
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Safety net so a stalled/unreachable STUN lookup can never block a handshake forever — proceed with whatever candidates were found in time (host-only is already enough on localhost, see module doc). */
const ICE_GATHERING_TIMEOUT_MS = 8000;

/** Outbound throttle — inside the spec's 10-15Hz band. */
const OUTBOUND_MIN_INTERVAL_MS = 80;
/** "send on change" — ignores sub-tile jitter that isn't a real move. */
const OUTBOUND_MIN_DELTA_TILES = 0.02;
/** Inbound processing cap, independent of the sender (defense-in-depth: never trust a remote peer to actually throttle itself). */
const INBOUND_MIN_INTERVAL_MS = 50;
const HEARTBEAT_INTERVAL_MS = 5000;
/** No pos/hb heard for this long -> the peer is gone even if the transport never fired a close event. */
const PEER_TIMEOUT_MS = 15000;
const STALE_SWEEP_INTERVAL_MS = 5000;
/**
 * Backoff for CONNECTION FAILURES (a pair that negotiated but never reached
 * an open DataChannel — e.g. both sides behind symmetric NAT, where
 * STUN-only can never connect and TURN is forbidden by D-25c). Without
 * this, offerer and answerer would re-offer/re-answer each other forever —
 * every cycle posting real comments on the PUBLIC room issue with the same
 * token the player's game commands use, until GitHub's content-creation
 * rate limit locks the player out of the actual game. Clean departures
 * (channel WAS open, then closed) are not failures and never back off.
 */
const FAILURE_BACKOFF_BASE_MS = 30_000;
const FAILURE_BACKOFF_MAX_MS = 8 * 60_000;
/** After this many consecutive failures with the same login, give up on that pair until the mode is toggled off/on. */
const MAX_CONSECUTIVE_FAILURES = 4;
/** Hard backstop on comment volume: total broadcast offers one session may post, whatever the reason. */
const MAX_OFFERS_PER_SESSION = 20;
/** Ghost catch-up speed — a little faster than LocalPlayer's own 5 tiles/s so sparse updates still feel caught-up rather than perpetually lagging. */
const GHOST_LERP_TILES_PER_SEC = 8;

function isFace(value: unknown): value is Face {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
}

/**
 * Parses+validates one inbound DataChannel payload against the CURRENT
 * world bounds. Never throws. A wrong type/shape/non-finite number is
 * garbage — dropped outright (returns null). A well-typed but out-of-range
 * coordinate is clamped, not dropped (product frame: "positions clamped to
 * world bounds") — still renders a sane ghost instead of one sitting
 * off-map or breaking layout math downstream.
 */
function parseWireMessage(raw: string, bounds: { width: number; height: number }): WireMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.t === 'hb') return { t: 'hb' };
  if (o.t !== 'pos') return null;
  if (typeof o.x !== 'number' || !Number.isFinite(o.x)) return null;
  if (typeof o.y !== 'number' || !Number.isFinite(o.y)) return null;
  if (o.face !== undefined && !isFace(o.face)) return null;
  const maxX = Math.max(0, bounds.width - 1);
  const maxY = Math.max(0, bounds.height - 1);
  const x = Math.min(Math.max(o.x, 0), maxX);
  const y = Math.min(Math.max(o.y, 0), maxY);
  return { t: 'pos', x, y, face: isFace(o.face) ? o.face : undefined };
}

/**
 * Copies `pc.localDescription` into a PLAIN object matching
 * RTCSessionDescriptionInit. `pc.localDescription` is an `RTCSessionDescription`
 * class instance, not a plain object — JSON.stringify happens to work on it
 * (the real p2p-signaling.ts path), but it is not universally
 * clone/serialize-safe (e.g. `postMessage`'s structured-clone algorithm
 * rejects it outright — hit by the QA BroadcastChannel stub during
 * development). Sending a real plain object is the correct fix either way:
 * SignalingMessage.sdp is typed as RTCSessionDescriptionInit, a plain-object
 * shape, and this stops relying on incidental class-serialization behaviour.
 */
function plainSdp(pc: RTCPeerConnection): RTCSessionDescriptionInit {
  const desc = pc.localDescription!;
  return { type: desc.type, sdp: desc.sdp };
}

/** Resolves once `pc`'s ICE gathering is complete, or after ICE_GATHERING_TIMEOUT_MS — whichever comes first (see module doc's "non-trickle ICE" note). */
function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
    function finish(): void {
      if (done) return;
      done = true;
      pc.onicegatheringstatechange = null;
      clearTimeout(timer);
      resolve();
    }
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
  });
}

interface GhostState {
  targetX: number;
  targetY: number;
  visualX: number;
  visualY: number;
  face?: Face;
}

/**
 * Starts a P2P session for `login`. Creates NOTHING until called — no
 * RTCPeerConnection, no signaling channel — this function IS the opt-in
 * consent boundary (see p2p-ui.ts: only ever called from the toggle's
 * "on" handler).
 */
export function startP2P(options: P2POptions): P2PHandle {
  const openSignaling = options.openSignaling ?? openGitHubSignaling;
  const { login } = options;

  let stopped = false;
  let signaling: SignalingChannel | null = null;

  /** This session's own outstanding broadcast offer, before it's been claimed by anyone (see module doc's mesh-formation note). Null once claimed (moved into `peers`/`channels` under the claimant's login) or torn down. */
  let myOfferPc: RTCPeerConnection | null = null;
  let myOfferChannel: RTCDataChannel | null = null;
  let myOfferClaimed = false;

  const peers = new Map<string, RTCPeerConnection>();
  const channels = new Map<string, RTCDataChannel>();
  const ghosts = new Map<string, GhostState>();
  /** Valid messages only — doubles as the stale sweep's LIVENESS anchor, so garbage must never advance it (see handleInbound). */
  const lastInboundAt = new Map<string, number>();
  /** EVERY inbound frame, valid or garbage — the processing throttle's anchor (see handleInbound). */
  const lastParseAttemptAt = new Map<string, number>();
  const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  /** Consecutive connection FAILURES per remote login (see FAILURE_BACKOFF_* doc) — cleared the moment a channel to that login actually opens. */
  const failuresByLogin = new Map<string, { count: number; nextAttemptAt: number }>();
  let offersPosted = 0;
  let reOfferTimer: ReturnType<typeof setTimeout> | null = null;

  function recordFailure(peerLogin: string): void {
    const count = (failuresByLogin.get(peerLogin)?.count ?? 0) + 1;
    const delay = Math.min(FAILURE_BACKOFF_BASE_MS * 2 ** (count - 1), FAILURE_BACKOFF_MAX_MS);
    failuresByLogin.set(peerLogin, { count, nextAttemptAt: Date.now() + delay });
    if (count >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(`P2P: ${count} falhas seguidas ao conectar com @${peerLogin} — desistindo desse par até religar o modo.`);
    }
  }

  /** May we (re-)attempt a connection with this login right now? False while inside its failure backoff window, or forever (this session) once it hit MAX_CONSECUTIVE_FAILURES. */
  function canAttempt(peerLogin: string): boolean {
    const f = failuresByLogin.get(peerLogin);
    if (!f) return true;
    if (f.count >= MAX_CONSECUTIVE_FAILURES) return false;
    return Date.now() >= f.nextAttemptAt;
  }

  /** How long our own next broadcast offer must wait, given the failure history with the login that just failed us. */
  function backoffDelayMs(peerLogin: string): number {
    const f = failuresByLogin.get(peerLogin);
    if (!f) return 0;
    return Math.max(0, f.nextAttemptAt - Date.now());
  }

  /** At most ONE pending re-offer at a time; delay 0 posts immediately (clean-departure path). */
  function scheduleReOffer(delayMs: number): void {
    if (stopped || reOfferTimer !== null) return;
    if (delayMs <= 0) {
      void postBroadcastOffer();
      return;
    }
    reOfferTimer = setTimeout(() => {
      reOfferTimer = null;
      if (!stopped && myOfferPc === null) void postBroadcastOffer();
    }, delayMs);
  }

  /**
   * PER-PEER outbound throttle state (never a single shared value): a
   * newly-connected peer must always get an immediate first position report
   * even if the local player was already stationary relative to some OTHER,
   * earlier peer — a shared "did it move" check would otherwise judge
   * "moved" against the wrong reference and silently skip the newcomer.
   */
  const lastSentByPeer = new Map<string, { x: number; y: number; face: Face | undefined; at: number }>();

  function emitStatus(): void {
    options.onStatus({ enabled: !stopped, searching: !stopped && channels.size === 0, connected: Array.from(channels.keys()) });
  }

  function emitGhosts(): void {
    const snapshot = new Map<string, PeerGhost>();
    for (const [peerLogin, g] of ghosts) snapshot.set(peerLogin, { login: peerLogin, x: g.visualX, y: g.visualY, face: g.face });
    options.onGhostsChanged(snapshot);
  }

  function teardownPeer(peerLogin: string): void {
    // A channel only ever enters `channels` in its own `onopen` — so its
    // presence here distinguishes a clean DEPARTURE (pair connected fine,
    // peer left) from a connection FAILURE (never reached open: ICE found
    // no viable pair, negotiation error, ...). Only failures back off.
    const hadOpenChannel = channels.has(peerLogin);
    channels.get(peerLogin)?.close();
    channels.delete(peerLogin);
    const pc = peers.get(peerLogin) ?? null;
    pc?.close();
    peers.delete(peerLogin);
    ghosts.delete(peerLogin);
    lastInboundAt.delete(peerLogin);
    lastParseAttemptAt.delete(peerLogin);
    lastSentByPeer.delete(peerLogin);
    const hb = heartbeatTimers.get(peerLogin);
    if (hb !== undefined) clearInterval(hb);
    heartbeatTimers.delete(peerLogin);

    if (!stopped) {
      if (hadOpenChannel) failuresByLogin.delete(peerLogin); // the pair CAN connect — a later drop is a departure, not incompatibility
      else recordFailure(peerLogin);
    }

    if (pc !== null && pc === myOfferPc) {
      // Our own offer's connection died — reset and re-announce so we can
      // still be found (see module doc: re-posting is the recovery path
      // for a dropped peer, not a periodic background loop). After a
      // FAILURE the re-post waits out that login's backoff window first:
      // an immediate fresh offer would just be re-answered by the same
      // peer and fail again, looping comments onto the public room issue
      // (see FAILURE_BACKOFF_* doc).
      myOfferPc = null;
      myOfferChannel = null;
      myOfferClaimed = false;
      if (!stopped) scheduleReOffer(hadOpenChannel ? 0 : backoffDelayMs(peerLogin));
    }

    emitStatus();
    emitGhosts();
    if (!stopped && channels.size === 0) signaling?.resumePolling();
  }

  function handleInbound(peerLogin: string, raw: string): void {
    const now = Date.now();
    // The throttle gate anchors to the last processing ATTEMPT (valid or
    // garbage) — anchoring to the last VALID message would let a stream of
    // unparseable frames bypass the gate entirely (each fails the parse,
    // never advances the anchor, and the next gets JSON.parse'd at full
    // DataChannel rate: a main-thread DoS). Two maps on purpose:
    // lastInboundAt advances ONLY on valid messages because it doubles as
    // the stale sweep's liveness anchor — advancing it on garbage would
    // keep a garbage-only peer alive forever.
    const lastAttempt = lastParseAttemptAt.get(peerLogin) ?? 0;
    if (now - lastAttempt < INBOUND_MIN_INTERVAL_MS) return; // rate-limit PROCESSING, independent of the sender
    lastParseAttemptAt.set(peerLogin, now);
    const msg = parseWireMessage(raw, options.getWorldBounds());
    if (!msg) return; // garbage — dropped silently
    lastInboundAt.set(peerLogin, now);
    if (msg.t === 'hb') return; // liveness only — the timestamp bump above already counts as "heard from"

    const existing = ghosts.get(peerLogin);
    if (!existing) {
      ghosts.set(peerLogin, { targetX: msg.x, targetY: msg.y, visualX: msg.x, visualY: msg.y, face: msg.face });
    } else {
      existing.targetX = msg.x;
      existing.targetY = msg.y;
      if (msg.face !== undefined) existing.face = msg.face;
    }
    emitGhosts();
  }

  function wireDataChannel(peerLogin: string, channel: RTCDataChannel): void {
    channel.onopen = () => {
      channels.set(peerLogin, channel);
      lastInboundAt.set(peerLogin, Date.now()); // the open event itself counts as "just heard from them"
      signaling?.pausePolling(); // spec: stop polling once connected
      const hb = setInterval(() => {
        if (channel.readyState !== 'open') return;
        try {
          // Doubles as a position RESYNC, not just a bare liveness ping: the
          // channel is deliberately unreliable (maxRetransmits: 0, see
          // postBroadcastOffer's `createDataChannel` call) so any single
          // `pos` update - including the very first one right after `open`,
          // before the SCTP
          // association is fully warmed up - can legitimately be dropped.
          // While a player is actively moving, the next on-change send
          // papers over that instantly; while STANDING STILL (the case a
          // dropped first packet would otherwise get stuck on forever,
          // since nothing would "change" again to trigger a resend), this
          // periodic resend is what a peer's ghost recovers on, at worst
          // HEARTBEAT_INTERVAL_MS after connecting. Piggybacking on the
          // heartbeat (rather than a bare `{t:'hb'}`) costs nothing extra —
          // same cadence, same channel, and it's still a valid `pos`
          // message on the receiving end, no second message kind needed.
          const last = lastSentByPeer.get(peerLogin);
          const payload = last
            ? JSON.stringify(last.face ? { t: 'pos', x: last.x, y: last.y, face: last.face } : { t: 'pos', x: last.x, y: last.y })
            : '{"t":"hb"}'; // no position reported to THIS peer yet at all — a bare liveness ping
          channel.send(payload);
        } catch (err) {
          console.warn(`Falha ao enviar heartbeat P2P para @${peerLogin}:`, err);
        }
      }, HEARTBEAT_INTERVAL_MS);
      heartbeatTimers.set(peerLogin, hb);
      emitStatus();
    };
    channel.onmessage = (ev) => {
      if (typeof ev.data === 'string') handleInbound(peerLogin, ev.data);
    };
    channel.onclose = () => teardownPeer(peerLogin);
    channel.onerror = () => teardownPeer(peerLogin);
  }

  function makePeerConnection(peerLogin: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(peerLogin, pc);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') teardownPeer(peerLogin);
    };
    return pc;
  }

  async function answerOffer(peerLogin: string, offerSdp: RTCSessionDescriptionInit): Promise<void> {
    if (peers.has(peerLogin)) return; // already connected/negotiating with this login
    const pc = makePeerConnection(peerLogin);
    pc.ondatachannel = (ev) => wireDataChannel(peerLogin, ev.channel);
    try {
      await pc.setRemoteDescription(offerSdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGathering(pc);
      if (stopped) return;
      await signaling?.send({ v: 1, kind: 'answer', from: login, to: peerLogin, sdp: plainSdp(pc) });
    } catch (err) {
      console.warn(`Falha ao responder o convite P2P de @${peerLogin}:`, err);
      teardownPeer(peerLogin);
    }
  }

  async function applyAnswer(peerLogin: string, pc: RTCPeerConnection, answerSdp: RTCSessionDescriptionInit): Promise<void> {
    try {
      await pc.setRemoteDescription(answerSdp);
    } catch (err) {
      console.warn(`Falha ao aplicar a resposta P2P de @${peerLogin}:`, err);
      teardownPeer(peerLogin);
    }
  }

  function handleSignalingMessage(msg: SignalingMessage): void {
    if (stopped) return;
    if (msg.from === login) return; // defensive; the channel already excludes our own posts
    if (msg.kind === 'offer') {
      if (msg.to !== '*' && msg.to !== login) return;
      if (peers.has(msg.from)) return;
      if (!(login > msg.from)) return; // tie-break: only the lexicographically larger login answers a foreign offer (module doc)
      if (!canAttempt(msg.from)) return; // repeated ICE failures with this login — inside its backoff window, or given up (FAILURE_BACKOFF_* doc). Answering would post a comment doomed to fail again.
      void answerOffer(msg.from, msg.sdp);
      return;
    }
    // answer — must be addressed to us and match OUR outstanding, unclaimed offer.
    if (msg.to !== login) return;
    if (myOfferClaimed || myOfferPc === null || myOfferChannel === null || myOfferPc.remoteDescription) return;
    if (peers.has(msg.from)) return; // shouldn't happen given the tie-break, but stay defensive
    myOfferClaimed = true;
    const pc = myOfferPc;
    const channel = myOfferChannel;
    peers.set(msg.from, pc);
    // Re-point onconnectionstatechange at the STANDARD per-peer teardown
    // (same as makePeerConnection sets up for the answerer role) - the
    // handler postBroadcastOffer installed only ever cleaned up the
    // UNCLAIMED offer's own bookkeeping (`!myOfferClaimed` guard), so
    // without this a failure/close on an ALREADY-claimed connection would
    // rely solely on the DataChannel's own close/error event (wired below)
    // to notice - which happens to work in practice but shouldn't be the
    // only path.
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') teardownPeer(msg.from);
    };
    wireDataChannel(msg.from, channel);
    void applyAnswer(msg.from, pc, msg.sdp);
  }

  async function postBroadcastOffer(): Promise<void> {
    if (offersPosted >= MAX_OFFERS_PER_SESSION) {
      // Hard backstop on public-comment volume (FAILURE_BACKOFF_* doc). A
      // legitimate session virtually never gets here; a pathological
      // connect/drop churn would. Discovery stops until the player toggles
      // the mode off/on — cosmetic feature, deliberate trade.
      console.warn(`P2P: limite de ${MAX_OFFERS_PER_SESSION} convites por sessão atingido — desligue e religue o modo para voltar a procurar pares.`);
      return;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    myOfferPc = pc;
    const channel = pc.createDataChannel('intencao', { ordered: false, maxRetransmits: 0 });
    myOfferChannel = channel;
    pc.onconnectionstatechange = () => {
      if ((pc.connectionState === 'failed' || pc.connectionState === 'closed') && myOfferPc === pc && !myOfferClaimed) {
        myOfferPc = null;
        myOfferChannel = null;
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      if (stopped || myOfferPc !== pc) {
        pc.close();
        return;
      }
      offersPosted += 1; // counted at the send — the comment-creating action the cap exists for
      await signaling?.send({ v: 1, kind: 'offer', from: login, to: '*', sdp: plainSdp(pc) });
    } catch (err) {
      console.warn('Falha ao publicar o convite P2P:', err);
      if (myOfferPc === pc) {
        myOfferPc = null;
        myOfferChannel = null;
      }
      pc.close();
    }
  }

  const staleSweepTimer = setInterval(() => {
    const now = Date.now();
    for (const peerLogin of Array.from(channels.keys())) {
      const last = lastInboundAt.get(peerLogin) ?? 0;
      if (now - last > PEER_TIMEOUT_MS) {
        console.warn(`Sem sinal de @${peerLogin} há mais de ${PEER_TIMEOUT_MS / 1000}s — encerrando a conexão P2P.`);
        teardownPeer(peerLogin);
      }
    }
  }, STALE_SWEEP_INTERVAL_MS);

  // Kick off: open signaling, then announce ourselves. Status starts
  // "searching" immediately (synchronously, before any await below runs) so
  // the HUD never shows a stale/blank state between the toggle click and
  // the first real status update.
  emitStatus();
  (async () => {
    try {
      const channel = await openSignaling(login);
      if (stopped) {
        void channel.close();
        return;
      }
      signaling = channel;
      channel.onMessage(handleSignalingMessage);
      await postBroadcastOffer();
    } catch (err) {
      console.warn('Não foi possível iniciar o modo tempo real (P2P):', err);
      stopped = true;
      clearInterval(staleSweepTimer);
      emitStatus();
    }
  })();

  return {
    updateInterpolation(dtSeconds: number): void {
      if (ghosts.size === 0) return;
      let changed = false;
      for (const g of ghosts.values()) {
        const dx = g.targetX - g.visualX;
        const dy = g.targetY - g.visualY;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.005) continue;
        changed = true;
        const step = GHOST_LERP_TILES_PER_SEC * dtSeconds;
        if (dist <= step) {
          g.visualX = g.targetX;
          g.visualY = g.targetY;
        } else {
          g.visualX += (dx / dist) * step;
          g.visualY += (dy / dist) * step;
        }
      }
      if (changed) emitGhosts();
    },

    reportLocalPosition(x: number, y: number, face?: Face): void {
      if (stopped || channels.size === 0) return; // nothing to send to
      const now = Date.now();
      // PER-PEER (see lastSentByPeer's doc): each connected peer gets its
      // own independent "did it move / am I inside the throttle window"
      // decision, so a peer that just connected always gets an immediate
      // first report even if the local player was already stationary
      // relative to some OTHER, longer-connected peer.
      for (const [peerLogin, channel] of channels) {
        if (channel.readyState !== 'open') continue;
        const last = lastSentByPeer.get(peerLogin);
        const moved = !last || Math.hypot(x - last.x, y - last.y) >= OUTBOUND_MIN_DELTA_TILES || face !== last.face;
        if (!moved) continue;
        if (last && now - last.at < OUTBOUND_MIN_INTERVAL_MS) continue;
        lastSentByPeer.set(peerLogin, { x, y, face, at: now });
        const payload = JSON.stringify(face ? { t: 'pos', x, y, face } : { t: 'pos', x, y });
        try {
          channel.send(payload);
        } catch (err) {
          console.warn(`Falha ao enviar posição P2P para @${peerLogin}:`, err);
        }
      }
    },

    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      clearInterval(staleSweepTimer);
      if (reOfferTimer !== null) clearTimeout(reOfferTimer);
      reOfferTimer = null;
      for (const channel of channels.values()) channel.close();
      for (const pc of peers.values()) pc.close();
      myOfferPc?.close();
      peers.clear();
      channels.clear();
      ghosts.clear();
      lastInboundAt.clear();
      lastParseAttemptAt.clear();
      failuresByLogin.clear();
      for (const hb of heartbeatTimers.values()) clearInterval(hb);
      heartbeatTimers.clear();
      myOfferPc = null;
      myOfferChannel = null;
      myOfferClaimed = false;
      const s = signaling;
      signaling = null;
      emitStatus();
      emitGhosts();
      if (s) await s.close();
    },
  };
}
