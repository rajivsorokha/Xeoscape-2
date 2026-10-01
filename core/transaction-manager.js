// core/transaction-manager.js
// Processes sale transactions against the product/inventory managers.
// Generic across store types -- no store-specific (e.g. pharmacy) logic.

const { randomUUID } = require('crypto');
const SqliteStore = require('./sqlite-store');

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
  async checkout({ items, customerId = null, paymentMethod = 'cash', cashierId = null, discount = 0, paidAmount = null, isTest = false }) {
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

    // Credit/due payment used to be gated on the B2B General Retail
    // store type. This build ships Apparel / Fashion only, so the gate
    // is now an explicit store setting instead (Settings -> Store
    // Profile -> "Allow credit / due sales"), off by default: a
    // walk-in boutique counter is paid in full, a wholesale or
    // dealer-facing garment business runs accounts. Enforced here (not
    // just hidden in the UI) so it can't be bypassed by calling the
    // API directly.
    if (dueAmount > 0 && !profile.creditSalesEnabled) {
      throw new Error('Credit / due sales are turned off. Enable them in Settings \u2192 Store Profile, or take payment in full.');
    }
    if (dueAmount > 0 && !customerId) {
      throw new Error('Select a customer to leave a balance due -- a walk-in sale must be paid in full.');
    }

    const change = Number(Math.max(paid - total, 0).toFixed(2));

    // Deduct stock for each line item. The availability check above
    // happens in its own earlier loop (not atomically with this one),
    // so two lines for the same product, or a concurrent sale on
    // another till, can still mean a later line here fails even though
    // every line looked fine a moment ago. If that happens mid-loop,
    // roll back whatever this same checkout already deducted -- the
    // transaction record is never written when this throws, so without
    // this, stock would be silently gone for a sale that doesn't exist.
    const deducted = [];
    try {
      for (const li of lineItems) {
        await this.inventoryManager.deductForSale(li.productId, li.quantity, `txn-checkout`);
        deducted.push(li);
      }
    } catch (err) {
      for (const li of deducted) {
        await this.inventoryManager.restock(li.productId, li.quantity, `txn-checkout-rollback`);
      }
      throw err;
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
      status: 'completed',
      // A cashier ringing up a demo/training sale marks it here rather
      // than it silently becoming an indistinguishable real sale --
      // see list()/deleteTestSale() below for how this keeps it out of
      // revenue reporting and makes it safely (hard-)deletable later,
      // unlike a genuine sale which is only ever voided, never removed.
      isTest: Boolean(isTest),
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
  async hold({ items, ref = '', customerId = null, cashierId = null, discount = 0, isTest = false }) {
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
      status: 'pending',
      isTest: Boolean(isTest),
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
    if (dueAmount > 0 && !profile.creditSalesEnabled) {
      throw new Error('Credit / due sales are turned off. Enable them in Settings \u2192 Store Profile, or take payment in full.');
    }
    if (dueAmount > 0 && !txn.customerId) {
      throw new Error('This order has no customer attached, so it must be paid in full.');
    }
    const change = Number(Math.max(paid - total, 0).toFixed(2));

    // Same rollback reasoning as checkout() above: the pre-check loop
    // just above isn't atomic with this one, so a later line can still
    // fail here even though everything looked available a moment ago.
    const deducted = [];
    try {
      for (const li of txn.items) {
        await this.inventoryManager.deductForSale(li.productId, li.quantity, `txn-hold-payment`);
        deducted.push(li);
      }
    } catch (err) {
      for (const li of deducted) {
        await this.inventoryManager.restock(li.productId, li.quantity, `txn-hold-payment-rollback`);
      }
      throw err;
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

    // BUGFIX: if this sale still has an amount due (a credit/due sale --
    // see checkout()'s dueAmount), a return against it was leaving that
    // due amount completely untouched: the customer would go on owing
    // the full original amount despite having handed back some of the
    // goods. A return against an unpaid balance cancels out debt rather
    // than being a literal cash refund (nothing was collected for that
    // portion yet, so there's nothing to hand back) -- so it's applied
    // against the due amount first, before anything would count as an
    // actual cash refund. originalDueAmount is persisted below so a
    // later void() or further return sees the already-reduced figure,
    // not the stale original.
    let originalDueAmount = txn.dueAmount || 0;
    if (originalDueAmount > 0 && txn.customerId) {
      const amountAppliedToDue = Math.min(originalDueAmount, refundTotal);
      originalDueAmount = Number((originalDueAmount - amountAppliedToDue).toFixed(2));
      const customer = await this.customersDb.findById(txn.customerId);
      if (customer) {
        await this.customersDb.update(txn.customerId, {
          balance: Number(Math.max((customer.balance || 0) - amountAppliedToDue, 0).toFixed(2))
        });
      }
    }

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
      // A return against a test sale is itself part of the test, not a
      // real refund -- inherited from the original sale so it's
      // excluded from reporting and cleaned up automatically if the
      // original is later deleted (see deleteTestSale() above).
      isTest: Boolean(txn.isTest),
      createdAt: new Date().toISOString()
    };
    await this.db.insert(returnTxn);
    await this.db.update(transactionId, { returnedQuantities: alreadyReturned, dueAmount: originalDueAmount });
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
      // BUGFIX: a credit/due sale (see checkout()'s dueAmount) adds to
      // the customer's balance at sale time; voiding the sale removed
      // the stock and the revenue, but was leaving that balance
      // untouched -- the customer would still show as owing money for
      // a sale that no longer exists. Reverse it here, the same way
      // stock is reversed just above.
      if (txn.dueAmount > 0 && txn.customerId) {
        const customer = await this.customersDb.findById(txn.customerId);
        if (customer) {
          await this.customersDb.update(txn.customerId, {
            balance: Number(Math.max((customer.balance || 0) - txn.dueAmount, 0).toFixed(2))
          });
        }
      }
    }

    return this.db.update(transactionId, { status: 'voided', voidReason: reason, voidedAt: new Date().toISOString() });
  }

  async get(id) {
    return this.db.findById(id);
  }

  /**
   * Deletes a test sale outright -- the one place this class actually
   * removes a record rather than voiding it (void() is for real sales:
   * it keeps the row, marked 'voided', for an accurate audit trail).
   * A test sale was never a real transaction to begin with, so there's
   * nothing to keep an audit trail of; restocking first (only if it
   * had actually deducted stock -- a still-pending held order never
   * did) undoes the one side effect a test checkout leaves behind.
   * Restricted to isTest rows specifically so this can never become a
   * back door for quietly deleting a genuine sale.
   */
  async deleteTestSale(transactionId) {
    const txn = await this.db.findById(transactionId);
    if (!txn) throw new Error(`Transaction not found: ${transactionId}`);
    if (!txn.isTest) {
      throw new Error('Only transactions marked as a test sale can be deleted. Void a real sale instead.');
    }
    if (txn.status === 'completed') {
      // Account for any partial returns already processed against this
      // sale (each restocked its own share already -- see returnItems()
      // above) so the remaining, not-yet-returned quantity is the only
      // part restocked here.
      const alreadyReturned = txn.returnedQuantities || {};
      for (const li of txn.items) {
        const remaining = li.quantity - (alreadyReturned[li.productId] || 0);
        if (remaining > 0) {
          await this.inventoryManager.restock(li.productId, remaining, `test-sale-delete-${transactionId}`);
        }
      }
      // Same reasoning as void() above: if this test sale was put on
      // credit (dueAmount > 0), that's a real balance on a real
      // customer's account even though the sale itself was a test --
      // deleting the sale without clearing it would leave them owing
      // money for a transaction that no longer exists.
      if (txn.dueAmount > 0 && txn.customerId) {
        const customer = await this.customersDb.findById(txn.customerId);
        if (customer) {
          await this.customersDb.update(txn.customerId, {
            balance: Number(Math.max((customer.balance || 0) - txn.dueAmount, 0).toFixed(2))
          });
        }
      }
    }
    await this.db.remove(transactionId);

    // Any return recorded against this test sale (see returnItems()
    // above) is itself just part of the test, and would otherwise be
    // left behind referencing a now-deleted transaction.
    const linkedReturns = (await this.db.readAll()).filter((t) => t.originalTransactionId === transactionId);
    for (const r of linkedReturns) {
      await this.db.remove(r.id);
    }

    return { id: transactionId, deleted: true };
  }

  /**
   * Retroactively flags an already-existing sale as a test sale -- for
   * sales made before isTest existed, or ones nobody thought to flag
   * at the time (e.g. a batch run through while setting the store up,
   * before going live for real). Once flagged, it's excluded from
   * reports like any other test sale, and becomes eligible for
   * deleteTestSale()/clearTestSales() -- this is deliberately the only
   * path to actually deleting an old real-looking sale, rather than
   * adding a separate, less-audited "just delete this" action.
   */
  async markAsTest(transactionId) {
    const txn = await this.db.findById(transactionId);
    if (!txn) throw new Error(`Transaction not found: ${transactionId}`);
    return this.db.update(transactionId, { isTest: true });
  }

  /**
   * Undoes markAsTest() -- for when the wrong sale was flagged. The
   * sale goes back to counting as a normal sale in reports and can no
   * longer be deleted (only voided). Nothing about stock or the
   * customer's balance changes either way: marking never touched
   * them, so there is nothing to put back.
   *
   * Any return recorded against the sale inherited its test flag
   * (see returnItems()), so it is flipped back along with it --
   * otherwise a real sale would be left with returns that reports
   * still ignore.
   */
  async unmarkAsTest(transactionId) {
    const txn = await this.db.findById(transactionId);
    if (!txn) throw new Error(`Transaction not found: ${transactionId}`);
    if (!txn.isTest) throw new Error('This transaction is not marked as a test sale.');
    if (txn.type === 'return') {
      throw new Error('A return follows its original sale. Undo the test mark on the sale instead.');
    }
    const updated = await this.db.update(transactionId, { isTest: false });
    const linkedReturns = (await this.db.readAll())
      .filter((t) => t.originalTransactionId === transactionId && t.isTest);
    for (const r of linkedReturns) {
      await this.db.update(r.id, { isTest: false });
    }
    return updated;
  }

  /**
   * Bulk version of deleteTestSale() for a "Clear test sales" action.
   * Deleting a sale also removes any test return linked to it (see
   * above), so by the time this loop reaches that return's own entry
   * in the snapshot it's already gone -- not an error, just nothing
   * left to do for that one.
   */
  async clearTestSales() {
    const all = await this.db.readAll();
    const testSales = all.filter((t) => t.isTest);
    let deletedCount = 0;
    for (const t of testSales) {
      if (!(await this.db.findById(t.id))) continue;
      await this.deleteTestSale(t.id);
      deletedCount += 1;
    }
    return { deletedCount };
  }

  /**
   * `includeTest` defaults to false so every existing caller --
   * reports, dashboards, top-products -- keeps test sales out of real
   * figures automatically, without each one needing to know test sales
   * exist. Pass true only where a human is meant to actually see them
   * (the Transactions/Customer Orders screens, so there's somewhere to
   * find and delete them from).
   */
  async list({ from, to, status, customerId, includeTest = false } = {}) {
    let transactions = await this.db.readAll();
    if (!includeTest) transactions = transactions.filter((t) => !t.isTest);
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
