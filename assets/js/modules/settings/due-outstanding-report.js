// assets/js/modules/settings/due-outstanding-report.js
// "Due / Outstanding" report: every customer currently owing money
// from a Credit sale (goods taken now, paid later -- see
// core/transaction-manager.js#checkout), with a quick action to
// record a payment. Needs credit sales switched on, since that's the only
// store type Credit exists for.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import { openCustomerForm } from '../customers/customer-form.js';
import notification from '../../ui/notification.js';

export async function mountDueOutstandingReport(container) {
  container.appendChild(el('h3', {}, 'Due / Outstanding Report'));

  if (!settingsStore.isCreditEnabled()) {
    container.appendChild(el('p', { class: 'settings-hint' },
      'Due / Outstanding tracking needs credit sales turned on (goods taken now, paid later -- via the Credit payment method at checkout). ' +
      'Tick "Allow credit / due sales" in Settings \u2192 Store Profile to use this.'
    ));
    return;
  }

  container.appendChild(el('p', { class: 'settings-hint' },
    'Everyone who currently owes money from a Credit sale. This is a live account balance, not a date-range total \u2014 it reflects any payments already recorded, no matter when the original sale happened.'
  ));

  const symbol = settingsStore.getCurrencySymbol();
  const summaryBox = el('div', { class: 'report-summary-box' }, 'Loading...');
  const tableWrap = el('div', { class: 'table-container' });
  container.appendChild(summaryBox);
  container.appendChild(tableWrap);

  async function refresh() {
    summaryBox.textContent = 'Loading...';
    tableWrap.innerHTML = '';
    try {
      const data = await apiClient.get('/transactions/reports/outstanding-credit');
      renderSummary(data);
      renderTable(data.customers);
    } catch (err) {
      summaryBox.textContent = 'Could not load report.';
      notification.error(`Failed to load Due/Outstanding report: ${err.message}`);
    }
  }

  function renderSummary(data) {
    summaryBox.innerHTML = '';
    summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
      el('div', { class: 'report-summary-cell' }, [
        el('div', { class: 'report-summary-label' }, 'Total Due / Outstanding'),
        el('div', { class: 'report-summary-value' }, formatMoney(data.totalOutstanding, symbol))
      ]),
      el('div', { class: 'report-summary-cell' }, [
        el('div', { class: 'report-summary-label' }, 'Customers Owing'),
        el('div', { class: 'report-summary-value' }, String(data.customerCount))
      ])
    ]));
  }

  function renderTable(customers) {
    tableWrap.innerHTML = '';
    if (!customers.length) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'Nothing due \u2014 every account is settled. \u2705'));
      return;
    }
    const thead = el('thead', {}, [
      el('tr', {}, ['Customer', 'Phone', 'Due / Outstanding', ''].map((h) => el('th', {}, h)))
    ]);
    const rows = customers.map((c) => el('tr', {}, [
      el('td', {}, c.name),
      el('td', {}, c.phone || '\u2014'),
      el('td', {}, [el('span', { style: 'color:var(--color-danger); font-weight:600;' }, formatMoney(c.balance, symbol))]),
      el('td', {}, [
        el('button', {
          class: 'btn btn-sm btn-secondary',
          onClick: async (e) => {
            // Fetch the full customer record rather than reusing the
            // trimmed {id, name, phone, balance} projection this
            // report's own API returns -- opening the edit form with
            // a partial object risks silently blanking fields (e.g.
            // email) if Save gets clicked, not just Record Payment.
            e.target.disabled = true;
            try {
              const full = await apiClient.get(`/customers/${c.id}`);
              openCustomerForm({ customer: full, onSaved: refresh });
            } catch (err) {
              notification.error(err.message);
            } finally {
              e.target.disabled = false;
            }
          }
        }, 'Record Payment')
      ])
    ]));
    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  await refresh();
}
