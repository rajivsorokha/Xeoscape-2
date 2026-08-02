// assets/js/modules/cart/open-tabs.js
// "Open Tabs" viewer: lists real persisted "Unpaid" (pending) orders
// created via the Hold button, and lets the cashier resume one back
// into the active cart, or pay it directly.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney, formatDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export async function openOpenTabsModal({ cartManager }) {
  const symbol = settingsStore.getCurrencySymbol();
  const content = el('div', {}, 'Loading...');

  modalManager.open({
    title: 'Open Tabs',
    content,
    actions: [{ label: 'Close', className: 'btn-secondary' }]
  });

  async function refresh() {
    try {
      const pendingOrders = await apiClient.get('/transactions?status=pending');
      content.innerHTML = '';

      if (pendingOrders.length === 0) {
        content.appendChild(el('div', { class: 'empty-state' }, 'No held orders. Use "Hold" on the POS screen to save one.'));
        return;
      }

      content.appendChild(el('div', { class: 'open-tabs-list' }, pendingOrders.map((order) =>
        el('div', { class: 'open-tab-item' }, [
          el('div', { class: 'open-tab-info' }, [
            el('strong', {}, order.ref || 'Held order'),
            el('span', {}, ` \u2014 ${order.items.reduce((s, li) => s + li.quantity, 0)} item(s), ${formatMoney(order.total, symbol)}`),
            el('div', { class: 'open-tab-date' }, formatDate(order.createdAt))
          ]),
          el('div', { style: 'display:flex; gap:0.4rem;' }, [
            el('button', {
              class: 'btn btn-sm btn-primary',
              onClick: async () => {
                if (cartManager.getLines().length > 0) {
                  const proceed = window.confirm('Resuming this order will replace the items currently in your cart. Continue?');
                  if (!proceed) return;
                }
                // Resuming loads the held items back into the cart and
                // discards the pending record -- a new transaction gets
                // created normally once it's actually paid.
                cartManager.clear();
                order.items.forEach((li) => {
                  cartManager.add({ id: li.productId, name: li.name, sku: li.sku, price: li.unitPrice }, li.quantity);
                });
                try {
                  await apiClient.post(`/transactions/${order.id}/void`, { reason: 'Resumed into cart' });
                } catch (err) {
                  // Non-fatal -- worst case the pending record lingers.
                }
                notification.success(`Resumed "${order.ref}".`);
                modalManager.close();
              }
            }, 'Resume'),
            el('button', {
              class: 'btn btn-sm btn-danger',
              onClick: async () => {
                if (!window.confirm(`Cancel held order "${order.ref}"?`)) return;
                try {
                  await apiClient.post(`/transactions/${order.id}/void`, { reason: 'Cancelled from Open Tabs' });
                  notification.success('Held order cancelled.');
                  refresh();
                } catch (err) {
                  notification.error(err.message);
                }
              }
            }, '\u2715')
          ])
        ])
      )));
    } catch (err) {
      notification.error(`Failed to load open tabs: ${err.message}`);
    }
  }

  await refresh();
}
