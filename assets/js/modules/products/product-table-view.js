// assets/js/modules/products/product-table-view.js
// The "table / CRUD style" rendering of the product catalog: Barcode,
// Item Name, Price, Stock, Expiry Date, Category, Supplier, Action
// columns with inline Edit/Label/Delete (and optionally Add to Cart)
// buttons per row. Shared by product-table-modal.js (the "Products"
// nav button's popup) and product-list.js's inline Grid/Table toggle,
// so there's one implementation instead of two copies drifting apart.
//
// Each row has a tick box; ticked products can be sent to the bulk
// barcode label printer in one go (see labels/label-bulk-print.js).

import { el } from '../../shared/utils.js';
import apiClient from '../../shared/api-client.js';
import { formatMoney, formatShortDate } from '../../shared/formatters.js';
import { openProductForm } from './product-form.js';
import { openQuickLabelPrint } from '../labels/label-quick-print.js';
import { openBulkLabelPrint } from '../labels/label-bulk-print.js';
import { addProductsToLabelQueue, labelQueue, labelQueueNav } from '../labels/label-queue-store.js';
import modalManager from '../../ui/modal-manager.js';
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

  // Ticked products, kept on the container element so the selection
  // survives the re-render that happens on every search keystroke or
  // edit -- you can search for one style, tick it, search for another,
  // tick that too, then print them all together.
  const selected = container._selectedProducts || (container._selectedProducts = new Map());
  // Keep the stored copies fresh (e.g. after editing a price/stock).
  products.forEach((p) => { if (selected.has(p.id)) selected.set(p.id, p); });

  const printBtn = el('button', {
    type: 'button',
    class: 'btn btn-sm btn-info',
    title: 'Print barcode labels for all ticked products',
    onClick: () => openBulkLabelPrint(Array.from(selected.values()))
  }, '');
  const queueBtn = el('button', {
    type: 'button',
    class: 'btn btn-sm btn-secondary',
    title: 'Add the ticked products to the print queue in Settings \u2192 Barcode Labels',
    onClick: () => {
      const { added, merged, skipped } = addProductsToLabelQueue(Array.from(selected.values()));
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (merged) parts.push(`${merged} already queued (count increased)`);
      if (skipped.length) parts.push(`${skipped.length} skipped \u2014 no barcode`);
      if (added || merged) notification.success(`Print queue: ${parts.join(', ')}.`);
      else notification.error(`Nothing added: ${parts.join(', ')}.`);
      if (added || merged) selected.clear();
      syncSelectionUi();
    }
  }, '');
  const openQueueBtn = el('button', {
    type: 'button',
    class: 'btn btn-sm btn-success',
    title: 'Open Settings \u2192 Barcode Labels to review and print the queue',
    onClick: () => {
      labelQueueNav.openBarcodeLabels = true;
      modalManager.close();
      window.location.hash = 'settings';
    }
  }, '');
  const clearBtn = el('button', {
    type: 'button',
    class: 'btn btn-sm btn-secondary',
    onClick: () => { selected.clear(); syncSelectionUi(); }
  }, 'Clear selection');
  const toolbar = el('div', { class: 'product-bulk-toolbar' }, [printBtn, queueBtn, openQueueBtn, clearBtn]);

  const rowBoxes = [];
  const selectAllBox = el('input', { type: 'checkbox', title: 'Select all shown products' });

  function syncSelectionUi() {
    const count = selected.size;
    printBtn.textContent = `\u{1F3F7} Print barcodes (${count} selected)`;
    printBtn.disabled = count === 0;
    clearBtn.disabled = count === 0;
    queueBtn.textContent = `\u2795 Add to label queue (${count})`;
    queueBtn.disabled = count === 0;
    // Only offered once something is actually waiting in the queue.
    openQueueBtn.textContent = `Open Barcode Labels (${labelQueue.length} queued)`;
    openQueueBtn.style.display = labelQueue.length ? '' : 'none';
    rowBoxes.forEach(({ box, id }) => { box.checked = selected.has(id); });
    const shownSelected = rowBoxes.filter(({ id }) => selected.has(id)).length;
    selectAllBox.checked = rowBoxes.length > 0 && shownSelected === rowBoxes.length;
    selectAllBox.indeterminate = shownSelected > 0 && shownSelected < rowBoxes.length;
  }

  selectAllBox.addEventListener('change', () => {
    products.forEach((p) => {
      if (selectAllBox.checked) selected.set(p.id, p);
      else selected.delete(p.id);
    });
    syncSelectionUi();
  });

  container.appendChild(toolbar);

  if (products.length === 0) {
    container.appendChild(el('div', { class: 'table-empty' }, 'No data available in table'));
    syncSelectionUi();
    return;
  }

  const thead = el('thead', {}, [
    el('tr', {}, [
      el('th', { class: 'select-col' }, selectAllBox),
      ...['Barcode', 'Item Name', 'Price', 'Stock', 'Expiry Date', 'Garment Type', 'Supplier', 'Action'].map((h) => el('th', {}, h))
    ])
  ]);

  const rows = products.map((p) => {
    const actionButtons = [
      el('button', {
        class: 'btn btn-sm btn-primary',
        title: 'Edit',
        onClick: () => openProductForm({ product: p, onSaved: onChange })
      }, '\u270E')
    ];
    actionButtons.push(el('button', {
      class: 'btn btn-sm btn-info',
      title: 'Print barcode labels (prints all ticked products if this one is ticked)',
      // With 2+ products ticked and this one among them, this prints
      // the whole ticked set (one dialog, one set of label settings)
      // instead of just this row.
      onClick: () => {
        if (selected.size >= 2 && selected.has(p.id)) openBulkLabelPrint(Array.from(selected.values()));
        else openQuickLabelPrint(p);
      }
    }, '\u{1F3F7}'));
    if (showDelete) {
      actionButtons.push(el('button', {
        class: 'btn btn-sm btn-danger',
        title: 'Delete',
        onClick: async () => {
          if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
          try {
            await apiClient.delete(`/inventory/products/${p.id}`);
            notification.success('Product deleted.');
            selected.delete(p.id);
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

    const rowBox = el('input', { type: 'checkbox', title: 'Select for bulk barcode printing' });
    rowBox.addEventListener('change', () => {
      if (rowBox.checked) selected.set(p.id, p);
      else selected.delete(p.id);
      syncSelectionUi();
    });
    rowBoxes.push({ box: rowBox, id: p.id });

    return el('tr', {}, [
      el('td', { class: 'select-col' }, rowBox),
      el('td', {}, p.sku || '-'),
      el('td', {}, p.name),
      el('td', {}, formatMoney(p.price, symbol)),
      el('td', {}, String(p.stock ?? 0)),
      el('td', {}, p.expirationDate ? formatShortDate(p.expirationDate) : '-'),
      el('td', {}, p.garmentType || '-'),
      el('td', {}, p.supplier || '-'),
      el('td', { class: 'action' }, actionButtons)
    ]);
  });

  container.appendChild(el('table', { class: 'app-table' }, [thead, el('tbody', {}, rows)]));
  syncSelectionUi();
}
