// tests/unit/transaction-manager.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const ProductManager = require('../../core/product-manager');
const InventoryManager = require('../../core/inventory-manager');
const TransactionManager = require('../../core/transaction-manager');
const StoreProfile = require('../../core/store-profile');
const SqliteStore = require('../../core/sqlite-store');
const storeConfig = require('../../core/store-config');

describe('TransactionManager', () => {
  let dataDir, productManager, inventoryManager, transactionManager, storeProfile, product;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-test-'));
    storeConfig.setStoreType('generalRetail');
    productManager = new ProductManager(dataDir);
    inventoryManager = new InventoryManager(dataDir, productManager);
    storeProfile = new StoreProfile(dataDir);
    // Tax off by default so the many existing exact-total assertions
    // below don't all need updating -- tax-specific behavior gets its
    // own tests further down instead.
    await storeProfile.update({ chargeTax: false });
    transactionManager = new TransactionManager(dataDir, productManager, inventoryManager, storeProfile);

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

  describe('tax', () => {
    beforeEach(async () => {
      await storeProfile.update({ chargeTax: true, taxPercentage: 10 });
    });

    test('checkout actually charges tax (was previously display-only on the frontend, never charged or stored)', async () => {
      const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
      expect(txn.subtotal).toBe(10);
      expect(txn.taxAmount).toBe(1); // 10% of 10
      expect(txn.total).toBe(11);
    });

    test('tax is calculated on the discounted amount, not the pre-discount subtotal', async () => {
      const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }], discount: 2 });
      expect(txn.taxAmount).toBe(0.8); // 10% of (10 - 2)
      expect(txn.total).toBe(8.8);
    });
  });

  describe('partial/due payment', () => {
    let customer;

    beforeEach(async () => {
      // Due/credit payment is now B2B-only (see
      // core/transaction-manager.js#checkout) -- switched here since
      // the outer beforeEach defaults to 'generalRetail'.
      storeConfig.setStoreType('b2bGeneralRetail');
      const customersStore = new SqliteStore(dataDir, 'customers');
      customer = await customersStore.insert({ id: 'cust-1', name: 'Jane Doe', balance: 0 });
    });

    test('rejects a partial payment with no customer attached', async () => {
      await expect(
        transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }], paidAmount: 4 })
      ).rejects.toThrow('Select a customer');
    });

    test('allows a partial payment when a customer is attached, and credits the shortfall to their balance', async () => {
      const txn = await transactionManager.checkout({
        items: [{ productId: product.id, quantity: 1 }],
        customerId: customer.id,
        paidAmount: 4
      });
      expect(txn.total).toBe(10);
      expect(txn.paidAmount).toBe(4);
      expect(txn.dueAmount).toBe(6);

      const customersStore = new SqliteStore(dataDir, 'customers');
      const updated = await customersStore.findById(customer.id);
      expect(updated.balance).toBe(6);
    });

    test('rejects a partial payment outside B2B General Retail, even with a customer attached', async () => {
      storeConfig.setStoreType('generalRetail');
      await expect(
        transactionManager.checkout({
          items: [{ productId: product.id, quantity: 1 }],
          customerId: customer.id,
          paidAmount: 4
        })
      ).rejects.toThrow('only available for B2B General Retail');
    });
  });

  describe('sales returns', () => {
    test('returning an item restocks it and creates a linked negative-total transaction', async () => {
      const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 3 }] });
      expect((await productManager.get(product.id)).stock).toBe(2);

      const returnTxn = await transactionManager.returnItems(sale.id, {
        items: [{ productId: product.id, quantity: 1 }],
        reason: 'Customer changed mind'
      });

      expect(returnTxn.total).toBe(-10);
      expect(returnTxn.type).toBe('return');
      expect(returnTxn.status).toBe('completed'); // nets into revenue reports automatically
      expect(returnTxn.originalTransactionId).toBe(sale.id);
      expect((await productManager.get(product.id)).stock).toBe(3); // restocked
    });

    test('cannot return more of an item than was originally purchased, including across multiple partial returns', async () => {
      const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }] });
      await transactionManager.returnItems(sale.id, { items: [{ productId: product.id, quantity: 1 }] });

      await expect(
        transactionManager.returnItems(sale.id, { items: [{ productId: product.id, quantity: 2 }] })
      ).rejects.toThrow('only 1 of 2 remain returnable');
    });

    test('cannot return against a pending (unpaid/held) order', async () => {
      const held = await transactionManager.hold({ items: [{ productId: product.id, quantity: 1 }] });
      await expect(
        transactionManager.returnItems(held.id, { items: [{ productId: product.id, quantity: 1 }] })
      ).rejects.toThrow('Only completed sales');
    });

    test('a return nets out of per-product revenue/units, not just the transaction total (regression: topProducts/productPerformance sum line items directly across all transactions with no return special-casing, so a positive-valued return line item would silently double-count as more revenue instead of netting)', async () => {
      const ReportGenerator = require('../../core/report-generator');
      const reportGenerator = new ReportGenerator(transactionManager, productManager, inventoryManager);

      const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }] }); // 20
      await transactionManager.returnItems(sale.id, { items: [{ productId: product.id, quantity: 1 }] }); // -10

      const top = await reportGenerator.topProducts({});
      const row = top.find((p) => p.productId === product.id);
      expect(row.revenue).toBe(10); // 20 - 10, not 30
      expect(row.quantity).toBe(1); // 2 - 1, not 3
    });
  });
});
