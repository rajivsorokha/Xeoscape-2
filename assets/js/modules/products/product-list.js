// assets/js/modules/products/product-list.js
// Renders the product catalog, wired to /api/inventory/products, with
// search + category filter -- matching the real POS catalog pane
// (search box + category "Select" dropdown next to the product grid).

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderProductCard } from './product-card.js';
import { openProductForm } from './product-form.js';
import { openCsvImportModal } from '../../ui/csv-import-modal.js';
import { createActionMenu } from '../../ui/action-menu.js';
import notification from '../../ui/notification.js';

export async function mountProductList(container, { eventBus } = {}) {
  let currentSearch = '';
  let currentCategory = '';

  const categorySelect = el('select', {
    onChange: (e) => { currentCategory = e.target.value; refresh(); }
  }, [el('option', { value: '' }, 'All Categories')]);

  container.appendChild(el('div', { class: 'view-header' }, [
    el('h2', {}, 'Products'),
    el('input', {
      class: 'search-input',
      placeholder: 'Search product by name or sku',
      onInput: (e) => { currentSearch = e.target.value; refresh(); }
    }),
    categorySelect,
    createActionMenu([
      {
        label: '\u2b06 Import CSV',
        onClick: () => openCsvImportModal({
          title: 'Import Products from CSV',
          templateEndpoint: '/inventory/products/csv-template',
          templateFilename: 'product-import-template.csv',
          importEndpoint: '/inventory/products/csv-import',
          onImported: () => refresh()
        })
      }
    ]),
    el('button', {
      class: 'btn btn-primary',
      onClick: () => openProductForm({ onSaved: () => refresh() })
    }, '+ New Product')
  ]));

  const grid = el('div', { class: 'product-grid' });
  container.appendChild(grid);

  async function loadCategories() {
    try {
      const categories = await apiClient.get('/categories');
      categorySelect.innerHTML = '';
      categorySelect.appendChild(el('option', { value: '' }, 'All Categories'));
      categories.forEach((c) => categorySelect.appendChild(el('option', { value: c.name }, c.name)));
    } catch (err) {
      // Non-fatal -- category filter just stays at "All Categories"
      console.warn('Could not load categories', err);
    }
  }

  async function refresh() {
    grid.innerHTML = 'Loading...';
    try {
      const params = new URLSearchParams();
      if (currentSearch) params.set('search', currentSearch);
      if (currentCategory) params.set('category', currentCategory);
      const query = params.toString();
      const products = await apiClient.get(`/inventory/products${query ? `?${query}` : ''}`);
      grid.innerHTML = '';
      if (products.length === 0) {
        grid.appendChild(el('div', { class: 'empty-state' }, 'No products yet. Create your first one above.'));
        return;
      }
      products.forEach((product) => {
        grid.appendChild(renderProductCard(product, {
          onEdit: () => openProductForm({ product, onSaved: () => refresh() }),
          onAddToCart: () => eventBus?.emit('cart:add', { product, quantity: 1 })
        }));
      });
    } catch (err) {
      notification.error(`Failed to load products: ${err.message}`);
    }
  }

  await loadCategories();
  await refresh();
}
