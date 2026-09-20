// core/product-manager.js
// Handles product CRUD using a flexible schema: the required/optional
// fields depend on the active store type (see store-config.js).
// Products are also scoped BY store type -- each one is stamped with
// the storeType active when it was created (see create() below), and
// list() only returns products matching the currently active store
// type, so switching Store Type in Settings shows a genuinely
// different catalog rather than the same shared one. Products with no
// storeType at all (data from before this scoping existed) are shown
// under every store type rather than hidden, so upgrading never makes
// existing inventory disappear.
// Persistence is backed by SQLite (core/sqlite-store.js), so every
// method that touches the database is async.

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

  async list({ category, garmentType, search } = {}) {
    let products = await this.db.readAll();
    products = products.filter((p) => !p.storeType || p.storeType === storeConfig.currentStoreType);
    // `category` is kept as a filter for any older data that still has
    // it (see config/product-fields.json's history), even though it's
    // no longer a field on the apparel form -- garmentType replaced it
    // as the thing products are actually filtered/grouped by.
    if (category) {
      products = products.filter((p) => p.category === category);
    }
    if (garmentType) {
      products = products.filter((p) => p.garmentType === garmentType);
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

  /**
   * Every product row, ignoring the active-store-type filter that
   * list() applies. Used when allocating barcodes (core/barcode.js):
   * a barcode has to be unique across the whole catalogue, because a
   * scanner at the till doesn't know or care which store type a
   * product was filed under.
   */
  async listAllStoreTypes() {
    return this.db.readAll();
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

  /**
   * Deletes every product tagged with the currently active store
   * type (see create() above) -- deliberately scoped rather than
   * wiping the whole table, so clearing out General Retail's catalog
   * to load a fresh one can never touch Pharmacy's (or any other
   * store type's) products. Untagged legacy products (no storeType at
   * all) are left alone too, for the same reason list() treats them
   * as visible everywhere rather than picking one store type to own
   * them.
   */
  async clearAllForCurrentStoreType() {
    const all = await this.db.readAll();
    const toRemove = all.filter((p) => p.storeType === storeConfig.currentStoreType);
    for (const p of toRemove) {
      await this.db.remove(p.id);
    }
    return { removed: toRemove.length };
  }

  getFieldSchema() {
    return storeConfig.getProductFields();
  }
}

module.exports = ProductManager;
