// core/product-manager.js
// Handles product CRUD using a flexible schema: the required/optional
// fields depend on the active store type (see store-config.js).
// Persistence is backed by NeDB (core/nedb-store.js), so every method
// that touches the database is async.

const { randomUUID } = require('crypto');
const SqliteStore = require('./sqlite-store');
const storeConfig = require('./store-config');

class ProductManager {
  constructor(dataDir) {
    this.db = new SqliteStore(dataDir, 'products');
  }

  _validate(fields, isPartial = false) {
    const schema = storeConfig.getProductFields();
    const errors = [];
    for (const fieldDef of schema) {
      const value = fields[fieldDef.key];
      const missing = value === undefined || value === null || value === '';
      if (fieldDef.required && missing && !isPartial) {
        errors.push(`Field "${fieldDef.label}" (${fieldDef.key}) is required.`);
      }
      if (!missing && fieldDef.type === 'number' && typeof value !== 'number') {
        errors.push(`Field "${fieldDef.label}" must be a number.`);
      }
      if (!missing && fieldDef.type === 'currency' && typeof value !== 'number') {
        errors.push(`Field "${fieldDef.label}" must be a numeric amount.`);
      }
    }
    return errors;
  }

  async list({ category, search } = {}) {
    let products = await this.db.readAll();
    if (category) {
      products = products.filter((p) => p.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      products = products.filter(
        (p) => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
      );
    }
    return products;
  }

  async get(id) {
    return this.db.findById(id);
  }

  async create(fields) {
    const errors = this._validate(fields);
    if (errors.length) {
      const err = new Error('Validation failed');
      err.details = errors;
      throw err;
    }
    const product = {
      id: randomUUID(),
      storeType: storeConfig.currentStoreType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...fields
    };
    return this.db.insert(product);
  }

  async update(id, patch) {
    const errors = this._validate(patch, true);
    if (errors.length) {
      const err = new Error('Validation failed');
      err.details = errors;
      throw err;
    }
    return this.db.update(id, { ...patch, updatedAt: new Date().toISOString() });
  }

  async remove(id) {
    return this.db.remove(id);
  }

  getFieldSchema() {
    return storeConfig.getProductFields();
  }
}

module.exports = ProductManager;
