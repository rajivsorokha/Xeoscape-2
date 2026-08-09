// api/expenses.js
// Expense tracking + reporting. Mutations gated by perm_settings,
// same reasoning as Purchase Orders/Reports -- back-office financial
// data, not a day-to-day cashier action.

const express = require('express');
const { requirePermission } = require('./auth-middleware');
const { DEFAULT_CATEGORIES } = require('../core/expense-manager');

function buildExpensesRouter({ expenseManager }) {
  const router = express.Router();

  router.get('/categories', (req, res) => {
    res.json(DEFAULT_CATEGORIES);
  });

  router.get('/', requirePermission('perm_settings'), async (req, res) => {
    const { from, to, category } = req.query;
    res.json(await expenseManager.list({ from, to, category }));
  });

  router.get('/summary', requirePermission('perm_settings'), async (req, res) => {
    const { from, to } = req.query;
    res.json(await expenseManager.summary({ from, to }));
  });

  router.post('/', requirePermission('perm_settings'), async (req, res) => {
    try {
      const expense = await expenseManager.create({ ...req.body, createdBy: req.currentUser?.id || null });
      res.status(201).json(expense);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:id', requirePermission('perm_settings'), async (req, res) => {
    try {
      const updated = await expenseManager.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Expense not found' });
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', requirePermission('perm_settings'), async (req, res) => {
    const removed = await expenseManager.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Expense not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildExpensesRouter;
