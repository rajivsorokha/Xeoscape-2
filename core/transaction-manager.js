// core/transaction-manager.js
// Processes sale transactions against the product/inventory managers.
// Generic across store types -- no store-specific (e.g. pharmacy) logic.

const { randomUUID } = require('crypto');
const NedbStore = require('./nedb-store');

class TransactionManager {
  constructor(dataDir, productManager, inventoryManager) {
    this.productManager = productManager;
    this.inventoryManager = inventoryManager;
    this.db = new NedbStore(dataDir, 'transactions');
  }

  /**
   * items: [{ productId, quantity }]
   */
  async checkout({ items, customerId = null, paymentMethod = 'cash', cashierId = null, discount = 0, paidAmount = null }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Transaction must include at least one item');
    }

    const lineItems = [];
    for (const { productId, quantity } of items) {
      const product = await this.productManager.get(productId);
      if (!product) throw new Error(`Product not found: ${productId}`);
      if ((product.stock || 0) < quantity && !product.disableStockCheck) {
        throw new Error(`Insufficient stock for "${product.name}"`);
      }
      lineItems.push({
        productId,
        name: product.name,
        sku: product.sku,
        unitPrice: product.price,
        quantity,
        lineTotal: Number((product.price * quantity).toFixed(2))
      });
    }

    const subtotal = Number(lineItems.reduce((sum, li) => sum + li.lineTotal, 0).toFixed(2));
    const total = Number(Math.max(subtotal - discount, 0).toFixed(2));

    // For card payments (or when no paidAmount is supplied) treat the
    // amount paid as exactly the total, so change is always well-defined.
    const paid = paidAmount === null || paidAmount === undefined ? total : Number(paidAmount);
    const change = Number(Math.max(paid - total, 0).toFixed(2));

    // Deduct stock for each line item
    for (const li of lineItems) {
      await this.inventoryManager.deductForSale(li.productId, li.quantity, `txn-checkout`);
    }

    const transaction = {
      id: randomUUID(),
      items: lineItems,
      subtotal,
      discount,
      total,
      paidAmount: paid,
      change,
      customerId,
      cashierId,
      paymentMethod,
      status: 'completed',
      createdAt: new Date().toISOString()
    };

    return this.db.insert(transaction);
  }

  /**
   * Holds an order as a real "Unpaid" transaction (status: 'pending'),
   * matching the real app's Open Tabs / on-hold model. Unlike checkout(),
   * this does NOT deduct stock -- stock is only committed once the held
   * order is actually paid via payFromHold().
   */
  async hold({ items, ref = '', customerId = null, cashierId = null, discount = 0 }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Cannot hold an empty order');
    }

    const lineItems = [];
    for (const { productId, quantity } of items) {
      const product = await this.productManager.get(productId);
      if (!product) throw new Error(`Product not found: ${productId}`);
      lineItems.push({
        productId,
        name: product.name,
        sku: product.sku,
        unitPrice: product.price,
        quantity,
        lineTotal: Number((product.price * quantity).toFixed(2))
      });
    }

    const subtotal = Number(lineItems.reduce((sum, li) => sum + li.lineTotal, 0).toFixed(2));
    const total = Number(Math.max(subtotal - discount, 0).toFixed(2));

    const allTransactions = await this.db.readAll();
    const pendingCount = allTransactions.filter((t) => t.status === 'pending').length;

    const transaction = {
      id: randomUUID(),
      ref: ref || `Order ${pendingCount + 1}`,
      items: lineItems,
      subtotal,
      discount,
      total,
      paidAmount: 0,
      change: 0,
      customerId,
      cashierId,
      paymentMethod: null,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    return this.db.insert(transaction);
  }

  /**
   * Completes a previously-held ("Unpaid") order: deducts stock now
   * (prices are re-validated against current product prices at pay
   * time, matching checkout()) and marks it 'completed'.
   */
  async payFromHold(transactionId, { paymentMethod = 'cash', paidAmount = null } = {}) {
    const txn = await this.db.findById(transactionId);
    if (!txn) throw new Error(`Transaction not found: ${transactionId}`);
    if (txn.status !== 'pending') throw new Error('Only unpaid/held orders can be paid from hold.');

    for (const li of txn.items) {
      const product = await this.productManager.get(li.productId);
      if (!product) throw new Error(`Product not found: ${li.productId}`);
      if ((product.stock || 0) < li.quantity && !product.disableStockCheck) {
        throw new Error(`Insufficient stock for "${product.name}"`);
      }
    }

    const paid = paidAmount === null || paidAmount === undefined ? txn.total : Number(paidAmount);
    const change = Number(Math.max(paid - txn.total, 0).toFixed(2));

    for (const li of txn.items) {
      await this.inventoryManager.deductForSale(li.productId, li.quantity, `txn-hold-payment`);
    }

    return this.db.update(transactionId, {
      status: 'completed',
      paymentMethod,
      paidAmount: paid,
      change,
      paidAt: new Date().toISOString()
    });
  }

  async void(transactionId, reason = '') {
    const txn = await this.db.findById(transactionId);
    if (!txn) throw new Error(`Transaction not found: ${transactionId}`);
    if (txn.status === 'voided') return txn;

    // Pending (held/unpaid) orders never deducted stock, so voiding one
    // shouldn't restock anything -- only completed sales get restocked.
    if (txn.status === 'completed') {
      for (const li of txn.items) {
        await this.inventoryManager.restock(li.productId, li.quantity, `void-${transactionId}`);
      }
    }

    return this.db.update(transactionId, { status: 'voided', voidReason: reason, voidedAt: new Date().toISOString() });
  }

  async get(id) {
    return this.db.findById(id);
  }

  async list({ from, to, status, customerId } = {}) {
    let transactions = await this.db.readAll();
    if (status) transactions = transactions.filter((t) => t.status === status);
    if (customerId) transactions = transactions.filter((t) => t.customerId === customerId);
    // A bare "YYYY-MM-DD" string (no time component) parses as UTC
    // midnight. That's the right boundary for `from` (start of day),
    // but for `to` it would exclude every transaction from that entire
    // day except ones at exactly 00:00:00 -- so a date-only `to` is
    // normalized to the end of that day instead.
    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
    if (from) transactions = transactions.filter((t) => new Date(t.createdAt) >= new Date(from));
    if (to) {
      const toDate = DATE_ONLY.test(to) ? new Date(`${to}T23:59:59.999`) : new Date(to);
      transactions = transactions.filter((t) => new Date(t.createdAt) <= toDate);
    }
    return transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

module.exports = TransactionManager;
