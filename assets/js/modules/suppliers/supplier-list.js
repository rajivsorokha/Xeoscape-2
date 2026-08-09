// assets/js/modules/suppliers/supplier-list.js
// Renders the supplier directory, wired to /api/suppliers.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderTable } from '../../ui/table-manager.js';
import { openSupplierForm } from './supplier-form.js';
import notification from '../../ui/notification.js';

export async function mountSupplierList(container) {
  container.appendChild(el('h3', {}, 'Suppliers'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Contacts for who you order stock from. Separate from the free-text Vendor/Supplier field on individual products.'
  ));
  container.appendChild(el('div', { class: 'view-header' }, [
    el('input', {
      class: 'search-input',
      placeholder: 'Search suppliers...',
      onInput: (e) => refresh(e.target.value)
    }),
    el('button', { class: 'btn btn-primary', onClick: () => openSupplierForm({ onSaved: () => refresh() }) }, '+ New Supplier')
  ]));

  const tableContainer = el('div', { class: 'table-container' });
  container.appendChild(tableContainer);

  async function refresh(search = '') {
    try {
      const suppliers = await apiClient.get(`/suppliers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      renderTable(tableContainer, {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'contactPerson', label: 'Contact Person' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          {
            key: 'actions',
            label: '',
            render: (s) => {
              const del = el('button', {
                class: 'btn btn-sm btn-danger',
                onClick: async (e) => {
                  e.stopPropagation();
                  if (!window.confirm(`Delete supplier "${s.name}"?`)) return;
                  try {
                    await apiClient.delete(`/suppliers/${s.id}`);
                    notification.success('Supplier deleted.');
                    refresh(search);
                  } catch (err) {
                    notification.error(err.message);
                  }
                }
              }, '\u2715');
              return del;
            }
          }
        ],
        rows: suppliers,
        onRowClick: (supplier) => openSupplierForm({ supplier, onSaved: () => refresh(search) }),
        emptyMessage: 'No suppliers yet. Add your first one above.'
      });
    } catch (err) {
      notification.error(`Failed to load suppliers: ${err.message}`);
    }
  }

  await refresh();
}
