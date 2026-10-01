// assets/js/modules/settings/detail-reports.js
// Transaction Details, Product Details and Customer reports. All three
// share one panel: pick a date range, view the table, and download the
// same data as a CSV file that opens in Excel.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

const MAX_ROWS_ON_SCREEN = 500;

const MONEY_KEYS = new Set([
  'unitPrice', 'lineTotal', 'billTotal', 'paid', 'due', 'price', 'cost',
  'stockValue', 'revenue', 'totalSpent', 'avgBill', 'dueBalance'
]);

function isoDate(d) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function mountDetailReport(container, { kind, title, hint, summaryCells, extraFilters = [] }) {
  container.appendChild(el('h4', { style: 'margin:0.75rem 0 0.25rem;' }, title));
  container.appendChild(el('p', { class: 'settings-hint' }, hint));

  const symbol = settingsStore.getCurrencySymbol();
  const state = { from: daysAgo(29), to: isoDate(new Date()), minVisits: '1' };

  const fromInput = el('input', { type: 'date', value: state.from, onInput: (e) => { state.from = e.target.value; } });
  const toInput = el('input', { type: 'date', value: state.to, onInput: (e) => { state.to = e.target.value; } });

  function setRange(from, to) {
    state.from = from;
    state.to = to;
    fromInput.value = from;
    toInput.value = to;
    load();
  }

  const quick = [
    ['Today', () => setRange(daysAgo(0), daysAgo(0))],
    ['7 Days', () => setRange(daysAgo(6), daysAgo(0))],
    ['30 Days', () => setRange(daysAgo(29), daysAgo(0))],
    ['All Time', () => setRange('', '')]
  ].map(([label, fn]) => el('button', { class: 'btn btn-sm btn-secondary', onClick: fn }, label));

  const extra = extraFilters.map((f) => f(state));

  const downloadBtn = el('button', {
    class: 'btn btn-sm btn-success',
    onClick: async () => {
      try {
        await apiClient.downloadFile(`/reports/detail/${kind}?${query('csv')}`, `${kind}-report.csv`);
        notification.success('CSV downloaded \u2014 open it with Excel.');
      } catch (err) {
        notification.error(err.message);
      }
    }
  }, '\u2B07 Download Excel (CSV)');

  container.appendChild(el('div', { style: 'display:flex; gap:0.75rem; align-items:flex-end; flex-wrap:wrap; margin-bottom:0.75rem;' }, [
    el('div', { class: 'form-field' }, [el('label', {}, 'From'), fromInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'To'), toInput]),
    ...extra,
    el('button', { class: 'btn btn-sm btn-primary', onClick: load }, 'Apply'),
    downloadBtn
  ]));
  container.appendChild(el('div', { style: 'display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.75rem;' }, quick));

  const summaryBox = el('div', { class: 'report-summary-box' }, 'Loading...');
  const tableWrap = el('div', { class: 'table-container', style: 'overflow-x:auto;' });
  container.appendChild(summaryBox);
  container.appendChild(tableWrap);

  function query(format) {
    const p = new URLSearchParams();
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
    if (kind === 'customers') p.set('minVisits', state.minVisits || '1');
    if (format) p.set('format', format);
    return p.toString();
  }

  function cell(col, row) {
    const v = row[col.key];
    if (v === '' || v === null || v === undefined) return '\u2014';
    if (MONEY_KEYS.has(col.key)) return formatMoney(v, symbol);
    return String(v);
  }

  async function load() {
    summaryBox.textContent = 'Loading...';
    tableWrap.innerHTML = '';
    try {
      const report = await apiClient.get(`/reports/detail/${kind}?${query()}`);

      summaryBox.innerHTML = '';
      summaryBox.appendChild(el('div', { class: 'report-summary-grid' },
        summaryCells(report.summary, symbol).map(([label, value]) => el('div', { class: 'report-summary-cell' }, [
          el('div', { class: 'report-summary-label' }, label),
          el('div', { class: 'report-summary-value' }, String(value))
        ]))
      ));

      if (!report.rows.length) {
        tableWrap.appendChild(el('div', { class: 'table-empty' }, 'No data for this period.'));
        return;
      }
      const shown = report.rows.slice(0, MAX_ROWS_ON_SCREEN);
      const thead = el('thead', {}, [el('tr', {}, report.columns.map((c) => el('th', {}, c.label)))]);
      const tbody = el('tbody', {}, shown.map((r) => el('tr', {}, report.columns.map((c) => el('td', {}, cell(c, r))))));
      tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, tbody]));
      if (report.rows.length > shown.length) {
        tableWrap.appendChild(el('p', { class: 'settings-hint' },
          `Showing the first ${shown.length} of ${report.rows.length} rows. Download the CSV to get all of them.`));
      }
    } catch (err) {
      summaryBox.textContent = 'Could not load report.';
      notification.error(`Failed to load report: ${err.message}`);
    }
  }

  return load();
}

export function mountTransactionDetailsReport(container) {
  return mountDetailReport(container, {
    kind: 'transactions',
    title: 'Transaction Details Report',
    hint: 'Every item on every bill in the period \u2014 invoice, date, customer and phone, product, quantity, price, payment method and cashier. Returns show as negative lines. Test sales are left out.',
    summaryCells: (s, sym) => [['Bills', s.bills], ['Item Lines', s.lines], ['Net Sales', formatMoney(s.totalSales, sym)]]
  });
}

export function mountProductDetailsReport(container) {
  return mountDetailReport(container, {
    kind: 'products',
    title: 'Product Details Report',
    hint: 'Every product with its price, cost, current stock and stock value, plus units sold, revenue and last sold date for the chosen period. Best sellers are listed first.',
    summaryCells: (s, sym) => [['Products', s.products], ['Units Sold', s.unitsSold], ['Revenue', formatMoney(s.revenue, sym)]]
  });
}

export function mountCustomerReport(container) {
  const minVisitsField = (state) => {
    const input = el('input', {
      type: 'number', min: '1', value: state.minVisits, style: 'width:6rem;',
      onInput: (e) => { state.minVisits = e.target.value; }
    });
    return el('div', { class: 'form-field' }, [el('label', {}, 'Min. visits'), input]);
  };
  return mountDetailReport(container, {
    kind: 'customers',
    title: 'Customer Report',
    hint: 'Who visits and buys most: phone number, number of bills, total spent, what they buy most, first and last visit, and days since they last came. Set "Min. visits" to 2 or more to see regulars only. Walk-in sales (no customer attached) are not included.',
    extraFilters: [minVisitsField],
    summaryCells: (s, sym) => [['Customers', s.customers], ['Total Spent', formatMoney(s.totalSpent, sym)], ['Walk-in Bills', s.walkInBills]]
  });
}

const TABS = [
  { id: 'transactions', label: 'Transaction Details', mount: mountTransactionDetailsReport },
  { id: 'products', label: 'Product Details', mount: mountProductDetailsReport },
  { id: 'customers', label: 'Customer Report', mount: mountCustomerReport }
];

// Shown at the bottom of Settings -> Report Generator.
export function mountDetailReportTabs(container) {
  container.appendChild(el('h3', { style: 'margin-top:1.75rem;' }, 'Detailed Reports & Excel Export'));

  const panel = el('div', {});
  const buttons = TABS.map((tab) => el('button', {
    class: 'btn btn-sm btn-secondary',
    onClick: () => show(tab)
  }, tab.label));

  container.appendChild(el('div', { class: 'report-range-row' }, buttons));
  container.appendChild(panel);

  function show(tab) {
    buttons.forEach((b, i) => {
      b.classList.toggle('btn-primary', TABS[i] === tab);
      b.classList.toggle('btn-secondary', TABS[i] !== tab);
    });
    panel.innerHTML = '';
    return tab.mount(panel);
  }

  return show(TABS[0]);
}
