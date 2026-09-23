// assets/js/modules/labels/label-sizes.js
// The label stock the barcode printer is loaded with. Everything is in
// millimetres, because that's how label stock is sold and how CSS
// @page sizing needs it -- working in pixels would make the printed
// size depend on the browser's DPI assumption, which is exactly the
// bug that makes barcodes come out unscannably small.
//
// Two families:
//   * roll  -- a thermal barcode printer (TSC, Zebra, Godex...) fed
//              with a continuous roll. One label = one page.
//   * sheet -- A4 sheets of peel-off labels run through an ordinary
//              office printer. Many labels per page, laid out on a
//              grid whose margins have to match the sheet exactly or
//              every label after the first prints creeping off-centre.

/**
 * @typedef {object} LabelSize
 * @property {string} id
 * @property {string} label            shown in the dropdown
 * @property {'roll'|'sheet'} kind
 * @property {number} widthMm          one label's width
 * @property {number} heightMm         one label's height
 * @property {number} [columns]        sheet only: labels across
 * @property {number} [rows]           sheet only: labels down
 * @property {number} [pageWidthMm]    sheet only
 * @property {number} [pageHeightMm]   sheet only
 * @property {number} [marginTopMm]    sheet only: unprintable top edge
 * @property {number} [marginLeftMm]   sheet only: unprintable left edge
 * @property {number} [gapXMm]         sheet only: gutter between columns
 * @property {number} [gapYMm]         sheet only: gutter between rows
 * @property {number} [defaultAcross]  roll only: how many labels this
 *   stock is normally sold/printed side by side (a "2UP"/"3UP" roll).
 *   Applied to the Labels-across control when this size is picked, so
 *   choosing the preset is enough -- see syncSizeDependentControls()
 *   in settings/barcode-labels.js and the sizeSelect handler in
 *   labels/label-quick-print.js.
 */

/** @type {LabelSize[]} */
export const LABEL_SIZES = [
  // --- Thermal roll stock, smallest first ---------------------------
  {
    id: 'roll-32x19',
    label: 'Roll \u2014 32 \u00d7 19 mm (small hang tag)',
    kind: 'roll',
    widthMm: 32,
    heightMm: 19
  },
  {
    id: 'roll-38x25',
    label: 'Roll \u2014 38 \u00d7 25 mm (standard garment tag)',
    kind: 'roll',
    widthMm: 38,
    heightMm: 25
  },
  {
    id: 'roll-40x30',
    label: 'Roll \u2014 40 \u00d7 30 mm',
    kind: 'roll',
    widthMm: 40,
    heightMm: 30
  },
  {
    id: 'roll-50x25',
    label: 'Roll \u2014 50 \u00d7 25 mm (wide, fits long SKUs)',
    kind: 'roll',
    widthMm: 50,
    heightMm: 25
  },
  {
    // The precise metric conversion of "2 x 1 inch" -- not the same
    // as the roll-50x25 entry above, which is a separately-sold,
    // genuinely rounded-to-50mm stock. Sold near-universally as a
    // "2UP" roll (two labels printed side by side before the roll
    // feeds to the next pair), so it defaults "Labels across" to 2 --
    // see defaultAcross below and how syncSizeDependentControls() /
    // refreshPreview() apply it in settings/barcode-labels.js and
    // labels/label-quick-print.js.
    id: 'roll-50.8x25.4-2up',
    label: 'Roll \u2014 2 \u00d7 1 in / 50.8 \u00d7 25.4 mm, 2UP (common generic chromo roll)',
    kind: 'roll',
    widthMm: 50.8,
    heightMm: 25.4,
    defaultAcross: 2
  },
  {
    id: 'roll-50x30',
    label: 'Roll \u2014 50 \u00d7 30 mm',
    kind: 'roll',
    widthMm: 50,
    heightMm: 30
  },
  {
    id: 'roll-58x40',
    label: 'Roll \u2014 58 \u00d7 40 mm (price + care detail)',
    kind: 'roll',
    widthMm: 58,
    heightMm: 40
  },
  {
    id: 'roll-75x50',
    label: 'Roll \u2014 75 \u00d7 50 mm (large / carton)',
    kind: 'roll',
    widthMm: 75,
    heightMm: 50
  },

  // --- A4 sheets of peel-off labels ---------------------------------
  // Dimensions follow the common Avery layouts these sheets are sold
  // as, since generic supermarket sheets copy them.
  {
    id: 'sheet-a4-65',
    label: 'A4 sheet \u2014 65 per page (38.1 \u00d7 21.2 mm)',
    kind: 'sheet',
    widthMm: 38.1,
    heightMm: 21.2,
    columns: 5,
    rows: 13,
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 10.7,
    marginLeftMm: 4.75,
    gapXMm: 2.5,
    gapYMm: 0
  },
  {
    id: 'sheet-a4-24',
    label: 'A4 sheet \u2014 24 per page (63.5 \u00d7 33.9 mm)',
    kind: 'sheet',
    widthMm: 63.5,
    heightMm: 33.9,
    columns: 3,
    rows: 8,
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 12.7,
    marginLeftMm: 7.2,
    gapXMm: 2.5,
    gapYMm: 0
  },
  {
    id: 'sheet-a4-21',
    label: 'A4 sheet \u2014 21 per page (63.5 \u00d7 38.1 mm)',
    kind: 'sheet',
    widthMm: 63.5,
    heightMm: 38.1,
    columns: 3,
    rows: 7,
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 15.1,
    marginLeftMm: 7.2,
    gapXMm: 2.5,
    gapYMm: 0
  },
  {
    id: 'sheet-a4-14',
    label: 'A4 sheet \u2014 14 per page (99.1 \u00d7 38.1 mm)',
    kind: 'sheet',
    widthMm: 99.1,
    heightMm: 38.1,
    columns: 2,
    rows: 7,
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 15.1,
    marginLeftMm: 4.65,
    gapXMm: 2.5,
    gapYMm: 0
  }
];

export const DEFAULT_LABEL_SIZE_ID = 'roll-38x25';

export function findLabelSize(id) {
  return LABEL_SIZES.find((size) => size.id === id) || null;
}

/**
 * Builds a one-off LabelSize from user-entered dimensions, for stock
 * that isn't in the list above. Custom stock is treated as a roll
 * (one label per page) because we can't know the grid of an arbitrary
 * sheet, and guessing wrong wastes a whole sheet of labels.
 *
 * @param {number} widthMm
 * @param {number} heightMm
 * @returns {LabelSize}
 */
export function customLabelSize(widthMm, heightMm) {
  const width = Number(widthMm);
  const height = Number(heightMm);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 15 || height < 8) {
    throw new Error('Custom labels must be at least 15 mm wide and 8 mm tall for the barcode to scan.');
  }
  if (width > 210 || height > 297) {
    throw new Error('Custom labels cannot be larger than an A4 page.');
  }
  return {
    id: 'custom',
    label: `Custom \u2014 ${width} \u00d7 ${height} mm`,
    kind: 'roll',
    widthMm: width,
    heightMm: height
  };
}

/** How many labels fit on one page of this stock. */
export function labelsPerPage(size) {
  return size.kind === 'sheet' ? size.columns * size.rows : 1;
}
