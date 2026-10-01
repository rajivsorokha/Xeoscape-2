// api/transactions.js
// Generic transaction/checkout endpoints. All store-type-specific
// (e.g. pharmacy prescription) logic has been removed; this now just
// handles line items, payment, and totals for any kind of retail store.

const express = require('express');
const { requirePermission } = require('./auth-middleware');

function buildTransactionsRouter({ transactionManager, reportGenerator }) {
  const router = express.Router();

  // GET /api/transactions
  // includeTest=true also returns sales marked as a test sale (see
  // core/transaction-manager.js#checkout's isTest flag) -- left off by
  // default so every ordinary caller (reports, dashboards) keeps test
  // sales out of real figures without having to know about them.
  router.get('/', async (req, res) => {
    const { from, to, status, customerId, includeTest } = req.query;
    res.json(await transactionManager.list({ from, to, status, customerId, includeTest: includeTest === 'true' }));
  });

  // GET /api/transactions/:id
  router.get('/:id', async (req, res) => {
    const txn = await transactionManager.get(req.params.id);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    res.json(txn);
  });

  // POST /api/transactions (checkout)
  router.post('/', async (req, res) => {
    try {
      const transaction = await transactionManager.checkout(req.body);
      res.status(201).json(transaction);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/transactions/hold -- creates a real "Unpaid" order (Open
  // Tabs), matching the real app's on-hold model. Does not deduct stock.
  router.post('/hold', async (req, res) => {
    try {
      const transaction = await transactionManager.hold(req.body);
      res.status(201).json(transaction);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/transactions/:id/pay -- completes a previously-held order.
  router.post('/:id/pay', async (req, res) => {
    try {
      const transaction = await transactionManager.payFromHold(req.params.id, req.body);
      res.json(transaction);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/transactions/:id -- hard-delete, but ONLY for sales
  // marked as a test sale (see transaction-manager.js#deleteTestSale).
  // A real sale can never be deleted this way, only voided.
  router.delete('/:id', requirePermission('perm_transactions'), async (req, res) => {
    try {
      const result = await transactionManager.deleteTestSale(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/transactions/:id/mark-test -- retroactively flags an
  // existing (real-looking) sale as a test sale, e.g. ones made while
  // setting the store up before going live. Once flagged it can be
  // deleted via DELETE /:id or swept up by /clear-test below.
  router.post('/:id/mark-test', requirePermission('perm_transactions'), async (req, res) => {
    try {
      res.json(await transactionManager.markAsTest(req.params.id));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/transactions/:id/unmark-test -- undoes mark-test, for a
  // sale flagged by mistake. Puts it back in reports as a normal sale.
  router.post('/:id/unmark-test', requirePermission('perm_transactions'), async (req, res) => {
    try {
      res.json(await transactionManager.unmarkAsTest(req.params.id));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/transactions/clear-test -- bulk-deletes every test sale.
  router.post('/clear-test', requirePermission('perm_transactions'), async (req, res) => {
    try {
      res.json(await transactionManager.clearTestSales());
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/transactions/:id/void
  router.post('/:id/void', requirePermission('perm_transactions'), async (req, res) => {
    try {
      const { reason } = req.body || {};
      const voided = await transactionManager.void(req.params.id, reason);
      res.json(voided);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/transactions/:id/return  { items: [{productId, quantity}], reason? }
  router.post('/:id/return', requirePermission('perm_transactions'), async (req, res) => {
    try {
      const { items, reason } = req.body || {};
      const returnTxn = await transactionManager.returnItems(req.params.id, {
        items,
        reason,
        cashierId: req.currentUser?.id || null
      });
      res.status(201).json(returnTxn);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/transactions/reports/summary
  router.get('/reports/summary', async (req, res) => {
    const { from, to } = req.query;
    res.json(await reportGenerator.salesSummary({ from, to }));
  });

  // GET /api/transactions/reports/outstanding-credit -- who currently
  // owes money (the Credit payment method). Not
  // date-ranged -- see core/report-generator.js#outstandingCredit for why.
  router.get('/reports/outstanding-credit', async (req, res) => {
    res.json(await reportGenerator.outstandingCredit());
  });

  // GET /api/transactions/reports/top-products
  router.get('/reports/top-products', async (req, res) => {
    const { from, to, limit } = req.query;
    res.json(await reportGenerator.topProducts({ from, to, limit: limit ? Number(limit) : undefined }));
  });

  return router;
}

module.exports = buildTransactionsRouter;
