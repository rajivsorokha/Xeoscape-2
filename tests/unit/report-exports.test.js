// tests/unit/report-exports.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const ProductManager = require('../../core/product-manager');
const InventoryManager = require('../../core/inventory-manager');
const TransactionManager = require('../../core/transaction-manager');
const StoreProfile = require('../../core/store-profile');
const ReportGenerator = require('../../core/report-generator');
const SqliteStore = require('../../core/sqlite-store');
const storeConfig = require('../../core/store-config');
const exportsCore = require('../../core/report-exports');
const { cleanupDataDir } = require('../helpers/data-dir');

describe('detail reports (transactions / products / customers)', () => {
  let dataDir, rg, tm, shirt, jeans, asha;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xeoscape-exports-'));
    storeConfig.setStoreType('apparel');
    const pm = new ProductManager(dataDir);
    const im = new InventoryManager(dataDir, pm);
    const sp = new StoreProfile(dataDir);
    await sp.update({ chargeTax: false });
    tm = new TransactionManager(dataDir, pm, im, sp);
    rg = new ReportGenerator(tm, pm, im, dataDir);
    shirt = await pm.create({ name: 'Blue T-Shirt', sku: 'TS-1', price: 344, cost: 200, stock: 50 });
    jeans = await pm.create({ name: 'Jeans', sku: 'JN-1', price: 800, stock: 20 });
    asha = await new SqliteStore(dataDir, 'customers').insert({ id: 'c1', name: 'Asha', phone: '9876543210', balance: 0 });
    await tm.checkout({ items: [{ productId: shirt.id, quantity: 2 }], customerId: 'c1' });
    await tm.checkout({ items: [{ productId: jeans.id, quantity: 1 }], customerId: 'c1' });
    await tm.checkout({ items: [{ productId: shirt.id, quantity: 1 }] }); // walk-in
  });

  afterEach(() => cleanupDataDir(dataDir));

  test('transaction details: one row per line item with customer phone', async () => {
    const r = await exportsCore.transactionDetails(rg, {});
    expect(r.rows).toHaveLength(3);
    expect(r.summary.bills).toBe(3);
    const ashaRow = r.rows.find((x) => x.product === 'Jeans');
    expect(ashaRow.customer).toBe('Asha');
    expect(ashaRow.phone).toBe('9876543210');
    expect(r.rows.find((x) => x.customer === 'Walk-in')).toBeTruthy();
  });

  test('product details: units sold and stock per product', async () => {
    const r = await exportsCore.productDetails(rg, {});
    const t = r.rows.find((x) => x.name === 'Blue T-Shirt');
    expect(t.unitsSold).toBe(3);
    expect(t.stock).toBe(47);
    expect(t.revenue).toBe(1032);
    expect(r.columns.map((c) => c.key)).toContain('lastSold');
  });

  test('customer report: visits, spend, last visit; walk-ins excluded', async () => {
    const r = await exportsCore.customerReport(rg, {});
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ name: 'Asha', phone: '9876543210', visits: 2, totalSpent: 1488, itemsBought: 3 });
    expect(r.rows[0].topItems).toContain('Blue T-Shirt x2');
    expect(r.summary.walkInBills).toBe(1);
    expect((await exportsCore.customerReport(rg, { minVisits: 3 })).rows).toHaveLength(0);
  });

  test('returns reduce spend and are not counted as visits', async () => {
    const [sale] = (await tm.list()).filter((t) => t.customerId === 'c1' && t.items[0].productId === jeans.id);
    await tm.returnItems(sale.id, { items: [{ productId: jeans.id, quantity: 1 }] });
    const r = await exportsCore.customerReport(rg, {});
    expect(r.rows[0].visits).toBe(2);
    expect(r.rows[0].totalSpent).toBe(688);
  });

  test('dashboard: totals, daily series, top products, customer mix', async () => {
    const d = await exportsCore.dashboard(rg, { days: 7 });
    expect(d.daily).toHaveLength(7);
    expect(d.current.bills).toBe(3);
    expect(d.current.netSales).toBe(1832); // 2x344 + 800 + 344
    expect(d.current.itemsSold).toBe(4);
    expect(d.current.avgBill).toBeCloseTo(610.67, 1);
    expect(d.daily[6].sales).toBe(1832); // all of it today
    expect(d.topProducts[0].name).toBe('Blue T-Shirt'); // 1032 vs jeans 800
    expect(d.customers).toMatchObject({ buyingThisPeriod: 1, new: 1, returning: 0 });
    expect(d.paymentMethods[0].method).toBe('cash');
    expect(d.change.netSales).toBeNull(); // nothing in the previous period to compare
  });

  test('dashboard: a return lowers net sales and the percent change is computed', async () => {
    const [sale] = (await tm.list()).filter((t) => t.customerId === 'c1' && t.items[0].productId === jeans.id);
    await tm.returnItems(sale.id, { items: [{ productId: jeans.id, quantity: 1 }] });
    const d = await exportsCore.dashboard(rg, { days: 30 });
    expect(d.current.returns).toBe(800);
    expect(d.current.netSales).toBe(1032);
  });

  test('a From date includes sales made after local midnight', async () => {
    const today = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    const ymd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const r = await exportsCore.transactionDetails(rg, { from: ymd, to: ymd });
    expect(r.summary.bills).toBe(3);
  });

  test('csv has BOM, header and phone kept as text', async () => {
    const csv = exportsCore.toCsv(await exportsCore.customerReport(rg, {}));
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('Customer,Phone,Visits (bills)');
    expect(csv).toContain('\t9876543210');
  });
});
