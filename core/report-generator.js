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
}

module.exports = ReportGenerator;
