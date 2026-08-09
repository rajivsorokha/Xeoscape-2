// core/transaction-manager.js
// Processes sale transactions against the product/inventory managers.
// Generic across store types -- no store-specific (e.g. pharmacy) logic.

const { randomUUID } = require('crypto');
const SqliteStore = require('./sqlite-store');
const storeConfig = require('./store-config');

class TransactionManager {
  constructor(dataDir, productManager, inventoryManager, storeProfile) {
    this.productManager = productManager;
    this.inventoryManager = inventoryManager;
    this.storeProfile = storeProfile;
    this.db = new SqliteStore(dataDir, 'transactions');
    // Only used to credit a customer's due balance on a partial
    // payment (checkout below) -- kept minimal rather than pulling in
    // the whole customers API surface.
    this.customersDb = new SqliteStore(dataDir, 'customers');
  }

  /**
   * items: [{ productId, quantity }]
   */
  async checkout({ items, customerId = null, paymentMethod = 'cash', cashierId = null, discount = 0, paidAmount = null, seatAssignment = null }) {
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
    const afterDiscount = Number(Math.max(subtotal - discount, 0).toFixed(2));

    // Tax was previously computed for on-screen display only
    // (cart-ui.js#computeGross) but never actually charged or stored
    // -- the "Gross Price (inc tax)" shown on the POS panel and the
    // amount actually billed/recorded were two different numbers.
    // Fixed here so what's displayed, charged, and stored all agree.
    const profile = await this.storeProfile.get();
    const taxAmount = profile.chargeTax
      ? Number((afterDiscount * ((profile.taxPercentage || 0) / 100)).toFixed(2))
      : 0;
    const total = Number((afterDiscount + taxAmount).toFixed(2));

    // For card payments (or when no paidAmount is supplied) treat the
    // amount paid as exactly the total, so change is always well-defined.
    const paid = paidAmount === null || paidAmount === undefined ? total : Number(paidAmount);
    const dueAmount = Number(Math.max(total - paid, 0).toFixed(2));

    // Credit/due payment is a B2B General Retail feature only --
    // wholesale accounts run on payment terms; walk-in retail,
    // pharmacy, and restaurant/cafe counters are expected to be paid
    // in full at the point of sale. Enforced here (not just hidden in
    // the UI) so it can't be bypassed by calling the API directly.
    if (dueAmount > 0 && storeConfig.currentStoreType !== 'b2bGeneralRetail') {
      throw new Error('Due/credit payment is only available for B2B General Retail -- this sale must be paid in full.');
    }
    if (dueAmount > 0 && !customerId) {
      throw new Error('Select a customer to leave a balance due -- a walk-in sale must be paid in full.');
    }

    const change = Number(Math.max(paid - total, 0).toFixed(2));

    // Deduct stock for each line item
    for (const li of lineItems) {
      await this.inventoryManager.deductForSale(li.productId, li.quantity, `txn-checkout`);
    }

    // Credit the due amount onto the customer's running balance --
    // paid off later via POST /api/customers/:id/pay-balance.
    if (dueAmount > 0) {
      const customer = await this.customersDb.findById(customerId);
      if (customer) {
        await this.customersDb.update(customerId, { balance: Number(((customer.balance || 0) + dueAmount).toFixed(2)) });
      }
    }

    const transaction = {
      id: randomUUID(),
      items: lineItems,
      subtotal,
      discount,
      taxAmount,
      taxPercentage: profile.chargeTax ? (profile.taxPercentage || 0) : 0,
      total,
      paidAmount: paid,
      dueAmount,
      change,
      customerId,
      cashierId,
      paymentMethod,
      seatAssignment,
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
  async hold({ items, ref = '', customerId = null, cashierId = null, discount = 0, seatAssignment = null }) {
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
    const afterDiscount = Number(Math.max(subtotal - discount, 0).toFixed(2));
    const profile = await this.storeProfile.get();
    const taxAmount = profile.chargeTax
      ? Number((afterDiscount * ((profile.taxPercentage || 0) / 100)).toFixed(2))
      : 0;
    const total = Number((afterDiscount + taxAmount).toFixed(2));

    const allTransactions = await this.db.readAll();
    const pendingCount = allTransactions.filter((t) => t.status === 'pending').length;

    const transaction = {
      id: randomUUID(),
      ref: ref || `Order ${pendingCount + 1}`,
      items: lineItems,
      subtotal,
      discount,
      taxAmount,
      taxPercentage: profile.chargeTax ? (profile.taxPercentage || 0) : 0,
      total,
      paidAmount: 0,
      change: 0,
      customerId,
      cashierId,
      paymentMethod: null,
      seatAssignment,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    return this.db.insert(transaction);
  }

  /**
   * Completes a previously-held ("Unpaid") order: deducts stock now
   * (prices AND tax are re-validated against current product prices/
   * store tax settings at pay time, matching checkout()) and marks it
   * 'completed'. Also supports a partial/due payment the same way
   * checkout() does, when a customer is attached to the order.
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

    const afterDiscount = Number(Math.max(txn.subtotal - (txn.discount || 0), 0).toFixed(2));
    const profile = await this.storeProfile.get();
    const taxAmount = profile.chargeTax
      ? Number((afterDiscount * ((profile.taxPercentage || 0) / 100)).toFixed(2))
      : 0;
    const total = Number((afterDiscount + taxAmount).toFixed(2));

    const paid = paidAmount === null || paidAmount === undefined ? total : Number(paidAmount);
    const dueAmount = Number(Math.max(total - paid, 0).toFixed(2));
    if (dueAmount > 0 && storeConfig.currentStoreType !== 'b2bGeneralRetail') {
      throw new Error('Due/credit payment is only available for B2B General Retail -- this order must be paid in full.');
    }
    if (dueAmount > 0 && !txn.customerId) {
      throw new Error('This order has no customer attached, so it must be paid in full.');
    }
    const change = Number(Math.max(paid - total, 0).toFixed(2));

    for (const li of txn.items) {
      await this.inventoryManager.deductForSale(li.productId, li.quantity, `txn-hold-payment`);
    }

    if (dueAmount > 0) {
      const customer = await this.customersDb.findById(txn.customerId);
      if (customer) {
        await this.customersDb.update(txn.customerId, { balance: Number(((customer.balance || 0) + dueAmount).toFixed(2)) });
      }
    }

    return this.db.update(transactionId, {
      status: 'completed',
      paymentMethod,
      taxAmount,
      taxPercentage: profile.chargeTax ? (profile.taxPercentage || 0) : 0,
      total,
      paidAmount: paid,
      dueAmount,
      change,
      paidAt: new Date().toISOString()
    });
  }

  /**
   * Returns some or all items from a completed sale: restocks the
   * returned quantities and records a linked 'returned' transaction
   * (negative totals) for the refund, rather than mutating the
   * original sale -- keeps the original an accurate record of what
   * was actually sold, with the return as its own auditable entry.
   * Tracks cumulative returned quantity per product on the original
   * transaction so repeated partial returns can't exceed what was
   * bought.
   */
  async returnItems(transactionId, { items, reason = '', cashierId = null } = {}) {
    const txn = await this.db.findById(transactionId);
    if (!txn) throw new Error(`Transaction not found: ${transactionId}`);
    if (txn.status !== 'completed') throw new Error('Only completed sales can be returned against.');
    if (!Array.isArray(items) || items.length === 0) throw new Error('Select at least one item to return.');

    const alreadyReturned = { ...(txn.returnedQuantities || {}) };
    const returnLineItems = [];

    for (const { productId, quantity } of items) {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const original = txn.items.find((li) => li.productId === productId);
      if (!original) throw new Error(`That product wasn't part of this sale.`);
      const returnedSoFar = alreadyReturned[productId] || 0;
      if (returnedSoFar + qty > original.quantity) {
        throw new Error(`Cannot return ${qty} of "${original.name}" -- only ${original.quantity - returnedSoFar} of ${original.quantity} remain returnable.`);
      }
      // Stored negative -- any per-product aggregation elsewhere
      // (topProducts, productPerformance, itemsSold) sums li.quantity
      // and li.lineTotal directly across all transactions with no
      // special-casing for a 'return' type, so a negative value here
      // is what makes a return actually net out of those figures
      // rather than being counted as more positive revenue/units.
      returnLineItems.push({
        productId,
        name: original.name,
        sku: original.sku,
        unitPrice: original.unitPrice,
        quantity: -qty,
        lineTotal: Number((-original.unitPrice * qty).toFixed(2))
      });
    }
    if (!returnLineItems.length) throw new Error('Select at least one item to return.');

    for (const li of returnLineItems) {
      const qty = Math.abs(li.quantity);
      await this.inventoryManager.restock(li.productId, qty, `return-${transactionId}`);
      alreadyReturned[li.productId] = (alreadyReturned[li.productId] || 0) + qty;
    }

    const refundTotal = Number(returnLineItems.reduce((sum, li) => sum + Math.abs(li.lineTotal), 0).toFixed(2));

    const returnTxn = {
      id: randomUUID(),
      items: returnLineItems,
      subtotal: -refundTotal,
      discount: 0,
      total: -refundTotal,
      paidAmount: -refundTotal,
      dueAmount: 0,
      change: 0,
      customerId: txn.customerId,
      cashierId,
      paymentMethod: txn.paymentMethod,
      // Deliberately status:'completed' (not a separate 'returned'
      // status) -- report-generator.js's revenue queries filter on
      // status:'completed', so this negative-total transaction nets
      // out of sales totals automatically through the exact same
      // code path a normal sale does, rather than needing every
      // report updated to know about a new status. `type` is purely
      // a UI marker (badge in the transaction list) for what it is.
      status: 'completed',
      type: 'return',
      originalTransactionId: transactionId,
      reason,
      createdAt: new Date().toISOString()
    };
    await this.db.insert(returnTxn);
    await this.db.update(transactionId, { returnedQuantities: alreadyReturned });
    return returnTxn;
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
