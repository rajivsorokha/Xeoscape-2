// assets/js/modules/checkout/payment.js
// Payment modal: Cash/Card method tabs, a read-only Price field, a
// keypad-driven Payment (amount tendered) field, a Card Info field
// (shown only for Card payments), and a live Change bar -- mirroring
// PharmaSpot's real Payment screen. Discount is set on the POS panel
// itself (cart-ui.js) and passed in here.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';
import { renderReceipt } from './receipt.js';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];

export function openPaymentDialog({ cartManager, currentUserId, discount = 0, customerId = null, seatAssignment = null, onComplete }) {
  const subtotal = cartManager.getSubtotal();
  let paymentMethod = 'cash';
  let amountTendered = '';
  let cardInfo = '';

  const symbol = settingsStore.getCurrencySymbol();
  const total = () => Number(Math.max(subtotal - discount, 0).toFixed(2));

  // --- Method tabs (Cash / Card) ---
  const cashTab = el('button', { class: 'payment-tab active', type: 'button' }, 'Cash');
  const cardTab = el('button', { class: 'payment-tab', type: 'button' }, 'Card');
  const tabs = el('div', { class: 'payment-tabs' }, [cashTab, cardTab]);

  // --- Card Info field (only shown for Card payments) ---
  const cardInfoInput = el('input', { type: 'text', placeholder: 'Card reference / auth code', onInput: (e) => { cardInfo = e.target.value; } });
  const cardInfoRow = el('div', { class: 'payment-field-row', style: 'display:none;' }, [el('label', {}, 'Card Info'), cardInfoInput]);

  function selectMethod(method) {
    paymentMethod = method;
    cashTab.classList.toggle('active', method === 'cash');
    cardTab.classList.toggle('active', method === 'card');
    cardInfoRow.style.display = method === 'card' ? 'flex' : 'none';
    updateChangeBar();
  }
  cashTab.addEventListener('click', () => selectMethod('cash'));
  cardTab.addEventListener('click', () => selectMethod('card'));

  // --- Price / Payment fields ---
  const priceField = el('div', { class: 'readonly-field' }, formatMoney(total(), symbol));
  const paymentField = el('div', { class: 'readonly-field' }, formatMoney(0, symbol));

  const fields = el('div', { class: 'payment-fields' }, [
    el('div', { class: 'payment-field-row' }, [el('label', {}, 'Price'), priceField]),
    el('div', { class: 'payment-field-row' }, [el('label', {}, 'Payment'), paymentField])
  ]);

  // --- Change bar ---
  const changeBar = el('div', { class: 'payment-change-bar' }, `Change: ${formatMoney(0, symbol)}`);

  function updateChangeBar() {
    const tendered = Number(amountTendered) || 0;
    paymentField.textContent = formatMoney(tendered, symbol);
    const change = tendered - total();
    if (paymentMethod === 'card') {
      changeBar.textContent = 'Card payment \u2014 exact amount charged';
      changeBar.classList.remove('insufficient');
    } else if (change < 0) {
      changeBar.textContent = `Insufficient \u2014 need ${formatMoney(Math.abs(change), symbol)} more`;
      changeBar.classList.add('insufficient');
    } else {
      changeBar.textContent = `Change: ${formatMoney(change, symbol)}`;
      changeBar.classList.remove('insufficient');
    }
  }

  // --- Keypad ---
  function pressDigit(digit) {
    if (digit === '.' && amountTendered.includes('.')) return;
    amountTendered += digit;
    updateChangeBar();
  }
  function clearAll() {
    amountTendered = '';
    updateChangeBar();
  }
  function backspace() {
    amountTendered = amountTendered.slice(0, -1);
    updateChangeBar();
  }

  const digitButtons = KEYPAD_KEYS.map((key) =>
    el('button', {
      type: 'button',
      class: `keypad-key ${key === '.' ? 'keypad-decimal' : ''}`,
      onClick: () => pressDigit(key)
    }, key)
  );

  const keypadGrid = el('div', { class: 'keypad-grid' }, digitButtons);

  const sideButtons = el('div', { class: 'keypad-side' }, [
    el('button', { type: 'button', class: 'keypad-key keypad-clear', onClick: clearAll }, 'AC'),
    el('button', { type: 'button', class: 'keypad-key keypad-backspace', onClick: backspace }, '\u232B')
  ]);

  const discountNote = el('div', { class: 'payment-discount-note' },
    discount > 0 ? `Discount applied: ${formatMoney(discount, symbol)}` : '');

  const formEl = el('div', { class: 'payment-form' }, [
    tabs,
    fields,
    cardInfoRow,
    discountNote,
    el('div', { class: 'payment-keypad-row' }, [keypadGrid, sideButtons]),
    changeBar
  ]);

  modalManager.open({
    title: 'Payment',
    content: formEl,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Confirm Payment',
        className: 'btn-success',
        closeOnClick: false,
        onClick: async () => {
          const tendered = Number(amountTendered) || 0;
          if (paymentMethod === 'cash' && tendered < total()) {
            notification.error('Payment amount is less than the total due.');
            return;
          }
          if (paymentMethod === 'card' && !cardInfo.trim()) {
            notification.error('Please enter card reference / auth code.');
            return;
          }
          try {
            const transaction = await apiClient.post('/transactions', {
              items: cartManager.toCheckoutItems(),
              paymentMethod,
              discount,
              customerId: customerId || null,
              seatAssignment,
              cashierId: currentUserId,
              paidAmount: paymentMethod === 'card' ? total() : tendered
            });
            modalManager.close();
            cartManager.clear();
            notification.success('Sale completed.');
            renderReceipt(transaction);
            onComplete?.(transaction);
          } catch (err) {
            notification.error(`Checkout failed: ${err.message}`);
          }
        }
      }
    ]
  });

  updateChangeBar();
}
