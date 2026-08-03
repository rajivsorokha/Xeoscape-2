// core/store-profile.js
// Store-level business profile: name, address, contact, tax settings,
// currency symbol, and receipt footer. Distinct from "store type"
// (config/store-types.json), which controls product fields -- this is
// the human-facing identity of the store itself, matching the fields
// captured in PharmaSpot's real Settings screen.

const SqliteStore = require('./sqlite-store');

const DEFAULT_PROFILE = {
  storeName: 'My Store',
  addressLine1: '',
  addressLine2: '',
  contactNumber: '',
  taxId: '', // GSTIN
  currencySymbol: '\u20B9', // Indian Rupee
  taxPercentage: 18, // standard GST rate
  chargeTax: true,
  quickBilling: false,
  receiptFooter: 'Thank you for your business!'
};

class StoreProfile {
  constructor(dataDir) {
    this.db = new SqliteStore(dataDir, 'store_profile');
  }

  async get() {
    const records = await this.db.readAll();
    return { ...DEFAULT_PROFILE, ...(records[0] || {}) };
  }

  async update(patch) {
    const records = await this.db.readAll();
    const current = { ...DEFAULT_PROFILE, ...(records[0] || {}) };
    const next = { ...current, ...patch };
    await this.db.writeAll([next]);
    return next;
  }
}

module.exports = StoreProfile;
