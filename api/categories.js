// api/categories.js
// Product-category management, scoped by store type the same way
// products are (see core/product-manager.js) -- each category is
// stamped with the storeType active when created, and listing only
// returns categories for the currently active store type. Untagged
// legacy categories (from before this scoping existed) show under
// every store type rather than disappearing.

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const SqliteStore = require('../core/sqlite-store');
const storeConfig = require('../core/store-config');
const { buildTemplateCsv, parseCsvAgainstSchema } = require('../core/csv-helpers');
const { requirePermission } = require('./auth-middleware');

const CATEGORY_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'text', required: false }
];

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');

function buildCategoriesRouter({ dataDir }) {
  const router = express.Router();
  const db = new SqliteStore(dataDir, 'categories');

  router.get('/csv-template', (req, res) => {
    const csv = buildTemplateCsv(CATEGORY_FIELDS);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="category-import-template.csv"');
    res.send(csv);
  });

  router.post('/csv-import', requirePermission('perm_categories'), (req, res) => {
    csvUpload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No CSV file provided.' });

      const { rows, errors } = parseCsvAgainstSchema(req.file.buffer, CATEGORY_FIELDS);
      const existing = (await db.readAll()).filter((c) => !c.storeType || c.storeType === storeConfig.currentStoreType);
      const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
      const created = [];
      const failed = [...errors];

      for (const { rowNumber, data } of rows) {
        if (existingNames.has(data.name.toLowerCase())) {
          failed.push({ rowNumber, message: `Category "${data.name}" already exists` });
          continue;
        }
        const category = await db.insert({
          id: randomUUID(),
          name: data.name,
          description: data.description || '',
          storeType: storeConfig.currentStoreType,
          createdAt: new Date().toISOString()
        });
        existingNames.add(data.name.toLowerCase());
        created.push(category);
      }

      res.json({
        totalRows: rows.length + errors.length,
        createdCount: created.length,
        failedCount: failed.length,
        errors: failed.sort((a, b) => a.rowNumber - b.rowNumber)
      });
    });
  });

  router.get('/', async (req, res) => {
    const categories = await db.readAll();
    res.json(categories.filter((c) => !c.storeType || c.storeType === storeConfig.currentStoreType));
  });

  router.post('/', requirePermission('perm_categories'), async (req, res) => {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const category = await db.insert({
      id: randomUUID(),
      name,
      description,
      storeType: storeConfig.currentStoreType,
      createdAt: new Date().toISOString()
    });
    res.status(201).json(category);
  });

  // DELETE /api/categories -- clears every category tagged with the
  // currently active store type (untagged legacy ones are left alone,
  // same reasoning as GET /'s filter above). Scoped so clearing out
  // one store type's categories can never touch another's.
  router.delete('/', requirePermission('perm_categories'), async (req, res) => {
    const all = await db.readAll();
    const toRemove = all.filter((c) => c.storeType === storeConfig.currentStoreType);
    for (const c of toRemove) await db.remove(c.id);
    res.json({ removed: toRemove.length });
  });

  router.put('/:id', requirePermission('perm_categories'), async (req, res) => {
    const updated = await db.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Category not found' });
    res.json(updated);
  });

  router.delete('/:id', requirePermission('perm_categories'), async (req, res) => {
    const removed = await db.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Category not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildCategoriesRouter;
