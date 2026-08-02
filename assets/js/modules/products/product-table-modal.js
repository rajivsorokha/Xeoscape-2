// assets/js/modules/products/product-table-modal.js
// "Products" button opens this modal: a searchable data table listing
// every product (Barcode, Item Name, Price, Stock, Expiry Date,
// Category, Supplier, Action), matching the real Products popup
// exactly. The "+" button next to Products opens the New Product form
// (product-form.js) separately.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney, formatShortDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import { openProductForm } from './product-form.js';
import notification from '../../ui/notification.js';

export function openProductTableModal() {
  const symbol = settingsStore.getCurrencySymbol();
  let search = '';

  const searchInput = el('input', {
    class: 'search-input',
    placeholder: 'Search...',
    onInput: (e) => { search = e.target.value; refresh(); }
  });

  const tableWrap = el('div', { class: 'table-container' });

  const content = el('div', {}, [
    el('div', { class: 'datatable-search-row' }, [el('span', {}, 'Search:'), searchInput]),
    tableWrap
  ]);

  modalManager.open({ title: 'Products', content, size: 'lg', actions: [{ label: 'Close', className: 'btn-secondary' }] });

  async function refresh() {
    try {
      const products = await apiClient.get(`/inventory/products${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      renderProductsTable(tableWrap, products, symbol, refresh);
    } catch (err) {
      notification.error(`Failed to load products: ${err.message}`);
    }
  }

  refresh();
}

function renderProductsTable(container, products, symbol, onChange) {
  container.innerHTML = '';

  if (products.length === 0) {
    container.appendChild(el('div', { class: 'table-empty' }, 'No data available in table'));
    return;
  }

  const thead = el('thead', {}, [
    el('tr', {}, ['Barcode', 'Item Name', 'Price', 'Stock', 'Expiry Date', 'Category', 'Supplier', 'Action'].map((h) => el('th', {}, h)))
  ]);

  const rows = products.map((p) => el('tr', {}, [
    el('td', {}, p.sku || '-'),
    el('td', {}, p.name),
    el('td', {}, formatMoney(p.price, symbol)),
    el('td', {}, String(p.stock ?? 0)),
    el('td', {}, p.expirationDate ? formatShortDate(p.expirationDate) : '-'),
    el('td', {}, p.category || '-'),
    el('td', {}, p.supplier || '-'),
    el('td', { class: 'action' }, [
      el('button', {
        class: 'btn btn-sm btn-primary',
        onClick: () => openProductForm({ product: p, onSaved: onChange })
      }, '\u270E'),
      el('button', {
        class: 'btn btn-sm btn-danger',
        onClick: async () => {
          if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
          try {
            await apiClient.delete(`/inventory/products/${p.id}`);
            notification.success('Product deleted.');
            onChange();
          } catch (err) {
            notification.error(err.message);
          }
        }
      }, '\u2715')
    ])
  ]));

  container.appendChild(el('table', { class: 'app-table' }, [thead, el('tbody', {}, rows)]));
}
