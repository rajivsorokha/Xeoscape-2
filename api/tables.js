// api/tables.js
// Restaurant/Cafe table management -- lets the store owner define
// their own set of tables (a number/name + seat count) instead of the
// old hardcoded 2/3/4/6/8-Seater buttons in the cart. Modeled closely
// on api/categories.js (same SqliteStore-per-collection pattern, same
// requirePermission gate), scoped by store type isn't needed here
// since tables are only ever shown/edited for the 'restaurant' store
// type in the UI, but records are plain and untagged for simplicity.

const express = require('express');
const { randomUUID } = require('crypto');
const SqliteStore = require('../core/sqlite-store');
const { requirePermission } = require('./auth-middleware');

function buildTablesRouter({ dataDir }) {
  const router = express.Router();
  const db = new SqliteStore(dataDir, 'tables');

  // GET /api/tables -- sorted by table number/name for a stable,
  // predictable order in both the Settings list and the cart's table
  // picker.
  router.get('/', async (req, res) => {
    const tables = await db.readAll();
    tables.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    res.json(tables);
  });

  router.post('/', requirePermission('perm_settings'), async (req, res) => {
    const { number, seats } = req.body;
    if (!number || !String(number).trim()) {
      return res.status(400).json({ error: 'Table number is required.' });
    }
    const seatCount = Number(seats);
    if (!Number.isFinite(seatCount) || seatCount <= 0) {
      return res.status(400).json({ error: 'Seats must be a positive number.' });
    }
    const table = await db.insert({
      id: randomUUID(),
      number: String(number).trim(),
      seats: seatCount,
      createdAt: new Date().toISOString()
    });
    res.status(201).json(table);
  });

  router.put('/:id', requirePermission('perm_settings'), async (req, res) => {
    const { number, seats } = req.body;
    const patch = {};
    if (number !== undefined) {
      if (!String(number).trim()) return res.status(400).json({ error: 'Table number is required.' });
      patch.number = String(number).trim();
    }
    if (seats !== undefined) {
      const seatCount = Number(seats);
      if (!Number.isFinite(seatCount) || seatCount <= 0) {
        return res.status(400).json({ error: 'Seats must be a positive number.' });
      }
      patch.seats = seatCount;
    }
    const updated = await db.update(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'Table not found' });
    res.json(updated);
  });

  router.delete('/:id', requirePermission('perm_settings'), async (req, res) => {
    const removed = await db.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Table not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildTablesRouter;
