// assets/js/modules/checkout/receipt.js
// Renders a printable receipt for a completed transaction, and an
// order preview (pre-payment) triggered by the POS panel's Print button.
//
// The header block (logo, store name, tagline, address, contact,
// GSTIN) is shared between the final receipt and the pre-payment
// preview, so what a customer sees before paying matches what they
// get on paper afterwards.

import { el } from '../../shared/utils.js';
import { formatMoney, formatDate } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import { getWhatsAppPhone, sendBillOnWhatsApp } from '../../shared/whatsapp.js';
import notification from '../../ui/notification.js';
import { printHtml } from '../../shared/print-utils.js';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// Minimal copy of the .receipt* rules from assets/css/components.css,
// inlined here rather than shared, because the printed copy is spliced
// into the app's own page and printed on its own (see
// shared/print-utils.js) rather than loading the app's full
// stylesheet.
//
// Sized for an 80mm thermal receipt roll -- the common width for
// retail POS receipt printers (the other common size is 58mm; change
// RECEIPT_PAPER_WIDTH_MM below if this shop's printer uses that
// instead). Page height is left as "auto" since thermal rolls are
// continuous-feed, not cut to a fixed page length -- the printer just
// feeds and cuts after however much the receipt actually needs.
const RECEIPT_PAPER_WIDTH_MM = 80;
// Every colour below is pure black (or a solid, not-too-thin dashed
// rule) on purpose. The soft slate/grey palette used on screen
// (#36404a body text, #75798b for the tagline/address/footer, a pale
// #dbdde3 divider) looks fine on a monitor but is exactly what makes a
// thermal print come out faint: most thermal printers -- and Chromium's
// own "print grayscale" conversion feeding them -- render anything
// lighter than true black as a sparse, weak dot pattern rather than a
// solid burn. Text weight is bumped up for the same reason: a thermal
// head lays down more/darker toner along a heavier stroke, which is
// what actually reads as "bold" on paper rather than just on screen.
const RECEIPT_PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${RECEIPT_PAPER_WIDTH_MM}mm; }
  /* -webkit-text-stroke adds a hairline outline around every glyph --
     on top of font-weight, this is what actually closes up the gaps
     in a thin monospace font so the thermal head lays down a solid
     stroke instead of a faint, broken one. Chromium/WebView2 (what
     this prints through) both support the -webkit- prefixed property. */
  body { color: #000; }
  .receipt { width: 100%; padding: 3mm 4mm; }
  .receipt-shop-header { text-align: center; margin-bottom: 0.4rem; }
  .receipt-logo { max-width: 100%; max-height: 40px; margin: 0 auto 0.25rem; display: block; }
  .receipt-store-name { font-weight: 800; font-size: 0.95rem; }
  .receipt-tagline { font-size: 0.68rem; color: #000; font-weight: 600; margin-bottom: 0.15rem; }
  .receipt-address { font-size: 0.62rem; color: #000; font-weight: 600; line-height: 1.3; }
  .receipt-header { text-align: center; margin-bottom: 0.4rem; font-size: 0.72rem; }
  .receipt-header div:first-child { font-weight: 800; }
  .receipt-line, .receipt-totals div { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.74rem; font-weight: 600; }
  .receipt-line span:first-child { word-break: break-word; }
  .receipt-total-line { font-weight: 800; font-size: 0.88rem; border-top: 2px dashed #000; margin-top: 0.3rem; padding-top: 0.3rem; }
  .receipt-payment { margin-top: 0.3rem; font-size: 0.72rem; font-weight: 600; }
  .receipt-footer { margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px dashed #000; text-align: center; font-size: 0.65rem; font-weight: 600; color: #000; }
  .receipt-test-banner { text-align: center; font-weight: 800; font-size: 0.78rem; border: 2px dashed #000; padding: 0.15rem; margin-bottom: 0.4rem; }
  @page { size: ${RECEIPT_PAPER_WIDTH_MM}mm auto; margin: 0; }
`;

// Receipt typeface. The old thin Courier + text-stroke look filled in
// the gaps of letters on the thermal head and made numbers hard to
// read (a 9 could look like an 8). These are heavy, open sans-serif
// faces that every Windows PC already has, so nothing needs installing
// and printing works offline. Chosen in Settings -> Store Profile ->
// Receipt Font. Appended AFTER RECEIPT_PRINT_CSS so it overrides the
// base sizes/weights.
const RECEIPT_FONT_CSS = {
  // Tahoma/Verdana were designed to stay legible at small sizes;
  // Arial Black gives the store name and total real impact.
  clear: `
  body { font-family: Tahoma, Verdana, Arial, sans-serif; font-weight: 700; -webkit-text-stroke: 0; }
  .receipt-store-name { font-family: 'Arial Black', Impact, Arial, sans-serif; font-weight: 900; font-size: 1.3rem; letter-spacing: 0.3px; }
  .receipt-tagline { font-size: 0.82rem; font-weight: 700; }
  .receipt-address { font-size: 0.78rem; font-weight: 700; }
  .receipt-header { font-size: 0.85rem; font-weight: 700; }
  .receipt-line, .receipt-totals div { font-size: 0.92rem; font-weight: 700; padding: 1px 0; }
  .receipt-total-line { font-family: 'Arial Black', Impact, Arial, sans-serif; font-weight: 900; font-size: 1.15rem; }
  .receipt-payment { font-size: 0.88rem; font-weight: 700; }
  .receipt-footer { font-size: 0.8rem; font-weight: 700; }
  .receipt-test-banner { font-size: 0.85rem; }`,
  // Condensed Impact headlines over bold Arial body text.
  impact: `
  body { font-family: Arial, Helvetica, sans-serif; font-weight: 700; -webkit-text-stroke: 0; }
  .receipt-store-name { font-family: Impact, 'Arial Narrow', Arial, sans-serif; font-weight: 400; font-size: 1.7rem; letter-spacing: 1px; text-transform: uppercase; }
  .receipt-tagline { font-size: 0.82rem; font-weight: 700; }
  .receipt-address { font-size: 0.78rem; font-weight: 700; }
  .receipt-header { font-size: 0.85rem; font-weight: 700; }
  .receipt-line, .receipt-totals div { font-size: 0.95rem; font-weight: 700; padding: 1px 0; }
  .receipt-total-line { font-family: Impact, 'Arial Narrow', Arial, sans-serif; font-weight: 400; font-size: 1.45rem; letter-spacing: 0.5px; }
  .receipt-payment { font-size: 0.9rem; font-weight: 700; }
  .receipt-footer { font-size: 0.8rem; font-weight: 700; }
  .receipt-test-banner { font-size: 0.85rem; }`,
  // The previous look, for anyone who prefers it.
  classic: `
  body { font-family: 'Courier New', monospace; font-weight: 600; -webkit-text-stroke: 0.35px #000; }`
};

function receiptFontCss(choice) {
  return RECEIPT_FONT_CSS[choice] || RECEIPT_FONT_CSS.clear;
}

// So a printed test sale is never mistaken for a real one on paper --
// especially once it can no longer be told apart from the transaction
// list it came from (that list is where the isTest flag actually
// lives; the printed slip is standalone).
const TEST_SALE_BANNER_HTML = '<div class="receipt-test-banner">\u{1F9EA} TEST SALE \u2014 NOT A REAL TRANSACTION</div>';

function receiptHeaderHtml(profile) {
  return `
    <div class="receipt-shop-header">
      ${profile.logoUrl ? `<img class="receipt-logo" src="${escapeHtml(profile.logoUrl)}" alt="">` : ''}
      <div class="receipt-store-name">${escapeHtml(profile.storeName || 'Xeoscape')}</div>
      ${profile.tagline ? `<div class="receipt-tagline">${escapeHtml(profile.tagline)}</div>` : ''}
      ${profile.addressLine1 ? `<div class="receipt-address">${escapeHtml(profile.addressLine1)}</div>` : ''}
      ${profile.addressLine2 ? `<div class="receipt-address">${escapeHtml(profile.addressLine2)}</div>` : ''}
      ${profile.contactNumber ? `<div class="receipt-address">Ph: ${escapeHtml(profile.contactNumber)}</div>` : ''}
      ${profile.taxId ? `<div class="receipt-address">GSTIN: ${escapeHtml(profile.taxId)}</div>` : ''}
    </div>`;
}

/**
 * Builds a full, standalone HTML document for a paid receipt -- built
 * fresh from the transaction data (rather than serializing the modal's
 * DOM) so it carries its own styles and prints correctly via
 * shared/print-utils.js, independent of the app's own stylesheet or
 * whatever else is currently on screen.
 */
function buildReceiptPrintHtml(transaction) {
  const symbol = settingsStore.getCurrencySymbol();
  const profile = settingsStore.getProfile();

  const lines = transaction.items.map((li) => `
    <div class="receipt-line">
      <span>${escapeHtml(li.name)} x${escapeHtml(li.quantity)}</span>
      <span>${escapeHtml(formatMoney(li.lineTotal, symbol))}</span>
    </div>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Receipt</title><style>${RECEIPT_PRINT_CSS}${receiptFontCss(profile.receiptFont)}</style></head>
<body>
  <div class="receipt">
    ${transaction.isTest ? TEST_SALE_BANNER_HTML : ''}
    ${receiptHeaderHtml(profile)}
    <div class="receipt-header"><div>${escapeHtml(formatDate(transaction.createdAt))}</div></div>
    <div class="receipt-lines">${lines}</div>
    <div class="receipt-totals">
      <div>Subtotal: ${escapeHtml(formatMoney(transaction.subtotal, symbol))}</div>
      <div>Discount: ${escapeHtml(formatMoney(transaction.discount, symbol))}</div>
      <div class="receipt-total-line">Total: ${escapeHtml(formatMoney(transaction.total, symbol))}</div>
    </div>
    <div class="receipt-payment">Paid via ${escapeHtml(transaction.paymentMethod)}</div>
    ${profile.receiptFooter ? `<div class="receipt-footer">${escapeHtml(profile.receiptFooter)}</div>` : ''}
  </div>
</body>
</html>`;
}

/**
 * Same idea as buildReceiptPrintHtml, for the pre-payment order
 * preview.
 */
function buildOrderPreviewPrintHtml({ lines = [], discount = 0, total = 0 }) {
  const symbol = settingsStore.getCurrencySymbol();
  const profile = settingsStore.getProfile();

  const rows = lines.map((line) => `
    <div class="receipt-line">
      <span>${escapeHtml(line.product.name)} x${escapeHtml(line.quantity)}</span>
      <span>${escapeHtml(formatMoney(line.product.price * line.quantity, symbol))}</span>
    </div>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Order Preview</title><style>${RECEIPT_PRINT_CSS}</style></head>
<body>
  <div class="receipt">
    ${receiptHeaderHtml(profile)}
    <div class="receipt-header"><div>Order Preview (unpaid)</div></div>
    <div class="receipt-lines">${rows}</div>
    <div class="receipt-totals">
      ${discount > 0 ? `<div>Discount: ${escapeHtml(formatMoney(discount, symbol))}</div>` : ''}
      <div class="receipt-total-line">Total: ${escapeHtml(formatMoney(total, symbol))}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Builds the shop-identity block shown at the top of every printed
 * receipt and preview: logo, store name, tagline, address and contact
 * details. Each line is optional and simply omitted when not set in
 * Settings -> Store Profile, so an unbranded install still prints a
 * clean receipt rather than empty lines.
 */
function renderReceiptHeader(profile) {
  return el('div', { class: 'receipt-shop-header' }, [
    profile.logoUrl ? el('img', { class: 'receipt-logo', src: profile.logoUrl, alt: profile.storeName || '' }) : null,
    el('div', { class: 'receipt-store-name' }, profile.storeName || 'Xeoscape'),
    profile.tagline ? el('div', { class: 'receipt-tagline' }, profile.tagline) : null,
    profile.addressLine1 ? el('div', { class: 'receipt-address' }, profile.addressLine1) : null,
    profile.addressLine2 ? el('div', { class: 'receipt-address' }, profile.addressLine2) : null,
    profile.contactNumber ? el('div', { class: 'receipt-address' }, `Ph: ${profile.contactNumber}`) : null,
    profile.taxId ? el('div', { class: 'receipt-address' }, `GSTIN: ${profile.taxId}`) : null
  ]);
}

export function renderReceipt(transaction, { phone: knownPhone = '' } = {}) {
  const symbol = settingsStore.getCurrencySymbol();
  const profile = settingsStore.getProfile();

  const lines = transaction.items.map((li) =>
    el('div', { class: 'receipt-line' }, [
      el('span', {}, `${li.name} x${li.quantity}`),
      el('span', {}, formatMoney(li.lineTotal, symbol))
    ])
  );

  const receipt = el('div', { class: 'receipt', id: 'printable-receipt' }, [
    transaction.isTest ? el('div', { class: 'receipt-test-banner' }, '\u{1F9EA} TEST SALE \u2014 NOT A REAL TRANSACTION') : null,
    renderReceiptHeader(profile),
    el('div', { class: 'receipt-header' }, [
      el('div', { class: 'receipt-date' }, formatDate(transaction.createdAt))
    ]),
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
        // See shared/print-utils.js for how printing here avoids both
        // the popup-blocking issue the old window.open()-based label
        // printing had, and printing the wrong content (the app has no
        // @media print rules of its own, so a bare window.print() on
        // the main window would print whatever else happened to be on
        // screen along with the receipt).
        onClick: () => printHtml(buildReceiptPrintHtml(transaction)).catch((err) => notification.error(`Print failed: ${err.message}`))
      },
      {
        label: '\u{1F4AC} WhatsApp',
        className: 'btn-whatsapp',
        closeOnClick: false,
        onClick: async (e) => {
          const btn = e.currentTarget; // must be read before any await
          // Customer's saved number, else the one typed on the POS
          // screen for this sale, else ask (and remember it).
          const receiptOverlay = modalManager.overlay;
          const phone = await getWhatsAppPhone({ customerId: transaction.customerId || null, knownPhone });
          // Asking for a number swaps this receipt out for the prompt
          // (only one modal at a time) -- bring the receipt back.
          if (receiptOverlay && !document.body.contains(receiptOverlay)) {
            renderReceipt(transaction, { phone: phone || knownPhone });
          }
          if (!phone) return;
          knownPhone = phone;
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
          if (btn) btn.disabled = true;
          try {
            await sendBillOnWhatsApp({
              phone,
              message,
              customerName: transaction.customerName || '',
              storeName: profile.storeName || 'Xeoscape',
              totalText: formatMoney(transaction.total, symbol)
            });
          } finally {
            if (btn) btn.disabled = false;
          }
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
  const profile = settingsStore.getProfile();

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
    renderReceiptHeader(profile),
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
      { label: 'Print', className: 'btn-secondary', closeOnClick: false, onClick: () => printHtml(buildOrderPreviewPrintHtml({ lines, discount, total })).catch((err) => notification.error(`Print failed: ${err.message}`)) },
      { label: 'Close', className: 'btn-primary' }
    ]
  });
}
