// core/expense-manager.js
// Business expenses (rent, utilities, staff wages, supplies, etc.) --
// tracked separately from Purchase Orders (which are specifically for
// restocking inventory). Scoped by store type like products/suppliers.

const { randomUUID } = require('crypto');
const SqliteStore = require('./sqlite-store');

const DEFAULT_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Marketing', 'Other'];

class ExpenseManager {
  constructor(dataDir, storeConfig) {
    this.db = new SqliteStore(dataDir, 'expenses');
    this.storeConfig = storeConfig;
  }

  async list({ from, to, category } = {}) {
    let expenses = (await this.db.readAll()).filter(
      (e) => !e.storeType || e.storeType === this.storeConfig.currentStoreType
    );
    if (from) expenses = expenses.filter((e) => new Date(e.date) >= new Date(from));
    if (to) expenses = expenses.filter((e) => new Date(e.date) <= new Date(to));
    if (category) expenses = expenses.filter((e) => e.category === category);
    return expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async create({ description, category, amount, date, paymentMethod = 'cash', notes = '', createdBy = null }) {
    if (!description || !description.trim()) throw new Error('description is required.');
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('amount must be a positive number.');
    return this.db.insert({
      id: randomUUID(),
      description: description.trim(),
      category: category || 'Other',
      amount: numericAmount,
      date: date || new Date().toISOString(),
      paymentMethod,
      notes,
      createdBy,
      storeType: this.storeConfig.currentStoreType,
      createdAt: new Date().toISOString()
    });
  }

  async update(id, patch) {
    if (patch.amount !== undefined) {
      const numericAmount = Number(patch.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('amount must be a positive number.');
      patch = { ...patch, amount: numericAmount };
    }
    return this.db.update(id, patch);
  }

  async remove(id) {
    return this.db.remove(id);
  }

  /** Total expenses and a per-category breakdown for a date range -- powers the Expense report. */
  async summary({ from, to } = {}) {
    const expenses = await this.list({ from, to });
    const byCategory = {};
    let total = 0;
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      total += e.amount;
    }
    return {
      from: from || null,
      to: to || null,
      total: Number(total.toFixed(2)),
      count: expenses.length,
      byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount: Number(amount.toFixed(2)) })),
      expenses
    };
  }
}

module.exports = ExpenseManager;
module.exports.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
