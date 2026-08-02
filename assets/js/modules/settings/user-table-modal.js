// assets/js/modules/settings/user-table-modal.js
// "Users" button opens this modal: a searchable data table of staff
// accounts with their permissions, matching the real Users popup.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import modalManager from '../../ui/modal-manager.js';
import { openUserForm } from './user-form.js';
import notification from '../../ui/notification.js';

const PERMISSION_LABELS = {
  perm_products: 'Products',
  perm_categories: 'Categories',
  perm_transactions: 'Transactions',
  perm_users: 'Users',
  perm_settings: 'Settings'
};

export function openUserTableModal() {
  let search = '';

  const searchInput = el('input', {
    class: 'search-input',
    placeholder: 'Search...',
    onInput: (e) => { search = e.target.value; refresh(); }
  });

  const tableWrap = el('div', { class: 'table-container' });

  const content = el('div', {}, [
    el('div', { class: 'datatable-search-row' }, [el('span', {}, 'Search:'), searchInput]),
    tableWrap
  ]);

  modalManager.open({ title: 'Users', content, size: 'lg', actions: [{ label: 'Close', className: 'btn-secondary' }] });

  async function refresh() {
    try {
      let users = await apiClient.get('/users');
      if (search) {
        const q = search.toLowerCase();
        users = users.filter((u) => u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q));
      }
      renderUsersTable(tableWrap, users, refresh);
    } catch (err) {
      notification.error(`Failed to load users: ${err.message}`);
    }
  }

  refresh();
}

function renderUsersTable(container, users, onChange) {
  container.innerHTML = '';

  if (users.length === 0) {
    container.appendChild(el('div', { class: 'table-empty' }, 'No data available in table'));
    return;
  }

  const thead = el('thead', {}, [el('tr', {}, ['Username', 'Full Name', 'Permissions', 'Action'].map((h) => el('th', {}, h)))]);

  const rows = users.map((u) => {
    const perms = Object.entries(PERMISSION_LABELS)
      .filter(([key]) => u.permissions?.[key])
      .map(([, label]) => label)
      .join(', ') || '\u2014';

    return el('tr', {}, [
      el('td', {}, u.username),
      el('td', {}, u.displayName || '-'),
      el('td', {}, perms),
      el('td', { class: 'action' }, [
        el('button', {
          class: 'btn btn-sm btn-danger',
          onClick: async () => {
            if (u.username === 'admin') {
              notification.error('The default admin account cannot be deleted.');
              return;
            }
            if (!window.confirm(`Delete user "${u.username}"?`)) return;
            try {
              await apiClient.delete(`/users/${u.id}`);
              notification.success('User deleted.');
              onChange();
            } catch (err) {
              notification.error(err.message);
            }
          }
        }, '\u2715')
      ])
    ]);
  });

  container.appendChild(el('table', { class: 'app-table' }, [thead, el('tbody', {}, rows)]));
}
