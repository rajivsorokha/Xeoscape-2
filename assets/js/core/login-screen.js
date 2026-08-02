// assets/js/core/login-screen.js
// Full-screen login gate shown after activation, before the main app.
// Uses the existing /api/users/authenticate endpoint via session.js.

import { el } from '../shared/utils.js';
import session from './session.js';

/**
 * @returns {Promise<void>} resolves once login succeeds
 */
export function renderLoginScreen(rootEl) {
  return new Promise((resolve) => {
    let username = '';
    let password = '';
    const errorEl = el('div', { class: 'gate-error' }, '');

    const usernameInput = el('input', {
      type: 'text',
      class: 'gate-input',
      placeholder: 'Username',
      onInput: (e) => { username = e.target.value; }
    });
    const passwordInput = el('input', {
      type: 'password',
      class: 'gate-input',
      placeholder: 'Password',
      onInput: (e) => { password = e.target.value; }
    });

    const submitBtn = el('button', { class: 'btn btn-primary btn-block', onClick: submit }, 'Log In');

    async function submit() {
      if (!username.trim() || !password) {
        errorEl.textContent = 'Enter your username and password.';
        return;
      }
      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';
      try {
        await session.login(username, password);
        resolve();
      } catch (err) {
        errorEl.textContent = err.message || 'Invalid username or password.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
      }
    }

    [usernameInput, passwordInput].forEach((input) => {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });

    rootEl.innerHTML = '';
    rootEl.appendChild(el('div', { class: 'gate-screen' }, [
      el('div', { class: 'gate-card' }, [
        el('div', { class: 'gate-badge' }, 'X'),
        el('h1', { class: 'gate-title' }, 'Xeoscape'),
        el('p', { class: 'gate-subtitle' }, 'Log in to continue'),
        el('label', { class: 'gate-label' }, 'Username'),
        usernameInput,
        el('label', { class: 'gate-label' }, 'Password'),
        passwordInput,
        errorEl,
        submitBtn,
        el('p', { class: 'gate-footnote' }, 'Default admin account: username "admin", password "admin"')
      ])
    ]));

    usernameInput.focus();
  });
}
