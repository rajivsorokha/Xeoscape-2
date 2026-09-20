// core/store-profile.js
// Store-level business profile: name, address, contact, tax settings,
// currency symbol, and receipt footer. Distinct from "store type"
// (config/store-types.json), which controls product fields -- this is
// the human-facing identity of the store itself, matching the fields
// captured in PharmaSpot's real Settings screen.

const SqliteStore = require('./sqlite-store');

// This build ships pre-branded for Mini Mode (Kids Wear by Seven
// Clans), so a fresh install already looks right without anyone
// having to open Settings first. Everything here is still just the
// starting value of an ordinary editable field -- Settings -> Store
// Profile can change the name, address, tagline or logo at any time,
// same as before.
const DEFAULT_PROFILE = {
  storeName: 'Mini Mode',
  // Shown under the store name on receipts, the login screen and the
  // app header wherever there's room for it.
  tagline: 'Kids Wear by Seven Clans',
  addressLine1: 'Uripok Khaiden Leikai',
  addressLine2: 'Imphal, Manipur - 795001',
  contactNumber: '',
  taxId: '', // GSTIN
  currencySymbol: '\u20B9', // Indian Rupee
  taxPercentage: 18, // standard GST rate
  chargeTax: true,
  quickBilling: false,
  // Whether a sale may be left partly unpaid against a customer's
  // running balance (a "due"). Previously this was implied by the
  // B2B General Retail store type; this build is Apparel / Fashion
  // only, so it's an explicit opt-in instead. Off by default -- a
  // retail counter takes payment in full. Turning it on also enables
  // the Due / Outstanding report and WhatsApp payment reminders.
  creditSalesEnabled: false,
  receiptFooter: 'Thank you for shopping with us!',
  // URL of the shop's logo, shown on receipts and throughout the app
  // (login screen, header). Defaults to the bundled Mini Mode logo
  // (assets/images/store-logo.png, served at /images/store-logo.png
  // -- see server.js's static mount of the assets/ folder). Replacing
  // it works the same way as before: upload a new one from Settings
  // -> Store Profile via the same /api/uploads/image endpoint (multer,
  // 2MB cap, jpeg/png/webp only) the product form's Picture field uses.
  logoUrl: '/images/store-logo.png',
  // A tighter square crop of the logo (just the smiley mark) for
  // compact spots that can't fit the full wide banner -- the login
  // screen's round badge. Not user-editable; it's a fixed companion
  // asset to the bundled default logo, so it's not exposed as a
  // Settings field.
  iconUrl: '/images/store-icon.png',
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
