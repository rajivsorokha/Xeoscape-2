// assets/js/modules/transactions/transaction-filter.js
// Filter controls for the transaction list (date range + status).

import { el } from '../../shared/utils.js';

const STATUS_OPTIONS = ['', 'completed', 'voided'];

export function mountTransactionFilter(container, { onFilter }) {
  const filters = { from: '', to: '', status: '' };

  function apply() {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    onFilter(clean);
  }

  const fromInput = el('input', {
    type: 'date',
    onChange: (e) => { filters.from = e.target.value; apply(); }
  });

  const toInput = el('input', {
    type: 'date',
    onChange: (e) => { filters.to = e.target.value; apply(); }
  });

  const statusSelect = el('select', {
    onChange: (e) => { filters.status = e.target.value; apply(); }
  }, STATUS_OPTIONS.map((s) => el('option', { value: s }, s || 'All statuses')));

  const clearBtn = el('button', {
    class: 'btn btn-sm btn-secondary',
    onClick: () => {
      filters.from = '';
      filters.to = '';
      filters.status = '';
      fromInput.value = '';
      toInput.value = '';
      statusSelect.value = '';
      apply();
    }
  }, 'Clear');

  container.appendChild(el('div', { class: 'filter-controls' }, [
    el('label', {}, ['From ', fromInput]),
    el('label', {}, ['To ', toInput]),
    el('label', {}, ['Status ', statusSelect]),
    clearBtn
  ]));
}
