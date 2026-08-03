// core/report-generator.js
// Generates sales and inventory reports from transaction/product data.

class ReportGenerator {
  constructor(transactionManager, productManager, inventoryManager) {
    this.transactionManager = transactionManager;
    this.productManager = productManager;
    this.inventoryManager = inventoryManager;
  }

  async salesSummary({ from, to } = {}) {
    const transactions = await this.transactionManager.list({ from, to, status: 'completed' });

    const totalRevenue = transactions.reduce((sum, t) => sum + t.total, 0);
    const totalTransactions = transactions.length;
    const itemsSold = transactions.reduce(
      (sum, t) => sum + t.items.reduce((s, li) => s + li.quantity, 0),
      0
    );

    return {
      from: from || null,
      to: to || null,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalTransactions,
      itemsSold,
      averageTransactionValue: totalTransactions
        ? Number((totalRevenue / totalTransactions).toFixed(2))
        : 0
    };
  }

  async topProducts({ from, to, limit = 5 } = {}) {
    const transactions = await this.transactionManager.list({ from, to, status: 'completed' });
    const tally = {};

    transactions.forEach((t) => {
      t.items.forEach((li) => {
        if (!tally[li.productId]) {
          tally[li.productId] = { productId: li.productId, name: li.name, quantity: 0, revenue: 0 };
        }
        tally[li.productId].quantity += li.quantity;
        tally[li.productId].revenue += li.lineTotal;
      });
    });

    return Object.values(tally)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit)
      .map((p) => ({ ...p, revenue: Number(p.revenue.toFixed(2)) }));
  }

  async inventoryStatus() {
    const [products, lowStock] = await Promise.all([
      this.productManager.list(),
      this.inventoryManager.lowStockReport()
    ]);
    return {
      totalProducts: products.length,
      lowStock
    };
  }

  /**
   * Daily time series combining sales and stock data for one product,
   * built from the real stock_movements history that checkout()/
   * restock() already write (see core/inventory-manager.js) -- not
   * synthetic data. Answers exactly what the merchant needs to see:
   * how stock has moved day to day, how demand (units sold) tracks
   * against it, and whether the product is heading toward a stockout
   * at its current sales pace.
   *
   *  - days[]: one entry per calendar day in range, each with
   *    { date, unitsSold, unitsRestocked, stockLevel } -- stockLevel
   *    is the end-of-day stock, carried forward on days with no
   *    movement so the line has no gaps.
   *  - avgDailySales / projectedDaysToStockout: velocity over the
   *    last up-to-14 days in range, projected against current stock.
   *    Null when there's no recent sales velocity to project from.
   *  - stockoutRisk: true when that projection is 7 days or less.
   */
  async inventoryMovement({ productId, from, to } = {}) {
    const product = await this.productManager.get(productId);
    if (!product) throw new Error(`Product not found: ${productId}`);

    const allMovements = await this.inventoryManager.history(productId);
    const inRange = allMovements
      .filter((m) => (!from || m.timestamp >= from) && (!to || m.timestamp <= to))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const dayBuckets = new Map();
    inRange.forEach((m) => {
      const dateKey = m.timestamp.slice(0, 10);
      if (!dayBuckets.has(dateKey)) {
        dayBuckets.set(dateKey, { unitsSold: 0, unitsRestocked: 0, endOfDayStock: m.resultingStock });
      }
      const bucket = dayBuckets.get(dateKey);
      if (m.type === 'sale') bucket.unitsSold += Math.abs(m.delta);
      if (m.type === 'restock') bucket.unitsRestocked += Math.abs(m.delta);
      // Movements within a day are already in chronological order (we
      // sorted `inRange` above), so the last one processed is always
      // the true end-of-day stock.
      bucket.endOfDayStock = m.resultingStock;
    });

    const days = [];
    if (from && to) {
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setHours(0, 0, 0, 0);

      // Seed the carry-forward stock level from the last movement
      // strictly before the range, so day 1 isn't a false gap; fall
      // back to current stock if there's no earlier history at all
      // (best available estimate, not perfectly retroactive).
      const earlierMovements = allMovements
        .filter((m) => new Date(m.timestamp) < start)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      let carryStock = earlierMovements.length
        ? earlierMovements[earlierMovements.length - 1].resultingStock
        : (product.stock || 0);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        const bucket = dayBuckets.get(key);
        if (bucket) carryStock = bucket.endOfDayStock;
        days.push({
          date: key,
          unitsSold: bucket ? bucket.unitsSold : 0,
          unitsRestocked: bucket ? bucket.unitsRestocked : 0,
          stockLevel: carryStock
        });
      }
    } else {
      [...dayBuckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([date, bucket]) => days.push({
          date,
          unitsSold: bucket.unitsSold,
          unitsRestocked: bucket.unitsRestocked,
          stockLevel: bucket.endOfDayStock
        }));
    }

    const minStock = typeof product.minStock === 'number' ? product.minStock : 5;
    const recentDays = days.slice(-14);
    const totalRecentSales = recentDays.reduce((sum, d) => sum + d.unitsSold, 0);
    const avgDailySales = recentDays.length ? totalRecentSales / recentDays.length : 0;
    const currentStock = product.stock || 0;
    const projectedDaysToStockout = avgDailySales > 0 ? Math.round(currentStock / avgDailySales) : null;

    return {
      productId,
      productName: product.name,
      sku: product.sku,
      currentStock,
      minStock,
      avgDailySales: Number(avgDailySales.toFixed(2)),
      projectedDaysToStockout,
      stockoutRisk: projectedDaysToStockout !== null && projectedDaysToStockout <= 7,
      days
    };
  }

  /**
   * Per-product performance analysis for spotting low-selling /
   * weak-demand items, built entirely from data this app already has
   * (transactions + current product stock/price/optional cost) --
   * see the design notes on each metric below for exactly what it
   * does and doesn't claim.
   *
   *  - ABC / Pareto classification: products ranked by revenue, then
   *    bucketed by cumulative revenue share (A = top ~80%, B = next
   *    ~15%, C = bottom ~5%) -- the standard 80/20 analysis.
   *  - Basket penetration: % of completed transactions that included
   *    the product at all (cheap, real proxy for cross-sell reach).
   *  - Sales Z-score: how many standard deviations a product's units
   *    sold in-range sits from the store's per-product average --
   *    flags statistical outliers on the low side.
   *  - "Days of stock at current pace": current stock \u00f7 (units sold
   *    \u00f7 days in range). This is a velocity proxy, not a formal
   *    Days-Sales-of-Inventory figure (that needs COGS and an average
   *    inventory value over time, which this app doesn't track) --
   *    it answers "at this rate, how long would today's stock last?"
   *  - Gross margin: only computed when the product has an optional
   *    Cost Price set (see COST_FIELD in store-config.js); null
   *    otherwise rather than guessing.
   *  - flaggedSlowMoving: true when a product is both bottom-tier (C)
   *    by revenue AND either had zero sales in range or its sales
   *    Z-score is \u2264 -1.5 -- i.e. flagged by two independent signals,
   *    not just one noisy one.
   */
  async productPerformance({ from, to } = {}) {
    const [transactions, products] = await Promise.all([
      this.transactionManager.list({ from, to, status: 'completed' }),
      this.productManager.list()
    ]);

    const totalRevenue = Number(transactions.reduce((sum, t) => sum + t.total, 0).toFixed(2));
    const totalBaskets = transactions.length;

    const tally = new Map();
    transactions.forEach((t) => {
      const seenInThisBasket = new Set();
      t.items.forEach((li) => {
        if (!tally.has(li.productId)) {
          tally.set(li.productId, { unitsSold: 0, revenue: 0, basketCount: 0 });
        }
        const row = tally.get(li.productId);
        row.unitsSold += li.quantity;
        row.revenue += li.lineTotal;
        if (!seenInThisBasket.has(li.productId)) {
          row.basketCount += 1;
          seenInThisBasket.add(li.productId);
        }
      });
    });

    // Every current product is included, even with zero sales in
    // range -- a product that sold nothing is exactly the "weak
    // demand" case this report exists to surface.
    const rows = products.map((p) => {
      const t = tally.get(p.id) || { unitsSold: 0, revenue: 0, basketCount: 0 };
      const cost = typeof p.cost === 'number' ? p.cost : null;
      const marginPct = cost != null && p.price
        ? Number((((p.price - cost) / p.price) * 100).toFixed(1))
        : null;
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category || null,
        currentStock: p.stock || 0,
        unitsSold: t.unitsSold,
        revenue: Number(t.revenue.toFixed(2)),
        marginPct,
        basketPenetrationPct: totalBaskets ? Number(((t.basketCount / totalBaskets) * 100).toFixed(1)) : 0
      };
    });

    const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
    let cumulative = 0;
    sorted.forEach((r) => {
      cumulative += r.revenue;
      r.revenueSharePct = totalRevenue ? Number(((r.revenue / totalRevenue) * 100).toFixed(2)) : 0;
      const cumulativeSharePct = totalRevenue ? Number(((cumulative / totalRevenue) * 100).toFixed(2)) : 0;
      r.cumulativeSharePct = cumulativeSharePct;
      r.abcClass = !totalRevenue ? 'C' : cumulativeSharePct <= 80 ? 'A' : cumulativeSharePct <= 95 ? 'B' : 'C';
    });

    const unitsSoldValues = sorted.map((r) => r.unitsSold);
    const mean = unitsSoldValues.reduce((s, v) => s + v, 0) / (unitsSoldValues.length || 1);
    const variance = unitsSoldValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (unitsSoldValues.length || 1);
    const stdDev = Math.sqrt(variance);
    sorted.forEach((r) => {
      r.salesZScore = stdDev > 0 ? Number(((r.unitsSold - mean) / stdDev).toFixed(2)) : 0;
    });

    const days = from && to
      ? Math.max(1, Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)))
      : 30;
    sorted.forEach((r) => {
      const dailyRate = r.unitsSold / days;
      // null = "wouldn't run out at this pace within a projectable
      // window" (either no stock, or no sales to project from).
      r.daysOfStockAtCurrentPace = dailyRate > 0 ? Math.round(r.currentStock / dailyRate) : null;
    });

    sorted.forEach((r) => {
      r.flaggedSlowMoving = r.abcClass === 'C' && (r.unitsSold === 0 || r.salesZScore <= -1.5);
    });

    return {
      from: from || null,
      to: to || null,
      days,
      totalRevenue,
      totalBaskets,
      averageBasketValue: totalBaskets ? Number((totalRevenue / totalBaskets).toFixed(2)) : 0,
      unitsSoldMean: Number(mean.toFixed(2)),
      unitsSoldStdDev: Number(stdDev.toFixed(2)),
      items: sorted
    };
  }
}

module.exports = ReportGenerator;
