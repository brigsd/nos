/**
 * src/auth.ts
 *
 * Player login with GitHub, straight from the static site (D-13, D-25d) -
 * no server of our own (D-03). Two paths live here:
 *
 * 1. PAT-based login (WORKS TODAY, the optional "modo avançado"). The
 *    player pastes a CLASSIC personal access token with the `public_repo`
 *    scope (a ready-made "create token" link is offered by auth-ui.ts).
 *    Classic, not fine-grained, out of necessity: a fine-grained PAT can
 *    only give write access to repos its owner controls/collaborates on,
 *    so for a regular player it can never open issues on brigsd/nos (PR
 *    #38 review finding). The token is validated once against
 *    `GET https://api.github.com/user` and then used to POST command
 *    issues directly (`POST /repos/{owner}/{repo}/issues`) instead of
 *    opening a pre-filled issue form - "agir sem sair do jogo" without any
 *    OAuth App at all. The pre-filled issue links remain the default,
 *    zero-risk path for everyone.
 *
 * 2. OAuth device flow (D-13's original target, RFC 8628) - implemented in
 *    full below, but NOT reachable today. It stays behind
 *    `DEVICE_FLOW_AVAILABLE` (config.NOS_OAUTH_CLIENT_ID being non-empty),
 *    which it is not, because the OAuth App has not been registered yet.
 *    Even once it exists, this code alone will not complete the flow from
 *    a browser - see the CORS note below.
 *
 * CORS note (verified 2026-07 against GitHub's current docs and
 * independent write-ups - see docs/CONTINUITY.md for the sources checked;
 * this sandbox has no direct network egress to github.com to hit the
 * endpoints live, so verification here is documentary, not a live probe):
 *
 *   - `https://github.com/login/device/code` and
 *     `https://github.com/login/oauth/access_token` send NO
 *     `Access-Control-Allow-Origin` header and do not answer a CORS
 *     preflight (OPTIONS) at all. A browser `fetch()` to either from a page
 *     served on brigsd.github.io is blocked by the browser before the
 *     request ever reaches GitHub. This has been true since at least 2015
 *     (github/isaacs#330, "OAuth web flow endpoints don't support CORS")
 *     and is still true as of GitHub's own docs and independent 2025
 *     write-ups (e.g. zonca.dev's browser device-flow post, which needs a
 *     small relay server for exactly this reason) - nothing found suggests
 *     this changed going into 2026. GitHub's own device-flow examples all
 *     assume a confidential/server-side client.
 *   - `https://api.github.com/*` (the REST API proper - `/user`,
 *     `/repos/.../issues`, ...) DOES support CORS
 *     (`Access-Control-Allow-Origin: *`, `Authorization` among the allowed
 *     request headers) for both unauthenticated and token-authenticated
 *     requests, and has since 2015. That is the entire reason the PAT path
 *     below works and the device-code exchange does not: once a token
 *     exists (however it was obtained), everything past that point is
 *     plain `api.github.com` and is fine from a static page.
 *   - The standard fix for the first bullet is a small server-side relay
 *     (Cloudflare Worker, Lambda, ...) that performs the two POSTs on the
 *     app's behalf. Per this task's constraint (no external infra beyond
 *     GitHub, D-03), that relay is deliberately NOT built here.
 *     `startDeviceFlow`/`pollDeviceToken` below are written correctly
 *     against the RFC 8628 state machine so they are ready to wire up the
 *     day either (a) a relay gets built, or (b) GitHub adds CORS to these
 *     two endpoints - neither has happened as of this writing, so
 *     exercising them today fails with a browser CORS error, not a GitHub
 *     error.
 *
 * Security: the token lives ONLY in localStorage, is never put in a URL or
 * logged, and every value that reaches the DOM (in auth-ui.ts) goes through
 * textContent - same rule mural.ts/meu-no.ts already follow for
 * player-typed/remote text.
 */
import { GITHUB_REPO_NAME, GITHUB_REPO_OWNER, NOS_OAUTH_CLIENT_ID } from './config';

const API_BASE = 'https://api.github.com';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * Scope requested by the (currently unreachable) device flow. `public_repo`
 * is knowingly OVER-BROAD - it grants write access to all of the player's
 * public repos, when all NÓS needs is "open issues on brigsd/nos". OAuth
 * Apps simply have no narrower scope that can do it; the right long-term
 * fix is a GitHub App (fine-grained `issues:write` permission, installed
 * on just this repo) instead of an OAuth App - worth revisiting when the
 * D-13 app registration actually happens.
 */
const DEVICE_FLOW_SCOPE = 'public_repo';

/** localStorage keys. `nos_token` is the name the task spec fixes; the rest are this module's own. */
const TOKEN_STORAGE_KEY = 'nos_token';
const LOGIN_CACHE_KEY = 'nos_token_login';

// ---------------------------------------------------------------------------
// Token storage - localStorage only. Never a cookie, never a URL param,
// never passed to console.log/console.warn (only the surrounding Error
// messages are, and those never interpolate the token itself).
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token: string, login: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(LOGIN_CACHE_KEY, login);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

/** Last known login for the stored token, without touching the network - lets the HUD paint instantly before getLogin() resolves. */
export function peekLogin(): string | null {
  return getToken() ? localStorage.getItem(LOGIN_CACHE_KEY) : null;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(LOGIN_CACHE_KEY);
}

// ---------------------------------------------------------------------------
// api.github.com - CORS-friendly (see module doc above); this is the part
// that actually works from a static page.
// ---------------------------------------------------------------------------

function githubApi(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Resolves the GitHub login for the stored token via `GET /user`,
 * refreshing the local cache. Returns null (and clears the stored token) if
 * the token is invalid/revoked; on a network hiccup it degrades to the
 * cached login instead of logging the player out for a transient failure
 * (same "fall back, don't fail" habit as world.ts's live fetch).
 */
export async function getLogin(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await githubApi('/user', token);
    if (res.status === 401) {
      logout(); // token revoked/expired - stop pretending we're logged in
      return null;
    }
    if (!res.ok) throw new Error(`GET /user: HTTP ${res.status}`);
    const data = (await res.json()) as { login?: string };
    if (!data.login) return null;
    localStorage.setItem(LOGIN_CACHE_KEY, data.login);
    return data.login;
  } catch (err) {
    console.warn('Não foi possível confirmar o login no GitHub agora, usando o último conhecido:', err);
    return peekLogin();
  }
}

/**
 * Validates a pasted token against `GET /user` and, on success, stores it
 * and returns the login. Throws an Error with a ready-to-show pt-BR message
 * otherwise - nothing is stored unless GitHub actually confirmed the token.
 */
export async function loginWithToken(token: string): Promise<string> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Cole um token antes de entrar.');

  let res: Response;
  try {
    res = await githubApi('/user', trimmed);
  } catch {
    throw new Error('Não foi possível falar com o GitHub agora. Confira sua conexão e tente de novo.');
  }
  if (res.status === 401) throw new Error('Token inválido ou expirado.');
  if (!res.ok) throw new Error(`O GitHub recusou o token (HTTP ${res.status}).`);

  const data = (await res.json()) as { login?: string };
  if (!data.login) throw new Error('O GitHub não devolveu um login para esse token.');

  setToken(trimmed, data.login);
  return data.login;
}

/**
 * Opens a command issue directly via the API instead of the pre-filled-link
 * fallback ("agir daqui", trade.ts/nativos.ts). `fields` become the
 * "### Campo\n\nvalor" blocks the engine's parsers already expect - the
 * exact same shape the GitHub issue-form templates render into (see
 * engine/commands.ts's parseTrocarParams/parseConversarTarget and their
 * tests). Requires the stored token to be able to open issues on brigsd/nos
 * (classic PAT, `public_repo`); throws a pt-BR message on any failure so
 * callers can fall back to the issue-form link.
 *
 * Labels: `comando` is requested but NOT load-bearing. GitHub silently
 * drops labels on issue creation when the author lacks triage/push access
 * (i.e. every regular player), so the tick's ingestion and trigger match on
 * the "Comando:" title prefix as well (.github/workflows/tick.yml, PR #38
 * review finding). The label still lands when the author CAN set it (repo
 * owner/collaborators), keeping their issues consistent with the templates.
 */
export async function createCommandIssue(
  title: string,
  fields: Record<string, string>,
): Promise<{ number: number; htmlUrl: string }> {
  const token = getToken();
  if (!token) throw new Error('Entre com o GitHub antes de agir direto.');

  const body = Object.entries(fields)
    .map(([label, value]) => `### ${label}\n\n${value}`)
    .join('\n\n');

  let res: Response;
  try {
    res = await githubApi(`/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, labels: ['comando'] }),
    });
  } catch {
    throw new Error('Não foi possível falar com o GitHub agora.');
  }
  if (res.status === 401) {
    logout(); // stored token is dead - drop it so the HUD stops claiming we're logged in
    throw new Error('Sua sessão expirou. Entre de novo.');
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error(
      'Esse token não consegue abrir issues em brigsd/nos — é preciso um token clássico com o escopo "public_repo" (tokens refinados/fine-grained não funcionam aqui).',
    );
  }
  if (!res.ok) throw new Error(`O GitHub recusou o comando (HTTP ${res.status}).`);

  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, htmlUrl: data.html_url };
}

// ---------------------------------------------------------------------------
// OAuth device flow (RFC 8628) - correct, but unreachable until
// NOS_OAUTH_CLIENT_ID is set AND the CORS problem above is solved. See the
// module doc comment before wiring this up for real.
// ---------------------------------------------------------------------------

/** Whether the OAuth App has been registered (config.ts). Does NOT by itself mean device flow will work from this browser - see the CORS note above. */
export const DEVICE_FLOW_AVAILABLE = NOS_OAUTH_CLIENT_ID !== '';

interface DeviceCodeStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token?: string;
  error?: string;
}

export async function startDeviceFlow(): Promise<DeviceCodeStart> {
  if (!DEVICE_FLOW_AVAILABLE) throw new Error('Login por OAuth ainda não está configurado neste site.');
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: NOS_OAUTH_CLIENT_ID, scope: DEVICE_FLOW_SCOPE }),
  });
  if (!res.ok) throw new Error(`Falha ao iniciar o login (HTTP ${res.status}).`);
  const data = (await res.json()) as DeviceCodeResponse;
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresInSeconds: data.expires_in,
    intervalSeconds: data.interval,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls the token endpoint per RFC 8628 §3.5 until the player confirms (or
 * the code expires/gets denied). Backs off by +5s on `slow_down`, keeps
 * going at the current interval on `authorization_pending`, and stops on
 * everything else.
 */
export async function pollDeviceToken(start: DeviceCodeStart): Promise<string> {
  let intervalMs = Math.max(1, start.intervalSeconds) * 1000;
  const deadline = Date.now() + start.expiresInSeconds * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);

    const res = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: NOS_OAUTH_CLIENT_ID,
        device_code: start.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = (await res.json()) as DeviceTokenResponse;

    if (data.access_token) return data.access_token;

    switch (data.error) {
      case 'authorization_pending':
        continue; // player hasn't confirmed yet - keep polling
      case 'slow_down':
        intervalMs += 5000; // RFC 8628: back off by at least 5s
        continue;
      case 'expired_token':
        throw new Error('O código expirou. Tente entrar de novo.');
      case 'access_denied':
        throw new Error('Login cancelado.');
      default:
        throw new Error(`Falha no login (${data.error ?? res.status}).`);
    }
  }
  throw new Error('O código expirou. Tente entrar de novo.');
}

/**
 * Full device-flow login: starts the flow, hands the user_code/verification
 * link to `onPrompt` so the caller can display it, polls for the token,
 * then resolves the login via `GET /user` and stores everything.
 *
 * See the CORS note atop this file: calling this today throws a browser
 * network/CORS error before it ever reaches GitHub for real, and
 * DEVICE_FLOW_AVAILABLE (client_id unset) keeps auth-ui.ts from ever
 * calling it in the first place.
 */
export async function loginWithDeviceFlow(
  onPrompt: (userCode: string, verificationUri: string) => void,
): Promise<string> {
  const start = await startDeviceFlow();
  onPrompt(start.userCode, start.verificationUri);
  const token = await pollDeviceToken(start);

  const res = await githubApi('/user', token);
  if (!res.ok) throw new Error('Login concluído, mas não foi possível confirmar o usuário.');
  const data = (await res.json()) as { login?: string };
  if (!data.login) throw new Error('O GitHub não devolveu um login.');

  setToken(token, data.login);
  return data.login;
}
