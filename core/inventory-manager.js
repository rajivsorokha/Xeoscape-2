// core/inventory-manager.js
// Tracks stock levels and stock-movement history, independent of the
// product-manager so stock adjustments can be audited separately.

const { randomUUID } = require('crypto');
const SqliteStore = require('./sqlite-store');

const MOVEMENT_TYPES = ['restock', 'sale', 'adjustment', 'return'];

class InventoryManager {
  constructor(dataDir, productManager) {
    this.productManager = productManager;
    this.movements = new SqliteStore(dataDir, 'stock_movements');
  }

  async getStock(productId) {
    const product = await this.productManager.get(productId);
    return product ? product.stock || 0 : null;
  }

  async adjustStock(productId, delta, type = 'adjustment', note = '') {
    if (!MOVEMENT_TYPES.includes(type)) {
      throw new Error(`Invalid movement type: ${type}`);
    }
    const product = await this.productManager.get(productId);
    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }
    const newStock = (product.stock || 0) + delta;
    if (newStock < 0 && !product.disableStockCheck) {
      throw new Error(`Insufficient stock for product "${product.name}"`);
    }
    await this.productManager.update(productId, { stock: newStock });
    return this.movements.insert({
      id: randomUUID(),
      productId,
      delta,
      type,
      note,
      resultingStock: newStock,
      timestamp: new Date().toISOString()
    });
  }

  async restock(productId, quantity, note = '') {
    return this.adjustStock(productId, Math.abs(quantity), 'restock', note);
  }

  async deductForSale(productId, quantity, note = '') {
    return this.adjustStock(productId, -Math.abs(quantity), 'sale', note);
  }

  async history(productId) {
    const movements = await this.movements.readAll();
    return movements.filter((m) => m.productId === productId);
  }

  /**
   * Threshold used for a given product: an explicit per-product
   * `reorderPoint` wins, falling back to the older `minStock` field
   * (still used by some store types, e.g. Pharmacy), falling back to
   * `defaultThreshold` when neither is set.
   */
  _thresholdFor(product, defaultThreshold) {
    if (typeof product.reorderPoint === 'number') return product.reorderPoint;
    if (typeof product.minStock === 'number') return product.minStock;
    return defaultThreshold;
  }

  /**
   * Products at or below their reorder point. Each row carries enough
   * to drive both the Low Stock report UI and one-click Purchase Order
   * creation: vendor (to group suggested POs), cost (for a suggested
   * PO's estimated total), and a suggested reorder quantity -- the
   * product's own `reorderQty` if set, otherwise enough to bring stock
   * back up to 2x the reorder point (a simple, transparent default;
   * never less than 1).
   */
  async lowStockReport(defaultThreshold = 5) {
    const products = await this.productManager.list();
    return products
      .filter((p) => (p.stock || 0) <= this._thresholdFor(p, defaultThreshold))
      .map((p) => {
        const threshold = this._thresholdFor(p, defaultThreshold);
        const stock = p.stock || 0;
        const suggestedQty = typeof p.reorderQty === 'number' && p.reorderQty > 0
          ? p.reorderQty
          : Math.max(1, threshold * 2 - stock);
        return {
          id: p.id,
          name: p.name,
          sku: p.sku || '',
          vendor: p.vendor || '',
          stock,
          minStock: p.minStock ?? null,
          reorderPoint: threshold,
          reorderQty: suggestedQty,
          cost: typeof p.cost === 'number' ? p.cost : null
        };
      })
      .sort((a, b) => a.stock - b.stock);
  }

  /**
   * Reconstructs what a product's stock level was at a specific point
   * in time. Works backward from the CURRENT stock level by reversing
   * every movement that happened strictly after `asOfDate` (current
   * stock minus the sum of those deltas) -- this stays correct even
   * when a product's entire movement history falls after the cutoff
   * (e.g. asking about "yesterday" for a product only restocked
   * today), unlike a forward reconstruction that would have nothing
   * to anchor to before the cutoff. `asOfDate` of null/undefined means
   * "now", i.e. just current stock.
   */
  async stockAsOf(productId, asOfDate) {
    const product = await this.productManager.get(productId);
    if (!product) return null;
    if (!asOfDate) return product.stock || 0;

    const cutoff = new Date(asOfDate);
    const movementsAfterCutoff = (await this.history(productId))
      .filter((m) => new Date(m.timestamp) > cutoff);
    const deltaAfterCutoff = movementsAfterCutoff.reduce((sum, m) => sum + m.delta, 0);

    return (product.stock || 0) - deltaAfterCutoff;
  }

  /** Products whose expirationDate has already passed or falls within `withinDays`. */
  async expiryReport(withinDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    const products = await this.productManager.list();
    return products
      .filter((p) => p.expirationDate)
      .filter((p) => new Date(p.expirationDate) <= cutoff)
      .map((p) => ({ id: p.id, name: p.name, expirationDate: p.expirationDate, stock: p.stock || 0 }))
      .sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));
  }
}

module.exports = InventoryManager;
