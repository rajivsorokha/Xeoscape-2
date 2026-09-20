// core/barcode.js
// Allocates new, unique barcodes for garment inventory.
//
// Deliberately server-side: "is this code already taken?" can only be
// answered against the product catalogue, and two tills adding stock
// at once must not be handed the same number. Rendering a code (the
// bar patterns themselves) is a separate, purely arithmetic concern
// and lives in assets/js/shared/barcode.js for the browser.
//
// The EAN-13 check-digit routine below is duplicated there. That's a
// deliberate five-line duplication rather than a shared module: the
// frontend is served as ES modules straight to the browser with no
// bundler (see gulpfile.js), so a require()-able shared file would
// mean introducing a build step for the sake of one small function.

// GS1 reserves prefix 20-29 for "restricted distribution" -- barcodes
// used only inside one store or chain. Allocating in-store codes there
// guarantees they can never collide with a real manufacturer's GTIN
// printed on a branded garment.
const IN_STORE_PREFIX = '20';

/**
 * EAN-13 check digit for 12 digits: weights alternate 1,3,1,3..., then
 * take whatever is needed to reach the next multiple of 10.
 * @param {string} first12
 * @returns {number}
 */
function ean13CheckDigit(first12) {
  const digits = String(first12).slice(0, 12).split('').map(Number);
  if (digits.length !== 12 || digits.some(Number.isNaN)) {
    throw new Error('An EAN-13 check digit needs exactly 12 digits.');
  }
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * Builds the in-store EAN-13 for a given sequence number. Sequence 1
 * is 2000000000015, 2 is 2000000000022, and so on -- ten digits of
 * room, far more than any single shop will use.
 * @param {number} sequence
 * @returns {string}
 */
function ean13FromSequence(sequence) {
  const body = String(Math.floor(sequence)).padStart(10, '0');
  if (body.length > 10) throw new Error('Run out of in-store barcode numbers.');
  const first12 = IN_STORE_PREFIX + body;
  return first12 + String(ean13CheckDigit(first12));
}

function abbreviate(text, length) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length);
}

/**
 * Builds a readable CODE128 SKU from the garment's own attributes --
 * type, colour and size are what staff actually use to tell two
 * hangers apart, so they lead: "TSHI-BLU-M-0042",
 * "CARG-BLK-32-0117". Blank attributes are skipped rather than
 * leaving empty segments, so a garment with no brand recorded still
 * gets a sensible code.
 *
 * Readability is the point. A stock count, a returns desk, or a
 * mis-filed rail can all be sorted out by reading the tag, without a
 * scanner and without looking the code up.
 *
 * @param {object} attributes - garmentType, color, size, brand
 * @param {number} sequence
 * @returns {string}
 */
function skuFromAttributes({ garmentType, brand, category, color, size } = {}, sequence = 1) {
  const segments = [
    abbreviate(brand, 3),
    // Fall back to the free-text category when no garment type is set,
    // so older products created before the Garment Type field existed
    // still generate a meaningful code rather than a bare number.
    abbreviate(garmentType || category, 4),
    abbreviate(color, 3),
    abbreviate(size, 4)
  ].filter(Boolean);
  segments.push(String(Math.floor(sequence)).padStart(4, '0'));
  return segments.join('-');
}

/**
 * Allocates `count` barcodes that no product in the catalogue is
 * already using.
 *
 * Uniqueness is checked against every product regardless of store type
 * (not just the active one): a barcode identifies a physical garment
 * on a shelf, and a scanner at the till has no idea which store type a
 * code was filed under, so a collision would be a real-world
 * mis-scan even if the two products never appear in the same list.
 *
 * @param {object} deps
 * @param {{ list: Function }} deps.productManager
 * @param {object} options
 * @param {'EAN13'|'CODE128'} [options.symbology]
 * @param {number} [options.count]
 * @param {object} [options.attributes] - brand/category/color/size, CODE128 only
 * @returns {Promise<string[]>}
 */
async function generateBarcodes({ productManager }, { symbology = 'EAN13', count = 1, attributes = {} } = {}) {
  const requested = Math.max(1, Math.min(Number(count) || 1, 500));

  // Include products from every store type -- see note above.
  const allProducts = await productManager.listAllStoreTypes();
  const taken = new Set(allProducts.map((product) => String(product.sku || '').trim()).filter(Boolean));

  const allocated = [];
  let sequence = 1;
  // Bounded so a corrupt catalogue can never spin here forever; the
  // ceiling is far above any realistic number of SKUs.
  const maxAttempts = taken.size + requested + 100000;

  while (allocated.length < requested) {
    if (sequence > maxAttempts) {
      throw new Error('Could not find a free barcode -- check the catalogue for duplicate SKUs.');
    }
    const candidate = symbology === 'CODE128'
      ? skuFromAttributes(attributes, sequence)
      : ean13FromSequence(sequence);
    sequence += 1;

    if (taken.has(candidate)) continue;
    taken.add(candidate); // so a batch never repeats within itself
    allocated.push(candidate);
  }

  return allocated;
}

module.exports = {
  ean13CheckDigit,
  ean13FromSequence,
  skuFromAttributes,
  generateBarcodes
};
