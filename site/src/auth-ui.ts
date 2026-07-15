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
 * Pre-filled "create a fine-grained token" link (GitHub's template-URL
 * feature): scopes the token to brigsd/nos with Issues: write before the
 * player even opens the page, so there's nothing to get wrong by hand.
 * `target_name`/`repositories` are a best-effort pre-fill only - GitHub
 * still makes the player confirm the resource owner/repo themselves.
 */
const PAT_CREATE_URL = (() => {
  const params = new URLSearchParams({
    name: 'NÓS (brigsd/nos)',
    description: 'Agir em NOS sem preencher o formulario de issue toda vez - so precisa de Issues: Read and write.',
    target_name: 'brigsd',
    repositories: 'nos',
    expires_in: '90',
    issues: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
})();

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
      'Entre com um token do GitHub para agir sem preencher o formulário toda vez. Crie um token refinado (fine-grained) só do repositório brigsd/nos, com permissão "Issues: Read and write" — nada além disso é necessário. Ele fica só neste navegador (nunca é enviado a mais nada além do próprio GitHub); revogue quando não precisar mais dele.',
    ),
  );

  const createLink = el('a', 'auth-create-link', 'Criar token no GitHub →');
  createLink.href = PAT_CREATE_URL;
  createLink.target = '_blank';
  createLink.rel = 'noopener noreferrer';
  rootEl.appendChild(createLink);

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
