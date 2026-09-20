// tests/unit/barcode.test.js

const { ean13CheckDigit, ean13FromSequence, skuFromAttributes, generateBarcodes } = require('../../core/barcode');

/** Minimal stand-in for ProductManager -- generateBarcodes only reads. */
function fakeProductManager(skus) {
  return { listAllStoreTypes: async () => skus.map((sku) => ({ sku })) };
}

describe('EAN-13 check digits', () => {
  test('matches known real-world barcodes', () => {
    expect(ean13CheckDigit('590123412345')).toBe(7);
    expect(ean13CheckDigit('400638133393')).toBe(1);
  });

  test('rejects anything that is not exactly 12 digits', () => {
    expect(() => ean13CheckDigit('12345')).toThrow('exactly 12 digits');
    expect(() => ean13CheckDigit('abcdefghijkl')).toThrow('exactly 12 digits');
  });

  test('sequence codes use the in-store 20-prefix and carry a valid check digit', () => {
    const code = ean13FromSequence(1);
    expect(code).toBe('2000000000015');
    expect(code.startsWith('20')).toBe(true);

    // Every generated code must self-verify, or scanners reject it.
    for (const sequence of [1, 2, 99, 1000, 987654321]) {
      const generated = ean13FromSequence(sequence);
      expect(generated).toHaveLength(13);
      expect(ean13CheckDigit(generated.slice(0, 12))).toBe(Number(generated[12]));
    }
  });

  test('refuses a sequence too large to fit the format', () => {
    expect(() => ean13FromSequence(12345678901)).toThrow('Run out of in-store barcode numbers');
  });
});

describe('readable CODE128 SKUs', () => {
  test('leads with the garment attributes staff actually read', () => {
    expect(skuFromAttributes({ garmentType: 'T-Shirt', color: 'Blue', size: 'M' }, 42))
      .toBe('TSHI-BLU-M-0042');
    expect(skuFromAttributes({ garmentType: 'Cargo Pant', color: 'Olive', size: '32' }, 7))
      .toBe('CARG-OLI-32-0007');
    expect(skuFromAttributes({ garmentType: 'Half Pant', color: 'Khaki', size: 'L', brand: 'Levis' }, 3))
      .toBe('LEV-HALF-KHA-L-0003');
  });

  test('skips blank attributes instead of leaving empty segments', () => {
    expect(skuFromAttributes({ size: 'XL' }, 5)).toBe('XL-0005');
    expect(skuFromAttributes({}, 1)).toBe('0001');
  });

  test('falls back to category for products predating the Garment Type field', () => {
    expect(skuFromAttributes({ category: 'Shirts', color: 'Red', size: 'S' }, 9))
      .toBe('SHIR-RED-S-0009');
  });

  test('strips punctuation and spaces so the code stays CODE128-safe', () => {
    expect(skuFromAttributes({ garmentType: 'T-Shirt', color: 'Off White' }, 1))
      .toBe('TSHI-OFF-0001');
  });
});

describe('allocating barcodes', () => {
  test('skips codes already used in the catalogue', async () => {
    const productManager = fakeProductManager(['2000000000015', '2000000000022']);
    const codes = await generateBarcodes({ productManager }, { symbology: 'EAN13', count: 2 });
    expect(codes).toEqual(['2000000000039', '2000000000046']);
  });

  test('never repeats a code within one batch', async () => {
    const productManager = fakeProductManager([]);
    const codes = await generateBarcodes({ productManager }, { symbology: 'EAN13', count: 50 });
    expect(new Set(codes).size).toBe(50);
  });

  test('checks uniqueness across every store type, not just the active one', async () => {
    // listAllStoreTypes() is used deliberately: a scanner at the till
    // has no idea which store type a product was filed under, so a
    // collision there is a real mis-scan.
    const productManager = fakeProductManager(['TSHI-BLU-M-0001']);
    const codes = await generateBarcodes({ productManager }, {
      symbology: 'CODE128',
      count: 1,
      attributes: { garmentType: 'T-Shirt', color: 'Blue', size: 'M' }
    });
    expect(codes).toEqual(['TSHI-BLU-M-0002']);
  });

  test('defaults to a single EAN-13 and caps an oversized request', async () => {
    const productManager = fakeProductManager([]);
    expect(await generateBarcodes({ productManager }, {})).toHaveLength(1);
    expect(await generateBarcodes({ productManager }, { count: 10000 })).toHaveLength(500);
  });

  test('ignores blank SKUs in the catalogue rather than treating them as taken', async () => {
    const productManager = fakeProductManager(['', null, undefined, '  ']);
    const codes = await generateBarcodes({ productManager }, { symbology: 'EAN13', count: 1 });
    expect(codes).toEqual(['2000000000015']);
  });
});
