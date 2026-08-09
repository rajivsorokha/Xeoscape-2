// api/purchase-orders.js
// Purchase order endpoints -- creating POs (including one-click
// suggestions from the Low Stock report), listing/viewing them, and
// receiving stock against them.

const express = require('express');
const { requirePermission } = require('./auth-middleware');

function buildPurchaseOrdersRouter({ purchaseOrderManager }) {
  const router = express.Router();

  // GET /api/purchase-orders?status=&vendor=
  router.get('/', async (req, res) => {
    const { status, vendor } = req.query;
    res.json(await purchaseOrderManager.list({ status, vendor }));
  });

  // GET /api/purchase-orders/suggestions
  // One suggested draft PO per vendor, built from the current Low
  // Stock report. Nothing is persisted -- the UI lets the merchant
  // review/edit before calling POST / to actually create one.
  router.get('/suggestions', async (req, res) => {
    res.json(await purchaseOrderManager.suggestFromLowStock());
  });

  // GET /api/purchase-orders/:id
  router.get('/:id', async (req, res) => {
    const order = await purchaseOrderManager.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });
    res.json(order);
  });

  // POST /api/purchase-orders  { vendor, items: [{productId, quantityOrdered, unitCost?}], notes?, expectedDate? }
  router.post('/', requirePermission('perm_products'), async (req, res) => {
    try {
      const order = await purchaseOrderManager.create(req.body);
      res.status(201).json(order);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // PUT /api/purchase-orders/:id  { vendor?, notes?, expectedDate?, status? }
  router.put('/:id', requirePermission('perm_products'), async (req, res) => {
    try {
      const updated = await purchaseOrderManager.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Purchase order not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/purchase-orders/:id/receive  { receipts: [{productId, quantityReceived}] }
  // Restocks inventory for the received quantities and updates status.
  router.post('/:id/receive', requirePermission('perm_products'), async (req, res) => {
    try {
      const { receipts = [] } = req.body || {};
      const updated = await purchaseOrderManager.receive(req.params.id, receipts);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/purchase-orders/:id
  router.delete('/:id', requirePermission('perm_products'), async (req, res) => {
    const removed = await purchaseOrderManager.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Purchase order not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildPurchaseOrdersRouter;
