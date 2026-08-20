// assets/js/modules/settings/due-outstanding-report.js
// "Due / Outstanding" settings section: who currently owes money and
// how much -- B2B General Retail's Due (a.k.a. "on credit" -- goods
// taken now, paid for later, not a credit card) payment method. Backed
// by GET /transactions/reports/outstanding-credit -- see
// core/report-generator.js#outstandingCredit for why this is sourced
// from live customer balances rather than summed from transactions.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import { openCustomerForm } from '../customers/customer-form.js';
import notification from '../../ui/notification.js';

export async function mountDueOutstandingReport(container) {
  container.appendChild(el('h3', {}, 'Due / Outstanding'));

  // Due/credit payment itself is B2B General Retail only (see
  // core/transaction-manager.js#checkout, enforced server-side) --
  // this report is meaningless for any other store type.
  if (!settingsStore.isB2B()) {
    container.appendChild(el('p', { class: 'settings-hint' },
      'Due/outstanding balances are only available for B2B General Retail (customers who take goods now and pay later). ' +
      'Switch Store Type to B2B General Retail in Settings \u2192 Store Type to use this.'
    ));
    return;
  }

  container.appendChild(el('p', { class: 'settings-hint' },
    'Every customer who currently owes money, and how much \u2014 not a credit-card report. ' +
    'Balances reflect any payments recorded since the sale, so this is what\u2019s owed right now, not just what was left unpaid at checkout.'
  ));

  const symbol = settingsStore.getCurrencySymbol();
  const summaryBox = el('div', { class: 'report-summary-box' }, 'Loading...');
  const tableWrap = el('div', { class: 'table-container' });

  container.appendChild(summaryBox);
  container.appendChild(tableWrap);

  async function load() {
    summaryBox.textContent = 'Loading...';
    tableWrap.innerHTML = '';
    try {
      const report = await apiClient.get('/transactions/reports/outstanding-credit');
      renderSummary(report);
      renderTable(report.customers);
    } catch (err) {
      summaryBox.textContent = '';
      notification.error(`Failed to load due/outstanding report: ${err.message}`);
    }
  }

  function renderSummary(report) {
    summaryBox.innerHTML = '';
    summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
      el('div', { class: 'report-summary-cell' }, [
        el('div', { class: 'report-summary-label' }, 'Total Due / Outstanding'),
        el('div', { class: 'report-summary-value', style: report.totalOutstanding > 0 ? 'color:var(--color-danger);' : '' }, formatMoney(report.totalOutstanding, symbol))
      ]),
      el('div', { class: 'report-summary-cell' }, [
        el('div', { class: 'report-summary-label' }, 'Customers with a Balance'),
        el('div', { class: 'report-summary-value' }, String(report.customerCount))
      ])
    ]));
  }

  function renderTable(customers) {
    tableWrap.innerHTML = '';
    if (!customers.length) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'No customer currently has a due/outstanding balance. \u2705'));
      return;
    }

    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Name'),
        el('th', {}, 'Phone'),
        el('th', {}, 'Due / Outstanding'),
        el('th', {}, 'Remind')
      ])
    ]);

    const rows = customers.map((c) => {
      const reminderBtn = el('button', {
        class: 'btn btn-sm btn-secondary',
        type: 'button',
        onClick: async (e) => {
          e.stopPropagation();
          e.target.disabled = true;
          try {
            await apiClient.post(`/whatsapp/send-reminder/${c.id}`, {});
            notification.success(`WhatsApp reminder sent to ${c.name}.`);
          } catch (err) {
            notification.error(err.message);
          } finally {
            e.target.disabled = false;
          }
        }
      }, '\u{1F4F1} Remind');

      return el('tr', { onClick: () => openCustomerForm({ customer: c, onSaved: load }) }, [
        el('td', {}, c.name || '\u2014'),
        el('td', {}, c.phone || '\u2014'),
        el('td', {}, el('span', { style: 'color:var(--color-danger); font-weight:600;' }, formatMoney(c.balance, symbol))),
        el('td', {}, [reminderBtn])
      ]);
    });

    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  await load();
}
