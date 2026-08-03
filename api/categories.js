// api/categories.js
// Simple product-category management. Generic across store types.

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const SqliteStore = require('../core/sqlite-store');
const { buildTemplateCsv, parseCsvAgainstSchema } = require('../core/csv-helpers');

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

  router.post('/csv-import', (req, res) => {
    csvUpload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No CSV file provided.' });

      const { rows, errors } = parseCsvAgainstSchema(req.file.buffer, CATEGORY_FIELDS);
      const existing = await db.readAll();
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
    res.json(await db.readAll());
  });

  router.post('/', async (req, res) => {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const category = await db.insert({ id: randomUUID(), name, description, createdAt: new Date().toISOString() });
    res.status(201).json(category);
  });

  router.put('/:id', async (req, res) => {
    const updated = await db.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Category not found' });
    res.json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const removed = await db.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Category not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildCategoriesRouter;
