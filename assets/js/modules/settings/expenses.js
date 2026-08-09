// assets/js/modules/settings/expenses.js
// "Expenses" settings section: record business expenses (rent,
// utilities, wages, etc.) and see a date-range summary/report --
// covers 'Expense module', 'Daily Expense Report', and 'Expense
// report' from the feature checklist.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney, formatShortDate } from '../../shared/formatters.js';
import { createDateRangePicker } from '../../ui/date-range-picker.js';
import notification from '../../ui/notification.js';

export async function mountExpenses(container) {
  container.appendChild(el('h3', {}, 'Expenses'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Track business expenses (rent, utilities, wages, supplies, etc.) separately from inventory purchase orders.'
  ));

  let categories = [];
  try {
    categories = await apiClient.get('/expenses/categories');
  } catch (err) {
    categories = ['Other'];
  }

  // --- New expense form ---
  const values = { description: '', category: categories[0] || 'Other', amount: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'cash', notes: '' };
  const descInput = el('input', { type: 'text', placeholder: 'e.g. Monthly rent', onInput: (e) => { values.description = e.target.value; } });
  const categorySelect = el('select', { onChange: (e) => { values.category = e.target.value; } }, categories.map((c) => el('option', { value: c }, c)));
  const amountInput = el('input', { type: 'number', min: '0', step: '0.01', placeholder: '0.00', onInput: (e) => { values.amount = e.target.value; } });
  const dateInput = el('input', { type: 'date', value: values.date, onInput: (e) => { values.date = e.target.value; } });
  const methodSelect = el('select', { onChange: (e) => { values.paymentMethod = e.target.value; } }, [
    el('option', { value: 'cash' }, 'Cash'),
    el('option', { value: 'card' }, 'Card'),
    el('option', { value: 'bank' }, 'Bank Transfer'),
    el('option', { value: 'other' }, 'Other')
  ]);
  const notesInput = el('input', { type: 'text', placeholder: 'Optional', onInput: (e) => { values.notes = e.target.value; } });

  const addBtn = el('button', {
    class: 'btn btn-primary',
    onClick: async () => {
      try {
        await apiClient.post('/expenses', values);
        notification.success('Expense recorded.');
        descInput.value = ''; values.description = '';
        amountInput.value = ''; values.amount = '';
        notesInput.value = ''; values.notes = '';
        await refresh();
      } catch (err) {
        notification.error(err.message);
      }
    }
  }, '+ Add Expense');

  container.appendChild(el('div', { class: 'settings-section' }, [
    el('h4', {}, 'Record an Expense'),
    el('div', { style: 'display:grid; grid-template-columns: repeat(3, 1fr); gap:0.75rem;' }, [
      el('div', { class: 'form-field' }, [el('label', {}, 'Description'), descInput]),
      el('div', { class: 'form-field' }, [el('label', {}, 'Category'), categorySelect]),
      el('div', { class: 'form-field' }, [el('label', {}, 'Amount'), amountInput]),
      el('div', { class: 'form-field' }, [el('label', {}, 'Date'), dateInput]),
      el('div', { class: 'form-field' }, [el('label', {}, 'Payment Method'), methodSelect]),
      el('div', { class: 'form-field' }, [el('label', {}, 'Notes'), notesInput])
    ]),
    addBtn
  ]));

  // --- Report ---
  const summaryBox = el('div', { class: 'report-summary-box' }, 'Loading...');
  const categoryBox = el('div', { class: 'report-summary-box' }, '');
  const tableWrap = el('div', { class: 'table-container' });

  let currentRange = null;
  const rangePicker = createDateRangePicker({
    initialPreset: 'thisMonth',
    onChange: (range) => { currentRange = range; refresh(); }
  });

  container.appendChild(el('h4', {}, 'Expense Report'));
  container.appendChild(el('div', { class: 'report-range-row' }, [rangePicker]));
  container.appendChild(summaryBox);
  container.appendChild(categoryBox);
  container.appendChild(tableWrap);

  async function refresh() {
    summaryBox.textContent = 'Loading...';
    tableWrap.innerHTML = '';
    try {
      const params = new URLSearchParams();
      if (currentRange) {
        params.set('from', currentRange.from.toISOString());
        params.set('to', currentRange.to.toISOString());
      }
      const data = await apiClient.get(`/expenses/summary?${params.toString()}`);
      renderSummary(data);
      renderCategoryBreakdown(data);
      renderTable(data.expenses);
    } catch (err) {
      summaryBox.textContent = 'Could not load report.';
      notification.error(`Failed to load expenses: ${err.message}`);
    }
  }

  function renderSummary(d) {
    summaryBox.innerHTML = '';
    summaryBox.appendChild(el('div', { class: 'report-summary-grid' }, [
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Total Expenses'), el('div', { class: 'report-summary-value' }, formatMoney(d.total))]),
      el('div', { class: 'report-summary-cell' }, [el('div', { class: 'report-summary-label' }, 'Entries'), el('div', { class: 'report-summary-value' }, String(d.count))])
    ]));
  }

  function renderCategoryBreakdown(d) {
    categoryBox.innerHTML = '';
    if (!d.byCategory.length) return;
    categoryBox.appendChild(el('div', { class: 'report-summary-label', style: 'margin-bottom:0.5rem;' }, 'By Category'));
    categoryBox.appendChild(el('div', { class: 'report-summary-grid' }, d.byCategory.map((c) => el('div', { class: 'report-summary-cell' }, [
      el('div', { class: 'report-summary-value' }, formatMoney(c.amount)),
      el('div', { class: 'report-summary-label' }, c.category)
    ]))));
  }

  function renderTable(expenses) {
    tableWrap.innerHTML = '';
    if (!expenses.length) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'No expenses in this range.'));
      return;
    }
    const thead = el('thead', {}, [
      el('tr', {}, ['Date', 'Description', 'Category', 'Amount', 'Payment', 'Notes', ''].map((h) => el('th', {}, h)))
    ]);
    const rows = expenses.map((e) => el('tr', {}, [
      el('td', {}, formatShortDate(e.date)),
      el('td', {}, e.description),
      el('td', {}, e.category),
      el('td', {}, formatMoney(e.amount)),
      el('td', {}, e.paymentMethod),
      el('td', {}, e.notes || '\u2014'),
      el('td', {}, [el('button', {
        class: 'btn btn-sm btn-danger',
        onClick: async () => {
          if (!window.confirm(`Delete expense "${e.description}"?`)) return;
          try {
            await apiClient.delete(`/expenses/${e.id}`);
            notification.success('Expense deleted.');
            await refresh();
          } catch (err) {
            notification.error(err.message);
          }
        }
      }, '\u2715')])
    ]));
    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  await refresh();
}
