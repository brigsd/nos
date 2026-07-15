/**
 * src/auth-ui.ts
 *
 * HUD panel for "Entrar com GitHub" (R2, D-13/D-25d) - the login control
 * itself. Two states only: logged out (a form) and logged in (`@login` +
 * "sair"). Which form the logged-out state shows depends on
 * auth.ts's DEVICE_FLOW_AVAILABLE (config.NOS_OAUTH_CLIENT_ID) - empty
 * today, so it's the PAT form; see auth.ts's header comment for why.
 *
 * DOM-overlay module in the meu-no.ts mold: re-renders itself in place on
 * every state change and calls `onChange` afterwards so the caller
 * (main.ts) can refresh whatever else reads auth state (Meu Nó's
 * auto-fill, Comércio/Nativos' "agir daqui" buttons).
 *
 * Security: a pasted token is the one piece of secret input this whole site
 * ever handles - the `<input type="password">` keeps it off-screen, it is
 * cleared from the form the instant it's accepted, and every string that
 * lands in the DOM (including GitHub's own user_code/verification_uri)
 * goes through textContent, same rule as mural.ts/meu-no.ts.
 */
import { setSavedLogin } from './meu-no';
import {
  DEVICE_FLOW_AVAILABLE,
  getLogin,
  isLoggedIn,
  loginWithDeviceFlow,
  loginWithToken,
  logout,
  peekLogin,
} from './auth';

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

/**
 * Pre-filled "create a classic token" link, scope `public_repo` only.
 *
 * Why CLASSIC and not fine-grained (review finding on PR #38): a
 * fine-grained PAT only grants write access to repos the token's owner
 * controls or collaborates on - a regular player can give one at most
 * READ-ONLY access to someone else's public repo, so a fine-grained token
 * can never open issues on brigsd/nos for a non-collaborator. The only
 * self-serve token a third-party player can mint that opens issues here is
 * a classic PAT with `public_repo` - which unavoidably also grants write to
 * ALL of the player's own public repos. That is why the copy below frames
 * this as an optional "modo avançado", spells that scope out honestly, and
 * tells the player to revoke the token when done. The zero-risk default for
 * everyone remains the pre-filled issue links (trade.ts/nativos.ts).
 */
const PAT_CREATE_URL = (() => {
  const params = new URLSearchParams({
    scopes: 'public_repo',
    description: 'NOS (brigsd/nos) - agir daqui',
  });
  return `https://github.com/settings/tokens/new?${params.toString()}`;
})();

/** Where the player revokes the token when they're done playing. */
const PAT_REVOKE_URL = 'https://github.com/settings/tokens';

function clearError(rootEl: HTMLElement): void {
  rootEl.querySelector('.auth-error')?.remove();
}

function showError(rootEl: HTMLElement, message: string): void {
  clearError(rootEl);
  rootEl.appendChild(el('p', 'auth-error', message));
}

function renderLoggedIn(rootEl: HTMLElement, login: string, onChange: () => void): void {
  rootEl.replaceChildren();
  const line = el('p', 'auth-line');
  line.append(el('span', 'hud-mural-author', `@${login}`));
  const out = el('button', 'auth-logout', 'sair');
  out.type = 'button';
  out.addEventListener('click', () => {
    logout();
    renderAuth(rootEl, onChange);
    onChange();
  });
  line.append(document.createTextNode(' '), out);
  rootEl.appendChild(line);
}

function renderPatForm(rootEl: HTMLElement, onChange: () => void): void {
  rootEl.replaceChildren();

  rootEl.appendChild(
    el(
      'p',
      'auth-hint',
      'Você não precisa entrar para jogar: os links de comando dos painéis já funcionam para todo mundo. Entrar é um modo avançado opcional, para enviar comandos daqui do site sem abrir outra aba.',
    ),
  );
  rootEl.appendChild(
    el(
      'p',
      'auth-hint',
      'Atenção: isso pede um token clássico com o escopo "public_repo", que dá acesso de escrita a TODOS os seus repositórios públicos — o GitHub não oferece nada mais restrito que funcione aqui para quem não é colaborador do brigsd/nos. O token fica só neste navegador e só é enviado ao próprio GitHub. Recomendação: revogue-o quando terminar de jogar.',
    ),
  );

  const createLink = el('a', 'auth-create-link', 'Criar token clássico no GitHub →');
  createLink.href = PAT_CREATE_URL;
  createLink.target = '_blank';
  createLink.rel = 'noopener noreferrer';
  rootEl.appendChild(createLink);

  const revokeLink = el('a', 'auth-create-link', 'Revogar tokens (quando terminar) →');
  revokeLink.href = PAT_REVOKE_URL;
  revokeLink.target = '_blank';
  revokeLink.rel = 'noopener noreferrer';
  rootEl.appendChild(revokeLink);

  const form = el('form', 'auth-form');
  const input = el('input', 'auth-input');
  input.type = 'password';
  input.placeholder = 'cole o token aqui';
  input.autocomplete = 'off';
  input.spellcheck = false;
  const button = el('button', 'auth-button', 'Entrar');
  button.type = 'submit';
  form.append(input, button);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const value = input.value;
    if (!value.trim()) return;
    clearError(rootEl);
    button.disabled = true;
    button.textContent = 'entrando…';
    loginWithToken(value)
      .then((login) => {
        setSavedLogin(login);
        renderAuth(rootEl, onChange);
        onChange();
      })
      .catch((err: unknown) => {
        input.value = ''; // never linger in the DOM after a failed attempt either
        button.disabled = false;
        button.textContent = 'Entrar';
        showError(rootEl, err instanceof Error ? err.message : 'Não foi possível entrar.');
      });
  });
  rootEl.appendChild(form);
}

function renderDeviceFlowForm(rootEl: HTMLElement, onChange: () => void): void {
  rootEl.replaceChildren();
  rootEl.appendChild(el('p', 'auth-hint', 'Entre com sua conta do GitHub para agir sem sair do jogo.'));

  const button = el('button', 'auth-button', 'Entrar com GitHub');
  button.type = 'button';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'iniciando…';
    loginWithDeviceFlow((userCode, verificationUri) => {
      // Waiting-for-confirmation view: swap the button for the code+link.
      rootEl.replaceChildren();
      rootEl.appendChild(el('p', 'auth-hint', 'Abra o link abaixo e digite o código para confirmar:'));
      rootEl.appendChild(el('p', 'auth-device-code', userCode));
      const link = el('a', 'auth-create-link', verificationUri.replace(/^https?:\/\//, ''));
      link.href = verificationUri;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      rootEl.appendChild(link);
      rootEl.appendChild(el('p', 'auth-hint', 'Aguardando confirmação…'));
    })
      .then((login) => {
        setSavedLogin(login);
        renderAuth(rootEl, onChange);
        onChange();
      })
      .catch((err: unknown) => {
        renderDeviceFlowForm(rootEl, onChange);
        showError(rootEl, err instanceof Error ? err.message : 'Não foi possível entrar.');
      });
  });
  rootEl.appendChild(button);
}

/**
 * Renders the login control into `rootEl` - call once at startup; it
 * re-renders itself on every state change from then on. `onChange` fires
 * whenever login/logout actually happens, so the caller can refresh
 * whatever else reads auth state.
 */
export function renderAuth(rootEl: HTMLElement, onChange: () => void): void {
  if (isLoggedIn()) {
    // Paint instantly from the cached login, then confirm/refresh in the
    // background - quietly drops back to logged-out if the token was
    // revoked server-side since the last visit.
    renderLoggedIn(rootEl, peekLogin() ?? '…', onChange);
    void getLogin().then((login) => {
      if (login) {
        setSavedLogin(login);
        renderLoggedIn(rootEl, login, onChange);
      } else if (!isLoggedIn()) {
        renderAuth(rootEl, onChange);
        onChange();
      }
    });
    return;
  }

  if (DEVICE_FLOW_AVAILABLE) {
    renderDeviceFlowForm(rootEl, onChange);
  } else {
    renderPatForm(rootEl, onChange);
  }
}
