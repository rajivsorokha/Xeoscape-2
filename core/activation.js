// core/activation.js
// Per-store-type activation/license gate. Each store type (General
// Retail, Pharmacy, Grocery/Supermarket, Apparel/Fashion, Electronics,
// Restaurant/Cafe, B2B General Retails, and more) has its own activation key defined in
// config/activation-keys.json. Entering a valid key both unlocks the
// app and sets the active store type to match that key.
//
// This is a straightforward, self-contained license gate suitable for
// controlling which edition a given install runs as -- it is not a
// cryptographically secure DRM system (the keys live in a plain JSON
// file shipped with the app), which is appropriate for this kind of
// internal/business licensing but worth being upfront about.

const fs = require('fs');
const path = require('path');
const NedbStore = require('./nedb-store');
const storeConfig = require('./store-config');

const KEYS_PATH = path.join(__dirname, '..', 'config', 'activation-keys.json');

class Activation {
  constructor(dataDir) {
    this.keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    this.db = new NedbStore(dataDir, 'activation');
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
