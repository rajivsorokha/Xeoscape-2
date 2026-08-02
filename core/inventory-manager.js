// core/inventory-manager.js
// Tracks stock levels and stock-movement history, independent of the
// product-manager so stock adjustments can be audited separately.

const { randomUUID } = require('crypto');
const NedbStore = require('./nedb-store');

const MOVEMENT_TYPES = ['restock', 'sale', 'adjustment', 'return'];

class InventoryManager {
  constructor(dataDir, productManager) {
    this.productManager = productManager;
    this.movements = new NedbStore(dataDir, 'stock_movements');
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

  async lowStockReport(defaultThreshold = 5) {
    const products = await this.productManager.list();
    return products
      .filter((p) => (p.stock || 0) <= (typeof p.minStock === 'number' ? p.minStock : defaultThreshold))
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock || 0, minStock: p.minStock ?? defaultThreshold }));
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
