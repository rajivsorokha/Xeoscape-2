// assets/js/modules/checkout/receipt.js
// Renders a printable receipt for a completed transaction, and an
// order preview (pre-payment) triggered by the POS panel's Print button.

import { el } from '../../shared/utils.js';
import { formatMoney, formatDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import apiClient from '../../shared/api-client.js';
import { openWhatsApp } from '../../shared/whatsapp.js';
import { promptModal } from '../../ui/prompt.js';
import notification from '../../ui/notification.js';

export function renderReceipt(transaction) {
  const symbol = settingsStore.getCurrencySymbol();
  const profile = settingsStore.getProfile();

  const lines = transaction.items.map((li) =>
    el('div', { class: 'receipt-line' }, [
      el('span', {}, `${li.name} x${li.quantity}`),
      el('span', {}, formatMoney(li.lineTotal, symbol))
    ])
  );

  const receipt = el('div', { class: 'receipt', id: 'printable-receipt' }, [
    el('div', { class: 'receipt-header' }, [
      el('div', {}, profile.storeName || 'Xeoscape'),
      el('div', { class: 'receipt-date' }, formatDate(transaction.createdAt))
    ]),
    transaction.seatAssignment ? el('div', { class: 'receipt-table' }, `Table: ${transaction.seatAssignment}`) : null,
    el('div', { class: 'receipt-lines' }, lines),
    el('div', { class: 'receipt-totals' }, [
      el('div', {}, `Subtotal: ${formatMoney(transaction.subtotal, symbol)}`),
      el('div', {}, `Discount: ${formatMoney(transaction.discount, symbol)}`),
      el('div', { class: 'receipt-total-line' }, `Total: ${formatMoney(transaction.total, symbol)}`)
    ]),
    el('div', { class: 'receipt-payment' }, `Paid via ${transaction.paymentMethod}`),
    profile.receiptFooter ? el('div', { class: 'receipt-footer' }, profile.receiptFooter) : null
  ]);

  modalManager.open({
    title: 'Receipt',
    content: receipt,
    actions: [
      {
        label: 'Print',
        className: 'btn-secondary',
        closeOnClick: false,
        // Small delay before printing: this modal opens immediately
        // after the payment modal closes (a rapid transition), and
        // invoking window.print() while the webview is still settling
        // from that appears related to a reported app-crash-on-print
        // issue that only reproduced from this specific flow (not from
        // the pre-checkout order preview, which doesn't follow a rapid
        // modal transition). Letting a frame settle first is a cheap,
        // safe mitigation to try.
        onClick: () => setTimeout(() => window.print(), 100)
      },
      {
        label: '\u{1F4AC} WhatsApp',
        className: 'btn-whatsapp',
        closeOnClick: false,
        onClick: async () => {
          let phone = '';
          if (transaction.customerId) {
            try {
              const customer = await apiClient.get(`/customers/${transaction.customerId}`);
              phone = customer.phone || '';
            } catch (err) {
              // fall through to manual entry
            }
          }
          if (!phone) {
            phone = await promptModal('Customer WhatsApp number (with country code):', '');
            if (phone === null) return;
          }
          const message = [
            `*${profile.storeName || 'Xeoscape'}* -- Receipt`,
            formatDate(transaction.createdAt),
            '',
            ...transaction.items.map((li) => `${li.name} x${li.quantity} - ${formatMoney(li.lineTotal, symbol)}`),
            '',
            `Subtotal: ${formatMoney(transaction.subtotal, symbol)}`,
            transaction.discount > 0 ? `Discount: ${formatMoney(transaction.discount, symbol)}` : null,
            `*Total: ${formatMoney(transaction.total, symbol)}*`,
            `Paid via ${transaction.paymentMethod}`,
            '',
            profile.receiptFooter || 'Thank you for your business!'
          ].filter(Boolean).join('\n');
          openWhatsApp(phone, message);
          notification.success('Opening WhatsApp...');
        }
      },
      { label: 'Close', className: 'btn-primary' }
    ]
  });
}

/**
 * Pre-payment order preview, triggered by the Print button on the POS
 * panel before checkout is confirmed -- lets a cashier print a slip for
 * a customer without finalizing the sale.
 */
export function renderOrderPreview({ lines = [], discount = 0, total = 0 }) {
  const symbol = settingsStore.getCurrencySymbol();

  if (lines.length === 0) {
    modalManager.open({
      title: 'Order Preview',
      content: el('div', {}, 'Cart is empty -- nothing to print.'),
      actions: [{ label: 'Close', className: 'btn-primary' }]
    });
    return;
  }

  const rows = lines.map((line) =>
    el('div', { class: 'receipt-line' }, [
      el('span', {}, `${line.product.name} x${line.quantity}`),
      el('span', {}, formatMoney(line.product.price * line.quantity, symbol))
    ])
  );

  const preview = el('div', { class: 'receipt' }, [
    el('div', { class: 'receipt-header' }, [el('div', {}, 'Order Preview (unpaid)')]),
    el('div', { class: 'receipt-lines' }, rows),
    el('div', { class: 'receipt-totals' }, [
      discount > 0 ? el('div', {}, `Discount: ${formatMoney(discount, symbol)}`) : null,
      el('div', { class: 'receipt-total-line' }, `Total: ${formatMoney(total, symbol)}`)
    ])
  ]);

  modalManager.open({
    title: 'Order Preview',
    content: preview,
    actions: [
      { label: 'Print', className: 'btn-secondary', closeOnClick: false, onClick: () => setTimeout(() => window.print(), 100) },
      { label: 'Close', className: 'btn-primary' }
    ]
  });
}
