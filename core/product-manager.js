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
    // Only used to auto-create a matching Category record when a
    // product is saved with a category name that doesn't exist yet
    // (see create()/update() below) -- a product's `category` field
    // has always just been free text with no link to the categories
    // collection, so importing/creating products never made them
    // appear on the Categories screen even though the text showed up
    // fine on the product itself. This closes that gap going forward.
    this.categoriesDb = new SqliteStore(dataDir, 'categories');
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
    products = products.filter((p) => !p.storeType || p.storeType === storeConfig.currentStoreType);
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

  /**
   * Auto-creates a Category record matching this product's `category`
   * text if one doesn't already exist for the current store type
   * (case-insensitive match, same rule the CSV import's own duplicate
   * check uses -- see api/categories.js). No-op if `category` is
   * empty or already matches an existing one. Failures here are
   * logged, not thrown -- a product save should never fail just
   * because the categories table had a hiccup.
   */
  async _ensureCategoryExists(categoryName) {
    if (!categoryName || !categoryName.trim()) return;
    try {
      const existing = (await this.categoriesDb.readAll()).filter(
        (c) => !c.storeType || c.storeType === storeConfig.currentStoreType
      );
      const alreadyExists = existing.some((c) => c.name.toLowerCase() === categoryName.trim().toLowerCase());
      if (alreadyExists) return;
      await this.categoriesDb.insert({
        id: randomUUID(),
        name: categoryName.trim(),
        description: '',
        storeType: storeConfig.currentStoreType,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn(`Could not auto-create category "${categoryName}": ${err.message}`);
    }
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
    await this._ensureCategoryExists(product.category);
    return this.db.insert(product);
  }

  async update(id, patch) {
    const errors = this._validate(patch, true);
    if (errors.length) {
      const err = new Error('Validation failed');
      err.details = errors;
      throw err;
    }
    if (patch.category) await this._ensureCategoryExists(patch.category);
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
