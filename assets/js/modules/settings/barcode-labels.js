// assets/js/modules/settings/barcode-labels.js
// Barcode label generator for clothing stock.
//
// Two ways into the print queue, because tagging garments happens two
// different ways in a real shop:
//
//   * From the catalogue -- the garment is already a product, you just
//     need tags for the ten that arrived today.
//   * Quick entry -- a delivery is on the counter and nothing is in
//     the system yet. Type what it is (T-Shirt, Cargo Pant, Half
//     Pant...), the colour and the size, and a barcode is allocated
//     for it there and then.
//
// Either way the operator picks the label stock they've actually
// loaded before printing, since that's what decides whether the bars
// come out scannable.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import settingsStore from '../../shared/settings-store.js';
import notification from '../../ui/notification.js';
import { LABEL_SIZES, DEFAULT_LABEL_SIZE_ID, findLabelSize, customLabelSize, labelsPerPage } from '../labels/label-sizes.js';
import { buildLabelSheetHtml, expandByQuantity, openPrintWindow, estimateXDimensionMm, MIN_X_DIMENSION_MM } from '../labels/label-sheet.js';

// Mirrors the Garment Type options in config/product-fields.json.
// Kept as a plain list here rather than fetched, so quick entry still
// works for a garment that isn't in the catalogue yet.
const GARMENT_TYPES = [
  'T-Shirt', 'Shirt', 'Polo', 'Hoodie', 'Sweatshirt', 'Jacket', 'Sweater',
  'Jeans', 'Trouser', 'Chino', 'Cargo Pant', 'Half Pant', 'Shorts', 'Track Pant', 'Legging',
  'Kurta', 'Kurti', 'Saree', 'Dress', 'Skirt', 'Top', 'Blouse',
  'Innerwear', 'Nightwear', 'Socks', 'Cap', 'Scarf', 'Other'
];

const SIZES = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free Size',
  '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46',
  '0-3M', '3-6M', '6-12M', '1-2Y', '2-3Y', '3-4Y', '4-5Y', '6-7Y', '8-9Y', '10-11Y', '12-13Y'
];

let queueSeq = 0;

export async function mountBarcodeLabels(container) {
  /** @type {Array<object>} labels waiting to be printed */
  const queue = [];

  const state = {
    sizeId: DEFAULT_LABEL_SIZE_ID,
    customWidthMm: 40,
    customHeightMm: 25,
    symbology: 'CODE128',
    skipCount: 0,
    // How many labels sit side by side on the roll before it feeds to
    // the next row -- 1 is the old single-lane behaviour.
    labelsAcross: 1,
    // 'none' | 'cw' | 'ccw' -- see rotateSelect below.
    rotate: 'none',
    content: {
      showStoreName: false,
      showGarmentType: true,
      showName: false,
      showColorSize: true,
      showPrice: true,
      showCodeText: true
    }
  };

  const currencySymbol = settingsStore.getCurrencySymbol();
  const storeName = settingsStore.getProfile().storeName || '';

  container.appendChild(el('h3', {}, 'Barcode Labels'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Build a batch of barcode tags for clothing stock, then print them on whichever label '
    + 'stock is loaded. Garments booked in here go into inventory with their barcode, so '
    + 'scanning the tag at the till sells the item and takes it off stock automatically.'
  ));

  // ---------------------------------------------------------------
  // Resolving the chosen label stock
  // ---------------------------------------------------------------

  function currentSize() {
    if (state.sizeId === 'custom') {
      return customLabelSize(state.customWidthMm, state.customHeightMm);
    }
    return findLabelSize(state.sizeId) || findLabelSize(DEFAULT_LABEL_SIZE_ID);
  }

  // ---------------------------------------------------------------
  // Quick entry: garment type / colour / size typed by the operator
  // ---------------------------------------------------------------

  const typeSelect = el('select', {}, GARMENT_TYPES.map((t) => el('option', { value: t }, t)));
  const colorInput = el('input', { type: 'text', placeholder: 'e.g. Navy Blue' });
  const sizeSelect = el('select', {}, [
    el('option', { value: '' }, 'Size...'),
    ...SIZES.map((s) => el('option', { value: s }, s))
  ]);
  const priceInput = el('input', { type: 'number', step: '0.01', min: '0', placeholder: 'Price' });
  // This is both the stock quantity booked in and the number of tags
  // printed -- twelve tees arriving means twelve in stock and twelve
  // labels, which is what makes the two stay in step.
  const qtyInput = el('input', { type: 'number', min: '1', step: '1', value: '1', placeholder: 'Qty' });

  const QUICK_QUANTITIES = [2, 4, 6, 8, 12];
  const quickQtyButtons = el('div', { class: 'label-qty-presets' }, QUICK_QUANTITIES.map((n) => (
    el('button', {
      type: 'button',
      class: 'btn btn-sm btn-secondary',
      onClick: () => { qtyInput.value = String(n); }
    }, `\u00d7${n}`)
  )));

  const addQuickBtn = el('button', { class: 'btn btn-primary' }, 'Add to stock & queue labels');

  addQuickBtn.addEventListener('click', async () => {
    const garmentType = typeSelect.value;
    const color = colorInput.value.trim();
    const size = sizeSelect.value;
    const quantity = Math.max(1, Math.floor(Number(qtyInput.value) || 1));

    if (!size) {
      notification.error('Pick a size -- a clothing tag without one is no use on the floor.');
      return;
    }

    addQuickBtn.disabled = true;
    try {
      // Tagging and stocking in happen together. A printed tag that
      // isn't backed by a product would scan to nothing at the till,
      // so it could never be sold and could never deduct stock --
      // see core/garment-intake.js.
      const result = await apiClient.post('/inventory/products/tag-in', {
        garmentType,
        color,
        size,
        quantity,
        price: priceInput.value === '' ? undefined : Number(priceInput.value),
        symbology: state.symbology
      });

      // An arrival of a garment already on the rail restocks that
      // product and reuses its barcode, so the queue row is merged
      // too rather than printing under a second code.
      const existingRow = queue.find((row) => row.code === result.code);
      if (existingRow) {
        existingRow.quantity += quantity;
      } else {
        queueSeq += 1;
        queue.push({
          id: `q${queueSeq}`,
          code: result.code,
          garmentType,
          name: result.product.name || '',
          color,
          size,
          price: result.product.price ?? null,
          mrp: result.product.mrp ?? null,
          quantity,
          source: 'intake'
        });
      }

      colorInput.value = '';
      priceInput.value = '';
      qtyInput.value = '1';
      renderQueue();
      notification.success(
        result.created
          ? `Created "${result.product.name}" (${result.code}) with ${result.added} in stock.`
          : `Restocked "${result.product.name}" (${result.code}) \u2014 now ${result.newStock} in stock.`
      );
    } catch (err) {
      notification.error(err.message);
    } finally {
      addQuickBtn.disabled = false;
    }
  });

  const quickEntry = el('div', { class: 'label-quick-entry' }, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Garment Type'), typeSelect]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Colour'), colorInput]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Size'), sizeSelect]),
    el('div', { class: 'form-field' }, [el('label', {}, `Price (${currencySymbol})`), priceInput]),
    el('div', { class: 'form-field' }, [
      el('label', { title: 'Goes into stock, and prints this many tags' }, 'Qty arrived'),
      qtyInput,
      quickQtyButtons
    ]),
    el('div', { class: 'form-field' }, [el('label', {}, '\u00a0'), addQuickBtn])
  ]);

  // ---------------------------------------------------------------
  // Adding garments that are already in the catalogue
  // ---------------------------------------------------------------

  const catalogueSearch = el('input', {
    type: 'text',
    class: 'search-input',
    placeholder: 'Search the catalogue by name or barcode...'
  });
  const catalogueResults = el('div', { class: 'label-catalogue-results' });

  let searchTimer = null;
  catalogueSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runCatalogueSearch, 250);
  });

  async function runCatalogueSearch() {
    const term = catalogueSearch.value.trim();
    if (!term) {
      catalogueResults.innerHTML = '';
      return;
    }
    try {
      const products = await apiClient.get(`/inventory/products?search=${encodeURIComponent(term)}`);
      catalogueResults.innerHTML = '';
      if (!products.length) {
        catalogueResults.appendChild(el('div', { class: 'table-empty' }, 'No garments match that.'));
        return;
      }
      products.slice(0, 25).forEach((product) => {
        const details = [product.garmentType, product.color, product.size].filter(Boolean).join(' \u00b7 ');
        catalogueResults.appendChild(el('div', { class: 'label-catalogue-row' }, [
          el('span', { class: 'label-catalogue-name' }, product.name),
          el('span', { class: 'label-catalogue-detail' }, details || '\u2014'),
          el('span', { class: 'label-catalogue-sku' }, product.sku || 'no barcode'),
          el('button', {
            class: 'btn btn-sm btn-secondary',
            title: 'One label per item in stock',
            onClick: () => addProduct(product, Math.max(1, Math.floor(Number(product.stock) || 1)))
          }, `Add \u00d7${Math.max(1, Math.floor(Number(product.stock) || 1))} (stock)`),
          el('button', {
            class: 'btn btn-sm btn-primary',
            onClick: () => addProduct(product, 1)
          }, 'Add \u00d71')
        ]));
      });
    } catch (err) {
      notification.error(`Search failed: ${err.message}`);
    }
  }

  function addProduct(product, quantity) {
    if (!product.sku) {
      notification.error(`"${product.name}" has no barcode yet. Edit the product and use Generate next to Barcode / SKU.`);
      return;
    }
    // Adding the same garment twice bumps the count rather than
    // creating a second row -- otherwise a distracted operator ends up
    // printing two separate piles for one style.
    const existing = queue.find((row) => row.code === product.sku);
    if (existing) {
      existing.quantity += quantity;
    } else {
      queueSeq += 1;
      queue.push({
        id: `q${queueSeq}`,
        code: product.sku,
        garmentType: product.garmentType || '',
        name: product.name || '',
        color: product.color || '',
        size: product.size || '',
        price: product.price ?? null,
        mrp: product.mrp ?? null,
        quantity,
        source: 'catalogue'
      });
    }
    renderQueue();
  }

  // ---------------------------------------------------------------
  // The print queue
  // ---------------------------------------------------------------

  const queueWrap = el('div', { class: 'table-container' });
  const queueSummary = el('div', { class: 'label-queue-summary' }, '');

  function renderQueue() {
    queueWrap.innerHTML = '';

    if (!queue.length) {
      queueWrap.appendChild(el('div', { class: 'table-empty' }, 'Nothing queued yet.'));
      queueSummary.textContent = '';
      updatePreview();
      return;
    }

    const head = el('thead', {}, [
      el('tr', {}, ['Barcode', 'Garment', 'Colour', 'Size', 'Price', 'Labels', ''].map((h) => el('th', {}, h)))
    ]);

    const rows = queue.map((row) => {
      const rowQty = el('input', {
        type: 'number',
        min: '1',
        step: '1',
        value: String(row.quantity),
        class: 'label-qty-input',
        onInput: (event) => {
          row.quantity = Math.max(1, Math.floor(Number(event.target.value) || 1));
          updateSummary();
          updatePreview();
        }
      });

      return el('tr', {}, [
        el('td', { class: 'label-code-cell' }, row.code),
        el('td', {}, row.garmentType || row.name || '\u2014'),
        el('td', {}, row.color || '\u2014'),
        el('td', {}, row.size || '\u2014'),
        el('td', {}, row.price === null || row.price === undefined ? '\u2014' : `${currencySymbol}${Number(row.price).toFixed(2)}`),
        el('td', {}, rowQty),
        el('td', { class: 'action' }, [
          el('button', {
            class: 'btn btn-sm btn-danger',
            title: 'Remove from queue',
            onClick: () => {
              const index = queue.indexOf(row);
              if (index >= 0) queue.splice(index, 1);
              renderQueue();
            }
          }, '\u2715')
        ])
      ]);
    });

    queueWrap.appendChild(el('table', { class: 'app-table' }, [head, el('tbody', {}, rows)]));
    updateSummary();
    updatePreview();
  }

  function totalLabels() {
    return queue.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  }

  function updateSummary() {
    const total = totalLabels();
    if (!total) {
      queueSummary.textContent = '';
      return;
    }
    let size;
    try {
      size = currentSize();
    } catch {
      queueSummary.textContent = `${total} label${total === 1 ? '' : 's'} queued.`;
      return;
    }
    const perPage = labelsPerPage(size);
    const pages = Math.ceil((total + state.skipCount) / perPage);
    queueSummary.textContent = size.kind === 'sheet'
      ? `${total} label${total === 1 ? '' : 's'} \u2014 ${pages} sheet${pages === 1 ? '' : 's'} of ${perPage}.`
      : state.labelsAcross > 1
        ? `${total} label${total === 1 ? '' : 's'} on ${size.widthMm} \u00d7 ${size.heightMm} mm roll stock, `
          + `${state.labelsAcross} across (${Math.ceil(total / state.labelsAcross)} row${Math.ceil(total / state.labelsAcross) === 1 ? '' : 's'}).`
        : `${total} label${total === 1 ? '' : 's'} on ${size.widthMm} \u00d7 ${size.heightMm} mm roll stock.`;
  }

  // ---------------------------------------------------------------
  // Print size + what goes on the label
  // ---------------------------------------------------------------

  const sizeSelectEl = el('select', {}, [
    ...LABEL_SIZES.map((size) => el('option', { value: size.id }, size.label)),
    el('option', { value: 'custom' }, 'Custom size...')
  ]);
  sizeSelectEl.value = state.sizeId;

  const customWidth = el('input', { type: 'number', min: '15', max: '210', step: '0.1', value: String(state.customWidthMm) });
  const customHeight = el('input', { type: 'number', min: '8', max: '297', step: '0.1', value: String(state.customHeightMm) });
  const customRow = el('div', { class: 'label-custom-size', style: 'display:none' }, [
    el('div', { class: 'form-field' }, [el('label', {}, 'Width (mm)'), customWidth]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Height (mm)'), customHeight])
  ]);

  const skipInput = el('input', { type: 'number', min: '0', step: '1', value: '0' });
  const skipRow = el('div', { class: 'form-field', style: 'display:none' }, [
    el('label', { title: 'Leave positions blank on the first sheet so a part-used sheet can be reused' },
      'Skip labels on first sheet'),
    skipInput
  ]);

  // Many thermal barcode rolls print more than one label across the
  // web before feeding to the next row -- exactly the roll size
  // chosen above, just laid out side by side in 2s, 3s or 4s. This is
  // a property of the roll, not a different label size, so it's a
  // separate control rather than another entry in the size dropdown.
  const acrossSelect = el('select', {}, [1, 2, 3, 4].map((n) => (
    el('option', { value: String(n) }, n === 1 ? '1 (single lane)' : `${n} across`)
  )));
  acrossSelect.value = String(state.labelsAcross);
  const acrossRow = el('div', { class: 'form-field', style: 'display:none' }, [
    el('label', { title: 'How many labels sit side by side on the roll before it feeds to the next row' },
      'Labels across'),
    acrossSelect
  ]);

  // Some printers/drivers rotate every printout 90 degrees relative to
  // how the stock is actually loaded -- and neither Portrait nor
  // Landscape in the print dialog changes that, since it's the driver
  // mapping the page onto the roll in a fixed way, not a page-content
  // setting. This pre-rotates the content the opposite way so the two
  // cancel out; see the `rotate` param on buildLabelSheetHtml for the
  // full explanation. Left on "Off" for everyone whose printer already
  // prints right-side up -- most do.
  const rotateSelect = el('select', {}, [
    el('option', { value: 'none' }, 'Off (default)'),
    el('option', { value: 'cw' }, 'Rotate 90\u00b0 (try this first)'),
    el('option', { value: 'ccw' }, 'Rotate 90\u00b0 the other way')
  ]);
  rotateSelect.value = state.rotate;
  const rotateRow = el('div', { class: 'form-field' }, [
    el('label', {
      title: 'If labels come out sideways and the print dialog\u2019s Portrait/Landscape option doesn\u2019t fix it, '
        + 'try this instead. Print one test label after each change.'
    }, 'My printer prints labels sideways'),
    rotateSelect
  ]);

  function syncSizeDependentControls() {
    customRow.style.display = state.sizeId === 'custom' ? 'flex' : 'none';
    const size = state.sizeId !== 'custom' ? findLabelSize(state.sizeId) : null;
    const isSheet = size?.kind === 'sheet';
    skipRow.style.display = isSheet ? 'block' : 'none';
    // "Labels across" is a roll-stock concept -- a sheet already has
    // its own fixed column count.
    acrossRow.style.display = isSheet ? 'none' : 'block';
    if (!isSheet) {
      state.skipCount = 0;
      skipInput.value = '0';
    }
    if (isSheet) {
      state.labelsAcross = 1;
      acrossSelect.value = '1';
    } else if (size?.defaultAcross) {
      // Stock that's normally sold/printed multiple-up (a "2UP" roll,
      // say) -- so picking the preset is enough on its own, rather
      // than also having to separately remember to set "Labels
      // across" to match.
      state.labelsAcross = size.defaultAcross;
      acrossSelect.value = String(size.defaultAcross);
    }
  }

  sizeSelectEl.addEventListener('change', () => {
    state.sizeId = sizeSelectEl.value;
    syncSizeDependentControls();
    updateSummary();
    updatePreview();
  });
  [customWidth, customHeight].forEach((input) => input.addEventListener('input', () => {
    state.customWidthMm = Number(customWidth.value);
    state.customHeightMm = Number(customHeight.value);
    updateSummary();
    updatePreview();
  }));
  skipInput.addEventListener('input', () => {
    state.skipCount = Math.max(0, Math.floor(Number(skipInput.value) || 0));
    updateSummary();
    updatePreview();
  });
  acrossSelect.addEventListener('change', () => {
    state.labelsAcross = Math.max(1, Math.floor(Number(acrossSelect.value)) || 1);
    updateSummary();
    updatePreview();
  });
  rotateSelect.addEventListener('change', () => {
    state.rotate = rotateSelect.value;
    updatePreview();
  });

  const symbologySelect = el('select', {}, [
    el('option', { value: 'CODE128' }, 'CODE128 \u2014 readable SKU (TSHI-BLU-M-0042)'),
    el('option', { value: 'EAN13' }, 'EAN-13 \u2014 13-digit retail barcode')
  ]);
  symbologySelect.value = state.symbology;
  symbologySelect.addEventListener('change', () => {
    state.symbology = symbologySelect.value;
    updatePreview();
  });

  const CONTENT_TOGGLES = [
    ['showGarmentType', 'Garment type'],
    ['showColorSize', 'Colour & size'],
    ['showName', 'Product name'],
    ['showPrice', 'Price'],
    ['showStoreName', 'Store name'],
    ['showCodeText', 'Barcode number']
  ];

  const contentBoxes = CONTENT_TOGGLES.map(([key, label]) => {
    const box = el('input', { type: 'checkbox', checked: state.content[key] });
    box.addEventListener('change', () => {
      state.content[key] = box.checked;
      updatePreview();
    });
    return el('label', { class: 'label-toggle' }, [box, ` ${label}`]);
  });

  // ---------------------------------------------------------------
  // Preview -- rendered with the exact same builder as the print job,
  // in an iframe so the app's stylesheet can't make it lie.
  // ---------------------------------------------------------------

  const previewFrame = el('iframe', { class: 'label-preview-frame', title: 'Label preview' });
  const previewNote = el('div', { class: 'settings-hint' }, '');
  const scanWarning = el('div', { class: 'label-scan-warning', style: 'display:none' }, '');

  /**
   * Checks the narrowest bar the current batch would print at. A code
   * that's too long for the chosen stock prints bars below what a
   * handheld scanner can resolve -- it previews perfectly and then
   * fails at the till, so it's worth flagging before the roll is
   * used up.
   */
  function updateScanWarning(size, items) {
    let worst = null;
    let worstCode = '';
    items.forEach((item) => {
      const xDim = estimateXDimensionMm(item.code, state.symbology, size);
      if (xDim !== null && (worst === null || xDim < worst)) {
        worst = xDim;
        worstCode = item.code;
      }
    });

    if (worst === null || worst >= MIN_X_DIMENSION_MM) {
      scanWarning.style.display = 'none';
      return;
    }

    scanWarning.style.display = 'block';
    scanWarning.textContent = `Bars would print ${worst.toFixed(3)} mm wide for "${worstCode}" `
      + `\u2014 below the ${MIN_X_DIMENSION_MM} mm most handheld scanners can read. `
      + 'Use wider label stock, switch to EAN-13, or shorten the code.';
  }

  function previewItems() {
    if (queue.length) return expandByQuantity(queue).slice(0, 12);
    // Nothing queued: show a worked example so the operator can judge
    // the stock size and content toggles before adding anything.
    return [{
      code: state.symbology === 'EAN13' ? '2000000000015' : 'TSHI-BLU-M-0042',
      garmentType: 'T-Shirt',
      name: 'Round Neck Cotton Tee',
      color: 'Navy Blue',
      size: 'M',
      price: 799,
      mrp: 1299
    }];
  }

  function updatePreview() {
    let size;
    try {
      size = currentSize();
    } catch (err) {
      previewNote.textContent = err.message;
      previewFrame.srcdoc = '';
      return;
    }

    const items = previewItems();
    const html = buildLabelSheetHtml(items, size, {
      ...state.content,
      storeName,
      currencySymbol,
      symbology: state.symbology
    }, 0, state.labelsAcross, state.rotate);

    previewFrame.srcdoc = html;
    updateScanWarning(size, queue.length ? queue : items);
    previewNote.textContent = queue.length
      ? `Showing the first ${items.length} of ${totalLabels()} label${totalLabels() === 1 ? '' : 's'}, at actual size.`
      : 'Example label at actual size. Add garments below to preview the real batch.';
  }

  // ---------------------------------------------------------------
  // Print
  // ---------------------------------------------------------------

  const printBtn = el('button', { class: 'btn btn-success' }, '\u{1F5A8} Print labels');
  printBtn.addEventListener('click', () => {
    if (!queue.length) {
      notification.error('Add at least one garment to the queue first.');
      return;
    }

    let size;
    try {
      size = currentSize();
    } catch (err) {
      notification.error(err.message);
      return;
    }

    const items = expandByQuantity(queue);
    if (!items.length) {
      notification.error('Every queued row is set to zero labels.');
      return;
    }

    const html = buildLabelSheetHtml(items, size, {
      ...state.content,
      storeName,
      currencySymbol,
      symbology: state.symbology
    }, state.skipCount, state.labelsAcross, state.rotate);

    openPrintWindow(html);
    notification.success(`Sent ${items.length} label${items.length === 1 ? '' : 's'} to the printer.`);
  });

  const clearBtn = el('button', { class: 'btn btn-secondary' }, 'Clear queue');
  clearBtn.addEventListener('click', () => {
    if (!queue.length) return;
    if (!window.confirm('Clear all queued labels?')) return;
    queue.length = 0;
    renderQueue();
  });

  // ---------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------

  container.appendChild(el('div', { class: 'label-layout' }, [
    el('div', { class: 'label-build-pane' }, [
      el('h4', {}, 'Add from the catalogue'),
      catalogueSearch,
      catalogueResults,

      el('h4', {}, 'Or book in a new delivery'),
      el('p', { class: 'settings-hint' },
        'Enter what arrived and it goes straight into inventory with a barcode, ready to sell. '
        + 'A garment already on the rail is restocked under its existing barcode rather than '
        + 'duplicated. Reprinting a torn tag? Use the catalogue search above \u2014 that never '
        + 'changes stock.'),
      quickEntry,

      el('h4', {}, 'Print queue'),
      queueSummary,
      queueWrap,
      el('div', { class: 'label-queue-actions' }, [clearBtn, printBtn])
    ]),

    el('div', { class: 'label-options-pane' }, [
      el('h4', {}, 'Printing size'),
      el('div', { class: 'form-field' }, [el('label', {}, 'Label stock'), sizeSelectEl]),
      customRow,
      acrossRow,
      rotateRow,
      skipRow,

      el('h4', {}, 'Barcode'),
      el('div', { class: 'form-field' }, [el('label', {}, 'Type'), symbologySelect]),

      el('h4', {}, 'Show on label'),
      el('div', { class: 'label-toggles' }, contentBoxes),

      el('h4', {}, 'Preview'),
      previewFrame,
      previewNote,
      scanWarning
    ])
  ]));

  syncSizeDependentControls();
  renderQueue();
}
