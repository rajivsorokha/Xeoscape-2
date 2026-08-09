// api/suppliers.js
// Supplier/vendor management: contact records for who you order stock
// from. Separate from the free-text "Vendor"/"Supplier" field already
// on individual products (see core/store-config.js) -- that field
// still just labels a product with a name; this is an actual address-
// book of suppliers with contact info, matching the checklist item
// "Supplier module". Scoped by store type the same way products and
// categories are (see core/product-manager.js), so each store type
// keeps its own supplier list.

const express = require('express');
const { randomUUID } = require('crypto');
const SqliteStore = require('../core/sqlite-store');
const { requirePermission } = require('./auth-middleware');

function buildSuppliersRouter({ dataDir, storeConfig }) {
  const router = express.Router();
  const db = new SqliteStore(dataDir, 'suppliers');

  router.get('/', async (req, res) => {
    const { search } = req.query;
    let suppliers = (await db.readAll()).filter((s) => !s.storeType || s.storeType === storeConfig.currentStoreType);
    if (search) {
      const q = search.toLowerCase();
      suppliers = suppliers.filter(
        (s) => (s.name || '').toLowerCase().includes(q) ||
               (s.contactPerson || '').toLowerCase().includes(q) ||
               (s.phone || '').includes(q) ||
               (s.email || '').toLowerCase().includes(q)
      );
    }
    res.json(suppliers.sort((a, b) => a.name.localeCompare(b.name)));
  });

  router.get('/:id', async (req, res) => {
    const supplier = await db.findById(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json(supplier);
  });

  router.post('/', requirePermission('perm_products'), async (req, res) => {
    const { name, contactPerson = '', phone = '', email = '', address = '', notes = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const supplier = await db.insert({
      id: randomUUID(),
      name,
      contactPerson,
      phone,
      email,
      address,
      notes,
      storeType: storeConfig.currentStoreType,
      createdAt: new Date().toISOString()
    });
    res.status(201).json(supplier);
  });

  router.put('/:id', requirePermission('perm_products'), async (req, res) => {
    const updated = await db.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Supplier not found' });
    res.json(updated);
  });

  router.delete('/:id', requirePermission('perm_products'), async (req, res) => {
    const removed = await db.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Supplier not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildSuppliersRouter;
