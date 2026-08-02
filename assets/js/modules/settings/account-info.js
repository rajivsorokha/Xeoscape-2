// assets/js/modules/settings/account-info.js
// "Account Information" modal, opened from the Administrator button --
// lets the current user update their display name, username, and
// password. Matches the real modal exactly: Name*, Username*,
// Password, Repeat Password, Submit.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';
import session from '../../core/session.js';

export async function openAccountInfoModal() {
  const sessionUser = session.getCurrentUser();
  if (!sessionUser) {
    notification.error('No active session.');
    return;
  }

  let currentUser;
  try {
    const users = await apiClient.get('/users');
    currentUser = users.find((u) => u.id === sessionUser.id) || users.find((u) => u.username === sessionUser.username);
  } catch (err) {
    notification.error(`Failed to load account: ${err.message}`);
    return;
  }

  if (!currentUser) {
    notification.error('No account found.');
    return;
  }

  const values = {
    displayName: currentUser.displayName || 'Administrator',
    username: currentUser.username,
    password: '',
    repeatPassword: ''
  };

  const nameInput = el('input', { value: values.displayName, onInput: (e) => (values.displayName = e.target.value) });
  const usernameInput = el('input', { value: values.username, onInput: (e) => (values.username = e.target.value) });
  const passwordInput = el('input', { type: 'password', placeholder: 'New Password', onInput: (e) => (values.password = e.target.value) });
  const repeatInput = el('input', { type: 'password', placeholder: 'Repeat', onInput: (e) => (values.repeatPassword = e.target.value) });
  const errorEl = el('div', { class: 'field-error' }, '');

  const form = el('div', {}, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Name*'), nameInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Username*'), usernameInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Password'), passwordInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Repeat Password'), repeatInput]),
    errorEl
  ]);

  modalManager.open({
    title: 'Account Information',
    content: form,
    actions: [
      {
        label: 'Submit',
        className: 'btn-primary btn-block',
        closeOnClick: false,
        onClick: async () => {
          if (!values.displayName.trim() || !values.username.trim()) {
            errorEl.textContent = 'Name and Username are required.';
            return;
          }
          if (values.password && values.password !== values.repeatPassword) {
            errorEl.textContent = 'Passwords do not match.';
            return;
          }
          try {
            const patch = { displayName: values.displayName, username: values.username };
            if (values.password) patch.password = values.password;
            await apiClient.put(`/users/${currentUser.id}`, patch);
            notification.success('Account updated.');
            modalManager.close();
          } catch (err) {
            errorEl.textContent = err.message;
          }
        }
      }
    ]
  });
}
