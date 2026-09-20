// tests/unit/product-manager.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const ProductManager = require('../../core/product-manager');
const storeConfig = require('../../core/store-config');

describe('ProductManager', () => {
  let dataDir;
  let productManager;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-test-'));
    storeConfig.setStoreType('apparel');
    productManager = new ProductManager(dataDir);
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('creates a product with required fields', async () => {
    const product = await productManager.create({
      name: 'Widget',
      sku: 'WID-001',
      price: 9.99,
      stock: 10
    });

    expect(product.id).toBeDefined();
    expect(product.name).toBe('Widget');
    expect(product.storeType).toBe('apparel');
  });

  test('rejects product creation missing required fields', async () => {
    await expect(productManager.create({ name: 'Incomplete' })).rejects.toThrow('Validation failed');
  });

  test('lists and filters products by search term', async () => {
    await productManager.create({ name: 'Red Mug', sku: 'MUG-RED', price: 5, stock: 3 });
    await productManager.create({ name: 'Blue Mug', sku: 'MUG-BLUE', price: 5, stock: 3 });
    await productManager.create({ name: 'Notebook', sku: 'NB-001', price: 2, stock: 20 });

    const results = await productManager.list({ search: 'mug' });
    expect(results).toHaveLength(2);
  });

  test('updates a product', async () => {
    const product = await productManager.create({ name: 'Widget', sku: 'WID-002', price: 9.99, stock: 10 });
    const updated = await productManager.update(product.id, { price: 12.5 });
    expect(updated.price).toBe(12.5);
  });

  test('removes a product', async () => {
    const product = await productManager.create({ name: 'Widget', sku: 'WID-003', price: 9.99, stock: 10 });
    const removed = await productManager.remove(product.id);
    expect(removed).toBe(true);
    expect(await productManager.get(product.id)).toBeNull();
  });

  test('creates an apparel product with its garment-specific fields', async () => {
    const product = await productManager.create({
      name: 'Round Neck Tee',
      sku: 'TSHI-NAV-M-0001',
      garmentType: 'T-Shirt',
      color: 'Navy Blue',
      size: 'M',
      material: '100% Cotton',
      mrp: 1299,
      price: 799,
      stock: 20,
      minStock: 5
    });
    expect(product.storeType).toBe('apparel');
    expect(product.garmentType).toBe('T-Shirt');
    expect(product.color).toBe('Navy Blue');
    expect(product.size).toBe('M');
    expect(product.minStock).toBe(5);
  });

  describe('filtering the catalog', () => {
    // There is no separate Categories feature for this apparel-only
    // build -- garmentType (a field on the product itself) is what
    // the POS catalog and Products screen filter by instead. `category`
    // is still accepted as a plain filter for any older data that has
    // it, even though it's no longer a field on the form.
    test('list() can filter by garmentType', async () => {
      await productManager.create({ name: 'Tee', sku: 'T1', garmentType: 'T-Shirt', price: 5, stock: 1 });
      await productManager.create({ name: 'Cargo', sku: 'C1', garmentType: 'Cargo Pant', price: 5, stock: 1 });

      const tees = await productManager.list({ garmentType: 'T-Shirt' });
      expect(tees.map((p) => p.sku)).toEqual(['T1']);
    });

    test('list() can still filter by the legacy category field', async () => {
      await productManager.create({ name: 'Old Stock', sku: 'O1', category: 'Legacy Bin', price: 5, stock: 1 });
      await productManager.create({ name: 'Tee', sku: 'T2', garmentType: 'T-Shirt', price: 5, stock: 1 });

      const legacy = await productManager.list({ category: 'Legacy Bin' });
      expect(legacy.map((p) => p.sku)).toEqual(['O1']);
    });
  });
});
