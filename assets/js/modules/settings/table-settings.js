// assets/js/modules/settings/table-settings.js
// Settings section (Restaurant/Cafe only) where the owner defines
// their own tables -- a number/name plus seat count -- instead of the
// old fixed 2/3/4/6/8-Seater buttons. The cart's table picker
// (assets/js/modules/cart/cart-ui.js) reads this same /api/tables
// list, so changes here show up there immediately.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderTable } from '../../ui/table-manager.js';
import { openTableForm } from './table-form.js';
import notification from '../../ui/notification.js';

export async function mountTableSettings(container) {
  container.appendChild(el('h3', {}, 'Tables'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'The tables shown for selection in the cart. Add one entry per physical table with its seat count -- table numbers can be anything (1, 12, "Patio-3"), not just seat-count labels.'
  ));
  container.appendChild(el('div', { class: 'view-header' }, [
    el('div', {}, ''),
    el('button', { class: 'btn btn-primary', onClick: () => openTableForm({ onSaved: () => refresh() }) }, '+ New Table')
  ]));

  const tableContainer = el('div', { class: 'table-container' });
  container.appendChild(tableContainer);

  async function refresh() {
    try {
      const tables = await apiClient.get('/tables');
      renderTable(tableContainer, {
        columns: [
          { key: 'number', label: 'Table Number' },
          { key: 'seats', label: 'Seats' },
          {
            key: 'actions',
            label: '',
            render: (t) => {
              const del = el('button', {
                class: 'btn btn-sm btn-danger',
                onClick: async (e) => {
                  e.stopPropagation();
                  if (!window.confirm(`Delete Table ${t.number}?`)) return;
                  try {
                    await apiClient.delete(`/tables/${t.id}`);
                    notification.success('Table deleted.');
                    refresh();
                  } catch (err) {
                    notification.error(err.message);
                  }
                }
              }, '\u2715');
              return del;
            }
          }
        ],
        rows: tables,
        onRowClick: (t) => openTableForm({ table: t, onSaved: () => refresh() }),
        emptyMessage: 'No tables yet. Add your first one above.'
      });
    } catch (err) {
      notification.error(`Failed to load tables: ${err.message}`);
    }
  }

  await refresh();
}
