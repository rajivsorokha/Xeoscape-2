// assets/js/ui/table-manager.js
// Lightweight, dependency-free replacement for a DataTable wrapper.
// Renders columns/rows into a container and supports simple click actions.

import { el } from '../shared/utils.js';

export function renderTable(container, { columns, rows, onRowClick, emptyMessage = 'No records found.' }) {
  container.innerHTML = '';

  if (!rows || rows.length === 0) {
    container.appendChild(el('div', { class: 'table-empty' }, emptyMessage));
    return;
  }

  const thead = el('thead', {}, [
    el('tr', {}, columns.map((col) => el('th', {}, col.label)))
  ]);

  const tbody = el('tbody', {}, rows.map((row) => {
    const tr = el('tr', {
      class: onRowClick ? 'table-row-clickable' : '',
      onClick: onRowClick ? () => onRowClick(row) : undefined
    }, columns.map((col) => el('td', {}, col.render ? col.render(row) : String(row[col.key] ?? ''))));
    return tr;
  }));

  container.appendChild(el('table', { class: 'app-table' }, [thead, tbody]));
}
