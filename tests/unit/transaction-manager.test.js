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
    storeConfig.setStoreType('apparel');
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
    // Closes the cached SqliteStore connection(s) under dataDir first
    // -- see tests/helpers/data-dir.js for why the bare rmSync fails
    // on Windows without this.
    SqliteStore.closeConnectionsUnder(dataDir);
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
      // Credit/due payment is gated on the store's own
      // creditSalesEnabled setting rather than the store type (see
      // core/transaction-manager.js#checkout), so switch it on here.
      await storeProfile.update({ creditSalesEnabled: true });
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

    test('rejects a partial payment when credit sales are off, even with a customer attached', async () => {
      await storeProfile.update({ creditSalesEnabled: false });
      await expect(
        transactionManager.checkout({
          items: [{ productId: product.id, quantity: 1 }],
          customerId: customer.id,
          paidAmount: 4
        })
      ).rejects.toThrow('Credit / due sales are turned off');
    });

    // BUGFIX regression tests: void()/returnItems() used to restock
    // items and record the refund, but leave the customer's balance
    // completely untouched -- so voiding or returning items from a
    // credit sale left them owing money for stock they no longer had.
    test('voiding a credit sale clears the balance it had put on the customer\u2019s account', async () => {
      const txn = await transactionManager.checkout({
        items: [{ productId: product.id, quantity: 1 }],
        customerId: customer.id,
        paidAmount: 4
      });
      expect(txn.dueAmount).toBe(6);

      await transactionManager.void(txn.id);

      const customersStore = new SqliteStore(dataDir, 'customers');
      expect((await customersStore.findById(customer.id)).balance).toBe(0);
    });

    test('returning items from a credit sale reduces the due balance first, rather than leaving it untouched', async () => {
      const txn = await transactionManager.checkout({
        items: [{ productId: product.id, quantity: 2 }], // total 20
        customerId: customer.id,
        paidAmount: 4 // due: 16
      });
      expect(txn.dueAmount).toBe(16);

      // Return 1 unit (worth 10) -- less than the 16 still owed, so it
      // should all go toward reducing the debt, not a cash refund.
      await transactionManager.returnItems(txn.id, { items: [{ productId: product.id, quantity: 1 }] });

      const customersStore = new SqliteStore(dataDir, 'customers');
      expect((await customersStore.findById(customer.id)).balance).toBe(6); // 16 - 10
      expect((await transactionManager.get(txn.id)).dueAmount).toBe(6);
    });

    test('a return larger than the remaining due amount only clears the due amount, not more', async () => {
      const txn = await transactionManager.checkout({
        items: [{ productId: product.id, quantity: 2 }], // total 20
        customerId: customer.id,
        paidAmount: 16 // due: 4
      });
      expect(txn.dueAmount).toBe(4);

      // Return both units (worth 20) -- only 4 of that is unpaid debt;
      // the rest was actually collected, so it's not this function's
      // job to also simulate refunding that already-paid portion.
      await transactionManager.returnItems(txn.id, { items: [{ productId: product.id, quantity: 2 }] });

      const customersStore = new SqliteStore(dataDir, 'customers');
      expect((await customersStore.findById(customer.id)).balance).toBe(0);
      expect((await transactionManager.get(txn.id)).dueAmount).toBe(0);
    });
  });

  describe('checkout/payFromHold stock-deduction atomicity', () => {
    // These simulate the race the rollback exists for: the up-front
    // availability check and the actual deduction are two separate
    // loops, not one atomic step, so something else (another till, a
    // duplicate line for the same product) can still make a later
    // deduction fail even though every line looked available a moment
    // ago. A spy stands in for that "something changed in between" --
    // the first deduction is real, the second is forced to fail
    // regardless of actual stock, isolating just the rollback behavior.
    afterEach(() => jest.restoreAllMocks());

    test('checkout() rolls back stock already deducted earlier in the same request if a later line fails', async () => {
      const other = await productManager.create({ name: 'Scarf', sku: 'SCF-1', price: 5, stock: 5 });
      const realDeduct = inventoryManager.deductForSale.bind(inventoryManager);
      let calls = 0;
      jest.spyOn(inventoryManager, 'deductForSale').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error('Insufficient stock for "Scarf"');
        return realDeduct(...args);
      });

      await expect(transactionManager.checkout({
        items: [
          { productId: product.id, quantity: 2 }, // deducts for real, first
          { productId: other.id, quantity: 1 } // forced to fail, second
        ]
      })).rejects.toThrow('Insufficient stock');

      // Without the rollback, `product` would be stuck at 3 (deducted)
      // despite no transaction ever having been created for the sale.
      expect((await productManager.get(product.id)).stock).toBe(5);
    });

    test('payFromHold() likewise rolls back on a later-line failure', async () => {
      const other = await productManager.create({ name: 'Scarf', sku: 'SCF-2', price: 5, stock: 5 });
      const held = await transactionManager.hold({
        items: [{ productId: product.id, quantity: 2 }, { productId: other.id, quantity: 1 }]
      });

      const realDeduct = inventoryManager.deductForSale.bind(inventoryManager);
      let calls = 0;
      jest.spyOn(inventoryManager, 'deductForSale').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error('Insufficient stock for "Scarf"');
        return realDeduct(...args);
      });

      await expect(transactionManager.payFromHold(held.id)).rejects.toThrow('Insufficient stock');
      expect((await productManager.get(product.id)).stock).toBe(5); // rolled back
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

  describe('test sales', () => {
    test('list() excludes test sales by default, but includes them with includeTest:true', async () => {
      const real = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
      const test = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }], isTest: true });

      const normal = await transactionManager.list({});
      expect(normal.map((t) => t.id)).toContain(real.id);
      expect(normal.map((t) => t.id)).not.toContain(test.id);

      const withTest = await transactionManager.list({ includeTest: true });
      expect(withTest.map((t) => t.id)).toEqual(expect.arrayContaining([real.id, test.id]));
    });

    test('a test sale still deducts stock like a real one (so it exercises the same code path)', async () => {
      await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }], isTest: true });
      expect((await productManager.get(product.id)).stock).toBe(3);
    });

    test('deleteTestSale() restocks and actually removes the record', async () => {
      const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }], isTest: true });
      expect((await productManager.get(product.id)).stock).toBe(3);

      const result = await transactionManager.deleteTestSale(txn.id);
      expect(result.deleted).toBe(true);
      expect((await productManager.get(product.id)).stock).toBe(5); // restocked
      expect(await transactionManager.get(txn.id)).toBeNull();
    });

    test('deleteTestSale() refuses to delete a real sale', async () => {
      const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
      await expect(transactionManager.deleteTestSale(txn.id)).rejects.toThrow('Only transactions marked as a test sale');
      expect(await transactionManager.get(txn.id)).not.toBeNull(); // untouched
    });

    test('deleteTestSale() does not restock a still-pending (held) test sale, since it never deducted stock', async () => {
      const held = await transactionManager.hold({ items: [{ productId: product.id, quantity: 2 }], isTest: true });
      expect((await productManager.get(product.id)).stock).toBe(5); // unchanged by hold()

      await transactionManager.deleteTestSale(held.id);
      expect((await productManager.get(product.id)).stock).toBe(5); // still unchanged, not double-restocked
    });

    test('deleteTestSale() accounts for quantities already returned, so it does not double-restock them', async () => {
      const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 3 }], isTest: true });
      expect((await productManager.get(product.id)).stock).toBe(2);

      await transactionManager.returnItems(sale.id, { items: [{ productId: product.id, quantity: 1 }] });
      expect((await productManager.get(product.id)).stock).toBe(3); // 1 already restocked by the return

      await transactionManager.deleteTestSale(sale.id);
      expect((await productManager.get(product.id)).stock).toBe(5); // remaining 2 restocked, not all 3 again
    });

    test('deleteTestSale() also removes a linked test return, rather than leaving an orphaned record', async () => {
      const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }], isTest: true });
      const returnTxn = await transactionManager.returnItems(sale.id, { items: [{ productId: product.id, quantity: 1 }] });
      expect(returnTxn.isTest).toBe(true); // inherited from the original sale

      await transactionManager.deleteTestSale(sale.id);
      expect(await transactionManager.get(sale.id)).toBeNull();
      expect(await transactionManager.get(returnTxn.id)).toBeNull();
    });

    test('clearTestSales() bulk-deletes every test sale and leaves real ones alone', async () => {
      const real = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
      await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }], isTest: true });
      await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }], isTest: true });

      const result = await transactionManager.clearTestSales();
      expect(result.deletedCount).toBe(2);

      const remaining = await transactionManager.list({ includeTest: true });
      expect(remaining.map((t) => t.id)).toEqual([real.id]);
    });

    test('markAsTest() retroactively flags an existing (real) sale, making it eligible for deletion', async () => {
      const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
      expect(txn.isTest).toBeFalsy();

      // Before marking: list() excludes it as a real sale either way,
      // and it can't be deleted.
      await expect(transactionManager.deleteTestSale(txn.id)).rejects.toThrow('Only transactions marked as a test sale');

      const marked = await transactionManager.markAsTest(txn.id);
      expect(marked.isTest).toBe(true);
      expect((await transactionManager.list({})).map((t) => t.id)).not.toContain(txn.id);
      expect((await transactionManager.list({ includeTest: true })).map((t) => t.id)).toContain(txn.id);

      // Now deletable like any other test sale.
      await transactionManager.deleteTestSale(txn.id);
      expect(await transactionManager.get(txn.id)).toBeNull();
    });

    test('markAsTest() works on an already-voided sale too, so old mistakes can still be cleaned up', async () => {
      const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
      await transactionManager.void(txn.id);

      await transactionManager.markAsTest(txn.id);
      const result = await transactionManager.deleteTestSale(txn.id);
      expect(result.deleted).toBe(true);
    });

    test('unmarkAsTest() reverses a wrong mark: sale counts again and can no longer be deleted', async () => {
      const txn = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 1 }] });
      await transactionManager.markAsTest(txn.id);
      expect((await transactionManager.list({})).map((t) => t.id)).not.toContain(txn.id);

      const restored = await transactionManager.unmarkAsTest(txn.id);
      expect(restored.isTest).toBe(false);
      expect((await transactionManager.list({})).map((t) => t.id)).toContain(txn.id);
      await expect(transactionManager.deleteTestSale(txn.id)).rejects.toThrow('Only transactions marked as a test sale');
    });

    test('unmarkAsTest() flips linked returns back too and rejects a sale that is not marked', async () => {
      const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }] });
      await expect(transactionManager.unmarkAsTest(sale.id)).rejects.toThrow('not marked as a test sale');

      await transactionManager.markAsTest(sale.id);
      await transactionManager.returnItems(sale.id, { items: [{ productId: product.id, quantity: 1 }] });
      await transactionManager.unmarkAsTest(sale.id);

      const all = await transactionManager.list({ includeTest: true });
      expect(all.filter((t) => t.isTest)).toHaveLength(0);
    });

    test('clearTestSales() does not error on a test return already removed alongside its parent sale', async () => {
      const sale = await transactionManager.checkout({ items: [{ productId: product.id, quantity: 2 }], isTest: true });
      await transactionManager.returnItems(sale.id, { items: [{ productId: product.id, quantity: 1 }] });

      const result = await transactionManager.clearTestSales();
      // Sale + its linked return were both test rows, but the return
      // is removed as a side effect of deleting the sale -- only one
      // actual deleteTestSale() call happens, so deletedCount is 1.
      expect(result.deletedCount).toBe(1);
      expect(await transactionManager.list({ includeTest: true })).toHaveLength(0);
    });
  });
});
