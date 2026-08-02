// assets/js/modules/settings/user-management.js
// Staff account management: list users, create new ones with granular
// per-feature permissions (Products, Categories, Transactions, Users,
// Settings), matching PharmaSpot's real permission checkboxes.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderTable } from '../../ui/table-manager.js';
import notification from '../../ui/notification.js';

const PERMISSIONS = [
  { key: 'perm_products', label: 'Manage Products and Stock' },
  { key: 'perm_categories', label: 'Manage Product Categories' },
  { key: 'perm_transactions', label: 'View Transactions' },
  { key: 'perm_users', label: 'Manage Users and Permissions' },
  { key: 'perm_settings', label: 'Manage Settings' }
];

export async function mountUserManagement(container) {
  container.appendChild(el('h3', {}, 'Staff Accounts'));

  const tableContainer = el('div', { class: 'table-container' });
  container.appendChild(tableContainer);

  const usernameInput = el('input', { placeholder: 'Username' });
  const passwordInput = el('input', { type: 'password', placeholder: 'Password' });
  const displayNameInput = el('input', { placeholder: 'Full name' });

  const permissionValues = {};
  const permissionCheckboxes = PERMISSIONS.map(({ key, label }) => {
    permissionValues[key] = false;
    const checkbox = el('input', { type: 'checkbox', onChange: (e) => { permissionValues[key] = e.target.checked; } });
    return el('label', { class: 'perm-checkbox' }, [checkbox, ` ${label}`]);
  });

  const addBtn = el('button', {
    class: 'btn btn-primary',
    onClick: async () => {
      if (!usernameInput.value || !passwordInput.value) {
        notification.error('Username and password are required.');
        return;
      }
      try {
        await apiClient.post('/users', {
          username: usernameInput.value,
          password: passwordInput.value,
          displayName: displayNameInput.value,
          permissions: permissionValues
        });
        usernameInput.value = '';
        passwordInput.value = '';
        displayNameInput.value = '';
        notification.success('User created.');
        await refresh();
      } catch (err) {
        notification.error(err.message);
      }
    }
  }, 'Add User');

  container.appendChild(el('div', { class: 'user-form-inline' }, [
    usernameInput, passwordInput, displayNameInput
  ]));
  container.appendChild(el('div', { class: 'perm-checkbox-row' }, permissionCheckboxes));
  container.appendChild(addBtn);

  async function refresh() {
    const users = await apiClient.get('/users');
    renderTable(tableContainer, {
      columns: [
        { key: 'username', label: 'Username' },
        { key: 'displayName', label: 'Full Name' },
        {
          key: 'permissions',
          label: 'Permissions',
          render: (u) => PERMISSIONS.filter((p) => u.permissions?.[p.key]).map((p) => p.label.split(' ')[0]).join(', ') || '—'
        }
      ],
      rows: users
    });
  }

  await refresh();
}
