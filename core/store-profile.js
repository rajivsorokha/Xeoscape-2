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
  receiptFooter: 'Thank you for your business!',
  // URL of an uploaded logo (e.g. /uploads/169...-ab12cd.png), shown on
  // receipts/branding. Uploaded via the same /api/uploads/image
  // endpoint (multer, 2MB cap, jpeg/png/webp only) the product form's
  // Picture field already uses -- see
  // assets/js/modules/settings/store-profile.js.
  logoUrl: '',
  // How this install is deployed: a single till with everything local
  // ('standalone'), a till that connects to a separate Network POS
  // Server ('networkTerminal'), or the machine acting as that server
  // for other tills to connect to ('networkServer'). Only the setting
  // itself is captured here -- see the note in
  // assets/js/modules/settings/store-profile.js for what's actually
  // wired up today vs. reserved for a future multi-till sync feature.
  applicationType: 'standalone',
  networkServerAddress: '', // used when applicationType === 'networkTerminal'
  networkServerPort: 4000, // used when applicationType === 'networkServer'
  // Minutes of no mouse/keyboard/touch activity before the app locks
  // and requires the current user's password to resume (see
  // assets/js/core/idle-lock.js). 0 disables the lock entirely.
  idleLockMinutes: 5
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
