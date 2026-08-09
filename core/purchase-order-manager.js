// core/purchase-order-manager.js
// Purchase orders for replenishing low-stock inventory. Deliberately
// simple: one PO has a vendor, a list of ordered items (productId,
// quantityOrdered, unitCost), and a status. Receiving a PO (in full or
// in part) writes real 'restock' stock movements via InventoryManager,
// so received quantities show up in stock history and the Stock on
// Hand / Product Performance reports exactly like a manual restock
// would -- no separate, disconnected "received" ledger.

const { randomUUID } = require('crypto');
const SqliteStore = require('./sqlite-store');

const STATUSES = ['draft', 'ordered', 'partially_received', 'received', 'cancelled'];

function computeStatus(items) {
  const totalOrdered = items.reduce((s, i) => s + i.quantityOrdered, 0);
  const totalReceived = items.reduce((s, i) => s + (i.quantityReceived || 0), 0);
  if (totalReceived === 0) return null; // caller decides draft vs ordered
  if (totalReceived >= totalOrdered) return 'received';
  return 'partially_received';
}

class PurchaseOrderManager {
  constructor(dataDir, inventoryManager, productManager) {
    this.db = new SqliteStore(dataDir, 'purchase_orders');
    this.inventoryManager = inventoryManager;
    this.productManager = productManager;
  }

  async list({ status, vendor } = {}) {
    let orders = await this.db.readAll();
    if (status) orders = orders.filter((o) => o.status === status);
    if (vendor) {
      const q = vendor.toLowerCase();
      orders = orders.filter((o) => (o.vendor || '').toLowerCase() === q);
    }
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async get(id) {
    return this.db.findById(id);
  }

  /**
   * Creates a purchase order. `items`: [{ productId, quantityOrdered, unitCost? }].
   * Product name/sku are snapshotted onto each line at creation time so
   * the PO stays readable even if a product is later renamed or deleted.
   */
  async create({ vendor = '', items = [], notes = '', expectedDate = null } = {}) {
    if (!items.length) {
      throw new Error('A purchase order needs at least one item.');
    }
    const lineItems = [];
    for (const item of items) {
      const product = await this.productManager.get(item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      const quantityOrdered = Math.max(1, Math.round(item.quantityOrdered || 1));
      const unitCost = typeof item.unitCost === 'number' ? item.unitCost : (typeof product.cost === 'number' ? product.cost : 0);
      lineItems.push({
        productId: product.id,
        name: product.name,
        sku: product.sku || '',
        quantityOrdered,
        quantityReceived: 0,
        unitCost
      });
    }

    const order = {
      id: randomUUID(),
      poNumber: `PO-${Date.now().toString(36).toUpperCase()}`,
      vendor,
      status: 'ordered',
      items: lineItems,
      notes,
      expectedDate,
      totalCost: Number(lineItems.reduce((s, i) => s + i.unitCost * i.quantityOrdered, 0).toFixed(2)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.db.insert(order);
  }

  async update(id, patch) {
    const allowed = ['vendor', 'notes', 'expectedDate', 'status'];
    if (patch.status && !STATUSES.includes(patch.status)) {
      throw new Error(`status must be one of: ${STATUSES.join(', ')}`);
    }
    const safePatch = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) safePatch[key] = patch[key];
    }
    return this.db.update(id, { ...safePatch, updatedAt: new Date().toISOString() });
  }

  async remove(id) {
    return this.db.remove(id);
  }

  /**
   * Marks quantities as received and restocks inventory accordingly.
   * `receipts`: [{ productId, quantityReceived }] -- quantities are
   * ADDED to whatever was already received on that line (so partial
   * receipts across multiple deliveries accumulate correctly), capped
   * at the ordered quantity. Status becomes 'partially_received' or
   * 'received' automatically based on totals across all lines.
   */
  async receive(id, receipts = []) {
    const order = await this.db.findById(id);
    if (!order) throw new Error('Purchase order not found');
    if (order.status === 'cancelled') throw new Error('Cannot receive a cancelled purchase order');

    const receiptByProduct = new Map(receipts.map((r) => [r.productId, r.quantityReceived]));

    const updatedItems = [];
    for (const item of order.items) {
      const additional = receiptByProduct.get(item.productId);
      let quantityReceived = item.quantityReceived || 0;
      if (additional) {
        const toReceive = Math.max(0, Math.min(Number(additional), item.quantityOrdered - quantityReceived));
        if (toReceive > 0) {
          await this.inventoryManager.restock(item.productId, toReceive, `Received on ${order.poNumber}`);
          quantityReceived += toReceive;
        }
      }
      updatedItems.push({ ...item, quantityReceived });
    }

    const nextStatus = computeStatus(updatedItems) || order.status;
    return this.db.update(id, { items: updatedItems, status: nextStatus, updatedAt: new Date().toISOString() });
  }

  /**
   * Builds one suggested draft PO per vendor from the current Low
   * Stock report, using each product's suggested reorder quantity
   * (see inventoryManager.lowStockReport). Products with no vendor set
   * are grouped under an empty-string "vendor" -- the caller/UI is
   * expected to prompt for a vendor before actually creating those.
   * Returns suggestions only; nothing is persisted here.
   */
  async suggestFromLowStock() {
    const lowStock = await this.inventoryManager.lowStockReport();
    const byVendor = new Map();
    for (const item of lowStock) {
      const key = item.vendor || '';
      if (!byVendor.has(key)) byVendor.set(key, []);
      byVendor.get(key).push({
        productId: item.id,
        name: item.name,
        sku: item.sku,
        quantityOrdered: item.reorderQty,
        unitCost: item.cost || 0
      });
    }
    return [...byVendor.entries()].map(([vendor, items]) => ({
      vendor,
      items,
      estimatedTotal: Number(items.reduce((s, i) => s + i.unitCost * i.quantityOrdered, 0).toFixed(2))
    }));
  }
}

module.exports = PurchaseOrderManager;
module.exports.STATUSES = STATUSES;
