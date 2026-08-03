// core/store-config.js
// Loads store-type and product-field configuration, and exposes helpers
// for determining what fields a given store type's products should have.
// The active store type is persisted to disk (store_type.json in the
// data directory) so it survives app/server restarts.

const fs = require('fs');
const path = require('path');

const STORE_TYPES_PATH = path.join(__dirname, '..', 'config', 'store-types.json');
const PRODUCT_FIELDS_PATH = path.join(__dirname, '..', 'config', 'product-fields.json');
const PERMISSIONS_PATH = path.join(__dirname, '..', 'config', 'permissions.json');

// Default store type for a fresh install.
const DEFAULT_STORE_TYPE = 'generalRetail';

// Appended to every store type's field set (see getProductFields
// below) -- optional everywhere, used only for gross-margin analysis
// in the Product Performance report. Not store-type-specific, so it
// doesn't belong duplicated across product-fields.json.
const COST_FIELD = {
  key: 'cost',
  label: 'Cost Price',
  type: 'currency',
  required: false
};

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

class StoreConfig {
  constructor() {
    this.storeTypes = loadJson(STORE_TYPES_PATH);
    this.productFieldSets = loadJson(PRODUCT_FIELDS_PATH);
    this.permissions = loadJson(PERMISSIONS_PATH);
    this.currentStoreType = DEFAULT_STORE_TYPE;
    this.dataDir = null;
  }

  /**
   * Points this StoreConfig at a data directory so the active store
   * type can be persisted/restored across restarts. Safe to call more
   * than once (e.g. once per createCore() call) -- it's a no-op after
   * the first successful load.
   */
  configureDataDir(dataDir) {
    this.dataDir = dataDir;
    this._loadPersistedStoreType();
  }

  _storeTypeFilePath() {
    return this.dataDir ? path.join(this.dataDir, 'store_type.json') : null;
  }

  _loadPersistedStoreType() {
    const filePath = this._storeTypeFilePath();
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
      const { storeType } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (storeType && this.storeTypes[storeType]) {
        this.currentStoreType = storeType;
      }
    } catch (err) {
      // Corrupt/missing file -- fall back to the current default silently.
    }
  }

  _persistStoreType() {
    const filePath = this._storeTypeFilePath();
    if (!filePath) return;
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ storeType: this.currentStoreType }), 'utf8');
  }

  listStoreTypes() {
    return Object.entries(this.storeTypes).map(([id, def]) => ({ id, ...def }));
  }

  setStoreType(storeTypeId) {
    if (!this.storeTypes[storeTypeId]) {
      throw new Error(`Unknown store type: ${storeTypeId}`);
    }
    this.currentStoreType = storeTypeId;
    this._persistStoreType();
    return this.storeTypes[storeTypeId];
  }

  getCurrentStoreType() {
    return { id: this.currentStoreType, ...this.storeTypes[this.currentStoreType] };
  }

  getProductFields(storeTypeId = this.currentStoreType) {
    const def = this.storeTypes[storeTypeId];
    if (!def) throw new Error(`Unknown store type: ${storeTypeId}`);
    const fields = this.productFieldSets[def.productFieldSetId] || [];
    // Cost price is cross-cutting (not store-type-specific), optional
    // everywhere, and only used for margin analysis in reporting -- so
    // it's appended here once instead of duplicated in every store
    // type's entry in product-fields.json.
    return [...fields, COST_FIELD];
  }

  getRolePermissions(role) {
    return (this.permissions.roles[role] && this.permissions.roles[role].permissions) || [];
  }

  roleHasPermission(role, permission) {
    const perms = this.getRolePermissions(role);
    return perms.includes('*') || perms.includes(permission);
  }
}

module.exports = new StoreConfig();
module.exports.StoreConfig = StoreConfig;
