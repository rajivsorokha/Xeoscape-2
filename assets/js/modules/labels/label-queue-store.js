// assets/js/modules/labels/label-queue-store.js
// The barcode label print queue, shared between the product table
// ("Add to label queue" on ticked products) and Settings -> Barcode
// Labels (where the queue is reviewed, edited and printed).
//
// It lives at module level rather than inside the Settings panel so it
// survives leaving the panel: tick products on the Products screen,
// add them, close the popup, open Settings later, and they're still
// waiting there. It is held in memory only, so restarting the app
// starts with an empty queue.

/** @type {Array<object>} the same array instance is used by every consumer */
export const labelQueue = [];

let seq = 0;

/** Set to true to make Settings open on the Barcode Labels section next time it mounts. */
export const labelQueueNav = { openBarcodeLabels: false };

/** Default label count for a product: one tag per piece in stock, at least 1. */
export function defaultLabelQuantity(product) {
  return Math.max(1, Math.floor(Number(product.stock) || 0));
}

/**
 * Adds products to the queue. A product already queued (same barcode)
 * has its count increased instead of getting a second row, matching
 * what the panel's own catalogue search does.
 * @returns {{ added: number, merged: number, skipped: object[] }}
 */
export function addProductsToLabelQueue(products, quantityFor = defaultLabelQuantity) {
  let added = 0;
  let merged = 0;
  const skipped = [];
  products.forEach((product) => {
    if (!product.sku) { skipped.push(product); return; }
    const quantity = quantityFor(product);
    const existing = labelQueue.find((row) => row.code === product.sku);
    if (existing) {
      existing.quantity += quantity;
      merged += 1;
      return;
    }
    seq += 1;
    labelQueue.push({
      id: `sq${seq}`,
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
    added += 1;
  });
  return { added, merged, skipped };
}
