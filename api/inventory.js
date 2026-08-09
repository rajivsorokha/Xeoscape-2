// api/inventory.js
// Flexible product/inventory endpoints. Field requirements adapt to the
// active store type (see core/store-config.js, config/product-fields.json).

const express = require('express');
const multer = require('multer');
const { buildTemplateCsv, parseCsvAgainstSchema } = require('../core/csv-helpers');
const { requirePermission } = require('./auth-middleware');

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');

function buildInventoryRouter({ productManager, inventoryManager, storeConfig }) {
  const router = express.Router();

  // GET /api/inventory/fields -> field schema for current store type
  router.get('/fields', (req, res) => {
    res.json({ storeType: storeConfig.currentStoreType, fields: productManager.getFieldSchema() });
  });

  // GET /api/inventory/barcode-lookup/:code -- looks up a barcode
  // against UPCitemdb's public trial API (no signup/API key needed --
  // https://api.upcitemdb.com/prod/trial/lookup) to auto-fill a
  // product name (and image, if available) for a scanned barcode that
  // isn't already in this store's catalog. The trial endpoint is
  // rate-limited (100 requests/day, small burst limit) and its
  // catalog is US/consumer-retail-leaning -- it won't have every
  // barcode, especially region-specific or non-retail-packaged goods,
  // so a "not found" result is expected sometimes, not a bug.
  router.get('/barcode-lookup/:code', requirePermission('perm_products'), async (req, res) => {
    const code = req.params.code.trim();
    if (!code) return res.status(400).json({ error: 'A barcode is required.' });

    try {
      const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`, {
        headers: { Accept: 'application/json' }
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data) {
        return res.json({ found: false, reason: 'Lookup service unavailable right now.' });
      }
      if (data.code === 'INVALID_UPC' || !data.items || data.items.length === 0) {
        return res.json({ found: false, reason: 'No match in the barcode database for this code.' });
      }

      const item = data.items[0];
      res.json({
        found: true,
        name: item.title || null,
        brand: item.brand || null,
        imageUrl: Array.isArray(item.images) && item.images.length ? item.images[0] : null
      });
    } catch (err) {
      // Network failure, rate limit, etc. -- never block manual entry
      // just because the external lookup couldn't be reached.
      res.json({ found: false, reason: 'Could not reach the barcode lookup service.' });
    }
  });

  // GET /api/inventory/products/csv-template -- downloadable CSV
  // header + example row matching the CURRENT store type's product
  // fields (Pharmacy gets expiry/minStock columns, Electronics gets
  // serialNumber/warrantyMonths, etc.) so the format always matches
  // whatever's actually required to create a product right now.
  router.get('/products/csv-template', (req, res) => {
    const csv = buildTemplateCsv(productManager.getFieldSchema());
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"');
    res.send(csv);
  });

  // POST /api/inventory/products/csv-import -- bulk-create products
  // from an uploaded CSV. Rows are validated the same way a single
  // manual product create is (required fields, number/currency/boolean
  // coercion); invalid rows are skipped and reported individually
  // rather than failing the whole import.
  router.post('/products/csv-import', requirePermission('perm_products'), (req, res) => {
    csvUpload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No CSV file provided.' });

      const { rows, errors } = parseCsvAgainstSchema(req.file.buffer, productManager.getFieldSchema());
      const created = [];
      const failed = [...errors];

      for (const { rowNumber, data } of rows) {
        try {
          created.push(await productManager.create(data));
        } catch (createErr) {
          failed.push({ rowNumber, message: createErr.details?.join('; ') || createErr.message });
        }
      }

      res.json({
        totalRows: rows.length + errors.length,
        createdCount: created.length,
        failedCount: failed.length,
        errors: failed.sort((a, b) => a.rowNumber - b.rowNumber)
      });
    });
  });

  // GET /api/inventory/products
  router.get('/products', async (req, res) => {
    const { category, search } = req.query;
    res.json(await productManager.list({ category, search }));
  });

  // GET /api/inventory/products/:id
  router.get('/products/:id', async (req, res) => {
    const product = await productManager.get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  });

  // POST /api/inventory/products
  router.post('/products', requirePermission('perm_products'), async (req, res) => {
    try {
      const product = await productManager.create(req.body);
      res.status(201).json(product);
    } catch (err) {
      res.status(400).json({ error: err.message, details: err.details || [] });
    }
  });

  // PUT /api/inventory/products/:id
  router.put('/products/:id', requirePermission('perm_products'), async (req, res) => {
    try {
      const updated = await productManager.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Product not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message, details: err.details || [] });
    }
  });

  // DELETE /api/inventory/products/:id
  // DELETE /api/inventory/products -- clears every product tagged
  // with the currently active store type (see
  // productManager.clearAllForCurrentStoreType). Used to wipe a
  // demo/seed catalog before a bulk CSV import of the real one.
  router.delete('/products', requirePermission('perm_products'), async (req, res) => {
    const result = await productManager.clearAllForCurrentStoreType();
    res.json(result);
  });

  router.delete('/products/:id', requirePermission('perm_products'), async (req, res) => {
    const removed = await productManager.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Product not found' });
    res.status(204).send();
  });

  // POST /api/inventory/products/:id/restock
  router.post('/products/:id/restock', requirePermission('perm_products'), async (req, res) => {
    try {
      const { quantity, note } = req.body;
      const movement = await inventoryManager.restock(req.params.id, quantity, note);
      res.status(201).json(movement);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/inventory/products/:id/history
  router.get('/products/:id/history', async (req, res) => {
    res.json(await inventoryManager.history(req.params.id));
  });

  // GET /api/inventory/alerts -- combined low-stock + expiring-soon
  // counts/lists for the nav bar's Alerts badge and dropdown.
  router.get('/alerts', async (req, res) => {
    const [lowStock, expiring] = await Promise.all([
      inventoryManager.lowStockReport(),
      inventoryManager.expiryReport(30)
    ]);
    res.json({ lowStock, expiring, count: lowStock.length + expiring.length });
  });

  // GET /api/inventory/low-stock
  // `threshold` only sets the fallback used when a product has neither
  // a reorderPoint nor a minStock set -- see
  // inventoryManager.lowStockReport for the full precedence.
  router.get('/low-stock', async (req, res) => {
    const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;
    res.json(await inventoryManager.lowStockReport(threshold));
  });

  // GET /api/inventory/vendors -- distinct, non-empty vendor names
  // across all products, for populating filter dropdowns (Stock on
  // Hand report, Purchase Orders).
  router.get('/vendors', async (req, res) => {
    const products = await productManager.list();
    const vendors = [...new Set(products.map((p) => p.vendor).filter(Boolean))].sort();
    res.json(vendors);
  });

  // GET /api/inventory/expiring
  router.get('/expiring', async (req, res) => {
    const withinDays = req.query.withinDays ? Number(req.query.withinDays) : undefined;
    res.json(await inventoryManager.expiryReport(withinDays));
  });

  return router;
}

module.exports = buildInventoryRouter;
