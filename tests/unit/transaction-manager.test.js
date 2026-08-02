// tests/unit/transaction-manager.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const ProductManager = require('../../core/product-manager');
const InventoryManager = require('../../core/inventory-manager');
const TransactionManager = require('../../core/transaction-manager');
const storeConfig = require('../../core/store-config');

describe('TransactionManager', () => {
  let dataDir, productManager, inventoryManager, transactionManager, product;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-test-'));
    storeConfig.setStoreType('generalRetail');
    productManager = new ProductManager(dataDir);
    inventoryManager = new InventoryManager(dataDir, productManager);
    transactionManager = new TransactionManager(dataDir, productManager, inventoryManager);

    product = await productManager.create({ name: 'Widget', sku: 'WID-100', price: 10, stock: 5 });
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('processes a checkout and deducts stock', async () => {
    const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }] });

    expect(txn.total).toBe(20);
    expect(txn.status).toBe('completed');
    expect((await productManager.get(product.id)).stock).toBe(3);
  });

  test('applies a discount to the total', async () => {
    const txn = await transactionManager.checkout({
      items: [{ productId: product.id, quantity: 2 }],
      discount: 5
    });
    expect(txn.total).toBe(15);
  });

  test('rejects checkout when stock is insufficient', async () => {
    await expect(
      transactionManager.checkout({ items: [{ productId: product.id, quantity: 100 }] })
    ).rejects.toThrow('Insufficient stock');
  });

  test('voiding a transaction restores stock', async () => {
    const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }] });
    expect((await productManager.get(product.id)).stock).toBe(3);

    const voided = await transactionManager.void(txn.id, 'customer changed mind');
    expect(voided.status).toBe('voided');
    expect((await productManager.get(product.id)).stock).toBe(5);
  });

  test('honors per-product minStock for low-stock reporting instead of a fixed threshold', async () => {
    const highMinStock = await productManager.create({ name: 'Insulin', sku: 'INS-001', price: 20, stock: 8, minStock: 10 });
    const lowMinStock = await productManager.create({ name: 'Bandages', sku: 'BND-001', price: 2, stock: 8, minStock: 2 });

    const report = await inventoryManager.lowStockReport();
    const reportedIds = report.map((r) => r.id);
    expect(reportedIds).toContain(highMinStock.id); // 8 <= minStock 10
    expect(reportedIds).not.toContain(lowMinStock.id); // 8 > minStock 2
  });

  test('disableStockCheck allows checkout below zero stock', async () => {
    const unlimited = await productManager.create({
      name: 'Loose Tablets', sku: 'LT-001', price: 1, stock: 1, disableStockCheck: true
    });
    const txn = await transactionManager.checkout({ items: [{ productId: unlimited.id, quantity: 5 }] });
    expect(txn.status).toBe('completed');
    expect((await productManager.get(unlimited.id)).stock).toBe(-4);
  });

  test('records paidAmount and change when cash tendered exceeds the total', async () => {
    const txn = await transactionManager.checkout({
      items: [{ productId: product.id, quantity: 1 }],
      paidAmount: 20
    });
    expect(txn.total).toBe(10);
    expect(txn.paidAmount).toBe(20);
    expect(txn.change).toBe(10);
  });

  test('defaults paidAmount to the total when not supplied (e.g. card payments)', async () => {
    const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
    expect(txn.paidAmount).toBe(txn.total);
    expect(txn.change).toBe(0);
  });

  test('hold() creates a pending order without deducting stock', async () => {
    const held = await transactionManager.hold({ items: [{ productId: product.id, quantity: 2 }], ref: 'Table 5' });
    expect(held.status).toBe('pending');
    expect(held.paidAmount).toBe(0);
    expect((await productManager.get(product.id)).stock).toBe(5); // unchanged
  });

  test('payFromHold() completes a held order and deducts stock', async () => {
    const held = await transactionManager.hold({ items: [{ productId: product.id, quantity: 2 }] });
    const paid = await transactionManager.payFromHold(held.id, { paymentMethod: 'cash', paidAmount: 25 });
    expect(paid.status).toBe('completed');
    expect(paid.paidAmount).toBe(25);
    expect(paid.change).toBe(5); // total is 20 (2 x 10)
    expect((await productManager.get(product.id)).stock).toBe(3);
  });

  test('voiding a pending (held) order does not restock, since none was deducted', async () => {
    const held = await transactionManager.hold({ items: [{ productId: product.id, quantity: 2 }] });
    const voided = await transactionManager.void(held.id, 'cancelled');
    expect(voided.status).toBe('voided');
    expect((await productManager.get(product.id)).stock).toBe(5); // still unchanged
  });

  test('a bare date-only "to" filter includes transactions from later that same day (regression: was excluding same-day sales, breaking custom range)', async () => {
    const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
    const todayStr = new Date(txn.createdAt).toISOString().slice(0, 10);

    // Before the fix, `to: todayStr` parsed as midnight, excluding any
    // transaction created later that same day (i.e. almost all of them).
    const results = await transactionManager.list({ from: todayStr, to: todayStr });
    expect(results.map((t) => t.id)).toContain(txn.id);
  });

  test('a full ISO "to" timestamp with an explicit end-of-day time still works as before', async () => {
    const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
    const day = new Date(txn.createdAt);
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).toISOString();
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).toISOString();

    const results = await transactionManager.list({ from, to });
    expect(results.map((t) => t.id)).toContain(txn.id);
  });
});
