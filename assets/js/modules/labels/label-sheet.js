// assets/js/modules/labels/label-sheet.js
// Turns a list of garments into print-ready HTML: the barcode itself
// plus the three things a shop floor actually reads off a clothing
// tag -- what the garment is, what colour, and what size.
//
// Everything is laid out in millimetres and printed via a CSS @page
// rule matching the loaded stock. That's deliberate: if the page size
// isn't declared, the browser assumes A4 and scales a 38 mm label up
// to fill it, or a thermal printer crops it. Sizing in mm and letting
// the printer print at 100% is the only way the bars come out at the
// width they were calculated for, which is what makes them scan.

import { barcodeSvg, encodeCode128, encodeEan13 } from '../../shared/barcode.js';
import { printHtml } from '../../shared/print-utils.js';

/**
 * @typedef {object} LabelItem
 * @property {string} code            value encoded in the barcode
 * @property {string} [garmentType]   "T-Shirt", "Cargo Pant", ...
 * @property {string} [name]          product name
 * @property {string} [color]
 * @property {string} [size]
 * @property {number} [price]
 * @property {number} [mrp]
 * @property {number} [quantity]      how many copies of this label
 */

/**
 * @typedef {object} LabelContentOptions
 * @property {boolean} [showStoreName]
 * @property {boolean} [showGarmentType]
 * @property {boolean} [showName]
 * @property {boolean} [showColorSize]
 * @property {boolean} [showPrice]
 * @property {boolean} [showCodeText]
 * @property {string}  [storeName]
 * @property {string}  [currencySymbol]
 * @property {'CODE128'|'EAN13'} [symbology]
 */

function escapeHtml(text) {
  return String(text ?? '').replace(/[<>&"']/g, (char) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]
  ));
}

/**
 * Works out type sizes and the barcode's share of the label from the
 * label's own height, so one layout works on 19 mm tags and 50 mm
 * ones without a separate template per size.
 *
 * The barcode gets roughly a third of the height, floored at 7 mm.
 * Below about 7 mm tall, bars get short enough that a hand scanner
 * has to be lined up precisely to read them -- so on very small stock
 * the text shrinks and the bars don't.
 */
function metricsFor(size, lineCount) {
  const padMm = Math.max(0.8, Math.min(2, size.heightMm * 0.06));
  const usableHeight = size.heightMm - padMm * 2;
  const barHeightMm = Math.max(7, Math.min(usableHeight * 0.42, 16));
  const textHeight = Math.max(0, usableHeight - barHeightMm);

  // Split what's left between however many text lines are switched on.
  const perLine = lineCount > 0 ? textHeight / lineCount : 0;
  const baseFontMm = Math.max(1.5, Math.min(perLine * 0.62, 3.4));

  return {
    padMm,
    barHeightMm,
    baseFontMm,
    barWidthMm: size.widthMm - padMm * 2
  };
}

// The narrow-bar width ("X-dimension") below which a printed barcode
// stops being reliably readable by ordinary handheld scanners. 0.19mm
// is 7.5 mil; general retail guidance is 0.25mm (10 mil) and 0.19mm is
// about as low as it is sensible to go on thermal stock.
//
// This matters more than it sounds. A readable SKU like
// "TSHI-BLU-M-0042" is 189 modules wide, and squeezing that onto a
// 38mm garment tag gives bars around 0.167mm -- it will look perfectly
// fine on screen and in the print preview, and then fail to scan at
// the till. Better to say so up front.
export const MIN_X_DIMENSION_MM = 0.19;

/**
 * Works out how wide each narrow bar will actually print, for a given
 * code on a given label stock, so the UI can warn before a whole roll
 * is wasted.
 *
 * @param {string} code
 * @param {'CODE128'|'EAN13'} symbology
 * @param {object} size - a LabelSize
 * @returns {number|null} millimetres per module, or null if the code
 *   can't be encoded at all
 */
export function estimateXDimensionMm(code, symbology, size) {
  let moduleCount;
  try {
    moduleCount = symbology === 'EAN13'
      ? encodeEan13(code).modules.length + 18 // 9-module quiet zone each side
      : encodeCode128(code).length + 20; // 10-module quiet zone each side
  } catch {
    return null;
  }
  const padMm = Math.max(0.8, Math.min(2, size.heightMm * 0.06));
  return (size.widthMm - padMm * 2) / moduleCount;
}

/**
 * Renders one label's inner HTML.
 * @param {LabelItem} item
 * @param {object} size
 * @param {LabelContentOptions} options
 * @returns {string}
 */
function renderLabel(item, size, options) {
  const {
    showStoreName = false,
    showGarmentType = true,
    showName = false,
    showColorSize = true,
    showPrice = true,
    showCodeText = true,
    storeName = '',
    currencySymbol = '\u20B9',
    symbology = 'CODE128'
  } = options;

  // Colour and size share one line -- they're read together ("blue,
  // medium") and on narrow stock two separate lines would leave no
  // room for the bars.
  const colorSizeParts = [item.color, item.size].filter(Boolean);

  const lines = [];
  if (showStoreName && storeName) lines.push({ text: storeName, weight: 600, scale: 0.8 });
  if (showGarmentType && item.garmentType) lines.push({ text: item.garmentType, weight: 700, scale: 1.05 });
  if (showName && item.name) lines.push({ text: item.name, weight: 400, scale: 0.85 });
  if (showColorSize && colorSizeParts.length) {
    lines.push({ text: colorSizeParts.join('  \u00b7  '), weight: 700, scale: 1.15 });
  }

  const metrics = metricsFor(size, lines.length + (showPrice ? 1 : 0));

  let barcodeHtml;
  try {
    barcodeHtml = barcodeSvg(item.code, symbology, {
      widthMm: metrics.barWidthMm,
      heightMm: metrics.barHeightMm,
      caption: showCodeText ? item.code : false,
      captionMm: Math.max(1.4, Math.min(metrics.baseFontMm * 0.78, 2.6))
    });
  } catch (err) {
    // One bad code shouldn't abort a 200-label run -- print a visible
    // placeholder so the operator can see which garment to fix rather
    // than discovering a silent gap after the fact.
    barcodeHtml = `<div class="label-error">${escapeHtml(err.message)}</div>`;
  }

  const textHtml = lines.map((line) => (
    `<div class="label-line" style="font-weight:${line.weight};`
    + `font-size:${(metrics.baseFontMm * line.scale).toFixed(2)}mm">${escapeHtml(line.text)}</div>`
  )).join('');

  let priceHtml = '';
  if (showPrice && (item.price !== undefined && item.price !== null && item.price !== '')) {
    const priceText = `${currencySymbol}${Number(item.price).toFixed(2)}`;
    const showMrp = item.mrp !== undefined && item.mrp !== null && item.mrp !== ''
      && Number(item.mrp) > Number(item.price);
    const mrpHtml = showMrp
      ? `<span class="label-mrp" style="font-size:${(metrics.baseFontMm * 0.8).toFixed(2)}mm">`
        + `MRP ${currencySymbol}${Number(item.mrp).toFixed(2)}</span>`
      : '';
    priceHtml = `<div class="label-price" style="font-size:${(metrics.baseFontMm * 1.2).toFixed(2)}mm">`
      + `${mrpHtml}<span>${escapeHtml(priceText)}</span></div>`;
  }

  return `<div class="label-inner" style="padding:${metrics.padMm.toFixed(2)}mm">`
    + `${textHtml}<div class="label-barcode">${barcodeHtml}</div>${priceHtml}</div>`;
}

/**
 * Expands each item by its quantity into a flat list of labels to
 * print. Quantity is per garment (10 blue medium T-shirts arriving =
 * 10 identical tags), which is the normal case when tagging a
 * delivery.
 * @param {LabelItem[]} items
 * @returns {LabelItem[]}
 */
export function expandByQuantity(items) {
  const expanded = [];
  items.forEach((item) => {
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
    for (let i = 0; i < quantity; i += 1) expanded.push(item);
  });
  return expanded;
}

/**
 * Builds the complete printable document.
 *
 * @param {LabelItem[]} items - already expanded by quantity
 * @param {object} size - a LabelSize from label-sizes.js
 * @param {LabelContentOptions} options
 * @param {number} [skipCount] - sheet stock only: leave this many
 *   positions on the first sheet blank, so a part-used sheet of
 *   peel-off labels can be fed back through instead of binned.
 * @param {number} [labelsAcross] - roll stock only: how many labels
 *   sit side by side across the roll before it feeds to the next row
 *   (2, 3, 4...). Many thermal barcode rolls are printed two or more
 *   labels wide rather than one -- exactly the "single" size chosen
 *   in the dropdown, just laid out in pairs (or triples, etc.) across
 *   the web. Ignored for sheet stock, which already defines its own
 *   column count.
 * @param {'none'|'cw'|'ccw'} [rotate] - some label printers/drivers
 *   rotate every printout 90 degrees relative to how the stock is
 *   actually loaded, and there's no page-content setting (the
 *   browser's own Portrait/Landscape included) that changes that --
 *   it's the driver mapping the declared page size onto the physical
 *   roll in a fixed way. When neither Portrait nor Landscape in the
 *   print dialog fixes a sideways printout, this pre-rotates the
 *   *content* the opposite way and swaps the declared page dimensions
 *   to match, so the two rotations cancel out on paper. Try 'cw'
 *   first; if that comes out upside-down/mirrored instead of fixed,
 *   the printer's rotation is the other direction -- switch to 'ccw'.
 * @returns {string} a full HTML document
 */
export function buildLabelSheetHtml(items, size, options = {}, skipCount = 0, labelsAcross = 1, rotate = 'none') {
  const isSheet = size.kind === 'sheet';
  // A gap between labels sitting side by side on the same roll row --
  // without one, adjacent barcodes' quiet zones touch and a scanner
  // can't tell where one code ends and the next begins.
  const rowGapMm = 2;
  const across = isSheet ? 1 : Math.max(1, Math.floor(labelsAcross) || 1);
  const doRotate = rotate === 'cw' || rotate === 'ccw';

  // The physical size of one whole printed page/row *before* any
  // compensating rotation -- i.e. what the label stock actually is.
  const unitWidthMm = isSheet
    ? size.pageWidthMm
    : across > 1
      ? (size.widthMm * across + rowGapMm * (across - 1)).toFixed(2)
      : size.widthMm;
  const unitHeightMm = isSheet ? size.pageHeightMm : size.heightMm;

  const pageRule = doRotate
    ? `@page { size: ${unitHeightMm}mm ${unitWidthMm}mm; margin: 0; }`
    : `@page { size: ${unitWidthMm}mm ${unitHeightMm}mm; margin: 0; }`;

  // Wraps one already-built page/row unit (a .sheet, .roll-row, or
  // bare .label -- whichever is the top-level printed block for this
  // stock) so it prints rotated. The OUTER div gets the swapped
  // dimensions and carries pagination (page-break-after); the INNER
  // div keeps the unit's real, unrotated size and is what's actually
  // rotated, anchored at its own top-left corner so the swap comes out
  // exactly filling the outer box rather than spilling past it.
  function rotateWrap(unitHtml, isLast) {
    if (!doRotate) return unitHtml;
    const transform = rotate === 'cw'
      ? 'rotate(90deg) translateY(-100%)'
      : 'rotate(-90deg) translateX(-100%)';
    const breakCss = isLast ? '' : 'page-break-after:always;break-after:page;';
    return `<div class="page-rotate-outer" style="width:${unitHeightMm}mm;height:${unitWidthMm}mm;`
      + `position:relative;overflow:hidden;${breakCss}">`
      + `<div style="width:${unitWidthMm}mm;height:${unitHeightMm}mm;`
      + `transform-origin:top left;transform:${transform};">${unitHtml}</div></div>`;
  }

  let bodyHtml;

  if (isSheet) {
    const perPage = size.columns * size.rows;
    // Blank leading cells represent labels already peeled off the
    // sheet.
    const cells = [...Array(Math.max(0, Math.floor(skipCount))).fill(null), ...items];
    const pageCount = Math.max(1, Math.ceil(cells.length / perPage));

    const pages = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageCells = cells.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
      const cellsHtml = pageCells.map((item) => (
        item
          ? `<div class="label">${renderLabel(item, size, options)}</div>`
          : '<div class="label label-blank"></div>'
      )).join('');
      pages.push(rotateWrap(`<div class="sheet">${cellsHtml}</div>`, pageIndex === pageCount - 1));
    }
    bodyHtml = pages.join('');
  } else {
    // Roll stock: one row of `across` labels per page. The printer's
    // own gap sensor handles feeding to the next row. When across is
    // 1 this is exactly the old single-label-per-page behaviour.
    const rows = [];
    for (let i = 0; i < items.length; i += across) {
      const rowItems = items.slice(i, i + across);
      // Pad a short final row with hidden filler cells so the row
      // still spans the full declared page width -- otherwise the
      // last row (e.g. one label left over from a run of 2-across)
      // would print narrower than the roll and drift off-centre.
      while (rowItems.length < across) rowItems.push(null);
      const rowHtml = rowItems.map((item) => (
        item
          ? `<div class="label">${renderLabel(item, size, options)}</div>`
          : '<div class="label label-blank"></div>'
      )).join('');
      const isLastRow = (i + across) >= items.length;
      const unitHtml = across > 1 ? `<div class="roll-row">${rowHtml}</div>` : rowHtml;
      rows.push(doRotate ? rotateWrap(unitHtml, isLastRow) : unitHtml);
    }
    bodyHtml = rows.join('');
  }

  // When rotating, pagination moves to the wrapper this function just
  // added (.page-rotate-outer, with its own inline page-break style
  // per unit above) instead of .sheet/.roll-row/.label -- those keep
  // their normal, unrotated CSS below exactly as before, just nested
  // one level deeper now.
  const sheetCss = isSheet
    ? `
    .sheet {
      width: ${size.pageWidthMm}mm;
      height: ${size.pageHeightMm}mm;
      padding: ${size.marginTopMm}mm 0 0 ${size.marginLeftMm}mm;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(${size.columns}, ${size.widthMm}mm);
      grid-template-rows: repeat(${size.rows}, ${size.heightMm}mm);
      column-gap: ${size.gapXMm}mm;
      row-gap: ${size.gapYMm}mm;
      ${doRotate ? '' : 'page-break-after: always; break-after: page;'}
    }
    ${doRotate ? '' : '.sheet:last-child { page-break-after: auto; break-after: auto; }'}
    .label { width: ${size.widthMm}mm; height: ${size.heightMm}mm; }
    `
    : `
    .label {
      width: ${size.widthMm}mm;
      height: ${size.heightMm}mm;
    }
    ${across > 1 ? `
    .roll-row {
      display: flex;
      gap: ${rowGapMm}mm;
      width: ${unitWidthMm}mm;
      height: ${size.heightMm}mm;
      ${doRotate ? '' : 'page-break-after: always; break-after: page;'}
    }
    ${doRotate ? '' : '.roll-row:last-child { page-break-after: auto; break-after: auto; }'}
    .roll-row .label { flex: 0 0 ${size.widthMm}mm; }
    ` : `
    .label {
      ${doRotate ? '' : 'page-break-after: always; break-after: page;'}
    }
    ${doRotate ? '' : '.label:last-child { page-break-after: auto; break-after: auto; }'}
    `}
    `;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Barcode labels</title>
<style>
  ${pageRule}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    /* Stop the browser helpfully shrinking type on small pages --
       that would change the printed barcode width. */
    -webkit-text-size-adjust: none;
    text-size-adjust: none;
  }
  ${sheetCss}
  .label-blank { visibility: hidden; }
  .label-inner {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    text-align: center;
    line-height: 1.15;
  }
  .label-line {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label-barcode { width: 100%; display: flex; justify-content: center; }
  .label-barcode svg { display: block; max-width: 100%; }
  .label-price {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 1.2mm;
    font-weight: 700;
  }
  .label-mrp { font-weight: 400; text-decoration: line-through; }
  .label-error {
    font-size: 2mm;
    color: #b00;
    padding: 0.5mm;
    text-align: center;
  }
  @media print {
    /* Backgrounds and the barcode's black bars must print as-is; some
       browsers strip them to save ink, which would leave the label
       blank. */
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * Sends the built document to the printer.
 *
 * This goes through a hidden iframe (see shared/print-utils.js) rather
 * than a new window/popup: the app's own stylesheet can't leak into a
 * separate document either way, and unlike `window.open()` this
 * doesn't depend on the runtime allowing a new window to be created --
 * which is exactly what was silently failing when this app is packaged
 * as a Tauri desktop app (labels or receipts would report "the print
 * window was blocked" on some PCs no matter what pop-up settings were
 * changed, because it was never really the OS/browser pop-up blocker
 * involved).
 *
 * @param {string} html
 * @returns {true} kept boolean-returning for existing call sites; a
 *   failure now surfaces as a thrown/rejected error instead, since a
 *   hidden iframe has no "blocked" state to report.
 */
export function openPrintWindow(html) {
  printHtml(html).catch((err) => console.error('Failed to print label sheet:', err));
  return true;
}
