// assets/js/modules/products/product-table-modal.js
// "Products" button opens this modal: a searchable data table listing
// every product, matching the real Products popup exactly. The "+"
// button next to Products opens the New Product form (product-form.js)
// separately. Table rendering itself lives in product-table-view.js,
// shared with the inline Table view toggle in product-list.js.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import { renderProductsTable } from './product-table-view.js';
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
