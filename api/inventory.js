// api/inventory.js
// Flexible product/inventory endpoints. Field requirements adapt to the
// active store type (see core/store-config.js, config/product-fields.json).

const express = require('express');
const multer = require('multer');
const { buildTemplateCsv, parseCsvAgainstSchema } = require('../core/csv-helpers');

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');

function buildInventoryRouter({ productManager, inventoryManager, storeConfig }) {
  const router = express.Router();

  // GET /api/inventory/fields -> field schema for current store type
  router.get('/fields', (req, res) => {
    res.json({ storeType: storeConfig.currentStoreType, fields: productManager.getFieldSchema() });
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
  router.post('/products/csv-import', (req, res) => {
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
  router.post('/products', async (req, res) => {
    try {
      const product = await productManager.create(req.body);
      res.status(201).json(product);
    } catch (err) {
      res.status(400).json({ error: err.message, details: err.details || [] });
    }
  });

  // PUT /api/inventory/products/:id
  router.put('/products/:id', async (req, res) => {
    try {
      const updated = await productManager.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Product not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message, details: err.details || [] });
    }
  });

  // DELETE /api/inventory/products/:id
  router.delete('/products/:id', async (req, res) => {
    const removed = await productManager.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Product not found' });
    res.status(204).send();
  });

  // POST /api/inventory/products/:id/restock
  router.post('/products/:id/restock', async (req, res) => {
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

  // GET /api/inventory/low-stock
  router.get('/low-stock', async (req, res) => {
    const threshold = req.query.threshold ? Number(req.query.threshold) : undefined;
    res.json(await inventoryManager.lowStockReport(threshold));
  });

  // GET /api/inventory/expiring
  router.get('/expiring', async (req, res) => {
    const withinDays = req.query.withinDays ? Number(req.query.withinDays) : undefined;
    res.json(await inventoryManager.expiryReport(withinDays));
  });

  return router;
}

module.exports = buildInventoryRouter;
