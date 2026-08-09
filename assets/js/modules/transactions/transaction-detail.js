// assets/js/modules/transactions/transaction-detail.js
// Shows full line-item detail for a transaction, and allows voiding
// it or returning some/all of its items.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney, formatDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

export function openTransactionDetail(transaction, { onVoided } = {}) {
  const symbol = settingsStore.getCurrencySymbol();
  const statusLabel = { completed: 'Paid', pending: 'Unpaid (held)', voided: 'Voided' }[transaction.status] || transaction.status;
  const isReturn = transaction.type === 'return';

  const lines = transaction.items.map((li) =>
    el('div', { class: 'txn-detail-line' }, [
      el('span', {}, `${li.name} x${li.quantity}`),
      el('span', {}, formatMoney(li.lineTotal, symbol))
    ])
  );

  const content = el('div', { class: 'txn-detail' }, [
    el('div', {}, `Date: ${formatDate(transaction.createdAt)}`),
    el('div', {}, `Status: ${isReturn ? 'Return / Refund' : statusLabel}`),
    el('div', { class: 'txn-detail-lines' }, lines),
    el('div', {}, `Subtotal: ${formatMoney(transaction.subtotal, symbol)}`),
    el('div', {}, `Discount: ${formatMoney(transaction.discount, symbol)}`),
    transaction.taxAmount ? el('div', {}, `Tax (${transaction.taxPercentage}%): ${formatMoney(transaction.taxAmount, symbol)}`) : null,
    el('div', { class: 'txn-detail-total' }, `Total: ${formatMoney(transaction.total, symbol)}`),
    transaction.status === 'completed' && !isReturn
      ? el('div', {}, `Paid: ${formatMoney(transaction.paidAmount ?? transaction.total, symbol)} (Change: ${formatMoney(transaction.change ?? 0, symbol)})`)
      : null,
    transaction.dueAmount > 0 ? el('div', { class: 'txn-detail-due' }, `Due: ${formatMoney(transaction.dueAmount, symbol)} added to customer balance`) : null
  ]);

  const actions = [{ label: 'Close', className: 'btn-secondary' }];

  if (transaction.status === 'completed' && !isReturn) {
    actions.unshift({
      label: 'Return Items',
      className: 'btn-secondary',
      closeOnClick: false,
      onClick: () => openReturnDialog(transaction, { onDone: onVoided })
    });
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

/** Item-level quantity picker for a return, respecting quantities already returned on prior partial returns. */
function openReturnDialog(transaction, { onDone } = {}) {
  const alreadyReturned = transaction.returnedQuantities || {};
  const qtyInputs = new Map();

  const rows = transaction.items.map((li) => {
    const returnedSoFar = alreadyReturned[li.productId] || 0;
    const remaining = li.quantity - returnedSoFar;
    const input = el('input', { type: 'number', min: '0', max: String(remaining), value: '0', style: 'width:70px;', disabled: remaining <= 0 });
    qtyInputs.set(li.productId, input);
    return el('div', { class: 'form-field', style: 'display:flex; align-items:center; justify-content:space-between; gap:0.5rem;' }, [
      el('span', {}, `${li.name} (${remaining} of ${li.quantity} returnable)`),
      input
    ]);
  });

  const reasonInput = el('input', { type: 'text', placeholder: 'Optional reason' });

  const content = el('div', {}, [
    ...rows,
    el('div', { class: 'form-field', style: 'margin-top:0.5rem;' }, [el('label', {}, 'Reason'), reasonInput])
  ]);

  modalManager.open({
    title: 'Return Items',
    content,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Process Return',
        className: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          const items = [...qtyInputs.entries()]
            .map(([productId, input]) => ({ productId, quantity: Number(input.value || 0) }))
            .filter((r) => r.quantity > 0);
          if (!items.length) {
            notification.warning('Enter a quantity to return for at least one item.');
            return;
          }
          try {
            await apiClient.post(`/transactions/${transaction.id}/return`, { items, reason: reasonInput.value });
            notification.success('Return processed and stock restocked.');
            modalManager.close();
            onDone?.();
          } catch (err) {
            notification.error(err.message);
          }
        }
      }
    ]
  });
}
