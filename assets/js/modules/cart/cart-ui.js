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
import { getWhatsAppPhone, sendBillOnWhatsApp } from '../../shared/whatsapp.js';
import { promptModal } from '../../ui/prompt.js';
import notification from '../../ui/notification.js';
import { setScanHandler } from '../../shared/barcode-scanner.js';

export function mountCart(container, { cartManager, onPay, onPrintPreview }) {
  // `discount` is always the resolved, absolute-currency amount --
  // that's what the backend (checkout/hold) actually charges against.
  // `discountValue`/`discountMode` are the *inputs* the cashier is
  // controlling: either a currency amount directly, or a percentage
  // that gets resolved against the current subtotal every time the
  // cart changes (so a 10% discount stays 10% as items are added or
  // removed, rather than freezing at whatever the subtotal happened to
  // be when it was typed).
  let discount = 0;
  let discountMode = 'amount'; // 'amount' | 'percent'
  let discountValue = 0;
  let selectedCustomerId = '';
  // WhatsApp number typed for the current sale (walk-in customers have
  // no saved number) -- reused by the Pay -> receipt screen so the
  // cashier is never asked twice. Reset when the sale ends or the
  // customer changes.
  let salePhone = '';
  // A demo/training sale, flagged so it never counts toward real
  // revenue figures and can later be found and actually deleted
  // (rather than just voided) -- see core/transaction-manager.js.
  let isTest = false;
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
  customerSelect.addEventListener('change', (e) => { selectedCustomerId = e.target.value; salePhone = ''; });

  // --- Barcode / SKU scan row ---
  // Also fed by the USB scanner (e.g. Dcode DC7132): it's a plain HID
  // keyboard-wedge device, so pulling the trigger just "types" the
  // code into whatever has focus, then Enter. barcode-scanner.js
  // recognizes that fast keystroke burst globally -- so a scan is
  // added to the cart even if the cashier's cursor is somewhere else
  // entirely (a quantity box, the discount field, nowhere) -- and
  // routes it here through the same addByBarcode() path a manually
  // typed code + Enter in this box would use, so both behave
  // identically and nothing can double-add an item.
  const barcodeInput = el('input', { type: 'text', placeholder: 'Scan barcode or type the number then hit enter' });
  async function addByBarcode(code) {
    code = (code ?? barcodeInput.value).trim();
    if (!code) return;
    try {
      const matches = await apiClient.get(`/inventory/products?search=${encodeURIComponent(code)}`);
      const exact = matches.find((p) => p.sku === code) || matches[0];
      if (!exact) {
        notification.error(`No product found for "${code}"`);
        barcodeInput.value = '';
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

  // While the POS screen is up, any scan (from anywhere -- see above)
  // adds to this cart. Cleared the moment the app navigates away from
  // 'pos', so a scan on the Transactions or Settings screen doesn't
  // silently add something to a cart that's out of sight.
  setScanHandler((code) => addByBarcode(code));
  cartManager.eventBus?.on('route:changed', ({ routeId }) => {
    if (routeId !== 'pos') setScanHandler(null);
  });

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
      discountValue = Number(e.target.value) || 0;
      resolveDiscount();
      render(lastState);
    }
  });
  const discountModeSelect = el('select', {
    class: 'discount-mode-select',
    title: 'Discount type',
    onChange: (e) => {
      discountMode = e.target.value;
      discountInput.placeholder = discountMode === 'percent' ? '%' : 'amount';
      resolveDiscount();
      render(lastState);
    }
  }, [
    el('option', { value: 'amount' }, settingsStore.getCurrencySymbol()),
    el('option', { value: 'percent' }, '%')
  ]);

  /** Recomputes `discount` (the actual currency amount charged) from whatever the cashier typed. */
  function resolveDiscount() {
    const subtotal = cartManager.getSubtotal();
    if (discountMode === 'percent') {
      const pct = Math.min(Math.max(discountValue, 0), 100);
      discount = Number(((subtotal * pct) / 100).toFixed(2));
    } else {
      discount = Math.min(Math.max(discountValue, 0), subtotal);
    }
  }

  // --- Test sale toggle ---
  // Lets a cashier ring up a demo/training sale without it polluting
  // real sales reports -- see core/transaction-manager.js#checkout's
  // isTest flag and list()'s includeTest for how it's kept separate.
  const testSaleCheckbox = el('input', {
    type: 'checkbox',
    id: 'cart-test-sale',
    onChange: (e) => { isTest = e.target.checked; }
  });
  const testSaleRow = el('label', { class: 'cart-test-sale-row', for: 'cart-test-sale' }, [
    testSaleCheckbox,
    ' This is a test sale (won\u2019t count toward sales reports, and can be deleted later)'
  ]);

  // --- Action row: Print / Cancel / Hold / Pay ---
  const printBtn = el('button', { class: 'btn btn-info btn-icon', title: 'Print preview', onClick: () => onPrintPreview?.({ lines: cartManager.getLines(), discount, total: computeGross() }) }, '\u{1F5A8}');
  function resetDiscount() {
    discountInput.value = '';
    discountValue = 0;
    discount = 0;
  }
  const cancelBtn = el('button', { class: 'btn btn-danger', onClick: () => {
    cartManager.clear();
    resetDiscount();
    salePhone = '';
    testSaleCheckbox.checked = false;
    isTest = false;
  } }, [el('span', {}, '\u2298 Cancel')]);
  const holdBtn = el('button', { class: 'btn btn-info', onClick: async () => {
    if (cartManager.getLines().length === 0) { notification.error('Cart is empty.'); return; }
    const ref = await promptModal('Reference for this held order:', '');
    if (ref === null) return;
    try {
      await apiClient.post('/transactions/hold', {
        items: cartManager.toCheckoutItems(),
        discount,
        customerId: selectedCustomerId || null,
        ref,
        isTest
      });
      cartManager.clear();
      resetDiscount();
      salePhone = '';
      testSaleCheckbox.checked = false;
      isTest = false;
      notification.success('Order held. Find it under Open Tabs.');
    } catch (err) {
      notification.error(err.message);
    }
  } }, [el('span', {}, '\u270B Hold')]);
  const payBtn = el('button', { class: 'btn btn-success', onClick: () => onPay?.({ discount, customerId: selectedCustomerId, phone: salePhone, isTest }) }, [el('span', {}, '\u{1F4B0} Pay')]);

  const whatsappBtn = el('button', { class: 'btn btn-whatsapp', title: 'Send bill to WhatsApp', onClick: async (e) => {
    const btn = e.currentTarget; // must be read before any await
    if (cartManager.getLines().length === 0) { notification.error('Cart is empty.'); return; }

    // Number comes from the selected customer's saved phone; only
    // asked for when there isn't one (then remembered for this sale).
    const phone = await getWhatsAppPhone({ customerId: selectedCustomerId || null, knownPhone: salePhone });
    if (!phone) return;
    salePhone = phone;

    const symbol = settingsStore.getCurrencySymbol();
    const lines = cartManager.getLines();
    const profile = settingsStore.getProfile();
    const total = computeGross();
    const message = [
      `*${profile.storeName || 'Xeoscape'}* -- Your Bill`,
      '',
      ...lines.map((l) => `${l.product.name} x${l.quantity} - ${formatMoney(l.product.price * l.quantity, symbol)}`),
      '',
      discount > 0 ? `Discount: ${formatMoney(discount, symbol)}` : null,
      `*Total: ${formatMoney(total, symbol)}*`,
      '',
      'Thank you for your business!'
    ].filter(Boolean).join('\n');

    btn.disabled = true;
    try {
      await sendBillOnWhatsApp({
        phone,
        message,
        customerName: customerSelect.selectedOptions[0]?.textContent === 'Walk in customer' ? '' : customerSelect.selectedOptions[0]?.textContent,
        storeName: profile.storeName || 'Xeoscape',
        totalText: formatMoney(total, symbol)
      });
    } finally {
      btn.disabled = false;
    }
  } }, [el('span', {}, '\u{1F4AC} WhatsApp')]);

  container.appendChild(el('div', { class: 'cart-panel' }, [
    el('div', { class: 'cart-customer-row' }, [customerSelect, addCustomerBtn, editCustomerBtn]),
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
      el('div', { class: 'cart-totals-row' }, [el('span', {}, 'Discount'), el('div', { class: 'discount-input-group' }, [discountInput, discountModeSelect])]),
      el('div', { class: 'cart-totals-row' }, [el('span', {}, ['Gross Price (inc ', taxInfoEl, '% GST)']), grossPriceEl])
    ]),
    testSaleRow,
    el('div', { class: 'cart-actions' }, [
      el('div', { class: 'cart-action-row-utility' }, [printBtn, cancelBtn]),
      el('div', { class: 'cart-action-row-primary' }, [holdBtn, whatsappBtn, payBtn])
    ])
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
    // A percentage discount is relative to the subtotal, which just
    // changed (a line was added/removed/re-quantitied) -- re-resolve it
    // so, say, "10%" stays 10% of the new total rather than the amount
    // it happened to work out to before the cart changed.
    resolveDiscount();
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
    if (lines.length === 0) salePhone = '';
    totalItemsEl.textContent = String(lines.reduce((s, l) => s + l.quantity, 0));
    priceEl.textContent = formatMoney(subtotal, settingsStore.getCurrencySymbol());
    grossPriceEl.textContent = formatMoney(computeGross(), settingsStore.getCurrencySymbol());
  }

  cartManager.eventBus?.on('cart:updated', render);
  refreshCustomers();
  render({ lines: cartManager.getLines(), subtotal: cartManager.getSubtotal() });
}
