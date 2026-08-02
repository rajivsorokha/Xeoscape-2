// assets/js/modules/transactions/transaction-detail.js
// Shows full line-item detail for a transaction and allows voiding it.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney, formatDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export function openTransactionDetail(transaction, { onVoided } = {}) {
  const symbol = settingsStore.getCurrencySymbol();
  const statusLabel = { completed: 'Paid', pending: 'Unpaid (held)', voided: 'Voided' }[transaction.status] || transaction.status;

  const lines = transaction.items.map((li) =>
    el('div', { class: 'txn-detail-line' }, [
      el('span', {}, `${li.name} x${li.quantity}`),
      el('span', {}, formatMoney(li.lineTotal, symbol))
    ])
  );

  const content = el('div', { class: 'txn-detail' }, [
    el('div', {}, `Date: ${formatDate(transaction.createdAt)}`),
    el('div', {}, `Status: ${statusLabel}`),
    el('div', { class: 'txn-detail-lines' }, lines),
    el('div', {}, `Subtotal: ${formatMoney(transaction.subtotal, symbol)}`),
    el('div', {}, `Discount: ${formatMoney(transaction.discount, symbol)}`),
    el('div', { class: 'txn-detail-total' }, `Total: ${formatMoney(transaction.total, symbol)}`),
    transaction.status === 'completed' ? el('div', {}, `Paid: ${formatMoney(transaction.paidAmount ?? transaction.total, symbol)} (Change: ${formatMoney(transaction.change ?? 0, symbol)})`) : null
  ]);

  const actions = [{ label: 'Close', className: 'btn-secondary' }];

  if (transaction.status === 'completed') {
    actions.unshift({
      label: 'Void Transaction',
      className: 'btn-danger',
      closeOnClick: false,
      onClick: async () => {
        try {
          await apiClient.post(`/transactions/${transaction.id}/void`, { reason: 'Voided from transaction detail' });
          notification.success('Transaction voided.');
          modalManager.close();
          onVoided?.();
        } catch (err) {
          notification.error(err.message);
        }
      }
    });
  }

  if (transaction.status === 'pending') {
    actions.unshift({
      label: 'Cancel Held Order',
      className: 'btn-danger',
      closeOnClick: false,
      onClick: async () => {
        try {
          await apiClient.post(`/transactions/${transaction.id}/void`, { reason: 'Cancelled from transaction detail' });
          notification.success('Held order cancelled.');
          modalManager.close();
          onVoided?.();
        } catch (err) {
          notification.error(err.message);
        }
      }
    });
    actions.unshift({
      label: 'Mark as Paid',
      className: 'btn-success',
      closeOnClick: false,
      onClick: async () => {
        try {
          await apiClient.post(`/transactions/${transaction.id}/pay`, {});
          notification.success('Order marked as paid.');
          modalManager.close();
          onVoided?.();
        } catch (err) {
          notification.error(err.message);
        }
      }
    });
  }

  modalManager.open({ title: 'Transaction Detail', content, actions });
}
