// api/customers.js
// Customer management. Generic across store types.

const express = require('express');
const { randomUUID } = require('crypto');
const SqliteStore = require('../core/sqlite-store');

function buildCustomersRouter({ dataDir }) {
  const router = express.Router();
  const db = new SqliteStore(dataDir, 'customers');

  router.get('/', async (req, res) => {
    const { search } = req.query;
    let customers = await db.readAll();
    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(
        (c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)
      );
    }
    res.json(customers);
  });

  router.get('/:id', async (req, res) => {
    const customer = await db.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  });

  router.post('/', async (req, res) => {
    const { name, phone = '', email = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const customer = await db.insert({
      id: randomUUID(),
      name,
      phone,
      email,
      loyaltyPoints: 0,
      balance: 0, // amount owed to the store from partial/due payments -- see api/transactions.js checkout dueAmount handling
      createdAt: new Date().toISOString()
    });
    res.status(201).json(customer);
  });

  router.put('/:id', async (req, res) => {
    const updated = await db.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Customer not found' });
    res.json(updated);
  });

  // POST /api/customers/:id/pay-balance -- records a payment against
  // the customer's due balance (accrued from partial/due sales -- see
  // core/transaction-manager.js#checkout). Floors at 0 rather than
  // going negative; keeps a light payment history on the customer
  // record itself rather than a whole separate table.
  router.post('/:id/pay-balance', async (req, res) => {
    const customer = await db.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number.' });
    }
    const currentBalance = customer.balance || 0;
    const applied = Math.min(amount, currentBalance);
    const history = customer.duePayments || [];
    history.push({ amount: applied, date: new Date().toISOString(), note: req.body?.note || '' });
    const updated = await db.update(req.params.id, {
      balance: Number((currentBalance - applied).toFixed(2)),
      duePayments: history
    });
    res.json(updated);
  });

  router.delete('/:id', async (req, res) => {
    const removed = await db.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Customer not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildCustomersRouter;
