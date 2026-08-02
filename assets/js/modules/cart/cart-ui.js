// assets/js/modules/cart/cart-ui.js
// Renders the POS order panel: customer select, barcode scan-to-add,
// the current cart lines, discount/tax totals, and the Print / Cancel /
// Hold / Pay / WhatsApp action row -- mirroring PharmaSpot's left-hand
// POS card, plus a click-to-chat WhatsApp bill share.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import { openCustomerForm } from '../customers/customer-form.js';
import { openWhatsApp } from '../../shared/whatsapp.js';
import { promptModal } from '../../ui/prompt.js';
import notification from '../../ui/notification.js';

export function mountCart(container, { cartManager, onPay, onPrintPreview }) {
  let discount = 0;
  let selectedCustomerId = '';
  let selectedSeats = null;

  // --- Seat assignment (Restaurant / Cafe only) ---
  const SEAT_SIZES = [2, 3, 4, 6, 8];
  const seatButtons = SEAT_SIZES.map((n) => {
    const btn = el('button', {
      type: 'button',
      class: 'btn btn-sm btn-secondary seat-btn',
      onClick: () => {
        selectedSeats = selectedSeats === n ? null : n;
        updateSeatButtons();
      }
    }, `${n}-Seater`);
    btn.dataset.seats = String(n);
    return btn;
  });
  function updateSeatButtons() {
    seatButtons.forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.seats) === selectedSeats);
    });
  }
  const seatRow = el('div', { class: 'cart-seat-row', style: 'display:none;' }, [
    el('span', { class: 'cart-seat-label' }, 'Table:'),
    ...seatButtons
  ]);
  // Only shown when the active store type is Restaurant / Cafe.
  apiClient.get('/settings')
    .then((settings) => {
      if (settings.storeType?.id === 'restaurant') {
        seatRow.style.display = 'flex';
      }
    })
    .catch(() => {});

  // --- Customer select row ---
  const customerSelect = el('select', {}, [el('option', { value: '' }, 'Walk in customer')]);
  const addCustomerBtn = el('button', { class: 'btn btn-primary btn-icon', onClick: () => openCustomerForm({ onSaved: refreshCustomers }) }, '+');
  const editCustomerBtn = el('button', { class: 'btn btn-secondary btn-icon' }, '\u270E');

  async function refreshCustomers() {
    try {
      const customers = await apiClient.get('/customers');
      customerSelect.innerHTML = '';
      customerSelect.appendChild(el('option', { value: '' }, 'Walk in customer'));
      customers.forEach((c) => customerSelect.appendChild(el('option', { value: c.id }, c.name)));
      customerSelect.value = selectedCustomerId;
    } catch (err) {
      notification.error(`Failed to load customers: ${err.message}`);
    }
  }
  customerSelect.addEventListener('change', (e) => { selectedCustomerId = e.target.value; });

  // --- Barcode / SKU scan row ---
  const barcodeInput = el('input', { type: 'text', placeholder: 'Scan barcode or type the number then hit enter' });
  async function addByBarcode() {
    const code = barcodeInput.value.trim();
    if (!code) return;
    try {
      const matches = await apiClient.get(`/inventory/products?search=${encodeURIComponent(code)}`);
      const exact = matches.find((p) => p.sku === code) || matches[0];
      if (!exact) {
        notification.error(`No product found for "${code}"`);
        return;
      }
      cartManager.add(exact, 1);
      barcodeInput.value = '';
    } catch (err) {
      notification.error(err.message);
    }
  }
  const barcodeForm = el('form', {
    onSubmit: (e) => { e.preventDefault(); addByBarcode(); }
  }, [barcodeInput, el('button', { class: 'btn btn-primary btn-icon', type: 'submit' }, '\u2713')]);

  // --- Cart table ---
  const listEl = el('div', { class: 'cart-lines' });
  const clearAllBtn = el('button', { class: 'btn btn-sm btn-secondary', onClick: () => cartManager.clear() }, '\u2715');

  // --- Totals / discount ---
  const totalItemsEl = el('span', {}, '0');
  const priceEl = el('span', {}, formatMoney(0, settingsStore.getCurrencySymbol()));
  const grossPriceEl = el('h3', {}, formatMoney(0, settingsStore.getCurrencySymbol()));
  const taxInfoEl = el('span', {}, String(settingsStore.getProfile().taxPercentage || 0));

  const discountInput = el('input', {
    type: 'number',
    min: '0',
    placeholder: 'amount',
    onInput: (e) => {
      discount = Number(e.target.value) || 0;
      render(lastState);
    }
  });

  // --- Action row: Print / Cancel / Hold / Pay ---
  const printBtn = el('button', { class: 'btn btn-info', onClick: () => onPrintPreview?.({ lines: cartManager.getLines(), discount, total: computeGross() }) }, '\u{1F5A8}');
  const cancelBtn = el('button', { class: 'btn btn-danger', onClick: () => { cartManager.clear(); discountInput.value = ''; discount = 0; selectedSeats = null; updateSeatButtons(); } }, [el('span', {}, '\u2298 Cancel')]);
  const holdBtn = el('button', { class: 'btn btn-info', onClick: async () => {
    if (cartManager.getLines().length === 0) { notification.error('Cart is empty.'); return; }
    const ref = await promptModal('Reference for this held order:', '');
    if (ref === null) return;
    try {
      await apiClient.post('/transactions/hold', {
        items: cartManager.toCheckoutItems(),
        discount,
        customerId: selectedCustomerId || null,
        seatAssignment: selectedSeats ? `${selectedSeats}-Seater` : null,
        ref
      });
      cartManager.clear();
      discountInput.value = '';
      discount = 0;
      selectedSeats = null;
      updateSeatButtons();
      notification.success('Order held. Find it under Open Tabs.');
    } catch (err) {
      notification.error(err.message);
    }
  } }, [el('span', {}, '\u270B Hold')]);
  const payBtn = el('button', { class: 'btn btn-success', onClick: () => onPay?.({ discount, customerId: selectedCustomerId, seatAssignment: selectedSeats ? `${selectedSeats}-Seater` : null }) }, [el('span', {}, '\u{1F4B0} Pay')]);

  const whatsappBtn = el('button', { class: 'btn btn-whatsapp', title: 'Send bill to WhatsApp', onClick: async () => {
    if (cartManager.getLines().length === 0) { notification.error('Cart is empty.'); return; }

    let phone = '';
    if (selectedCustomerId) {
      try {
        const customer = await apiClient.get(`/customers/${selectedCustomerId}`);
        phone = customer.phone || '';
      } catch (err) {
        // fall through to manual entry
      }
    }
    if (!phone) {
      phone = await promptModal('Customer WhatsApp number (with country code, e.g. 15551234567):', '');
      if (phone === null) return;
    }

    const symbol = settingsStore.getCurrencySymbol();
    const lines = cartManager.getLines();
    const profile = settingsStore.getProfile();
    const message = [
      `*${profile.storeName || 'Xeoscape'}* -- Your Bill`,
      '',
      ...lines.map((l) => `${l.product.name} x${l.quantity} - ${formatMoney(l.product.price * l.quantity, symbol)}`),
      '',
      discount > 0 ? `Discount: ${formatMoney(discount, symbol)}` : null,
      `*Total: ${formatMoney(computeGross(), symbol)}*`,
      '',
      'Thank you for your business!'
    ].filter(Boolean).join('\n');

    openWhatsApp(phone, message);
  } }, [el('span', {}, '\u{1F4AC} WhatsApp')]);

  container.appendChild(el('div', { class: 'cart-panel' }, [
    el('div', { class: 'cart-customer-row' }, [customerSelect, addCustomerBtn, editCustomerBtn]),
    seatRow,
    barcodeForm,
    el('div', { class: 'cart-table-wrap' }, [
      el('div', { class: 'cart-table-header' }, [
        el('span', {}, '#'), el('span', {}, 'Item'), el('span', {}, 'Qty'), el('span', {}, 'Price'), clearAllBtn
      ]),
      listEl
    ]),
    el('div', { class: 'cart-totals' }, [
      el('div', { class: 'cart-totals-row' }, [el('span', {}, 'Total Item(s)'), el('span', {}, [': ', totalItemsEl])]),
      el('div', { class: 'cart-totals-row' }, [el('span', {}, 'Price :'), el('span', {}, [': ', priceEl])]),
      el('div', { class: 'cart-totals-row' }, [el('span', {}, 'Discount'), discountInput]),
      el('div', { class: 'cart-totals-row' }, [el('span', {}, ['Gross Price (inc ', taxInfoEl, '% GST)']), grossPriceEl])
    ]),
    el('div', { class: 'cart-action-row' }, [printBtn, cancelBtn, holdBtn, payBtn, whatsappBtn])
  ]));

  function computeGross() {
    const subtotal = cartManager.getSubtotal();
    const afterDiscount = Math.max(subtotal - discount, 0);
    const profile = settingsStore.getProfile();
    const tax = profile.chargeTax ? afterDiscount * ((profile.taxPercentage || 0) / 100) : 0;
    return Number((afterDiscount + tax).toFixed(2));
  }

  let lastState = { lines: [], subtotal: 0 };

  function render(state = { lines: [], subtotal: 0 }) {
    lastState = state;
    const { lines = [], subtotal = 0 } = state;
    // The cart is emptied both by Cancel (handled above) and by a
    // successful payment (cartManager.clear() inside payment.js) --
    // catching it here too means the table selection always resets
    // once an order is done, regardless of which path emptied it.
    if (lines.length === 0 && selectedSeats !== null) {
      selectedSeats = null;
      updateSeatButtons();
    }
    listEl.innerHTML = '';
    if (lines.length === 0) {
      listEl.appendChild(el('div', { class: 'cart-empty' }, 'No items yet -- scan a barcode or add from the catalog.'));
    } else {
      lines.forEach((line, idx) => {
        listEl.appendChild(el('div', { class: 'cart-line' }, [
          el('span', { class: 'cart-line-index' }, String(idx + 1)),
          el('span', { class: 'cart-line-name' }, line.product.name),
          el('input', {
            type: 'number',
            min: '1',
            value: String(line.quantity),
            class: 'cart-line-qty',
            onChange: (e) => cartManager.setQuantity(line.product.id, Number(e.target.value))
          }),
          el('span', { class: 'cart-line-price' }, formatMoney(line.product.price * line.quantity, settingsStore.getCurrencySymbol())),
          el('button', { class: 'btn btn-sm btn-danger', onClick: () => cartManager.remove(line.product.id) }, '\u2715')
        ]));
      });
    }
    totalItemsEl.textContent = String(lines.reduce((s, l) => s + l.quantity, 0));
    priceEl.textContent = formatMoney(subtotal, settingsStore.getCurrencySymbol());
    grossPriceEl.textContent = formatMoney(computeGross(), settingsStore.getCurrencySymbol());
  }

  cartManager.eventBus?.on('cart:updated', render);
  refreshCustomers();
  render({ lines: cartManager.getLines(), subtotal: cartManager.getSubtotal() });
}
