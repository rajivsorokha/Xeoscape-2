// assets/js/modules/labels/label-quick-print.js
// The tag button on a product row: print labels for one garment
// without going to Settings first.
//
// This is the common case by a wide margin -- a few pieces of one
// style arrive, or a tag gets torn off on the floor and needs
// replacing. The full batch builder (Settings -> Barcode Labels)
// stays for tagging a whole delivery.

import { el } from '../../shared/utils.js';
import settingsStore from '../../shared/settings-store.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';
import { LABEL_SIZES, DEFAULT_LABEL_SIZE_ID, findLabelSize, customLabelSize } from './label-sizes.js';
import { buildLabelSheetHtml, openPrintWindow, estimateXDimensionMm, MIN_X_DIMENSION_MM } from './label-sheet.js';

/**
 * @param {object} product - needs at least sku; garmentType/color/size/price used if present
 */
export function openQuickLabelPrint(product) {
  if (!product.sku) {
    notification.error(`"${product.name}" has no barcode yet. Edit it and use Generate next to Barcode / SKU.`);
    return;
  }

  const currencySymbol = settingsStore.getCurrencySymbol();
  const storeName = settingsStore.getProfile().storeName || '';

  const qtyInput = el('input', { type: 'number', min: '1', step: '1', value: '1' });

  // One-tap buttons for the counts people actually reach for --
  // typing the same few numbers over and over is exactly the kind of
  // friction a quick preset removes. They just set the field; the
  // number typed in still wins if it's the last thing touched.
  const QUICK_QUANTITIES = [2, 4, 6, 8, 12];
  const quickQtyButtons = el('div', { class: 'label-qty-presets' }, QUICK_QUANTITIES.map((n) => (
    el('button', {
      type: 'button',
      class: 'btn btn-sm btn-secondary',
      onClick: () => { qtyInput.value = String(n); refreshPreview(); }
    }, `\u00d7${n}`)
  )));

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

  // Many thermal barcode rolls print more than one label side by side
  // before feeding to the next row -- this is what puts two (or three,
  // or four) copies of the same tag next to each other on one strip,
  // like the roll this button is being used with.
  const acrossSelect = el('select', {}, [1, 2, 3, 4].map((n) => (
    el('option', { value: String(n) }, n === 1 ? '1 (single lane)' : `${n} across`)
  )));

  const symbologySelect = el('select', {}, [
    el('option', { value: 'CODE128' }, 'CODE128'),
    el('option', { value: 'EAN13' }, 'EAN-13')
  ]);
  // Default to whatever the existing code actually is, so reprinting a
  // torn tag reproduces the same symbology rather than silently
  // switching it -- two different-looking tags for one garment on the
  // same rail causes no end of confusion at the till.
  symbologySelect.value = /^\d{13}$/.test(product.sku) ? 'EAN13' : 'CODE128';

  const priceBox = el('input', { type: 'checkbox', checked: true });
  const previewFrame = el('iframe', { class: 'label-preview-frame', title: 'Label preview' });
  const scanWarning = el('div', { class: 'label-scan-warning', style: 'display:none' }, '');

  function currentSize() {
    return sizeSelect.value === 'custom'
      ? customLabelSize(customWidth.value, customHeight.value)
      : findLabelSize(sizeSelect.value);
  }

  function labelItem(quantity) {
    return {
      code: product.sku,
      garmentType: product.garmentType || '',
      name: product.name || '',
      color: product.color || '',
      size: product.size || '',
      price: product.price ?? null,
      mrp: product.mrp ?? null,
      quantity
    };
  }

  function contentOptions() {
    return {
      showGarmentType: Boolean(product.garmentType),
      // With no garment type recorded, fall back to the product name so
      // the tag still says what the item is.
      showName: !product.garmentType,
      showColorSize: true,
      showPrice: priceBox.checked,
      showStoreName: false,
      showCodeText: true,
      storeName,
      currencySymbol,
      symbology: symbologySelect.value
    };
  }

  function refreshPreview() {
    try {
      const size = currentSize();
      const labelsAcross = size.kind === 'sheet' ? 1 : Math.max(1, Number(acrossSelect.value) || 1);
      previewFrame.srcdoc = buildLabelSheetHtml([labelItem(1)], size, contentOptions(), 0, labelsAcross);

      // Warn if this code is too long for the chosen stock to print
      // scannable bars -- see MIN_X_DIMENSION_MM in label-sheet.js.
      const xDim = estimateXDimensionMm(product.sku, symbologySelect.value, size);
      if (xDim !== null && xDim < MIN_X_DIMENSION_MM) {
        scanWarning.style.display = 'block';
        scanWarning.textContent = `Bars would print ${xDim.toFixed(3)} mm wide \u2014 below the `
          + `${MIN_X_DIMENSION_MM} mm most handheld scanners can read. Use wider label stock.`;
      } else {
        scanWarning.style.display = 'none';
      }
    } catch (err) {
      previewFrame.srcdoc = '';
      notification.error(err.message);
    }
  }

  const acrossRow = el('div', { class: 'form-field' }, [
    el('label', { title: 'How many labels sit side by side on the roll before it feeds to the next row' },
      'Labels across'),
    acrossSelect
  ]);

  sizeSelect.addEventListener('change', () => {
    const isSheet = sizeSelect.value !== 'custom' && (findLabelSize(sizeSelect.value) || {}).kind === 'sheet';
    customRow.style.display = sizeSelect.value === 'custom' ? 'flex' : 'none';
    // "Labels across" is a roll-stock concept -- a sheet already has
    // its own fixed column count.
    acrossRow.style.display = isSheet ? 'none' : 'block';
    if (isSheet) acrossSelect.value = '1';
    refreshPreview();
  });
  [customWidth, customHeight, symbologySelect, priceBox, acrossSelect].forEach((control) => {
    control.addEventListener('change', refreshPreview);
  });

  const details = [product.garmentType, product.color, product.size].filter(Boolean).join('  \u00b7  ');

  const content = el('div', { class: 'label-quick-print' }, [
    el('div', { class: 'label-quick-heading' }, [
      el('strong', {}, product.name || product.sku),
      details ? el('span', { class: 'label-catalogue-detail' }, details) : null
    ]),
    el('div', { class: 'form-field' }, [el('label', {}, 'How many labels'), qtyInput]),
    quickQtyButtons,
    el('div', { class: 'form-field' }, [el('label', {}, 'Printing size'), sizeSelect]),
    customRow,
    acrossRow,
    el('div', { class: 'form-field' }, [el('label', {}, 'Barcode type'), symbologySelect]),
    el('label', { class: 'label-toggle' }, [priceBox, ' Show price on label']),
    el('h4', {}, 'Preview'),
    previewFrame,
    scanWarning
  ]);

  modalManager.open({
    title: 'Print Barcode Labels',
    content,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: '\u{1F5A8} Print',
        className: 'btn-success',
        // Stay open if the size is invalid, so the operator can fix it
        // rather than losing the whole dialog.
        closeOnClick: false,
        onClick: () => {
          const quantity = Math.max(1, Math.floor(Number(qtyInput.value) || 1));
          let size;
          try {
            size = currentSize();
          } catch (err) {
            notification.error(err.message);
            return;
          }
          const items = Array.from({ length: quantity }, () => labelItem(1));
          const labelsAcross = size.kind === 'sheet' ? 1 : Math.max(1, Number(acrossSelect.value) || 1);
          openPrintWindow(buildLabelSheetHtml(items, size, contentOptions(), 0, labelsAcross));
          notification.success(`Sent ${quantity} label${quantity === 1 ? '' : 's'} to the printer.`);
          modalManager.close();
        }
      }
    ]
  });

  refreshPreview();
}
