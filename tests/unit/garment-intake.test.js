// tests/unit/garment-intake.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const ProductManager = require('../../core/product-manager');
const InventoryManager = require('../../core/inventory-manager');
const TransactionManager = require('../../core/transaction-manager');
const StoreProfile = require('../../core/store-profile');
const storeConfig = require('../../core/store-config');
const { tagInGarment, findMatchingGarment, defaultName } = require('../../core/garment-intake');

describe('garment intake', () => {
  let dataDir, productManager, inventoryManager, deps;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xeoscape-intake-'));
    storeConfig.setStoreType('apparel');
    productManager = new ProductManager(dataDir);
    inventoryManager = new InventoryManager(dataDir, productManager);
    deps = { productManager, inventoryManager };
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const TEE = { garmentType: 'T-Shirt', color: 'Navy Blue', size: 'M', price: 799 };

  test('a tagged garment lands in inventory with its barcode and stock', async () => {
    const result = await tagInGarment(deps, { ...TEE, quantity: 12 });

    expect(result.created).toBe(true);
    expect(result.newStock).toBe(12);
    expect(result.product.sku).toBe('TSHI-NAV-M-0001');
    expect(result.product.name).toBe('Navy Blue T-Shirt');

    // The whole point: the printed tag has to find a real product.
    const [found] = await productManager.list({ search: result.code });
    expect(found.id).toBe(result.product.id);
    expect(found.stock).toBe(12);
  });

  test('records the arrival as a restock movement, not an opening balance', async () => {
    const { product } = await tagInGarment(deps, { ...TEE, quantity: 12 });
    const history = await inventoryManager.history(product.id);

    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('restock');
    expect(history[0].delta).toBe(12);
    expect(history[0].resultingStock).toBe(12);
  });

  test('a repeat delivery restocks the same barcode instead of duplicating the line', async () => {
    const first = await tagInGarment(deps, { ...TEE, quantity: 5 });
    // Different casing/spacing is the same garment on the rail.
    const second = await tagInGarment(deps, {
      garmentType: 't-shirt', color: '  navy blue ', size: 'M', quantity: 8, price: 799
    });

    expect(second.created).toBe(false);
    expect(second.code).toBe(first.code);
    expect(second.newStock).toBe(13);
    expect(await productManager.list()).toHaveLength(1);
  });

  test('a different colour or size is a different garment', async () => {
    await tagInGarment(deps, { ...TEE, quantity: 5 });
    const otherSize = await tagInGarment(deps, { ...TEE, size: 'L', quantity: 3 });
    const otherColor = await tagInGarment(deps, { ...TEE, color: 'Black', quantity: 4 });

    expect(otherSize.created).toBe(true);
    expect(otherColor.created).toBe(true);
    expect(new Set([otherSize.code, otherColor.code]).size).toBe(2);
    expect(await productManager.list()).toHaveLength(3);
  });

  test('rejects an intake that could not be sold or counted', async () => {
    await expect(tagInGarment(deps, { ...TEE, quantity: 0 })).rejects.toThrow('at least 1');
    await expect(tagInGarment(deps, { ...TEE, quantity: 'lots' })).rejects.toThrow('at least 1');
    await expect(tagInGarment(deps, { ...TEE, size: '', quantity: 1 })).rejects.toThrow('size');
    await expect(tagInGarment(deps, { ...TEE, garmentType: '', quantity: 1 })).rejects.toThrow('garment type');
    await expect(tagInGarment(deps, { garmentType: 'T-Shirt', color: 'Red', size: 'S', quantity: 1 }))
      .rejects.toThrow('selling price');
  });

  test('a partial attribute match is not treated as the same garment', () => {
    // Quietly merging a delivery into the wrong line is worse than a
    // duplicate someone can spot.
    const products = [{ color: 'Navy Blue', size: 'M', garmentType: '' }];
    expect(findMatchingGarment(products, { garmentType: 'T-Shirt', color: 'Navy Blue', size: 'M' })).toBeNull();
  });

  test('names the garment from what was typed', () => {
    expect(defaultName({ garmentType: 'Cargo Pant', color: 'Olive' })).toBe('Olive Cargo Pant');
    expect(defaultName({ garmentType: 'Half Pant', color: 'Khaki', brand: 'Levis' })).toBe('Levis Khaki Half Pant');
    expect(defaultName({})).toBe('Garment');
  });
});

describe('tag -> sale -> stock loop', () => {
  let dataDir, productManager, inventoryManager, transactionManager, deps;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xeoscape-loop-'));
    storeConfig.setStoreType('apparel');
    productManager = new ProductManager(dataDir);
    inventoryManager = new InventoryManager(dataDir, productManager);
    const storeProfile = new StoreProfile(dataDir);
    await storeProfile.update({ chargeTax: false });
    transactionManager = new TransactionManager(dataDir, productManager, inventoryManager, storeProfile);
    deps = { productManager, inventoryManager };
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('scanning a printed tag sells the garment and takes it off stock', async () => {
    const { product, code } = await tagInGarment(deps, {
      garmentType: 'Cargo Pant', color: 'Olive', size: '32', quantity: 13, price: 1499
    });

    // Scanning at the POS is a barcode lookup against the catalogue.
    const [scanned] = await productManager.list({ search: code });
    expect(scanned.id).toBe(product.id);

    await transactionManager.checkout({ items: [{ productId: scanned.id, quantity: 3 }] });

    expect((await productManager.get(product.id)).stock).toBe(10);

    const history = await inventoryManager.history(product.id);
    expect(history.map((m) => m.type)).toEqual(['restock', 'sale']);
    expect(history[1].delta).toBe(-3);
  });

  test('cannot sell more garments than were tagged in', async () => {
    const { product } = await tagInGarment(deps, {
      garmentType: 'Shirt', color: 'White', size: 'L', quantity: 2, price: 999
    });

    await expect(
      transactionManager.checkout({ items: [{ productId: product.id, quantity: 5 }] })
    ).rejects.toThrow('Insufficient stock');

    expect((await productManager.get(product.id)).stock).toBe(2);
  });

  test('a return puts the garment back on the rail', async () => {
    const { product } = await tagInGarment(deps, {
      garmentType: 'Kurta', color: 'Maroon', size: 'XL', quantity: 6, price: 1299
    });

    const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }] });
    expect((await productManager.get(product.id)).stock).toBe(4);

    await transactionManager.returnItems(sale.id, {
      items: [{ productId: product.id, quantity: 1 }],
      reason: 'Wrong size'
    });
    expect((await productManager.get(product.id)).stock).toBe(5);
  });
});
