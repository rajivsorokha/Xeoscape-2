// tests/unit/csv-helpers.test.js

const { buildTemplateCsv, parseCsvAgainstSchema } = require('../../core/csv-helpers');

const PRODUCT_FIELDS = [
  { key: 'name', label: 'Product Name', type: 'text', required: true },
  { key: 'sku', label: 'SKU', type: 'text', required: true },
  { key: 'price', label: 'Price', type: 'currency', required: true },
  { key: 'category', label: 'Category', type: 'text', required: false },
  { key: 'stock', label: 'Stock Quantity', type: 'number', required: true }
];

describe('csv-helpers', () => {
  describe('buildTemplateCsv', () => {
    test('generates a header row matching field keys plus one example row', () => {
      const csv = buildTemplateCsv(PRODUCT_FIELDS);
      const lines = csv.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('name,sku,price,category,stock');
    });
  });

  describe('parseCsvAgainstSchema', () => {
    test('parses valid rows and coerces numbers/currency', () => {
      const csv = 'name,sku,price,category,stock\nWidget,WID-1,9.99,Gadgets,10\n';
      const { rows, errors } = parseCsvAgainstSchema(Buffer.from(csv), PRODUCT_FIELDS);
      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(1);
      expect(rows[0].data).toEqual({ name: 'Widget', sku: 'WID-1', price: 9.99, category: 'Gadgets', stock: 10 });
      expect(rows[0].rowNumber).toBe(2);
    });

    test('flags rows missing a required field', () => {
      const csv = 'name,sku,price,category,stock\n,WID-1,9.99,Gadgets,10\n';
      const { rows, errors } = parseCsvAgainstSchema(Buffer.from(csv), PRODUCT_FIELDS);
      expect(rows).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/Product Name is required/);
    });

    test('flags a non-numeric value in a number/currency column', () => {
      const csv = 'name,sku,price,category,stock\nWidget,WID-1,abc,Gadgets,10\n';
      const { rows, errors } = parseCsvAgainstSchema(Buffer.from(csv), PRODUCT_FIELDS);
      expect(rows).toHaveLength(0);
      expect(errors[0].message).toMatch(/not a valid number/);
    });

    test('handles quoted fields containing commas', () => {
      const csv = 'name,sku,price,category,stock\n"Widget, Deluxe",WID-2,12.5,Gadgets,5\n';
      const { rows, errors } = parseCsvAgainstSchema(Buffer.from(csv), PRODUCT_FIELDS);
      expect(errors).toHaveLength(0);
      expect(rows[0].data.name).toBe('Widget, Deluxe');
    });

    test('coerces boolean-typed fields from common truthy/falsy strings', () => {
      const fields = [...PRODUCT_FIELDS, { key: 'disableStockCheck', label: 'Disable stock check', type: 'boolean', required: false }];
      const csv = 'name,sku,price,category,stock,disableStockCheck\nWidget,WID-1,9.99,Gadgets,10,true\n';
      const { rows, errors } = parseCsvAgainstSchema(Buffer.from(csv), fields);
      expect(errors).toHaveLength(0);
      expect(rows[0].data.disableStockCheck).toBe(true);
    });

    test('continues parsing subsequent rows after an earlier row has an error', () => {
      const csv = 'name,sku,price,category,stock\n,WID-1,9.99,Gadgets,10\nWidget2,WID-2,5,Gadgets,3\n';
      const { rows, errors } = parseCsvAgainstSchema(Buffer.from(csv), PRODUCT_FIELDS);
      expect(errors).toHaveLength(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].data.name).toBe('Widget2');
      expect(rows[0].rowNumber).toBe(3);
    });
  });
});
