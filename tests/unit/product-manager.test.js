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
});
