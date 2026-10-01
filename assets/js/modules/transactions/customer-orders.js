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

  async function load() {
    try {
      // includeTest:true -- a test sale attached to a (real or test)
      // customer still needs to show up somewhere it can be found and
      // deleted; it's already excluded from every report regardless.
      const [transactions, customers] = await Promise.all([
        apiClient.get('/transactions?includeTest=true'),
        apiClient.get('/customers')
      ]);
      const customerName = Object.fromEntries(customers.map((c) => [c.id, c.name]));
      const withCustomer = transactions.filter((t) => t.customerId);

      const table = el('div');
      renderTable(table, {
        columns: [
          {
            key: 'customer',
            label: 'Customer',
            render: (t) => el('span', {}, [
              customerName[t.customerId] || 'Unknown',
              t.isTest ? el('span', { class: 'po-status-badge po-status-partially_received', style: 'margin-left:0.4rem;' }, 'TEST') : null
            ])
          },
          { key: 'createdAt', label: 'Date', render: (t) => formatDate(t.createdAt) },
          { key: 'total', label: 'Total', render: (t) => formatMoney(t.total, settingsStore.getCurrencySymbol()) },
          { key: 'status', label: 'Status' },
          {
            key: 'actions',
            label: '',
            render: (t) => {
              if (!t.isTest) return '';
              // Only a test sale can be deleted outright here -- see
              // core/transaction-manager.js#deleteTestSale.
              const btn = el('button', { class: 'btn btn-sm btn-danger', title: 'Delete this test sale' }, '\u2715');
              btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this test sale? This restocks any items it deducted and cannot be undone.')) return;
                try {
                  await apiClient.delete(`/transactions/${t.id}`);
                  notification.success('Test sale deleted.');
                  load();
                } catch (err) {
                  notification.error(`Failed to delete: ${err.message}`);
                }
              });
              return btn;
            }
          }
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

  await load();
}
