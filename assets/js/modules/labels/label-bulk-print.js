// assets/js/modules/labels/label-bulk-print.js
// Print barcode labels for several products in one go.
//
// Opened from the product table once one or more rows are ticked.
// label-quick-print.js is the one-garment version; this is the
// "tag a whole delivery" version without having to go through
// Settings -> Barcode Labels.

import { el } from '../../shared/utils.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';
import { LABEL_SIZES, DEFAULT_LABEL_SIZE_ID, findLabelSize, customLabelSize } from './label-sizes.js';
import { buildLabelSheetHtml, expandByQuantity, openPrintWindow } from './label-sheet.js';

// Guard against a typo (e.g. 5000) queueing thousands of labels.
const MAX_LABELS_PER_PRODUCT = 999;

/**
 * @param {object[]} products - the ticked products (needs sku; name/garmentType/color/size/price/stock used if present)
 */
export function openBulkLabelPrint(products) {
  if (!products || products.length === 0) {
    notification.error('Tick at least one product first.');
    return;
  }

  const printable = products.filter((p) => p.sku);
  const skipped = products.filter((p) => !p.sku);
  if (printable.length === 0) {
    notification.error('None of the selected products have a barcode yet. Edit them and use Generate next to Barcode / SKU.');
    return;
  }

  const currencySymbol = settingsStore.getCurrencySymbol();
  const storeName = settingsStore.getProfile().storeName || '';

  // --- Per-product quantity ------------------------------------------
  // Default to the stock on hand (one tag per piece is the usual job
  // when tagging a delivery), falling back to 1 if there's no stock.
  const qtyInputs = new Map();
  const productRows = printable.map((p) => {
    const defaultQty = Math.max(1, Math.floor(Number(p.stock) || 0));
    const input = el('input', {
      type: 'number', min: '0', max: String(MAX_LABELS_PER_PRODUCT), step: '1',
      value: String(Math.min(defaultQty, MAX_LABELS_PER_PRODUCT)), class: 'label-bulk-qty'
    });
    input.addEventListener('input', refreshPreview);
    qtyInputs.set(p.id, input);
    const details = [p.garmentType, p.color, p.size].filter(Boolean).join(' \u00b7 ');
    return el('tr', {}, [
      el('td', {}, [el('div', {}, p.name || p.sku), details ? el('div', { class: 'label-catalogue-detail' }, details) : null]),
      el('td', {}, p.sku),
      el('td', {}, String(p.stock ?? 0)),
      el('td', {}, input)
    ]);
  });

  const productTable = el('table', { class: 'app-table label-bulk-table' }, [
    el('thead', {}, [el('tr', {}, ['Item', 'Barcode', 'Stock', 'Labels'].map((h) => el('th', {}, h)))]),
    el('tbody', {}, productRows)
  ]);

  function setAllQuantities(fn) {
    printable.forEach((p) => { qtyInputs.get(p.id).value = String(fn(p)); });
    refreshPreview();
  }

  const quickButtons = el('div', { class: 'label-qty-presets' }, [
    el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onClick: () => setAllQuantities((p) => Math.min(Math.max(1, Math.floor(Number(p.stock) || 0)), MAX_LABELS_PER_PRODUCT)) }, 'Match stock'),
    el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onClick: () => setAllQuantities(() => 1) }, '1 each'),
    el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onClick: () => setAllQuantities(() => 2) }, '2 each')
  ]);

  // --- Label stock / layout (same controls as the single-product dialog) ---
  const sizeSelect = el('select', {}, [
    ...LABEL_SIZES.map((size) => el('option', { value: size.id }, size.label)),
    el('option', { value: 'custom' }, 'Custom size...')
  ]);
  sizeSelect.value = DEFAULT_LABEL_SIZE_ID;

  const customWidth = el('input', { type: 'number', min: '15', max: '210', step: '0.1', value: '40' });
  const customHeight = el('input', { type: 'number', min: '8', max: '297', step: '0.1', value: '25' });
  const customRow = el('div', { class: 'label-custom-size', style: 'display:none' }, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Width (mm)'), customWidth]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Height (mm)'), customHeight])
  ]);

  const acrossSelect = el('select', {}, [1, 2, 3, 4].map((n) => (
    el('option', { value: String(n) }, n === 1 ? '1 (single lane)' : `${n} across`)
  )));
  const acrossRow = el('div', { class: 'form-field' }, [
    el('label', { title: 'How many labels sit side by side on the roll before it feeds to the next row' }, 'Labels across'),
    acrossSelect
  ]);

  const rotateSelect = el('select', {}, [
    el('option', { value: 'none' }, 'Off (default)'),
    el('option', { value: 'cw' }, 'Rotate 90\u00b0 (try this first)'),
    el('option', { value: 'ccw' }, 'Rotate 90\u00b0 the other way')
  ]);
  const rotateRow = el('div', { class: 'form-field' }, [
    el('label', { title: 'If labels come out sideways, try this. Print one test label after each change.' }, 'My printer prints labels sideways'),
    rotateSelect
  ]);

  const priceBox = el('input', { type: 'checkbox', checked: true });
  const previewFrame = el('iframe', { class: 'label-preview-frame', title: 'Label preview' });
  const totalEl = el('div', { class: 'label-bulk-total' }, '');

  function currentSize() {
    return sizeSelect.value === 'custom'
      ? customLabelSize(customWidth.value, customHeight.value)
      : findLabelSize(sizeSelect.value);
  }

  // Each product keeps its own barcode type, so a batch mixing
  // EAN-13 and CODE128 tags reprints every one exactly as it was.
  function labelItem(p, quantity) {
    return {
      code: p.sku,
      symbology: /^\d{13}$/.test(p.sku) ? 'EAN13' : 'CODE128',
      garmentType: p.garmentType || '',
      name: p.name || '',
      color: p.color || '',
      size: p.size || '',
      price: p.price ?? null,
      mrp: p.mrp ?? null,
      quantity
    };
  }

  function quantityFor(p) {
    const n = Math.floor(Number(qtyInputs.get(p.id).value) || 0);
    return Math.min(Math.max(n, 0), MAX_LABELS_PER_PRODUCT);
  }

  function contentOptions() {
    return {
      // Per label: show garment type when set, else fall back to the name.
      showGarmentType: true,
      showName: true,
      showColorSize: true,
      showPrice: priceBox.checked,
      showStoreName: false,
      showCodeText: true,
      storeName,
      currencySymbol
    };
  }

  // renderLabel prints garmentType and name as separate lines when both
  // flags are on, so mirror the single-product dialog: only keep the
  // name when there is no garment type.
  function itemsForPrint(quantityOverride) {
    return printable.map((p) => {
      const item = labelItem(p, quantityOverride ?? quantityFor(p));
      if (item.garmentType) item.name = '';
      return item;
    });
  }

  function layoutArgs() {
    const size = currentSize();
    const labelsAcross = size.kind === 'sheet' ? 1 : Math.max(1, Number(acrossSelect.value) || 1);
    return { size, labelsAcross };
  }

  function refreshPreview() {
    const total = printable.reduce((sum, p) => sum + quantityFor(p), 0);
    totalEl.textContent = `${total} label${total === 1 ? '' : 's'} from ${printable.length} product${printable.length === 1 ? '' : 's'}`
      + (skipped.length ? ` \u2014 ${skipped.length} skipped (no barcode)` : '');
    try {
      const { size, labelsAcross } = layoutArgs();
      // Preview one label of the first product only -- the full run
      // can be hundreds of labels.
      const first = itemsForPrint(0);
      first[0].quantity = 1;
      previewFrame.srcdoc = buildLabelSheetHtml(expandByQuantity([first[0]]), size, contentOptions(), 0, labelsAcross, rotateSelect.value);
    } catch (err) {
      previewFrame.srcdoc = '';
    }
  }

  sizeSelect.addEventListener('change', () => {
    const size = sizeSelect.value !== 'custom' ? findLabelSize(sizeSelect.value) : null;
    const isSheet = size?.kind === 'sheet';
    customRow.style.display = sizeSelect.value === 'custom' ? 'flex' : 'none';
    acrossRow.style.display = isSheet ? 'none' : 'block';
    if (isSheet) acrossSelect.value = '1';
    else if (size?.defaultAcross) acrossSelect.value = String(size.defaultAcross);
    refreshPreview();
  });
  [customWidth, customHeight, priceBox, acrossSelect, rotateSelect].forEach((c) => c.addEventListener('change', refreshPreview));

  const content = el('div', { class: 'label-quick-print label-bulk-print' }, [
    skipped.length
      ? el('div', { class: 'label-scan-warning' }, `Skipping ${skipped.length} product${skipped.length === 1 ? '' : 's'} with no barcode: ${skipped.map((p) => p.name).join(', ')}.`)
      : null,
    el('div', { class: 'label-bulk-table-wrap' }, productTable),
    quickButtons,
    totalEl,
    el('div', { class: 'form-field' }, [el('label', {}, 'Printing size'), sizeSelect]),
    customRow,
    acrossRow,
    rotateRow,
    el('label', { class: 'label-toggle' }, [priceBox, ' Show price on label']),
    el('h4', {}, 'Preview (first product)'),
    previewFrame
  ]);

  modalManager.open({
    title: `Print Barcode Labels \u2014 ${printable.length} product${printable.length === 1 ? '' : 's'}`,
    content,
    size: 'lg',
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: '\u{1F5A8} Print all',
        className: 'btn-success',
        closeOnClick: false,
        onClick: () => {
          const items = itemsForPrint();
          const total = items.reduce((sum, i) => sum + i.quantity, 0);
          if (total === 0) {
            notification.error('Every label count is 0 \u2014 enter how many labels to print.');
            return;
          }
          let size; let labelsAcross;
          try {
            ({ size, labelsAcross } = layoutArgs());
          } catch (err) {
            notification.error(err.message);
            return;
          }
          openPrintWindow(buildLabelSheetHtml(expandByQuantity(items), size, contentOptions(), 0, labelsAcross, rotateSelect.value));
          notification.success(`Sent ${total} label${total === 1 ? '' : 's'} to the printer.`);
          modalManager.close();
        }
      }
    ]
  });

  refreshPreview();
}
