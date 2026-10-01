// assets/js/modules/transactions/transaction-list.js
// Transactions view: stats cards (Sales/Transactions/Items Sold/
// Products), a filter row (Till/Cashier/Status/Date range), and a
// two-pane layout (Products sold summary + Transaction Details) --
// matching the real Transactions screen.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderTable } from '../../ui/table-manager.js';
import { formatMoney, formatDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import { openTransactionDetail } from './transaction-detail.js';
import { createDateRangePicker } from '../../ui/date-range-picker.js';
import { createBackToPosButton } from '../../ui/back-to-pos-button.js';
import notification from '../../ui/notification.js';

export async function mountTransactionList(container) {
  const symbol = settingsStore.getCurrencySymbol();
  const today = new Date();
  const filters = {
    cashier: '',
    status: 'completed',
    from: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString(),
    to: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString(),
    // Off by default -- test sales are already excluded from every
    // stat card and report query below (list()'s own includeTest
    // default handles that), this just controls whether they show up
    // in the Transaction Details table so they can be found/deleted.
    includeTest: false
  };

  // --- Stats cards ---
  const salesValueEl = el('div', { class: 'stat-value' }, '0');
  const txnValueEl = el('div', { class: 'stat-value' }, '0');
  const itemsValueEl = el('div', { class: 'stat-value' }, '0');
  const productsValueEl = el('div', { class: 'stat-value' }, '0');
  const creditValueEl = el('div', { class: 'stat-value' }, '0');

  container.appendChild(el('div', { class: 'view-header' }, [el('h2', {}, 'Transactions'), createBackToPosButton()]));

  const statCards = [
    el('div', { class: 'stat-card stat-card-green' }, [el('div', { class: 'stat-label' }, 'SALES'), salesValueEl]),
    el('div', { class: 'stat-card stat-card-warning' }, [el('div', { class: 'stat-label' }, 'TRANSACTIONS'), txnValueEl]),
    el('div', { class: 'stat-card stat-card-info' }, [el('div', { class: 'stat-label' }, 'ITEMS SOLD'), itemsValueEl]),
    el('div', { class: 'stat-card stat-card-green' }, [el('div', { class: 'stat-label' }, 'PRODUCTS'), productsValueEl])
  ];
  // Outstanding Credit only means anything when credit sales are on
  // (the only store type Credit payment is available for -- see
  // core/transaction-manager.js#checkout) -- omitted entirely
  // elsewhere rather than always showing a meaningless ₹0.
  if (settingsStore.isCreditEnabled()) {
    statCards.push(el('div', { class: 'stat-card stat-card-warning' }, [el('div', { class: 'stat-label' }, 'OUTSTANDING DUE'), creditValueEl]));
  }
  container.appendChild(el('div', { class: 'stats-row' }, statCards));

  // --- Filter row ---
  const cashierSelect = el('select', { onChange: (e) => { filters.cashier = e.target.value; refresh(); } }, [el('option', { value: '' }, 'All Cashiers')]);
  const statusSelect = el('select', { onChange: (e) => { filters.status = e.target.value; refresh(); } }, [
    el('option', { value: 'completed' }, 'Paid'),
    el('option', { value: 'pending' }, 'Unpaid'),
    el('option', { value: 'voided' }, 'Voided'),
    el('option', { value: '' }, 'All')
  ]);
  statusSelect.value = 'completed';

  const datePicker = createDateRangePicker({
    initialPreset: 'today',
    onChange: ({ from, to }) => {
      // Keep full timestamps (not just the date) so the end-of-day
      // boundary (23:59:59.999) actually reaches the API -- truncating
      // to "YYYY-MM-DD" would silently drop it and make the backend
      // compare against midnight, excluding same-day transactions.
      filters.from = from.toISOString();
      filters.to = to.toISOString();
      refresh();
    }
  });

  const includeTestCheckbox = el('input', {
    type: 'checkbox',
    onChange: (e) => { filters.includeTest = e.target.checked; clearTestBtn.style.display = e.target.checked ? '' : 'none'; refresh(); }
  });
  const clearTestBtn = el('button', {
    class: 'btn btn-sm btn-danger',
    style: 'display:none;',
    onClick: async () => {
      if (!confirm('Delete every test sale? This restocks any items they deducted and cannot be undone.')) return;
      try {
        const { deletedCount } = await apiClient.post('/transactions/clear-test', {});
        notification.success(`Deleted ${deletedCount} test sale${deletedCount === 1 ? '' : 's'}.`);
        refresh();
      } catch (err) {
        notification.error(`Failed to clear test sales: ${err.message}`);
      }
    }
  }, 'Clear test sales');

  // After a sale is marked as a test sale it is (correctly) excluded
  // from the default list -- but that made the row vanish and look as
  // if it had been deleted. Switch "Show test sales" on instead, so
  // the sale stays visible with its TEST badge and its own delete (X)
  // button, and nothing is removed until the user clicks that.
  function revealTestSales() {
    filters.includeTest = true;
    includeTestCheckbox.checked = true;
    clearTestBtn.style.display = '';
  }

  container.appendChild(el('div', { class: 'view-header transactions-filter-bar' }, [
    el('h2', {}, 'Transactions'),
    el('label', { class: 'filter-label' }, ['Till', el('select', { disabled: true }, [el('option', {}, 'Till 1')])]),
    el('label', { class: 'filter-label' }, ['Cashier', cashierSelect]),
    el('label', { class: 'filter-label' }, ['Status', statusSelect]),
    el('label', { class: 'filter-label' }, ['Date', datePicker]),
    el('label', { class: 'filter-label filter-label-checkbox' }, [includeTestCheckbox, 'Show test sales']),
    clearTestBtn
  ]));

  // --- Two-pane layout ---
  const twoPane = el('div', { class: 'transactions-two-pane' });
  const productsPane = el('div', { class: 'panel-box' }, [el('h3', {}, 'Products')]);
  const transactionsPane = el('div', { class: 'panel-box' }, [el('h3', {}, 'Transaction Details')]);
  const productsTable = el('div', { class: 'table-container' });
  const transactionsTable = el('div', { class: 'table-container' });
  productsPane.appendChild(productsTable);
  transactionsPane.appendChild(transactionsTable);
  twoPane.appendChild(productsPane);
  twoPane.appendChild(transactionsPane);
  container.appendChild(twoPane);

  async function loadCashiers() {
    try {
      const users = await apiClient.get('/users');
      cashierSelect.innerHTML = '';
      cashierSelect.appendChild(el('option', { value: '' }, 'All Cashiers'));
      users.forEach((u) => cashierSelect.appendChild(el('option', { value: u.id }, u.displayName || u.username)));
    } catch (err) {
      // non-fatal
    }
  }

  async function refresh() {
    try {
      const query = { status: filters.status, from: filters.from, to: filters.to, customerId: undefined };
      const cleanQuery = Object.fromEntries(Object.entries(query).filter(([, v]) => v));
      const params = new URLSearchParams(cleanQuery).toString();
      // Reports (summary/top-products) never include test sales,
      // regardless of "Show test sales" below -- that checkbox only
      // controls what shows up in the Transaction Details table itself,
      // so test sales can actually be found and deleted, without ever
      // touching the real figures on the stat cards.
      const listParams = new URLSearchParams({ ...cleanQuery, ...(filters.includeTest ? { includeTest: 'true' } : {}) }).toString();

      const [transactions, summary, topProducts, products, users, outstandingCredit] = await Promise.all([
        apiClient.get(`/transactions${listParams ? `?${listParams}` : ''}`),
        apiClient.get(`/transactions/reports/summary${params ? `?${params}` : ''}`),
        apiClient.get(`/transactions/reports/top-products${params ? `?${params}` : ''}`),
        apiClient.get('/inventory/products'),
        apiClient.get('/users'),
        settingsStore.isCreditEnabled() ? apiClient.get('/transactions/reports/outstanding-credit') : Promise.resolve(null)
      ]);

      const cashierName = Object.fromEntries(users.map((u) => [u.id, u.displayName || u.username]));

      const filteredByCashier = filters.cashier
        ? transactions.filter((t) => t.cashierId === filters.cashier)
        : transactions;

      salesValueEl.textContent = formatMoney(summary.totalRevenue, symbol);
      txnValueEl.textContent = String(summary.totalTransactions);
      itemsValueEl.textContent = String(summary.itemsSold);
      productsValueEl.textContent = String(products.length);
      if (outstandingCredit) creditValueEl.textContent = formatMoney(outstandingCredit.totalOutstanding, symbol);

      renderTable(productsTable, {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'quantity', label: 'Sold' },
          { key: 'available', label: 'Available', render: (p) => String(products.find((x) => x.id === p.productId)?.stock ?? '-') },
          { key: 'revenue', label: 'Sales', render: (p) => formatMoney(p.revenue, symbol) }
        ],
        rows: topProducts,
        emptyMessage: 'No sales in this period.'
      });

      renderTable(transactionsTable, {
        columns: [
          {
            key: 'id',
            label: 'Invoice',
            render: (t) => el('span', {}, [
              t.id.slice(0, 8),
              t.isTest ? el('span', { class: 'po-status-badge po-status-partially_received', style: 'margin-left:0.4rem;' }, 'TEST') : null
            ])
          },
          { key: 'createdAt', label: 'Date', render: (t) => formatDate(t.createdAt) },
          { key: 'total', label: 'Total', render: (t) => formatMoney(t.total, symbol) },
          { key: 'paidAmount', label: 'Paid', render: (t) => formatMoney(t.paidAmount ?? t.total, symbol) },
          {
            key: 'dueAmount',
            label: 'Due',
            render: (t) => (t.dueAmount > 0
              ? el('span', { style: 'color:var(--color-danger); font-weight:600;' }, formatMoney(t.dueAmount, symbol))
              : '\u2014')
          },
          { key: 'change', label: 'Change', render: (t) => formatMoney(t.change ?? 0, symbol) },
          {
            key: 'paymentMethod',
            label: 'Method',
            render: (t) => (t.paymentMethod === 'credit'
              ? el('span', { class: 'po-status-badge po-status-partially_received' }, 'Credit')
              : (t.paymentMethod || '\u2014'))
          },
          { key: 'till', label: 'Till', render: () => '1' },
          { key: 'cashierId', label: 'Cashier', render: (t) => cashierName[t.cashierId] || '-' },
          {
            key: 'view',
            label: 'View',
            render: (t) => {
              const viewBtn = el('button', { class: 'btn btn-sm btn-info' }, 'View');
              viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openTransactionDetail(t, { onVoided: () => refresh(), onMarkedTest: () => { revealTestSales(); refresh(); } });
              });
              if (t.isTest) {
                // Only a test sale can be deleted outright -- a real
                // sale is only ever voided (see the View screen), which
                // keeps it in the record with status:'voided' rather
                // than erasing it.
                const deleteBtn = el('button', { class: 'btn btn-sm btn-danger', title: 'Delete this test sale' }, '\u2715');
                deleteBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (!confirm('Delete this test sale? This restocks any items it deducted and cannot be undone.')) return;
                  try {
                    await apiClient.delete(`/transactions/${t.id}`);
                    notification.success('Test sale deleted.');
                    refresh();
                  } catch (err) {
                    notification.error(`Failed to delete: ${err.message}`);
                  }
                });
                const buttons = [viewBtn];
                if (t.type !== 'return') {
                  // Marked the wrong sale? Put it back as a normal sale.
                  const undoBtn = el('button', { class: 'btn btn-sm btn-warning', title: 'Undo test mark \u2014 make this a normal sale again' }, '\u21A9');
                  undoBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('Undo the test mark? This goes back to being a normal sale and counts in reports again.')) return;
                    try {
                      await apiClient.post(`/transactions/${t.id}/unmark-test`, {});
                      notification.success('Test mark removed. This is a normal sale again.');
                      refresh();
                    } catch (err) {
                      notification.error(`Failed to undo: ${err.message}`);
                    }
                  });
                  buttons.push(undoBtn);
                }
                buttons.push(deleteBtn);
                return el('span', { style: 'display:flex; gap:0.3rem;' }, buttons);
              }
              if (t.type !== 'return') {
                // Lets an old/unwanted real sale (e.g. made while
                // setting the store up, before going live) be cleared
                // out: flagging it as a test sale makes it eligible for
                // the delete button above, or the bulk "Clear test
                // sales" action -- without this, a real sale has no
                // delete path at all, only Void (see View).
                const markTestBtn = el('button', { class: 'btn btn-sm btn-secondary', title: 'Mark as a test sale, so it can be deleted' }, '\u{1F9EA}');
                markTestBtn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (!confirm('Mark this as a test sale? It will be excluded from reports, but it is NOT deleted. It stays in this list with a TEST badge until you click its \u2715 button.')) return;
                  try {
                    await apiClient.post(`/transactions/${t.id}/mark-test`, {});
                    notification.success('Marked as a test sale. It is not deleted \u2014 click \u2715 on the row to delete it.');
                    revealTestSales();
                    refresh();
                  } catch (err) {
                    notification.error(`Failed to mark: ${err.message}`);
                  }
                });
                return el('span', { style: 'display:flex; gap:0.3rem;' }, [viewBtn, markTestBtn]);
              }
              return viewBtn;
            }
          }
        ],
        rows: filteredByCashier,
        emptyMessage: 'No transactions match these filters.'
      });
    } catch (err) {
      notification.error(`Failed to load transactions: ${err.message}`);
    }
  }

  await loadCashiers();
  await refresh();
}
