// assets/js/core/idle-lock.js
// Locks the app behind a password prompt after N minutes of no mouse/
// keyboard/touch activity -- configurable in Settings -> Store Profile
// -> Application (0 = disabled). Reuses the same visual language as
// the login gate (see login-screen.js) since it's conceptually the
// same "prove who you are" screen, just re-entering rather than
// starting a session.

import { el } from '../shared/utils.js';
import session from './session.js';
import apiClient from '../shared/api-client.js';
import settingsStore from '../shared/settings-store.js';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'];

export function initIdleLock() {
  let idleTimer = null;
  let locked = false;

  function currentIdleMinutes() {
    const minutes = Number(settingsStore.getProfile().idleLockMinutes);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  }

  function resetTimer() {
    if (locked) return;
    if (idleTimer) clearTimeout(idleTimer);
    const minutes = currentIdleMinutes();
    if (!minutes) return; // disabled
    idleTimer = setTimeout(showLockScreen, minutes * 60 * 1000);
  }

  function showLockScreen() {
    if (locked || !session.isLoggedIn()) return;
    locked = true;

    const user = session.getCurrentUser();
    let password = '';
    const errorEl = el('div', { class: 'gate-error' }, '');

    const passwordInput = el('input', {
      type: 'password',
      class: 'gate-input',
      placeholder: 'Password',
      onInput: (e) => { password = e.target.value; }
    });

    const unlockBtn = el('button', { class: 'btn btn-primary btn-block', onClick: unlock }, 'Unlock');
    const logoutBtn = el('button', {
      class: 'btn btn-secondary btn-block',
      style: 'margin-top:0.5rem;',
      onClick: () => {
        session.logout();
        window.location.reload();
      }
    }, 'Log Out Instead');

    async function unlock() {
      if (!password) {
        errorEl.textContent = 'Enter your password.';
        return;
      }
      errorEl.textContent = '';
      unlockBtn.disabled = true;
      unlockBtn.textContent = 'Unlocking\u2026';
      try {
        await apiClient.post('/users/authenticate', { username: user.username, password });
        overlay.remove();
        locked = false;
        password = '';
        resetTimer();
      } catch (err) {
        errorEl.textContent = 'Incorrect password.';
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock';
        passwordInput.value = '';
        password = '';
      }
    }

    passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });

    const overlay = el('div', { class: 'gate-screen idle-lock-overlay' }, [
      el('div', { class: 'gate-card' }, [
        el('div', { class: 'gate-badge' }, '\u{1F512}'),
        el('h1', { class: 'gate-title' }, 'Locked'),
        el('p', { class: 'gate-subtitle' }, `Signed in as ${user?.displayName || user?.username || 'this user'} \u2014 enter your password to resume`),
        passwordInput,
        errorEl,
        unlockBtn,
        logoutBtn
      ])
    ]);

    document.body.appendChild(overlay);
    passwordInput.focus();
  }

  ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
  resetTimer();
}
