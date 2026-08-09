// assets/js/modules/customers/customer-list.js
// Renders the customer directory, wired to /api/customers.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderTable } from '../../ui/table-manager.js';
import { openCustomerForm } from './customer-form.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

export async function mountCustomerList(container) {
  container.appendChild(el('div', { class: 'view-header' }, [
    el('h2', {}, 'Customers'),
    el('input', {
      class: 'search-input',
      placeholder: 'Search customers...',
      onInput: (e) => refresh(e.target.value)
    }),
    el('button', { class: 'btn btn-primary', onClick: () => openCustomerForm({ onSaved: () => refresh() }) }, '+ New Customer')
  ]));

  const tableContainer = el('div', { class: 'table-container' });
  container.appendChild(tableContainer);

  async function refresh(search = '') {
    try {
      const customers = await apiClient.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      renderTable(tableContainer, {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'loyaltyPoints', label: 'Loyalty Points' },
          {
            key: 'balance',
            label: 'Balance Due',
            render: (c) => el('span', { style: c.balance > 0 ? 'color:var(--color-danger); font-weight:600;' : '' }, formatMoney(c.balance || 0, settingsStore.getCurrencySymbol()))
          }
        ],
        rows: customers,
        onRowClick: (customer) => openCustomerForm({ customer, onSaved: () => refresh() })
      });
    } catch (err) {
      notification.error(`Failed to load customers: ${err.message}`);
    }
  }

  await refresh();
}
