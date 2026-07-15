/**
 * src/config.ts
 *
 * Site-wide config constants that are safe to ship in the client bundle -
 * nothing secret here, this is a public static site with no server of its
 * own (D-03: repo = banco, Actions = servidor do tick, Pages = cliente).
 */

/** The repo the site talks to for live world state (world.ts) and player commands (issues). */
export const GITHUB_REPO_OWNER = 'brigsd';
export const GITHUB_REPO_NAME = 'nos';

/**
 * GitHub OAuth App client_id for the device-flow login (D-13, D-25d). A
 * client_id is not a secret for a public client - device flow needs no
 * client secret at all (RFC 8628) - it is simply empty because the OAuth
 * App does not exist yet. The repo owner registers it by hand at
 * github.com/settings/developers ("New OAuth App", Authorization callback
 * URL can be anything since device flow never redirects) and pastes the
 * resulting client_id here.
 *
 * Empty (default) = the device-flow "Entrar com GitHub" button stays
 * hidden and the site falls back to PAT-based login (site/src/auth.ts) -
 * the path that actually works on a pure static site today, verified
 * 2026-07 (see the CORS note at the top of auth.ts). IMPORTANT: filling
 * this in is NOT sufficient by itself to make device flow complete from a
 * browser - read that note before flipping this on.
 */
export const NOS_OAUTH_CLIENT_ID = '';
