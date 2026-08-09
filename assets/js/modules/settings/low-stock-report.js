// assets/js/modules/settings/low-stock-report.js
// "Low Stock" settings section: products at or below their reorder
// point (see core/inventory-manager.js#lowStockReport for the
// reorderPoint -> minStock -> default fallback), with the ability to
// select items and create a Purchase Order directly from this screen
// -- items are grouped by vendor since a PO belongs to one vendor.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import notification from '../../ui/notification.js';

export async function mountLowStockReport(container) {
  container.appendChild(el('h3', {}, 'Low Stock'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Products at or below their reorder point. Select items to create a purchase order \u2014 items are grouped into one order per vendor. Set a product\u2019s Reorder Point / Reorder Quantity / Vendor from its edit form to tune this list.'
  ));

  const selected = new Set();
  const tableWrap = el('div', { class: 'table-container' });
  const actionRow = el('div', { class: 'perf-filter-row', style: 'display:flex; justify-content:space-between; align-items:center;' });
  const selectionSummary = el('span', { class: 'settings-hint' }, '');
  const createBtn = el('button', {
    class: 'btn btn-primary btn-sm',
    onClick: createPurchaseOrders
  }, 'Create Purchase Order(s) from Selected');

  container.appendChild(actionRow);
  container.appendChild(tableWrap);

  let items = [];

  async function load() {
    tableWrap.innerHTML = 'Loading...';
    try {
      items = await apiClient.get('/inventory/low-stock');
      renderTable();
      renderActionRow();
    } catch (err) {
      tableWrap.innerHTML = '';
      notification.error(`Failed to load low stock report: ${err.message}`);
    }
  }

  function renderActionRow() {
    actionRow.innerHTML = '';
    selectionSummary.textContent = selected.size
      ? `${selected.size} item(s) selected`
      : `${items.length} product(s) at or below reorder point`;
    actionRow.appendChild(selectionSummary);
    actionRow.appendChild(createBtn);
    createBtn.disabled = selected.size === 0;
  }

  function toggleAll(checked) {
    items.forEach((i) => (checked ? selected.add(i.id) : selected.delete(i.id)));
    renderTable();
    renderActionRow();
  }

  function renderTable() {
    tableWrap.innerHTML = '';
    if (!items.length) {
      tableWrap.appendChild(el('div', { class: 'table-empty' }, 'Nothing is currently low on stock. \u2705'));
      return;
    }

    const selectAll = el('input', {
      type: 'checkbox',
      checked: items.length > 0 && selected.size === items.length,
      onChange: (e) => toggleAll(e.target.checked)
    });

    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, [selectAll]),
        el('th', {}, 'Product'),
        el('th', {}, 'Vendor'),
        el('th', {}, 'Stock'),
        el('th', {}, 'Reorder Point'),
        el('th', {}, 'Suggested Reorder Qty'),
        el('th', {}, 'Est. Cost')
      ])
    ]);

    const rows = items.map((i) => {
      const checkbox = el('input', {
        type: 'checkbox',
        checked: selected.has(i.id),
        onChange: (e) => {
          if (e.target.checked) selected.add(i.id); else selected.delete(i.id);
          renderActionRow();
        }
      });
      const critical = i.stock === 0;
      return el('tr', { class: critical ? 'perf-row-flagged' : '' }, [
        el('td', {}, [checkbox]),
        el('td', {}, [el('div', {}, i.name), el('div', { class: 'perf-sku' }, i.sku || '')]),
        el('td', {}, i.vendor || '\u2014'),
        el('td', {}, critical ? el('span', { class: 'perf-flag-badge' }, 'Out of stock') : String(i.stock)),
        el('td', {}, String(i.reorderPoint)),
        el('td', {}, String(i.reorderQty)),
        el('td', {}, i.cost != null ? formatMoney(i.cost * i.reorderQty) : '\u2014')
      ]);
    });

    tableWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  async function createPurchaseOrders() {
    const chosen = items.filter((i) => selected.has(i.id));
    if (!chosen.length) return;

    const byVendor = new Map();
    chosen.forEach((i) => {
      const key = i.vendor || '';
      if (!byVendor.has(key)) byVendor.set(key, []);
      byVendor.get(key).push({ productId: i.id, quantityOrdered: i.reorderQty, unitCost: i.cost || 0 });
    });

    createBtn.disabled = true;
    const created = [];
    try {
      for (const [vendor, poItems] of byVendor.entries()) {
        const order = await apiClient.post('/purchase-orders', {
          vendor: vendor || 'Unspecified Vendor',
          items: poItems
        });
        created.push(order);
      }
      notification.success(`Created ${created.length} purchase order(s): ${created.map((o) => o.poNumber).join(', ')}`);
      selected.clear();
      await load();
    } catch (err) {
      notification.error(`Failed to create purchase order: ${err.message}`);
    } finally {
      createBtn.disabled = false;
    }
  }

  await load();
}
