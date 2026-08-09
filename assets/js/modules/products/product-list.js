// assets/js/modules/products/product-list.js
// Renders the POS catalog pane: search + category filter + a Grid/
// Table view-style toggle, wired to /api/inventory/products. This is
// the checkout-screen catalog a cashier browses to add items to the
// cart -- product creation and deletion are deliberately NOT here
// (use the "Products" nav button's management popup for those, which
// has its own full CRUD table). Table view here shows Edit + Add to
// Cart per row, but no Delete, for the same reason.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { renderProductCard } from './product-card.js';
import { renderProductsTable } from './product-table-view.js';
import { openProductForm } from './product-form.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';

const VIEW_STYLE_STORAGE_KEY = 'xeoscape:product-view-style';
const DEFAULT_VIEW_STYLE = 'grid'; // 'grid' (card tiles, current style) | 'table' (CRUD-style data table, minus Delete here)

function loadSavedViewStyle() {
  const saved = localStorage.getItem(VIEW_STYLE_STORAGE_KEY);
  return saved === 'table' ? 'table' : DEFAULT_VIEW_STYLE;
}

export async function mountProductList(container, { eventBus } = {}) {
  let currentSearch = '';
  let currentCategory = '';
  let viewStyle = loadSavedViewStyle();

  const categorySelect = el('select', {
    onChange: (e) => { currentCategory = e.target.value; refresh(); }
  }, [el('option', { value: '' }, 'All Categories')]);

  const gridStyleBtn = el('button', { class: 'view-style-btn', title: 'Grid view' }, '\u25A6 Grid');
  const tableStyleBtn = el('button', { class: 'view-style-btn', title: 'Table view' }, '\u2630 Table');
  function setViewStyle(style) {
    viewStyle = style;
    localStorage.setItem(VIEW_STYLE_STORAGE_KEY, style);
    gridStyleBtn.classList.toggle('active', style === 'grid');
    tableStyleBtn.classList.toggle('active', style === 'table');
    grid.style.display = style === 'grid' ? 'grid' : 'none';
    tableWrap.style.display = style === 'table' ? 'block' : 'none';
    refresh();
  }
  gridStyleBtn.onclick = () => setViewStyle('grid');
  tableStyleBtn.onclick = () => setViewStyle('table');
  const viewStyleToggle = el('div', { class: 'view-style-toggle' }, [gridStyleBtn, tableStyleBtn]);

  container.appendChild(el('div', { class: 'view-header' }, [
    el('h2', {}, 'Products'),
    el('input', {
      class: 'search-input',
      placeholder: 'Search product by name or sku',
      onInput: (e) => { currentSearch = e.target.value; refresh(); }
    }),
    categorySelect,
    viewStyleToggle
  ]));

  const grid = el('div', { class: 'product-grid' });
  const tableWrap = el('div', { class: 'table-container' });
  container.appendChild(grid);
  container.appendChild(tableWrap);

  gridStyleBtn.classList.toggle('active', viewStyle === 'grid');
  tableStyleBtn.classList.toggle('active', viewStyle === 'table');
  grid.style.display = viewStyle === 'grid' ? 'grid' : 'none';
  tableWrap.style.display = viewStyle === 'table' ? 'block' : 'none';

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
    const target = viewStyle === 'grid' ? grid : tableWrap;
    target.innerHTML = 'Loading...';
    try {
      const params = new URLSearchParams();
      if (currentSearch) params.set('search', currentSearch);
      if (currentCategory) params.set('category', currentCategory);
      const query = params.toString();
      const products = await apiClient.get(`/inventory/products${query ? `?${query}` : ''}`);

      if (viewStyle === 'table') {
        renderProductsTable(tableWrap, products, settingsStore.getCurrencySymbol(), refresh, {
          onAddToCart: eventBus ? (product) => eventBus.emit('cart:add', { product, quantity: 1 }) : undefined,
          showDelete: false
        });
        return;
      }

      grid.innerHTML = '';
      if (products.length === 0) {
        grid.appendChild(el('div', { class: 'empty-state' }, 'No products yet. Add some from the Products screen.'));
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
