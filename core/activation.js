// core/activation.js
// Activation/license gate. This build ships a single edition --
// Apparel / Fashion -- whose activation key is defined in
// config/activation-keys.json. Entering a valid key both unlocks the
// app and sets the active store type to match that key. The
// key-to-store-type mapping is kept (rather than collapsed to a
// single hard-coded key) so another edition can be reintroduced by
// adding entries to config/store-types.json, product-fields.json and
// activation-keys.json, with no code change.
//
// This is a straightforward, self-contained license gate suitable for
// controlling which edition a given install runs as -- it is not a
// cryptographically secure DRM system (the keys live in a plain JSON
// file shipped with the app), which is appropriate for this kind of
// internal/business licensing but worth being upfront about.

const fs = require('fs');
const path = require('path');
const SqliteStore = require('./sqlite-store');
const storeConfig = require('./store-config');

const KEYS_PATH = path.join(__dirname, '..', 'config', 'activation-keys.json');

class Activation {
  constructor(dataDir) {
    this.keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    this.db = new SqliteStore(dataDir, 'activation');
  }

  async getStatus() {
    const records = await this.db.readAll();
    const record = records[0];
    if (!record) return { activated: false, storeType: null };
    return {
      activated: true,
      storeType: record.storeType,
      activatedAt: record.activatedAt
    };
  }

  /**
   * @param {string} activationKey
   * @returns {{ activated: true, storeType: string }} on success
   * @throws if the key doesn't match any known store type
   */
  async activate(activationKey) {
    const trimmedKey = (activationKey || '').trim();
    const matchedStoreType = Object.entries(this.keys).find(
      ([, key]) => key.toUpperCase() === trimmedKey.toUpperCase()
    );

    if (!matchedStoreType) {
      throw new Error('Invalid activation key.');
    }

    const [storeType] = matchedStoreType;
    storeConfig.setStoreType(storeType);

    const record = {
      storeType,
      activationKey: trimmedKey,
      activatedAt: new Date().toISOString()
    };
    await this.db.writeAll([record]);

    return { activated: true, storeType };
  }

  /** Clears activation, requiring a key to be entered again. */
  async deactivate() {
    await this.db.writeAll([]);
    return { activated: false };
  }
}

module.exports = Activation;
