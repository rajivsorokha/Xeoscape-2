// assets/js/modules/settings/stock-on-hand.js
// "Stock on Hand" settings section: cost and retail value of inventory
// currently in stock, filterable by an "as of" date (reconstructed
// from stock-movement history -- see
// core/report-generator.js#stockOnHand) and/or by vendor.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import notification from '../../ui/notification.js';

export async function mountStockOnHand(container) {
  container.appendChild(el('h3', {}, 'Stock on Hand'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Cost and retail value of everything currently in inventory. Filter by vendor, or pick a past date to see what was on hand then (quantities are reconstructed from stock history; prices/costs still use today\u2019s values).'
  ));

  let asOf = '';
  let vendor = '';

  const summaryBox = el('div', { class: 'report-summary-box' }, 'Loading...');
  const tableWrap = el('div', { class: 'table-container' });

  const dateInput = el('input', { type: 'date', onInput: (e) => { asOf = e.target.value; } });
  const vendorSelect = el('select', { onChange: (e) => { vendor = e.target.value; } }, [
    el('option', { value: '' }, 'All Vendors')
  ]);
  const applyBtn = el('button', { class: 'btn btn-sm btn-primary', onClick: load }, 'Apply Filters');
  const clearBtn = el('button', {
    class: 'btn btn-sm btn-secondary',
    onClick: () => { asOf = ''; vendor = ''; dateInput.value = ''; vendorSelect.value = ''; load(); }
  }, 'Clear');

  container.appendChild(el('div', { class: 'perf-filter-row', style: 'display:flex; gap:1rem; align-items:flex-end; flex-wrap:wrap;' }, [
    el('div', { class: 'form-field' }, [el('label', {}, 'As of date'), dateInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Vendor'), vendorSelect]),
    applyBtn,
    clearBtn
  ]));
  container.appendChild(summaryBox);
  container.appendChild(tableWrap);

  async function loadVendors() {
    try {
      const vendors = await apiClient.get('/inventory/vendors');
      vendors.forEach((v) => vendorSelect.appendChild(el('option', { value: v }, v)));
    } catch (err) {
      // Non-fatal -- filter dropdown just stays "All Vendors" only.
    }
  }

  async function load() {
    summaryBox.textContent = 'Loading...';
    tableWrap.innerHTML = '';
    try {
      const params = new URLSearchParams();
      if (asOf) params.set('asOf', asOf);
      if (vendor) params.set('vendor', vendor);
      const query = params.toString();
      const data = await apiClient.get(`/reports/stock-on-hand${query ? `?${query}` : ''}`);
      renderSummary(data);
      renderTable(data);
    } catch (err) {
      summaryBox.textContent = 'Could not load report.';
      notification.error(`Failed to load stock on hand: ${err.message}`);
    }
  }

  function renderSummary(d) {
    summaryBox.innerHTML = '';
    summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Products'), el('div', { class: 'report-summary-value' }, String(d.totalProducts))]),
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Units on Hand'), el('div', { class: 'report-summary-value' }, String(d.totalUnits))]),
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Cost Value'), el('div', { class: 'report-summary-value' }, formatMoney(d.totalCostValue))]),
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Retail Value'), el('div', { class: 'report-summary-value' }, formatMoney(d.totalRetailValue))])
    ]));
    if (d.itemsMissingCost > 0) {
      summaryBox.appendChild(el('div', { class: 'settings-hint', style: 'margin-top:0.5rem;' },
        `${d.itemsMissingCost} product(s) have no Cost Price set, so Cost Value excludes them (set a Cost Price on the product to include it).`
      ));
    }
  }

  function renderTable(d) {
    tableWrap.innerHTML = '';
    if (!d.items.length) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'No products match this filter.'));
      return;
    }
    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Product'), el('th', {}, 'Vendor'), el('th', {}, 'Qty'),
        el('th', {}, 'Unit Cost'), el('th', {}, 'Unit Price'), el('th', {}, 'Cost Value'), el('th', {}, 'Retail Value')
      ])
    ]);
    const rows = d.items.map((i) => el('tr', {}, [
      el('td', {}, [el('div', {}, i.name), el('div', { class: 'perf-sku' }, i.sku || '')]),
      el('td', {}, i.vendor || '\u2014'),
      el('td', {}, String(i.quantity)),
      el('td', {}, i.cost != null ? formatMoney(i.cost) : '\u2014'),
      el('td', {}, formatMoney(i.price)),
      el('td', {}, i.costValue != null ? formatMoney(i.costValue) : '\u2014'),
      el('td', {}, formatMoney(i.retailValue))
    ]));
    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  await loadVendors();
  await load();
}
