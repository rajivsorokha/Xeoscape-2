// core/activation.js
// Per-store-type activation/license gate. Each store type (General
// Retail, Pharmacy, Grocery/Supermarket, Apparel/Fashion, Electronics,
// Restaurant/Cafe, B2B General Retails, and more) has a pool of
// activation keys defined in config/activation-keys.json (see
// scripts/generate-activation-keys.js to generate or top these up).
// Entering a valid key both unlocks the app and sets the active store
// type to match that key. There's also a "demo" bucket of keys that
// isn't tied to any one store type -- see activate() below.
//
// This is a straightforward, self-contained license gate suitable for
// controlling which edition a given install runs as -- it is not a
// cryptographically secure DRM system (the keys live in a plain JSON
// file shipped with the app), which is appropriate for this kind of
// internal/business licensing but worth being upfront about.
//
// "One computer per key" is enforced locally, not centrally: this app
// has no license server, so an install has no way to know whether a
// key it's shown has already been used somewhere else. What it does
// do is generate a random device ID the first time it runs (persisted
// in this install's data directory, alongside its database -- see
// _getOrCreateDeviceId), record that ID and a human-readable device
// label against whichever key activates it, and surface both in
// Settings. That gives you an audit trail to check against your own
// master list (config/activation-keys-master-list.csv) if a key looks
// like it's shown up somewhere unexpected -- it doesn't stop someone
// technical from typing the same key into two computers.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const SqliteStore = require('./sqlite-store');
const storeConfig = require('./store-config');

const KEYS_PATH = path.join(__dirname, '..', 'config', 'activation-keys.json');
const DEMO_BUCKET = 'demo';

class Activation {
  constructor(dataDir) {
    this.keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    this.dataDir = dataDir;
    this.db = new SqliteStore(dataDir, 'activation');
  }

  async getStatus() {
    const records = await this.db.readAll();
    const record = records[0];
    if (!record) return { activated: false, storeType: null };
    return {
      activated: true,
      storeType: record.storeType,
      isDemo: Boolean(record.isDemo),
      activatedAt: record.activatedAt,
      deviceId: record.deviceId,
      deviceLabel: record.deviceLabel
    };
  }

  /** Finds which bucket (store type id, or "demo") a key belongs to. */
  _findBucket(trimmedKey) {
    const match = Object.entries(this.keys).find(([, bucketKeys]) =>
      (Array.isArray(bucketKeys) ? bucketKeys : [bucketKeys]).some(
        (k) => k.toUpperCase() === trimmedKey.toUpperCase()
      )
    );
    return match ? match[0] : null;
  }

  /**
   * A device ID unique to this install, generated once and persisted
   * in this install's own data directory (which is per-computer -- see
   * app.config.js's resolveDefaultDataDir) so it's stable across
   * restarts and re-activations on the same machine.
   */
  _getOrCreateDeviceId() {
    const filePath = path.join(this.dataDir, 'device-id.json');
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')).deviceId;
    } catch {
      if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
      const deviceId = crypto.randomUUID();
      fs.writeFileSync(filePath, JSON.stringify({ deviceId }), 'utf8');
      return deviceId;
    }
  }

  /**
   * @param {string} activationKey
   * @param {string} [requestedStoreType] Only used for a demo key,
   *   which isn't tied to one store type -- a real key's store type
   *   always comes from which bucket the key itself belongs to.
   * @returns {{ activated: true, storeType: string, isDemo: boolean }}
   * @throws if the key doesn't match any known key, or (for a demo
   *   key) requestedStoreType isn't a real store type
   */
  async activate(activationKey, requestedStoreType) {
    const trimmedKey = (activationKey || '').trim();
    const bucket = this._findBucket(trimmedKey);

    if (!bucket) {
      throw new Error('Invalid activation key.');
    }

    const isDemo = bucket === DEMO_BUCKET;
    let storeType = bucket;
    if (isDemo) {
      storeType = (requestedStoreType || '').trim();
      if (!storeConfig.storeTypes[storeType]) {
        throw new Error('Select a store type to try the demo as.');
      }
    }

    storeConfig.setStoreType(storeType);

    const record = {
      storeType,
      activationKey: trimmedKey,
      isDemo,
      deviceId: this._getOrCreateDeviceId(),
      deviceLabel: `${os.hostname()} (${os.platform()})`,
      activatedAt: new Date().toISOString()
    };
    await this.db.writeAll([record]);

    return { activated: true, storeType, isDemo };
  }

  /** Clears activation, requiring a key to be entered again. */
  async deactivate() {
    await this.db.writeAll([]);
    return { activated: false };
  }
}

module.exports = Activation;
