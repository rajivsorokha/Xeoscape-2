// tests/unit/report-generator.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const ProductManager = require('../../core/product-manager');
const InventoryManager = require('../../core/inventory-manager');
const TransactionManager = require('../../core/transaction-manager');
const ReportGenerator = require('../../core/report-generator');
const storeConfig = require('../../core/store-config');

describe('ReportGenerator#productPerformance', () => {
  let dataDir, productManager, inventoryManager, transactionManager, reportGenerator;
  let hero, midrange, steady, deadStock;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-report-test-'));
    storeConfig.setStoreType('generalRetail');
    productManager = new ProductManager(dataDir);
    inventoryManager = new InventoryManager(dataDir, productManager);
    transactionManager = new TransactionManager(dataDir, productManager, inventoryManager);
    reportGenerator = new ReportGenerator(transactionManager, productManager, inventoryManager);

    // A realistic revenue spread across 4 products so ABC tiers land
    // where intuition expects: hero is the clear top performer but
    // isn't the store's *entire* revenue, midrange is a solid #2,
    // steady is a minor contributor, and dead stock never sells.
    hero = await productManager.create({ name: 'Hero Item', sku: 'HERO-1', price: 100, cost: 60, stock: 100 });
    midrange = await productManager.create({ name: 'Midrange Item', sku: 'MID-1', price: 50, stock: 80 });
    steady = await productManager.create({ name: 'Steady Item', sku: 'STEADY-1', price: 20, stock: 50 });
    // Never sold at all -- the classic "weak demand" case.
    deadStock = await productManager.create({ name: 'Dead Stock Item', sku: 'DEAD-1', price: 15, stock: 40 });

    // 10 baskets: hero every time (10 units, $1000), midrange 8 of 10
    // times (8 units, $400), steady half the time (5 units, $100),
    // dead stock never. Total revenue: $1500.
    for (let i = 0; i < 10; i += 1) {
      const items = [{ productId: hero.id, quantity: 1 }];
      if (i < 8) items.push({ productId: midrange.id, quantity: 1 });
      if (i % 2 === 0) items.push({ productId: steady.id, quantity: 1 });
      await transactionManager.checkout({ items });
    }
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('includes every current product, even ones with zero sales in range', async () => {
    const report = await reportGenerator.productPerformance({});
    expect(report.items).toHaveLength(4);
    const deadRow = report.items.find((i) => i.productId === deadStock.id);
    expect(deadRow.unitsSold).toBe(0);
    expect(deadRow.revenue).toBe(0);
  });

  test('ranks by revenue and computes basket penetration correctly', async () => {
    const report = await reportGenerator.productPerformance({});
    const heroRow = report.items.find((i) => i.productId === hero.id);
    const steadyRow = report.items.find((i) => i.productId === steady.id);

    expect(heroRow.revenue).toBe(1000); // 10 units * 100
    expect(steadyRow.revenue).toBe(100); // 5 units * 20
    expect(report.totalBaskets).toBe(10);
    expect(heroRow.basketPenetrationPct).toBe(100); // in every basket
    expect(steadyRow.basketPenetrationPct).toBe(50); // in half the baskets
  });

  test('classifies tiers by cumulative revenue share and flags the zero-sale item as a slow mover', async () => {
    const report = await reportGenerator.productPerformance({});
    const heroRow = report.items.find((i) => i.productId === hero.id);
    const midrangeRow = report.items.find((i) => i.productId === midrange.id);
    const deadRow = report.items.find((i) => i.productId === deadStock.id);

    // hero: 1000/1500 = 66.7% cumulative -> A
    expect(heroRow.abcClass).toBe('A');
    // midrange: (1000+400)/1500 = 93.3% cumulative -> B
    expect(midrangeRow.abcClass).toBe('B');
    // dead stock: bottom tier, zero sales -> C and flagged
    expect(deadRow.abcClass).toBe('C');
    expect(deadRow.flaggedSlowMoving).toBe(true);
    expect(heroRow.flaggedSlowMoving).toBe(false);
  });

  test('computes margin only when a Cost Price is set on the product', async () => {
    const report = await reportGenerator.productPerformance({});
    const heroRow = report.items.find((i) => i.productId === hero.id);
    const steadyRow = report.items.find((i) => i.productId === steady.id);

    expect(heroRow.marginPct).toBe(40); // (100-60)/100
    expect(steadyRow.marginPct).toBeNull(); // no cost set
  });

  test('with no transactions at all, everything is zero-revenue and flagged', async () => {
    const emptyDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-report-empty-'));
    const pm = new ProductManager(emptyDataDir);
    const im = new InventoryManager(emptyDataDir, pm);
    const tm = new TransactionManager(emptyDataDir, pm, im);
    const rg = new ReportGenerator(tm, pm, im);
    await pm.create({ name: 'Lonely Item', sku: 'LONE-1', price: 10, stock: 5 });

    const report = await rg.productPerformance({});
    expect(report.totalRevenue).toBe(0);
    expect(report.items[0].abcClass).toBe('C');
    expect(report.items[0].flaggedSlowMoving).toBe(true);

    fs.rmSync(emptyDataDir, { recursive: true, force: true });
  });
});

describe('ReportGenerator#inventoryMovement', () => {
  let dataDir, productManager, inventoryManager, transactionManager, reportGenerator, product;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yourshopapp-movement-test-'));
    storeConfig.setStoreType('generalRetail');
    productManager = new ProductManager(dataDir);
    inventoryManager = new InventoryManager(dataDir, productManager);
    transactionManager = new TransactionManager(dataDir, productManager, inventoryManager);
    reportGenerator = new ReportGenerator(transactionManager, productManager, inventoryManager);

    product = await productManager.create({ name: 'Tracked Item', sku: 'TRK-1', price: 10, stock: 100, minStock: 10 });
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('produces a daily series with carried-forward stock levels on days with no movement', async () => {
    await transactionManager.checkout({ items: [{ productId: product.id, quantity: 5 }] });

    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

    const movement = await reportGenerator.inventoryMovement({ productId: product.id, from, to });
    expect(movement.days).toHaveLength(1);
    expect(movement.days[0].unitsSold).toBe(5);
    expect(movement.days[0].stockLevel).toBe(95);
    expect(movement.currentStock).toBe(95);
  });

  test('projects a stockout when recent sales velocity would exhaust current stock soon', async () => {
    // Sell 30 units today against 100 in stock -- at that pace, stock
    // would be gone in a little over 3 days.
    await transactionManager.checkout({ items: [{ productId: product.id, quantity: 30 }] });

    const movement = await reportGenerator.inventoryMovement({ productId: product.id });
    expect(movement.avgDailySales).toBeGreaterThan(0);
    expect(movement.projectedDaysToStockout).not.toBeNull();
    expect(movement.stockoutRisk).toBe(true);
  });

  test('does not project a stockout when there has been no recent sales activity', async () => {
    const movement = await reportGenerator.inventoryMovement({ productId: product.id });
    expect(movement.avgDailySales).toBe(0);
    expect(movement.projectedDaysToStockout).toBeNull();
    expect(movement.stockoutRisk).toBe(false);
  });

  test('throws for an unknown product', async () => {
    await expect(reportGenerator.inventoryMovement({ productId: 'does-not-exist' }))
      .rejects.toThrow('Product not found');
  });
});
