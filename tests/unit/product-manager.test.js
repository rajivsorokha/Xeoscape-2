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
    storeConfig.setStoreType('generalRetail');
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
    expect(product.storeType).toBe('generalRetail');
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

  test('creates a pharmacy product with expiry/minStock fields', async () => {
    storeConfig.setStoreType('pharmacy');
    const product = await productManager.create({
      name: 'Amoxicillin',
      sku: '123456789',
      price: 12.5,
      stock: 20,
      minStock: 10,
      expirationDate: '2027-01-01',
      supplier: 'Acme Pharma'
    });
    expect(product.storeType).toBe('pharmacy');
    expect(product.minStock).toBe(10);
    expect(product.expirationDate).toBe('2027-01-01');
    storeConfig.setStoreType('generalRetail');
  });

  describe('category auto-creation', () => {
    // A product's `category` was always just free text with no link
    // to the actual categories collection -- creating/importing
    // products never made the category appear on the Categories
    // screen, even though the text showed up fine on the product
    // itself. This closes that gap.
    const SqliteStore = require('../../core/sqlite-store');

    test('creating a product with a brand-new category name auto-creates a matching category record', async () => {
      await productManager.create({ name: 'Widget', sku: 'W1', price: 5, stock: 1, category: 'Brand New Category' });

      const categoriesDb = new SqliteStore(dataDir, 'categories');
      const categories = await categoriesDb.readAll();
      expect(categories.some((c) => c.name === 'Brand New Category')).toBe(true);
    });

    test('does not create a duplicate category (case-insensitive) for a category that already exists', async () => {
      await productManager.create({ name: 'Widget A', sku: 'WA', price: 5, stock: 1, category: 'Snacks' });
      await productManager.create({ name: 'Widget B', sku: 'WB', price: 5, stock: 1, category: 'snacks' }); // different case

      const categoriesDb = new SqliteStore(dataDir, 'categories');
      const categories = await categoriesDb.readAll();
      expect(categories.filter((c) => c.name.toLowerCase() === 'snacks')).toHaveLength(1);
    });

    test('updating a product to a new category also auto-creates it', async () => {
      const product = await productManager.create({ name: 'Widget', sku: 'W2', price: 5, stock: 1, category: 'Original' });
      await productManager.update(product.id, { category: 'Renamed Category' });

      const categoriesDb = new SqliteStore(dataDir, 'categories');
      const categories = await categoriesDb.readAll();
      expect(categories.some((c) => c.name === 'Renamed Category')).toBe(true);
    });

    test('a product with no category set does not create anything', async () => {
      await productManager.create({ name: 'Widget', sku: 'W3', price: 5, stock: 1 });

      const categoriesDb = new SqliteStore(dataDir, 'categories');
      const categories = await categoriesDb.readAll();
      expect(categories).toHaveLength(0);
    });
  });
});
