// core/garment-intake.js
// "A delivery arrived -- tag it and put it into stock."
//
// This is the operation behind quick entry in Settings -> Barcode
// Labels. It exists because printing a barcode is only half the job:
// a tag that isn't backed by a product in the catalogue scans to
// nothing at the till, sells nothing, and deducts nothing. Allocating
// the code, creating the product and booking the stock in have to
// happen together or not at all.
//
// The matching rule below is the important part. Twelve navy medium
// tees arriving today and eight more next month are the *same* line
// on the rail: they must share one barcode and one stock figure, not
// become two products whose totals have to be added up by hand. So an
// intake looks for an existing garment with the same type, colour and
// size first, and only creates a new product when there isn't one.

const { generateBarcodes } = require('./barcode');

/** Case/whitespace-insensitive compare for matching garment attributes. */
function normalise(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Finds the garment already in the catalogue matching this type,
 * colour and size, if any.
 *
 * Requires all three to be present and to match. A partial match
 * (same colour and size, no type recorded) is deliberately NOT
 * treated as the same garment -- quietly merging a delivery into the
 * wrong product line is far more damaging than creating a duplicate
 * someone can spot and merge later.
 */
function findMatchingGarment(products, { garmentType, color, size }) {
  if (!garmentType || !color || !size) return null;
  return products.find((product) => (
    normalise(product.garmentType) === normalise(garmentType)
    && normalise(product.color) === normalise(color)
    && normalise(product.size) === normalise(size)
  )) || null;
}

/**
 * Builds a default product name from what the operator typed, so
 * quick entry doesn't force them to invent one: "Navy Blue T-Shirt".
 */
function defaultName({ garmentType, color, brand }) {
  const parts = [brand, color, garmentType].map((part) => String(part ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : 'Garment';
}

/**
 * Tags a garment and books it into stock in one go.
 *
 * Either restocks the matching product that already exists, or
 * allocates a barcode and creates it. Stock is always moved through
 * inventoryManager.restock() rather than written directly, so the
 * arrival shows up in stock-movement history and the Stock on Hand
 * report like any other restock.
 *
 * @param {object} deps
 * @param {object} deps.productManager
 * @param {object} deps.inventoryManager
 * @param {object} options
 * @param {string} options.garmentType
 * @param {string} options.color
 * @param {string} options.size
 * @param {number} options.quantity      how many arrived
 * @param {number} [options.price]       required when creating
 * @param {number} [options.mrp]
 * @param {string} [options.brand]
 * @param {string} [options.name]        defaults from the attributes
 * @param {'CODE128'|'EAN13'} [options.symbology]
 * @returns {Promise<{product: object, code: string, created: boolean, added: number, newStock: number}>}
 */
async function tagInGarment({ productManager, inventoryManager }, {
  garmentType,
  color,
  size,
  quantity,
  price,
  mrp = null,
  brand = '',
  name = '',
  symbology = 'CODE128'
} = {}) {
  const added = Math.floor(Number(quantity));
  if (!Number.isFinite(added) || added < 1) {
    throw new Error('Enter how many garments arrived (at least 1).');
  }
  if (!garmentType) throw new Error('Pick a garment type.');
  if (!size) throw new Error('Pick a size.');

  const existing = findMatchingGarment(await productManager.list(), { garmentType, color, size });

  if (existing) {
    // Same line on the rail -- reuse its barcode so both deliveries
    // scan to one product, and book the arrival as a restock.
    await inventoryManager.restock(existing.id, added, 'Stock-in via barcode labels');
    const updated = await productManager.get(existing.id);
    return {
      product: updated,
      code: updated.sku,
      created: false,
      added,
      newStock: updated.stock || 0
    };
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new Error('Enter a selling price for this garment.');
  }

  const [code] = await generateBarcodes({ productManager }, {
    symbology,
    count: 1,
    attributes: { garmentType, color, size, brand }
  });

  // Created at zero stock, then restocked, so the arrival is recorded
  // as a movement rather than appearing from nowhere as an opening
  // balance. The Stock on Hand and Low Stock reports both read that
  // history.
  const product = await productManager.create({
    name: name.trim() || defaultName({ garmentType, color, brand }),
    sku: code,
    garmentType,
    color: color || '',
    size,
    brand: brand || '',
    price: numericPrice,
    ...(mrp === null || mrp === '' ? {} : { mrp: Number(mrp) }),
    stock: 0
  });

  await inventoryManager.restock(product.id, added, 'Stock-in via barcode labels');
  const stocked = await productManager.get(product.id);

  return {
    product: stocked,
    code,
    created: true,
    added,
    newStock: stocked.stock || 0
  };
}

module.exports = { tagInGarment, findMatchingGarment, defaultName };
