// assets/js/modules/settings/purchase-orders.js
// "Purchase Orders" settings section: lists all POs (draft/ordered/
// partially received/received/cancelled) and lets the merchant record
// receipts against an order -- which restocks inventory for real (see
// core/purchase-order-manager.js#receive).

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney, formatShortDate } from '../../shared/formatters.js';
import notification from '../../ui/notification.js';

const STATUS_LABEL = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled'
};

export async function mountPurchaseOrders(container) {
  container.appendChild(el('h3', {}, 'Purchase Orders'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Purchase orders created from the Low Stock report, or listed here after creation. Open an order to record what was received \u2014 received quantities restock inventory immediately.'
  ));

  const listWrap = el('div', { class: 'table-container' });
  const detailWrap = el('div', { class: 'movement-panel', style: 'display:none;' });
  container.appendChild(listWrap);
  container.appendChild(detailWrap);

  async function loadList() {
    listWrap.innerHTML = 'Loading...';
    try {
      const orders = await apiClient.get('/purchase-orders');
      renderList(orders);
    } catch (err) {
      listWrap.innerHTML = '';
      notification.error(`Failed to load purchase orders: ${err.message}`);
    }
  }

  function renderList(orders) {
    listWrap.innerHTML = '';
    if (!orders.length) {
      listWrap.appendChild(el('div', { class: 'table-empty' }, 'No purchase orders yet \u2014 create one from the Low Stock report.'));
      return;
    }
    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'PO #'),
        el('th', {}, 'Vendor'),
        el('th', {}, 'Status'),
        el('th', {}, 'Items'),
        el('th', {}, 'Total Cost'),
        el('th', {}, 'Created'),
        el('th', {}, '')
      ])
    ]);
    const rows = orders.map((o) => el('tr', {}, [
      el('td', {}, o.poNumber),
      el('td', {}, o.vendor || '\u2014'),
      el('td', {}, [el('span', { class: `po-status-badge po-status-${o.status}` }, STATUS_LABEL[o.status] || o.status)]),
      el('td', {}, String(o.items.length)),
      el('td', {}, formatMoney(o.totalCost)),
      el('td', {}, formatShortDate(o.createdAt)),
      el('td', {}, [el('button', { class: 'btn btn-sm btn-secondary', onClick: () => openDetail(o.id) }, 'Open')])
    ]));
    listWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));
  }

  async function openDetail(id) {
    detailWrap.style.display = 'block';
    detailWrap.innerHTML = 'Loading...';
    try {
      const order = await apiClient.get(`/purchase-orders/${id}`);
      renderDetail(order);
    } catch (err) {
      detailWrap.innerHTML = '';
      notification.error(`Failed to load purchase order: ${err.message}`);
    }
  }

  function renderDetail(order) {
    detailWrap.innerHTML = '';
    const receiveInputs = new Map();

    detailWrap.appendChild(el('div', { class: 'movement-panel-header' }, [
      el('h4', {}, `${order.poNumber} \u2014 ${order.vendor || 'Unspecified Vendor'}`),
      el('button', { class: 'btn btn-sm btn-secondary', onClick: () => { detailWrap.style.display = 'none'; detailWrap.innerHTML = ''; } }, 'Close')
    ]));
    detailWrap.appendChild(el('div', { class: 'settings-hint' }, `Status: ${STATUS_LABEL[order.status] || order.status}`));

    const rows = order.items.map((item) => {
      const remaining = item.quantityOrdered - item.quantityReceived;
      const input = el('input', {
        type: 'number',
        min: '0',
        max: String(remaining),
        placeholder: '0',
        style: 'width:80px;',
        disabled: order.status === 'cancelled' || remaining <= 0
      });
      receiveInputs.set(item.productId, input);
      return el('tr', {}, [
        el('td', {}, [el('div', {}, item.name), el('div', { class: 'perf-sku' }, item.sku || '')]),
        el('td', {}, String(item.quantityOrdered)),
        el('td', {}, String(item.quantityReceived)),
        el('td', {}, String(remaining)),
        el('td', {}, formatMoney(item.unitCost)),
        el('td', {}, [input])
      ]);
    });

    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, 'Product'), el('th', {}, 'Ordered'), el('th', {}, 'Received'),
        el('th', {}, 'Remaining'), el('th', {}, 'Unit Cost'), el('th', {}, 'Receive Now')
      ])
    ]);
    detailWrap.appendChild(el('table', { class: 'app-table perf-table' }, [thead, el('tbody', {}, rows)]));

    if (order.status !== 'cancelled' && order.status !== 'received') {
      detailWrap.appendChild(el('div', { style: 'display:flex; gap:0.5rem; margin-top:0.75rem;' }, [
        el('button', {
          class: 'btn btn-primary btn-sm',
          onClick: async () => {
            const receipts = [...receiveInputs.entries()]
              .map(([productId, input]) => ({ productId, quantityReceived: Number(input.value || 0) }))
              .filter((r) => r.quantityReceived > 0);
            if (!receipts.length) {
              notification.warning('Enter a quantity to receive for at least one item.');
              return;
            }
            try {
              const updated = await apiClient.post(`/purchase-orders/${order.id}/receive`, { receipts });
              notification.success('Stock received and inventory updated.');
              renderDetail(updated);
              await loadList();
            } catch (err) {
              notification.error(err.message);
            }
          }
        }, 'Record Receipt'),
        el('button', {
          class: 'btn btn-secondary btn-sm',
          onClick: async () => {
            if (!window.confirm('Cancel this purchase order?')) return;
            try {
              const updated = await apiClient.put(`/purchase-orders/${order.id}`, { status: 'cancelled' });
              notification.success('Purchase order cancelled.');
              renderDetail(updated);
              await loadList();
            } catch (err) {
              notification.error(err.message);
            }
          }
        }, 'Cancel Order')
      ]));
    }
  }

  await loadList();
}
