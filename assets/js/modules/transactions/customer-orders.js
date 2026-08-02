// assets/js/modules/transactions/customer-orders.js
// "Orders" button: shows transactions that were tied to a specific
// customer (as opposed to walk-in sales), matching PharmaSpot's
// Customer Orders view.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderTable } from '../../ui/table-manager.js';
import { formatMoney, formatDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export async function openCustomerOrdersModal() {
  const content = el('div', {}, 'Loading...');
  modalManager.open({
    title: 'Customer Orders',
    content,
    actions: [{ label: 'Close', className: 'btn-secondary' }]
  });

  try {
    const [transactions, customers] = await Promise.all([
      apiClient.get('/transactions'),
      apiClient.get('/customers')
    ]);
    const customerName = Object.fromEntries(customers.map((c) => [c.id, c.name]));
    const withCustomer = transactions.filter((t) => t.customerId);

    const table = el('div');
    renderTable(table, {
      columns: [
        { key: 'customer', label: 'Customer', render: (t) => customerName[t.customerId] || 'Unknown' },
        { key: 'createdAt', label: 'Date', render: (t) => formatDate(t.createdAt) },
        { key: 'total', label: 'Total', render: (t) => formatMoney(t.total, settingsStore.getCurrencySymbol()) },
        { key: 'status', label: 'Status' }
      ],
      rows: withCustomer,
      emptyMessage: 'No customer orders yet -- assign a customer during checkout to see them here.'
    });

    content.innerHTML = '';
    content.appendChild(table);
  } catch (err) {
    notification.error(`Failed to load orders: ${err.message}`);
  }
}
