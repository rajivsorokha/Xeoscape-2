// assets/js/modules/settings/user-form.js
// Modal "New User" form (triggered by the "+" button next to Users in
// the topbar), with the same granular permission checkboxes as the
// inline form on the Users management page.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

const PERMISSIONS = [
  { key: 'perm_products', label: 'Products' },
  { key: 'perm_categories', label: 'Categories' },
  { key: 'perm_transactions', label: 'Transactions' },
  { key: 'perm_users', label: 'Users' },
  { key: 'perm_settings', label: 'Settings' }
];

export function openUserForm({ onSaved } = {}) {
  const values = { username: '', password: '', displayName: '', permissions: {} };

  const usernameInput = el('input', { placeholder: 'Username', onInput: (e) => (values.username = e.target.value) });
  const passwordInput = el('input', { type: 'password', placeholder: 'Password', onInput: (e) => (values.password = e.target.value) });
  const displayNameInput = el('input', { placeholder: 'Full name', onInput: (e) => (values.displayName = e.target.value) });

  const permCheckboxes = PERMISSIONS.map(({ key, label }) => {
    const checkbox = el('input', { type: 'checkbox', onChange: (e) => { values.permissions[key] = e.target.checked; } });
    return el('label', { class: 'perm-checkbox' }, [checkbox, ` ${label}`]);
  });

  const form = el('div', {}, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Username *'), usernameInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Password *'), passwordInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Full Name'), displayNameInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Permissions'), el('div', { class: 'perm-checkbox-row' }, permCheckboxes)])
  ]);

  modalManager.open({
    title: 'New User',
    content: form,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Save',
        className: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          if (!values.username || !values.password) {
            notification.error('Username and password are required.');
            return;
          }
          try {
            await apiClient.post('/users', values);
            notification.success('User created.');
            modalManager.close();
            onSaved?.();
          } catch (err) {
            notification.error(err.message);
          }
        }
      }
    ]
  });
}
