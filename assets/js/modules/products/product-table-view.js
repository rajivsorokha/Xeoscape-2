// assets/js/modules/products/product-table-view.js
// The "table / CRUD style" rendering of the product catalog: Barcode,
// Item Name, Price, Stock, Expiry Date, Category, Supplier, Action
// columns with inline Edit/Delete (and optionally Add to Cart)
// buttons per row. Shared by product-table-modal.js (the "Products"
// nav button's popup) and product-list.js's inline Grid/Table toggle,
// so there's one implementation instead of two copies drifting apart.

import { el } from '../../shared/utils.js';
import apiClient from '../../shared/api-client.js';
import { formatMoney, formatShortDate } from '../../shared/formatters.js';
import { openProductForm } from './product-form.js';
import notification from '../../ui/notification.js';

/**
 * @param {HTMLElement} container
 * @param {object[]} products
 * @param {string} symbol - currency symbol
 * @param {() => void} onChange - called after an edit/delete to trigger a re-fetch+re-render
 * @param {{ onAddToCart?: (product: object) => void, showDelete?: boolean }} [options] -
 *   onAddToCart shows that action too (POS context); showDelete (default true) can be set
 *   false to hide the Delete action -- e.g. the POS catalog's Table view, where deleting a
 *   product isn't a checkout-screen task (use the Products management screen for that).
 */
export function renderProductsTable(container, products, symbol, onChange, { onAddToCart, showDelete = true } = {}) {
  container.innerHTML = '';

  if (products.length === 0) {
    container.appendChild(el('div', { class: 'table-empty' }, 'No data available in table'));
    return;
  }

  const thead = el('thead', {}, [
    el('tr', {}, ['Barcode', 'Item Name', 'Price', 'Stock', 'Expiry Date', 'Category', 'Supplier', 'Action'].map((h) => el('th', {}, h)))
  ]);

  const rows = products.map((p) => {
    const actionButtons = [
      el('button', {
        class: 'btn btn-sm btn-primary',
        title: 'Edit',
        onClick: () => openProductForm({ product: p, onSaved: onChange })
      }, '\u270E')
    ];
    if (showDelete) {
      actionButtons.push(el('button', {
        class: 'btn btn-sm btn-danger',
        title: 'Delete',
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
      }, '\u2715'));
    }
    if (onAddToCart) {
      actionButtons.unshift(el('button', {
        class: 'btn btn-sm btn-secondary',
        title: 'Add to Cart',
        onClick: () => onAddToCart(p)
      }, '\u{1F6D2}'));
    }

    return el('tr', {}, [
      el('td', {}, p.sku || '-'),
      el('td', {}, p.name),
      el('td', {}, formatMoney(p.price, symbol)),
      el('td', {}, String(p.stock ?? 0)),
      el('td', {}, p.expirationDate ? formatShortDate(p.expirationDate) : '-'),
      el('td', {}, p.category || '-'),
      el('td', {}, p.supplier || '-'),
      el('td', { class: 'action' }, actionButtons)
    ]);
  });

  container.appendChild(el('table', { class: 'app-table' }, [thead, el('tbody', {}, rows)]));
}
