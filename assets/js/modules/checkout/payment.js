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
  const profile = settingsStore.getProfile();
  const afterDiscount = () => Number(Math.max(subtotal - discount, 0).toFixed(2));
  const taxAmount = () => (profile.chargeTax ? Number((afterDiscount() * ((profile.taxPercentage || 0) / 100)).toFixed(2)) : 0);
  // Was previously subtotal-discount only, silently excluding tax --
  // the amount required at Pay now matches what cart-ui.js's "Gross
  // Price (inc tax)" already displayed, and what the backend actually
  // charges/stores (see core/transaction-manager.js#checkout).
  const total = () => Number((afterDiscount() + taxAmount()).toFixed(2));

  // --- Method tabs (Cash / Card / Credit) ---
  // Credit is a B2B General Retail feature only (see
  // core/transaction-manager.js#checkout, which enforces this
  // server-side too -- this isn't just a hidden button). Cash and
  // Card always require the full amount; Credit is the one place a
  // shortfall is expected and goes onto the customer's account balance.
  const cashTab = el('button', { class: 'payment-tab active', type: 'button' }, 'Cash');
  const cardTab = el('button', { class: 'payment-tab', type: 'button' }, 'Card');
  const creditTab = settingsStore.isB2B() ? el('button', { class: 'payment-tab', type: 'button' }, 'Credit') : null;
  const tabs = el('div', { class: 'payment-tabs' }, creditTab ? [cashTab, cardTab, creditTab] : [cashTab, cardTab]);

  // --- Card Info field (only shown for Card payments) ---
  const cardInfoInput = el('input', { type: 'text', placeholder: 'Card reference / auth code', onInput: (e) => { cardInfo = e.target.value; } });
  const cardInfoRow = el('div', { class: 'payment-field-row', style: 'display:none;' }, [el('label', {}, 'Card Info'), cardInfoInput]);

  // --- Credit hint (only shown for Credit payments) ---
  const creditHint = el('div', { class: 'settings-hint', style: 'display:none;' },
    customerId
      ? 'Enter what\u2019s being collected now (0 is fine for fully on credit) \u2014 the remainder goes onto this customer\u2019s account balance.'
      : '\u26A0 Select a customer above first \u2014 credit needs an account to bill it to.'
  );

  function selectMethod(method) {
    paymentMethod = method;
    cashTab.classList.toggle('active', method === 'cash');
    cardTab.classList.toggle('active', method === 'card');
    if (creditTab) creditTab.classList.toggle('active', method === 'credit');
    cardInfoRow.style.display = method === 'card' ? 'flex' : 'none';
    creditHint.style.display = method === 'credit' ? 'block' : 'none';
    updateChangeBar();
  }
  cashTab.addEventListener('click', () => selectMethod('cash'));
  cardTab.addEventListener('click', () => selectMethod('card'));
  if (creditTab) creditTab.addEventListener('click', () => selectMethod('credit'));

  // --- Price / Payment fields ---
  // Payment is a real <input> (not a read-only div) so the amount can
  // be typed on a keyboard, not just clicked on the on-screen keypad
  // below -- both paths write to the same `amountTendered` and stay
  // in sync with each other.
  const priceField = el('div', { class: 'readonly-field' }, formatMoney(total(), symbol));
  const taxHint = el('div', { class: 'settings-hint', style: 'margin:0.15rem 0 0.5rem;' },
    profile.chargeTax ? `Includes ${profile.taxPercentage || 0}% tax (${formatMoney(taxAmount(), symbol)})` : ''
  );
  const paymentField = el('input', {
    type: 'text',
    inputmode: 'decimal',
    class: 'readonly-field payment-amount-input',
    placeholder: formatMoney(0, symbol),
    onInput: (e) => {
      // Same rule the keypad enforces: digits and a single decimal point.
      let v = e.target.value.replace(/[^0-9.]/g, '');
      const firstDot = v.indexOf('.');
      if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
      amountTendered = v;
      if (v !== e.target.value) e.target.value = v;
      updateChangeBar();
    },
    onKeydown: (e) => { if (e.key === 'Enter') confirmPayment(); }
  });

  const fields = el('div', { class: 'payment-fields' }, [
    el('div', { class: 'payment-field-row' }, [el('label', {}, 'Price'), priceField]),
    taxHint,
    el('div', { class: 'payment-field-row' }, [el('label', {}, 'Payment'), paymentField]),
    creditHint
  ]);

  // --- Change bar ---
  const changeBar = el('div', { class: 'payment-change-bar' }, `Change: ${formatMoney(0, symbol)}`);

  function updateChangeBar() {
    const tendered = Number(amountTendered) || 0;
    const change = tendered - total();
    if (paymentMethod === 'card') {
      changeBar.textContent = 'Card payment \u2014 exact amount charged';
      changeBar.classList.remove('insufficient');
    } else if (paymentMethod === 'credit') {
      // Credit is the dedicated path for a shortfall -- see
      // core/transaction-manager.js#checkout's dueAmount handling
      // (B2B General Retail only, enforced server-side).
      if (!customerId) {
        changeBar.textContent = 'Select a customer to bill the credit to.';
        changeBar.classList.add('insufficient');
      } else if (change < 0) {
        changeBar.textContent = `To Credit Account: ${formatMoney(Math.abs(change), symbol)}`;
        changeBar.classList.remove('insufficient');
      } else {
        changeBar.textContent = `Paid in full \u2014 nothing added to the credit account. Change: ${formatMoney(change, symbol)}`;
        changeBar.classList.remove('insufficient');
      }
    } else if (change < 0) {
      changeBar.textContent = `Insufficient \u2014 need ${formatMoney(Math.abs(change), symbol)} more`;
      changeBar.classList.add('insufficient');
    } else {
      changeBar.textContent = `Change: ${formatMoney(change, symbol)}`;
      changeBar.classList.remove('insufficient');
    }
  }

  // --- Keypad (mouse/touch path -- keeps the same amountTendered the keyboard path above writes to) ---
  function pressDigit(digit) {
    if (digit === '.' && amountTendered.includes('.')) return;
    amountTendered += digit;
    paymentField.value = amountTendered;
    updateChangeBar();
  }
  function clearAll() {
    amountTendered = '';
    paymentField.value = '';
    updateChangeBar();
  }
  function backspace() {
    amountTendered = amountTendered.slice(0, -1);
    paymentField.value = amountTendered;
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

  async function confirmPayment() {
    const tendered = Number(amountTendered) || 0;
    if (paymentMethod === 'cash' && tendered < total()) {
      notification.error('Cash payment must cover the full amount. Use Credit if you want to leave a balance due.');
      return;
    }
    if (paymentMethod === 'card' && !cardInfo.trim()) {
      notification.error('Please enter card reference / auth code.');
      return;
    }
    if (paymentMethod === 'credit' && !customerId) {
      notification.error('Select a customer to bill the credit to.');
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

  modalManager.open({
    title: 'Payment',
    content: formEl,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      { label: 'Confirm Payment', className: 'btn-success', closeOnClick: false, onClick: confirmPayment }
    ]
  });

  updateChangeBar();
}
