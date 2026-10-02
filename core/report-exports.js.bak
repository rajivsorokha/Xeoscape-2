// core/report-exports.js
// Row builders for the Transaction Details, Product Details and
// Customer reports, plus a CSV serializer that opens cleanly in Excel
// (UTF-8 BOM so the rupee sign and non-English names survive).
//
// Every builder returns { columns: [{key, label}], rows: [...], summary }
// so the same data drives both the on-screen table and the CSV file.

const { stringify } = require('csv-stringify/sync');

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

function dayKey(iso) {
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  const pad = (x) => String(x).padStart(2, '0');
  return `${dayKey(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


// transactionManager.list() reads a bare "YYYY-MM-DD" `from` as UTC
// midnight, which is 5:30 AM in India -- so sales rung up after
// midnight on the first day would be missed. Convert date-only values
// to local start/end of day before asking.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function startOfDay(from) {
  if (!from || !DATE_ONLY.test(from)) return from;
  const [y, m, d] = from.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}
function endOfDay(to) {
  if (!to || !DATE_ONLY.test(to)) return to;
  const [y, m, d] = to.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}
function listCompleted(rg, from, to) {
  return rg.transactionManager.list({ from: startOfDay(from), to: endOfDay(to), status: 'completed' });
}

// Phone numbers: keep as text in Excel so 98xxxxxxx0 isn't shown as 9.8E+09.
const asText = (v) => (v ? `\t${v}` : '');

function toCsv({ columns, rows }) {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => {
    const v = r[c.key];
    if (v === null || v === undefined) return '';
    return c.text ? asText(v) : v;
  }));
  return '\uFEFF' + stringify([header, ...body]);
}

async function loadLookups(rg) {
  const customers = rg.customersDb ? await rg.customersDb.readAll() : [];
  const users = rg.usersDb ? await rg.usersDb.readAll() : [];
  return {
    customerById: new Map(customers.map((c) => [c.id, c])),
    userById: new Map(users.map((u) => [u.id, u.displayName || u.username]))
  };
}

/** One row per line item sold, with the bill's details repeated. */
async function transactionDetails(rg, { from, to }) {
  const txns = await listCompleted(rg, from, to);
  const { customerById, userById } = await loadLookups(rg);
  const rows = [];

  for (const t of txns) {
    const customer = t.customerId ? customerById.get(t.customerId) : null;
    const isReturn = t.type === 'return';
    for (const li of t.items || []) {
      const sign = isReturn ? -1 : 1;
      rows.push({
        invoice: String(t.id).slice(0, 8),
        date: fmtDateTime(t.createdAt),
        type: isReturn ? 'Return' : 'Sale',
        customer: customer ? customer.name : 'Walk-in',
        phone: customer ? customer.phone || '' : '',
        product: li.name,
        sku: li.sku || '',
        quantity: sign * (li.quantity || 0),
        unitPrice: round2(li.unitPrice ?? li.price),
        lineTotal: round2(isReturn ? -Math.abs(li.lineTotal || 0) : li.lineTotal),
        billTotal: round2(t.total),
        paid: round2(t.paidAmount ?? t.total),
        due: round2(t.dueAmount),
        method: t.paymentMethod || '',
        cashier: userById.get(t.cashierId) || ''
      });
    }
  }

  const sales = txns.filter((t) => t.type !== 'return');
  return {
    columns: [
      { key: 'invoice', label: 'Invoice' },
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'customer', label: 'Customer' },
      { key: 'phone', label: 'Phone', text: true },
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantity', label: 'Qty' },
      { key: 'unitPrice', label: 'Unit Price' },
      { key: 'lineTotal', label: 'Line Total' },
      { key: 'billTotal', label: 'Bill Total' },
      { key: 'paid', label: 'Paid' },
      { key: 'due', label: 'Due' },
      { key: 'method', label: 'Payment Method' },
      { key: 'cashier', label: 'Cashier' }
    ],
    rows,
    summary: {
      bills: sales.length,
      lines: rows.length,
      totalSales: round2(txns.reduce((s, t) => s + (t.total || 0), 0))
    }
  };
}

/** One row per product: catalogue details + sales in the period. */
async function productDetails(rg, { from, to }) {
  const products = await rg.productManager.list();
  const txns = await listCompleted(rg, from, to);

  const sold = new Map();
  for (const t of txns) {
    const sign = t.type === 'return' ? -1 : 1;
    for (const li of t.items || []) {
      const s = sold.get(li.productId) || { qty: 0, revenue: 0, lastSold: null };
      s.qty += sign * (li.quantity || 0);
      s.revenue += sign * Math.abs(li.lineTotal || 0);
      if (sign > 0 && (!s.lastSold || t.createdAt > s.lastSold)) s.lastSold = t.createdAt;
      sold.set(li.productId, s);
    }
  }

  const rows = products.map((p) => {
    const s = sold.get(p.id) || { qty: 0, revenue: 0, lastSold: null };
    const price = typeof p.price === 'number' ? p.price : 0;
    const cost = typeof p.cost === 'number' ? p.cost : null;
    const stock = p.stock || 0;
    return {
      name: p.name,
      sku: p.sku || '',
      barcode: p.barcode || '',
      category: p.category || p.garmentType || '',
      vendor: p.vendor || '',
      price: round2(price),
      cost: cost === null ? '' : round2(cost),
      stock,
      stockValue: round2(stock * (cost ?? price)),
      unitsSold: s.qty,
      revenue: round2(s.revenue),
      lastSold: s.lastSold ? fmtDateTime(s.lastSold) : ''
    };
  }).sort((a, b) => b.unitsSold - a.unitsSold || a.name.localeCompare(b.name));

  return {
    columns: [
      { key: 'name', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'barcode', label: 'Barcode', text: true },
      { key: 'category', label: 'Category' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'price', label: 'Price' },
      { key: 'cost', label: 'Cost' },
      { key: 'stock', label: 'Stock' },
      { key: 'stockValue', label: 'Stock Value' },
      { key: 'unitsSold', label: 'Units Sold (period)' },
      { key: 'revenue', label: 'Revenue (period)' },
      { key: 'lastSold', label: 'Last Sold' }
    ],
    rows,
    summary: {
      products: rows.length,
      unitsSold: rows.reduce((s, r) => s + r.unitsSold, 0),
      revenue: round2(rows.reduce((s, r) => s + r.revenue, 0))
    }
  };
}

/** One row per customer: how often they visit and what they buy. */
async function customerReport(rg, { from, to, minVisits = 1 }) {
  const txns = await listCompleted(rg, from, to);
  const { customerById } = await loadLookups(rg);
  const now = new Date();
  const groups = new Map();

  for (const t of txns) {
    if (!t.customerId) continue; // walk-in sales have no one to report on
    const g = groups.get(t.customerId) || { sales: [], items: new Map(), spent: 0 };
    if (t.type === 'return') {
      g.spent -= Math.abs(t.total || 0);
    } else {
      g.sales.push(t);
      g.spent += t.total || 0;
      for (const li of t.items || []) {
        g.items.set(li.name, (g.items.get(li.name) || 0) + (li.quantity || 0));
      }
    }
    groups.set(t.customerId, g);
  }

  const rows = [];
  for (const [customerId, g] of groups) {
    if (!g.sales.length) continue;
    const c = customerById.get(customerId) || {};
    const dates = g.sales.map((t) => t.createdAt).sort();
    const visitDays = new Set(dates.map(dayKey)).size;
    const lastVisit = dates[dates.length - 1];
    const topItems = [...g.items.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => `${name} x${qty}`)
      .join('; ');
    rows.push({
      customerId, // not a CSV column; lets the Customers screen join stats to records
      name: c.name || '(deleted customer)',
      phone: c.phone || '',
      visits: g.sales.length,
      visitDays,
      totalSpent: round2(g.spent),
      avgBill: round2(g.spent / g.sales.length),
      itemsBought: [...g.items.values()].reduce((s, q) => s + q, 0),
      topItems,
      firstVisit: fmtDateTime(dates[0]),
      lastVisit: fmtDateTime(lastVisit),
      daysSinceLast: Math.floor((now - new Date(lastVisit)) / 86400000),
      dueBalance: round2(c.balance || 0)
    });
  }

  const filtered = rows
    .filter((r) => r.visits >= Number(minVisits || 1))
    .sort((a, b) => b.visits - a.visits || b.totalSpent - a.totalSpent);

  return {
    columns: [
      { key: 'name', label: 'Customer' },
      { key: 'phone', label: 'Phone', text: true },
      { key: 'visits', label: 'Visits (bills)' },
      { key: 'visitDays', label: 'Days Visited' },
      { key: 'totalSpent', label: 'Total Spent' },
      { key: 'avgBill', label: 'Avg Bill' },
      { key: 'itemsBought', label: 'Items Bought' },
      { key: 'topItems', label: 'Most Bought Items' },
      { key: 'firstVisit', label: 'First Visit' },
      { key: 'lastVisit', label: 'Last Visit' },
      { key: 'daysSinceLast', label: 'Days Since Last Visit' },
      { key: 'dueBalance', label: 'Due Balance' }
    ],
    rows: filtered,
    summary: {
      customers: filtered.length,
      totalSpent: round2(filtered.reduce((s, r) => s + r.totalSpent, 0)),
      walkInBills: txns.filter((t) => !t.customerId && t.type !== 'return').length
    }
  };
}

// ---------------------------------------------------------------------
// Dashboard: sales performance for the last N days vs the N days before
// ---------------------------------------------------------------------
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function periodStats(txns) {
  const sales = txns.filter((t) => t.type !== 'return');
  const returns = txns.filter((t) => t.type === 'return');
  const gross = sales.reduce((s, t) => s + (t.total || 0), 0);
  const returned = returns.reduce((s, t) => s + Math.abs(t.total || 0), 0);
  const itemsSold = sales.reduce((s, t) => s + (t.items || []).reduce((a, li) => a + (li.quantity || 0), 0), 0)
    - returns.reduce((s, t) => s + (t.items || []).reduce((a, li) => a + (li.quantity || 0), 0), 0);
  const customers = new Set(sales.filter((t) => t.customerId).map((t) => t.customerId));
  return {
    netSales: round2(gross - returned),
    grossSales: round2(gross),
    returns: round2(returned),
    bills: sales.length,
    avgBill: sales.length ? round2(gross / sales.length) : 0,
    itemsSold,
    discounts: round2(sales.reduce((s, t) => s + (t.discount || 0), 0)),
    uniqueCustomers: customers.size
  };
}

function pctChange(now, before) {
  if (!before) return now ? null : 0; // null = "new", nothing to compare to
  return round2(((now - before) / before) * 100);
}

async function dashboard(rg, { days = 30 } = {}) {
  const n = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = addDays(today, -(n - 1));
  const prevFrom = addDays(from, -n);
  const prevTo = addDays(from, -1);
  const iso = (d) => dayKey(d.toISOString());

  const txns = await listCompleted(rg, iso(from), iso(today));
  const prevTxns = await listCompleted(rg, iso(prevFrom), iso(prevTo));

  const current = periodStats(txns);
  const previous = periodStats(prevTxns);

  // Daily series (every day present, even with no sales, so the chart
  // shows quiet days honestly).
  const dailyMap = new Map();
  for (let i = 0; i < n; i += 1) {
    const d = addDays(from, i);
    dailyMap.set(iso(d), { date: iso(d), label: `${d.getDate()}/${d.getMonth() + 1}`, sales: 0, bills: 0 });
  }
  const byWeekday = WEEKDAYS.map((label) => ({ label, sales: 0, bills: 0 }));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, sales: 0, bills: 0 }));
  const methods = new Map();
  const products = new Map();
  const customerSpend = new Map();

  for (const t of txns) {
    const sign = t.type === 'return' ? -1 : 1;
    const amount = sign * Math.abs(t.total || 0);
    const when = new Date(t.createdAt);
    const day = dailyMap.get(dayKey(t.createdAt));
    if (day) { day.sales += amount; if (sign > 0) day.bills += 1; }
    byWeekday[when.getDay()].sales += amount;
    byHour[when.getHours()].sales += amount;
    if (sign > 0) {
      byWeekday[when.getDay()].bills += 1;
      byHour[when.getHours()].bills += 1;
      const m = t.paymentMethod || 'other';
      methods.set(m, (methods.get(m) || 0) + (t.total || 0));
    }
    for (const li of t.items || []) {
      const p = products.get(li.productId || li.name) || { name: li.name, qty: 0, revenue: 0 };
      p.qty += sign * (li.quantity || 0);
      p.revenue += sign * Math.abs(li.lineTotal || 0);
      products.set(li.productId || li.name, p);
    }
    if (t.customerId && sign > 0) customerSpend.set(t.customerId, (customerSpend.get(t.customerId) || 0) + (t.total || 0));
  }

  // New vs returning: a customer is "returning" if they also bought
  // before this period began.
  const allBefore = await rg.transactionManager.list({ to: iso(addDays(from, -1)), status: 'completed' });
  const seenBefore = new Set(allBefore.filter((t) => t.customerId && t.type !== 'return').map((t) => t.customerId));
  const returningCustomers = [...customerSpend.keys()].filter((id) => seenBefore.has(id)).length;

  const daily = [...dailyMap.values()].map((d) => ({ ...d, sales: round2(d.sales) }));
  const topProducts = [...products.values()]
    .map((p) => ({ ...p, revenue: round2(p.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  const paymentMethods = [...methods.entries()]
    .map(([method, amount]) => ({ method, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const customers = rg.customersDb ? await rg.customersDb.readAll() : [];

  return {
    days: n,
    from: iso(from),
    to: iso(today),
    current,
    previous,
    change: {
      netSales: pctChange(current.netSales, previous.netSales),
      bills: pctChange(current.bills, previous.bills),
      avgBill: pctChange(current.avgBill, previous.avgBill),
      itemsSold: pctChange(current.itemsSold, previous.itemsSold)
    },
    daily,
    byWeekday: byWeekday.map((d) => ({ ...d, sales: round2(d.sales) })),
    byHour: byHour.map((h) => ({ ...h, sales: round2(h.sales) })),
    paymentMethods,
    topProducts,
    customers: {
      total: customers.length,
      buyingThisPeriod: customerSpend.size,
      returning: returningCustomers,
      new: customerSpend.size - returningCustomers
    },
    outstandingDue: round2(customers.reduce((s, c) => s + (c.balance || 0), 0))
  };
}

module.exports = { dashboard, transactionDetails, productDetails, customerReport, toCsv };
